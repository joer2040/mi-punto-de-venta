-- ARCHIVO: sql/dev/2026-08-16_seed_app_roles_dev.sql
-- ENTORNO: DEV únicamente
-- PROPÓSITO: Seed inicial de roles en DEV. app_roles estaba vacío — nunca fue seeded.
--            Prerequisito para que funcionen todas las asignaciones de app_role_permissions.
-- IDEMPOTENTE: Sí (ON CONFLICT DO NOTHING)
-- DESTRUCTIVO: No
-- PRD: No ejecutar en PRD

begin;

insert into public.app_roles (name)
values
  ('manager'),
  ('administrador operativo'),
  ('mesero')
on conflict (name) do nothing;

do $$
declare
  role_count int;
begin
  select count(*) into role_count
  from public.app_roles
  where lower(name) in ('manager', 'administrador operativo', 'mesero');

  if role_count < 3 then
    raise exception 'ERROR: se esperaban 3 roles, se encontraron %', role_count;
  end if;

  raise notice 'OK: % roles presentes en app_roles', role_count;
end;
$$;

commit;
