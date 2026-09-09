-- Seed de permisos para el módulo de Finanzas.
-- Crea finances:view y finances:manage en app_permissions.
-- Solo finances:view se asigna a roles en esta migración.
-- finances:manage queda registrada pero sin asignar: requiere decisión
-- de negocio sobre qué roles pueden ejecutar operaciones financieras
-- (traspasos, aportaciones, retiros, reversas) en PRD.

begin;

-- ============================================================
-- 1. Permisos del módulo
-- ============================================================

insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el modulo de finanzas, reportes contables, polizas y mayor.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras: traspasos, aportaciones, retiros y reversas.')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

-- ============================================================
-- 2. Asignación de finances:view a roles operativos
-- Roles objetivo: manager, administrador operativo, admin
-- Se omiten silenciosamente roles que no existan en app_roles.
-- finances:manage NO se asigna aquí — pendiente de decisión de negocio.
-- ============================================================

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'finances'
 and permissions.action_key = 'view'
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;

commit;
