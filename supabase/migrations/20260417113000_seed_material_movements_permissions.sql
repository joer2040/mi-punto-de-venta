begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('movements', 'view', 'Ver modulo de movimiento de materiales.'),
  ('movements', 'create', 'Registrar movimientos de entrada y salida de materiales.')
on conflict (screen_key, action_key) do update
set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'movements'
 and permissions.action_key in ('view', 'create')
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;

commit;
