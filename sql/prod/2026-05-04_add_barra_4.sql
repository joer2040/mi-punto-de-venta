insert into public.tables (number, status)
select 'Barra 4', 'libre'
where not exists (
  select 1
  from public.tables
  where number = 'Barra 4'
);
