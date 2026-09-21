-- membership_plans is already seeded (lowercase ids: silver/gold/platinum)
-- by the initial schema migration. This migration adds a promotions table
-- for limited-time discount codes, and threads a server-resolved discount
-- percentage through confirm_booking so the recorded booking total always
-- matches what Stripe actually charged when a promo code was applied. The
-- discount percent always comes from a server-side lookup against the
-- promotions table below, never from anything the client claims, preserving
-- the existing "never trust a client-supplied amount" invariant.

create table public.promotions (
  code text primary key,
  description text not null,
  discount_percent integer not null check (discount_percent between 1 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  active boolean not null default true
);

alter table public.promotions enable row level security;
-- No policies for anon/authenticated: promotions are only ever read through
-- the backend's service-role client, same pattern as the booking RPCs.

insert into
  public.promotions (code, description, discount_percent, starts_at, ends_at)
values
  (
    'WELCOME10',
    '10% off your first booking',
    10,
    now(),
    now() + interval '90 days'
  ),
  (
    'MATINEE15',
    '15% off any booking this week',
    15,
    now(),
    now() + interval '14 days'
  )
on conflict (code) do nothing;

alter table public.payments
add column if not exists promo_code text references public.promotions (code),
add column if not exists discount_pence integer not null default 0;

alter table public.membership_payments
add column if not exists promo_code text references public.promotions (code),
add column if not exists discount_pence integer not null default 0;

-- The signature is changing (two new params), so CREATE OR REPLACE would
-- create a second overload rather than replace the existing function. Drop
-- the old signature explicitly first.
drop function if exists public.confirm_booking (uuid, text, jsonb);

create or replace function public.confirm_booking (
  p_draft_id uuid,
  p_email text,
  p_payment jsonb,
  p_discount_percent integer default 0,
  p_promo_code text default null
) returns uuid language plpgsql security definer
set
  search_path = public, extensions as $$
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

  insert into public.bookings (reference, guest_email, screening_id, status, total_pence)
  values (v_reference, p_email, v_screening_id, 'confirmed', 0)
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
$$;

revoke execute on function public.confirm_booking (uuid, text, jsonb, integer, text)
from
  public,
  anon,
  authenticated;
