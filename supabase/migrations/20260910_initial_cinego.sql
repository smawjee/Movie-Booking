create extension if not exists pgcrypto;

create type public.booking_status as enum('held', 'confirmed', 'cancelled', 'expired');

create type public.delivery_status as enum('queued', 'sent', 'preview', 'failed');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.cinemas (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  timezone text not null default 'Europe/London'
);

create table public.premium_experiences (
  id text primary key,
  name text not null,
  description text not null,
  surcharge_pence integer not null check (surcharge_pence >= 0),
  safety_notice text
);

create table public.auditoriums (
  id uuid primary key default gen_random_uuid(),
  cinema_id uuid not null references public.cinemas (id),
  name text not null,
  experience_id text not null references public.premium_experiences (id)
);

create table public.seats (
  id uuid primary key default gen_random_uuid(),
  auditorium_id uuid not null references public.auditoriums (id),
  row_label text not null,
  seat_number integer not null,
  tier text not null check (tier in ('standard', 'premium')),
  unique (auditorium_id, row_label, seat_number)
);

create table public.movies (
  id bigint primary key,
  title text not null,
  overview text not null default '',
  poster_path text,
  rating text not null default 'NR',
  runtime integer,
  language text,
  genre_ids integer[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.screenings (
  id uuid primary key default gen_random_uuid(),
  movie_id bigint not null references public.movies (id),
  auditorium_id uuid not null references public.auditoriums (id),
  starts_at timestamptz not null,
  base_price_pence integer not null check (base_price_pence >= 0),
  language text not null default 'en',
  unique (auditorium_id, starts_at)
);

create table public.booking_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id),
  guest_token_hash text,
  screening_id uuid references public.screenings (id),
  ticket_count integer not null default 1 check (ticket_count between 1 and 12),
  created_by text not null check (created_by in ('assistant', 'user')),
  expires_at timestamptz not null default (now() + interval '1 hour')
);

create table public.age_confirmations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid unique references public.booking_drafts (id) on delete cascade,
  rating text not null,
  age_band text not null,
  declared boolean not null check (declared),
  policy_version text not null,
  confirmed_at timestamptz not null default now()
);

create table public.seat_reservations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.booking_drafts (id) on delete cascade,
  screening_id uuid not null references public.screenings (id),
  seat_id uuid not null references public.seats (id),
  status public.booking_status not null default 'held',
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

create unique index one_active_seat_hold on public.seat_reservations (screening_id, seat_id)
where
  status in ('held', 'confirmed');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  user_id uuid references auth.users (id),
  guest_email text,
  screening_id uuid not null references public.screenings (id),
  status public.booking_status not null default 'confirmed',
  total_pence integer not null check (total_pence >= 0),
  created_at timestamptz not null default now()
);

create table public.booking_seats (
  booking_id uuid references public.bookings (id) on delete cascade,
  seat_id uuid references public.seats (id),
  price_pence integer not null,
  primary key (booking_id, seat_id)
);

create table public.booking_concessions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  sku text not null,
  name text not null,
  quantity integer not null check (quantity > 0),
  unit_price_pence integer not null
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references public.bookings (id),
  reference text unique not null,
  brand text not null,
  last_four char(4) not null,
  amount_pence integer not null,
  status text not null default 'simulated',
  created_at timestamptz not null default now()
);

create table public.membership_plans (
  id text primary key,
  name text not null,
  monthly_price_pence integer not null,
  discount_percent integer not null check (discount_percent between 0 and 100)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  plan_id text not null references public.membership_plans (id),
  status text not null check (status in ('active', 'cancelled')),
  renews_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.membership_payments (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id),
  reference text unique not null,
  brand text not null,
  last_four char(4) not null,
  amount_pence integer not null,
  created_at timestamptz not null default now()
);

create table public.membership_events (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships (id),
  event_type text not null,
  created_at timestamptz not null default now()
);

create table public.ticket_deliveries (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  status public.delivery_status not null default 'queued',
  provider_reference text,
  attempt_count integer not null default 0,
  last_attempt_at timestamptz
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  consented boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 2000),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

alter table public.bookings enable row level security;

alter table public.booking_seats enable row level security;

alter table public.payments enable row level security;

alter table public.memberships enable row level security;

alter table public.membership_payments enable row level security;

alter table public.chat_sessions enable row level security;

alter table public.chat_messages enable row level security;

create policy "own profile" on public.profiles for all using (auth.uid () = id)
with
  check (auth.uid () = id);

create policy "own bookings" on public.bookings for
select
  using (auth.uid () = user_id);

create policy "own booking seats" on public.booking_seats for
select
  using (
    exists (
      select
        1
      from
        public.bookings b
      where
        b.id = booking_id
        and b.user_id = auth.uid ()
    )
  );

create policy "own payments" on public.payments for
select
  using (
    exists (
      select
        1
      from
        public.bookings b
      where
        b.id = booking_id
        and b.user_id = auth.uid ()
    )
  );

create policy "own memberships" on public.memberships for
select
  using (auth.uid () = user_id);

create policy "own membership payments" on public.membership_payments for
select
  using (
    exists (
      select
        1
      from
        public.memberships m
      where
        m.id = membership_id
        and m.user_id = auth.uid ()
    )
  );

create policy "own chat sessions" on public.chat_sessions for all using (auth.uid () = user_id)
with
  check (auth.uid () = user_id);

create policy "own chat messages" on public.chat_messages for all using (
  exists (
    select
      1
    from
      public.chat_sessions s
    where
      s.id = session_id
      and s.user_id = auth.uid ()
  )
)
with
  check (
    exists (
      select
        1
      from
        public.chat_sessions s
      where
        s.id = session_id
        and s.user_id = auth.uid ()
    )
  );

create or replace function public.hold_seats (
  p_draft_id uuid,
  p_screening_id uuid,
  p_seat_ids uuid[]
) returns setof public.seat_reservations language plpgsql security definer
set
  search_path = public as $$begin update public.seat_reservations set status='expired' where status='held' and expires_at<now();if exists(select 1 from public.seat_reservations where screening_id=p_screening_id and seat_id=any(p_seat_ids) and status in('held','confirmed')) then raise exception 'SEAT_CONFLICT' using errcode='unique_violation';end if;return query insert into public.seat_reservations(draft_id,screening_id,seat_id) select p_draft_id,p_screening_id,unnest(p_seat_ids) returning *;end;$$;

insert into
  public.premium_experiences
values
  (
    'standard',
    'Standard 2D',
    'Crystal-clear projection and comfortable seating.',
    0,
    null
  ),
  (
    '3d',
    'RealD 3D',
    'Immersive depth with lightweight glasses.',
    200,
    null
  ),
  (
    'imax',
    'IMAX',
    'Floor-to-ceiling picture and precision sound.',
    450,
    null
  ),
  (
    'dolby',
    'Dolby Cinema',
    'Dolby Vision, Atmos and luxury recliners.',
    550,
    null
  ),
  (
    '4dx',
    '4DX',
    'Motion seats with environmental effects.',
    650,
    'Includes motion, water and flashing effects. Restrictions apply.'
  ),
  (
    'screenx',
    'ScreenX',
    'Panoramic 270-degree cinema.',
    500,
    null
  )
on conflict do nothing;

insert into
  public.membership_plans
values
  ('silver', 'Silver', 499, 5),
  ('gold', 'Gold', 899, 10),
  ('platinum', 'Platinum', 1499, 15)
on conflict do nothing;
