-- Five more cinemas, and ten screens at every cinema (the six formats plus
-- three more Standard screens and a second 3D screen). Matches
-- services/cinemas.js. Only adds rows, and is safe to run more than once.
insert into public.cinemas (slug, name)
values
  ('manchester', 'Cinego Manchester'),
  ('birmingham', 'Cinego Birmingham'),
  ('leeds', 'Cinego Leeds'),
  ('cardiff', 'Cinego Cardiff'),
  ('belfast', 'Cinego Belfast')
on conflict (slug) do nothing;

with layout (screen_number, experience_id) as (
  values
    (1, '3d'), (2, '4dx'), (3, 'dolby'), (4, 'imax'), (5, 'screenx'),
    (6, 'standard'), (7, 'standard'), (8, 'standard'), (9, 'standard'),
    (10, '3d')
)
insert into public.auditoriums (cinema_id, name, experience_id, screen_number)
select c.id, 'Screen ' || l.screen_number, l.experience_id, l.screen_number
from public.cinemas c
cross join layout l
where not exists (
  select 1 from public.auditoriums a
  where a.cinema_id = c.id and a.screen_number = l.screen_number
);

-- Seats for any screen that has none: 8 rows of 12 (back two rows premium),
-- or 6 rows of 8 for 4DX, as in the original screens.
insert into public.seats (auditorium_id, row_label, seat_number, tier)
select
  a.id,
  chr(64 + r) as row_label,
  n as seat_number,
  case when r > rows - 2 then 'premium' else 'standard' end as tier
from public.auditoriums a
cross join lateral (
  select
    case when a.experience_id = '4dx' then 6 else 8 end as rows,
    case when a.experience_id = '4dx' then 8 else 12 end as per_row
) size
cross join lateral generate_series(1, size.rows) r
cross join lateral generate_series(1, size.per_row) n
where not exists (select 1 from public.seats s where s.auditorium_id = a.id)
on conflict do nothing;
