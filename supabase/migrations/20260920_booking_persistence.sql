-- Seeds the static catalogue data (cinemas, auditoriums, seats) that the
-- initial schema defines but never populates, and adds the confirm_booking
-- RPC used alongside the existing hold_seats() to make checkout atomic.

alter table public.auditoriums
add column if not exists screen_number integer not null default 1;

insert into
  public.cinemas (slug, name, timezone)
values
  ('edinburgh', 'Cinego Edinburgh', 'Europe/London'),
  ('glasgow', 'Cinego Glasgow', 'Europe/London'),
  ('london', 'Cinego London', 'Europe/London')
on conflict (slug) do nothing;

do $$
declare
  c record;
  exp record;
  screen int;
  aud_id uuid;
  row_letters text[];
  seats_per_row int;
  premium_rows int := 2;
  row_count int;
  r text;
  i int;
  n int;
begin
  for c in select id from public.cinemas loop
    screen := 1;
    for exp in select id from public.premium_experiences order by id loop
      insert into public.auditoriums (cinema_id, name, experience_id, screen_number)
      values (c.id, 'Screen ' || screen, exp.id, screen)
      returning id into aud_id;

      if exp.id = '4dx' then
        row_letters := array['A', 'B', 'C', 'D', 'E', 'F'];
        seats_per_row := 8;
      else
        row_letters := array['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        seats_per_row := 12;
      end if;
      row_count := array_length(row_letters, 1);

      for i in 1..row_count loop
        r := row_letters[i];
        for n in 1..seats_per_row loop
          insert into public.seats (auditorium_id, row_label, seat_number, tier)
          values (
            aud_id,
            r,
            n,
            case
              when i > row_count - premium_rows then 'premium'
              else 'standard'
            end
          );
        end loop;
      end loop;

      screen := screen + 1;
    end loop;
  end loop;
end $$;

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

  insert into public.payments (booking_id, reference, brand, last_four, amount_pence, status)
  values (
    v_booking_id,
    p_payment ->> 'reference',
    p_payment ->> 'brand',
    p_payment ->> 'last4',
    v_total,
    'simulated'
  );

  insert into public.ticket_deliveries (booking_id, status)
  values (v_booking_id, 'queued');

  return v_booking_id;
end;
$$;
