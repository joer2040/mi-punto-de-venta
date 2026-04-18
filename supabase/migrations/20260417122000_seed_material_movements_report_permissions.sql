begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('report_material_movements', 'view', 'Ver reporte de movimiento de materiales.')
on conflict (screen_key, action_key) do update
set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'report_material_movements'
 and permissions.action_key = 'view'
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;

commit;
