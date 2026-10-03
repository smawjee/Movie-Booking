-- Makes booking confirmation idempotent per Stripe PaymentIntent, so the new
-- payment_intent.succeeded webhook and the browser's verify-on-return call can
-- both confirm the same payment without the second one failing (previously it
-- hit RESERVATION_EXPIRED because the seats were no longer 'held').

create unique index if not exists payments_stripe_payment_intent_id_key on public.payments (stripe_payment_intent_id)
where
  stripe_payment_intent_id is not null;

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
  v_intent_id text;
begin
  -- Idempotency: the browser (/api/bookings/confirm) and the Stripe webhook
  -- can both confirm the same PaymentIntent, possibly at the same moment.
  -- Serialise callers per intent, then hand back the existing booking if the
  -- other caller already created it.
  v_intent_id := p_payment ->> 'stripePaymentIntentId';
  if v_intent_id is not null then
    perform pg_advisory_xact_lock(hashtext('confirm_booking:' || v_intent_id));

    select booking_id into v_booking_id
    from public.payments
    where stripe_payment_intent_id = v_intent_id;

    if v_booking_id is not null then
      return v_booking_id;
    end if;
  end if;

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

-- Same signature as 20260922, so CREATE OR REPLACE keeps the oid and the
-- service-role-only lockdown. Repeating the revoke is defensive only.
revoke execute on function public.confirm_booking (uuid, text, jsonb, integer, text)
from
  public,
  anon,
  authenticated;
