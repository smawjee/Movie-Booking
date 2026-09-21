-- Adds a column to record which Stripe PaymentIntent paid for a booking, and
-- updates confirm_booking to write it and to use the real payment status
-- ("paid") that the verify-on-return backend flow now supplies, instead of
-- the hardcoded 'simulated' placeholder from the pre-Stripe demo flow.

alter table public.payments
add column if not exists stripe_payment_intent_id text;

create or replace function public.confirm_booking (
  p_draft_id uuid,
  p_email text,
  p_payment jsonb
) returns uuid language plpgsql security definer
set
  search_path = public, extensions as $$
declare
  v_screening_id uuid;
  v_base_price integer;
  v_reference text;
  v_booking_id uuid;
  v_total integer := 0;
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
    v_total := v_total + v_seat_price;
  end loop;

  update public.bookings set total_pence = v_total where id = v_booking_id;

  update public.seat_reservations
  set status = 'confirmed'
  where draft_id = p_draft_id and status = 'held';

  insert into public.payments (
    booking_id, reference, brand, last_four, amount_pence, status, stripe_payment_intent_id
  )
  values (
    v_booking_id,
    p_payment ->> 'reference',
    p_payment ->> 'brand',
    p_payment ->> 'last4',
    v_total,
    coalesce(p_payment ->> 'status', 'paid'),
    p_payment ->> 'stripePaymentIntentId'
  );

  insert into public.ticket_deliveries (booking_id, status)
  values (v_booking_id, 'queued');

  return v_booking_id;
end;
$$;

-- CREATE OR REPLACE preserves the function's oid, so the service-role-only
-- lockdown from 20260920120000_restrict_booking_rpcs_to_service_role.sql
-- stays in effect. Repeating the revoke here is defensive/idempotent only.
revoke execute on function public.confirm_booking (uuid, text, jsonb)
from
  public,
  anon,
  authenticated;
