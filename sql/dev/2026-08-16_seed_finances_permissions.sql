-- ARCHIVO: sql/dev/2026-08-16_seed_finances_permissions.sql
-- ENTORNO: DEV únicamente
-- PROPÓSITO: Crear permisos del módulo de Finanzas y asignarlos a roles
-- IDEMPOTENTE: Sí
-- PRD: No ejecutar en PRD

begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el módulo de Finanzas: saldos, pólizas, mayor y sesiones de caja.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras: traspasos, aportaciones, retiros, resoluciones y reversas.')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from   public.app_roles       roles
join   public.app_permissions permissions
       on  permissions.screen_key = 'finances'
       and permissions.action_key = 'view'
where  lower(trim(roles.name)) in ('manager', 'administrador operativo')
on conflict do nothing;

do $$
declare
  perm_count int;
  assign_count int;
begin
  select count(*) into perm_count
  from public.app_permissions
  where screen_key = 'finances';

  select count(*) into assign_count
  from public.app_role_permissions rp
  join public.app_permissions p on p.id = rp.permission_id
  where p.screen_key = 'finances';

  if perm_count < 2 then
    raise exception 'ERROR: se esperaban 2 permisos finances, se encontraron %', perm_count;
  end if;

  raise notice 'OK: % permisos finances creados, % asignaciones de rol', perm_count, assign_count;
end;
$$;

commit;
