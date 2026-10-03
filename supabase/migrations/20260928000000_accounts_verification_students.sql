-- Accounts, simulated identity/student verification, student membership,
-- saved per-user bookings, and membership benefit tracking.

-- 1. Profile fields. Verification columns are written only by the Express
--    backend (service role) after its own checks.
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists date_of_birth date,
  add column if not exists id_verification_status text not null default 'none'
    check (id_verification_status in ('none', 'pending', 'verified', 'rejected')),
  add column if not exists age_verified_at timestamptz,
  add column if not exists student_status text not null default 'none'
    check (student_status in ('none', 'pending', 'verified', 'rejected')),
  add column if not exists student_email text,
  add column if not exists student_verified_until timestamptz;

-- The old "own profile" policy was FOR ALL, so any signed-in user could set
-- their own verification status with the public anon key. Browser clients
-- now only read their profile; every write goes through the backend.
revoke insert, update, delete, truncate on public.profiles from anon, authenticated;
drop policy if exists "own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid () = id);

-- 2. Verification requests (identity and student), simulated checks.
create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('identity', 'student')),
  status text not null default 'pending'
    check (status in ('pending', 'code_sent', 'verified', 'rejected')),
  detail jsonb not null default '{}'::jsonb,
  code_hash text,
  attempts integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists verification_requests_user_idx
  on public.verification_requests (user_id, kind, created_at desc);
alter table public.verification_requests enable row level security;
revoke all on public.verification_requests from anon, authenticated;
grant select (id, kind, status, created_at, decided_at)
  on public.verification_requests to authenticated;
create policy "read own verification requests" on public.verification_requests
  for select using (auth.uid () = user_id);

-- 3. Student plan.
insert into public.membership_plans (id, name, monthly_price_pence, discount_percent)
values ('student', 'Student', 499, 25)
on conflict (id) do update
  set name = excluded.name,
      monthly_price_pence = excluded.monthly_price_pence,
      discount_percent = excluded.discount_percent;

-- 4. Cancellation keeps benefits until renews_at.
alter table public.memberships
  add column if not exists cancelled_at timestamptz;

-- 5. Monthly benefits (e.g. the student plan's free ticket).
create table if not exists public.membership_benefit_usage (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  benefit text not null,
  period_start date not null,
  booking_reference text,
  created_at timestamptz not null default now(),
  unique (membership_id, benefit, period_start)
);
alter table public.membership_benefit_usage enable row level security;
revoke all on public.membership_benefit_usage from anon, authenticated;

-- 6. confirm_booking: link the booking to a signed-in user and support a
--    fixed discount (free-ticket benefit) on top of the percentage discount.
drop function if exists public.confirm_booking (uuid, text, jsonb, integer, text);
create function public.confirm_booking (
  p_draft_id uuid,
  p_email text,
  p_payment jsonb,
  p_discount_percent integer default 0,
  p_promo_code text default null,
  p_user_id uuid default null,
  p_discount_pence integer default 0
) returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_screening_id uuid;
  v_base_price integer;
  v_reference text;
  v_booking_id uuid;
  v_full_total integer := 0;
  v_total integer := 0;
  v_discount_pence integer := 0;
  v_seat record;
  v_seat_price integer;
begin
  update public.seat_reservations
  set status = 'expired'
  where draft_id = p_draft_id
    and status = 'held'
    and expires_at < now();

  select screening_id into v_screening_id
  from public.seat_reservations
  where draft_id = p_draft_id and status = 'held'
  limit 1;

  if v_screening_id is null then
    raise exception 'RESERVATION_EXPIRED' using errcode = 'no_data_found';
  end if;

  select base_price_pence into v_base_price
  from public.screenings
  where id = v_screening_id;

  v_reference := 'CG-' || upper(encode(gen_random_bytes(4), 'hex'));

  insert into public.bookings (reference, user_id, guest_email, screening_id, status, total_pence)
  values (v_reference, p_user_id, p_email, v_screening_id, 'confirmed', 0)
  returning id into v_booking_id;

  for v_seat in
    select sr.seat_id, s.tier
    from public.seat_reservations sr
    join public.seats s on s.id = sr.seat_id
    where sr.draft_id = p_draft_id and sr.status = 'held'
  loop
    v_seat_price := v_base_price + (case when v_seat.tier = 'premium' then 250 else 0 end);
    insert into public.booking_seats (booking_id, seat_id, price_pence)
    values (v_booking_id, v_seat.seat_id, v_seat_price);
    v_full_total := v_full_total + v_seat_price;
  end loop;

  v_total := round(v_full_total * (100 - coalesce(p_discount_percent, 0)) / 100.0);
  v_total := greatest(0, v_total - greatest(0, coalesce(p_discount_pence, 0)));
  v_discount_pence := v_full_total - v_total;

  update public.bookings set total_pence = v_total where id = v_booking_id;

  update public.seat_reservations
  set status = 'confirmed'
  where draft_id = p_draft_id and status = 'held';

  insert into public.payments (
    booking_id, reference, brand, last_four, amount_pence, status,
    stripe_payment_intent_id, promo_code, discount_pence
  )
  values (
    v_booking_id,
    p_payment ->> 'reference',
    p_payment ->> 'brand',
    p_payment ->> 'last4',
    v_total,
    coalesce(p_payment ->> 'status', 'paid'),
    p_payment ->> 'stripePaymentIntentId',
    p_promo_code,
    v_discount_pence
  );

  insert into public.ticket_deliveries (booking_id, status)
  values (v_booking_id, 'queued');

  return v_booking_id;
end;
$function$;

revoke execute on function public.confirm_booking (uuid, text, jsonb, integer, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.confirm_booking (uuid, text, jsonb, integer, text, uuid, integer)
  to service_role;
