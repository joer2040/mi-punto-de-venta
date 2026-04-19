insert into public.tables (number, status)
select v.number, 'libre'
from (values
  ('Barra 2'),
  ('Barra 3'),
  ('Mesa 5'),
  ('Mesa 6'),
  ('Mesa 7'),
  ('Mesa 8'),
  ('Mesa 9'),
  ('Mesa 10'),
  ('Mesa 11'),
  ('Mesa 12')
) as v(number)
where not exists (
  select 1
  from public.tables t
  where t.number = v.number
);
