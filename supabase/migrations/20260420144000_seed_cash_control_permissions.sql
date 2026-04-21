begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('cash_control', 'view', 'Ver el modulo de control y corte de caja.'),
  ('cash_control', 'manage', 'Abrir y cerrar sesiones de caja.')
on conflict (screen_key, action_key) do update
set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'cash_control'
 and permissions.action_key in ('view', 'manage')
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;

commit;
