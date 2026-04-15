-- Historical/manual support script.
-- Source of truth now lives in supabase/migrations and supabase/functions.
-- Keep this file as reference or for controlled SQL Editor use only.
--
-- Security and access-control setup for mi-punto-de-venta
-- Run this script in the Supabase SQL editor.
--
-- Important:
-- 1. Create the first auth user manually in Supabase Authentication with:
--    email: admin@usuarios.mi-punto-de-venta.local
--    password: a valid initial password
--    Auto Confirm User: enabled
-- 2. Get that auth user id.
-- 3. Bootstrap the profile with:
--    select public.bootstrap_superadmin(
--      'AUTH_USER_ID_AQUI'::uuid,
--      'admin',
--      'Administrador General'
--    );

create extension if not exists pgcrypto;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  notes text,
  performed_by text
);

create table if not exists public.app_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text,
  email text not null unique,
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_superadmin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.app_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.app_permissions (
  id uuid primary key default gen_random_uuid(),
  screen_key text not null,
  action_key text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (screen_key, action_key)
);

create table if not exists public.app_role_permissions (
  role_id uuid not null references public.app_roles(id) on delete cascade,
  permission_id uuid not null references public.app_permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table if not exists public.app_user_roles (
  user_id uuid not null references public.app_profiles(id) on delete cascade,
  role_id uuid not null references public.app_roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index if not exists idx_app_profiles_status on public.app_profiles(status);
create index if not exists idx_app_permissions_screen_action on public.app_permissions(screen_key, action_key);
create index if not exists idx_app_user_roles_role_id on public.app_user_roles(role_id);

insert into public.app_permissions (screen_key, action_key, description)
select screen_key, action_key, initcap(replace(screen_key, '_', ' ')) || ' - ' || initcap(action_key)
from unnest(array[
  'home',
  'master',
  'providers',
  'purchases',
  'reports',
  'report_inventory',
  'report_purchases',
  'report_sales',
  'pos',
  'security_users'
]) as screen_key
cross join unnest(array['view', 'create', 'edit', 'delete', 'manage']) as action_key
on conflict (screen_key, action_key) do nothing;

update public.app_roles
set name = 'manager',
    description = 'Acceso operativo completo. Solo puede administrar usuarios con rol de mesero.'
where name = 'Administrador Operativo';

update public.app_roles
set name = 'mesero',
    description = 'Opera mesas y consulta los reportes disponibles.'
where name = 'Mesero';

delete from public.app_roles
where name = 'Consulta Reportes';

insert into public.app_roles (name, description)
values
  ('manager', 'Acceso operativo completo. Solo puede administrar usuarios con rol de mesero.'),
  ('mesero', 'Opera mesas y consulta los reportes disponibles.')
on conflict (name) do update
set description = excluded.description;

delete from public.app_role_permissions
where role_id in (
  select id
  from public.app_roles
  where name in ('manager', 'mesero')
);

with role_permission_map as (
  select role_name, screen_key, action_key
  from (
    values
      ('manager', 'home', 'view'),
      ('manager', 'master', 'view'),
      ('manager', 'master', 'create'),
      ('manager', 'master', 'edit'),
      ('manager', 'master', 'delete'),
      ('manager', 'providers', 'view'),
      ('manager', 'providers', 'create'),
      ('manager', 'providers', 'edit'),
      ('manager', 'providers', 'delete'),
      ('manager', 'purchases', 'view'),
      ('manager', 'purchases', 'create'),
      ('manager', 'purchases', 'edit'),
      ('manager', 'purchases', 'delete'),
      ('manager', 'reports', 'view'),
      ('manager', 'report_inventory', 'view'),
      ('manager', 'report_purchases', 'view'),
      ('manager', 'report_sales', 'view'),
      ('manager', 'pos', 'view'),
      ('manager', 'pos', 'create'),
      ('manager', 'pos', 'edit'),
      ('manager', 'pos', 'delete'),
      ('manager', 'security_users', 'view'),
      ('manager', 'security_users', 'manage'),
      ('mesero', 'home', 'view'),
      ('mesero', 'pos', 'view'),
      ('mesero', 'pos', 'create'),
      ('mesero', 'pos', 'edit'),
      ('mesero', 'reports', 'view'),
      ('mesero', 'report_inventory', 'view'),
      ('mesero', 'report_purchases', 'view'),
      ('mesero', 'report_sales', 'view')
  ) as permissions(role_name, screen_key, action_key)
)
insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from role_permission_map map
join public.app_roles roles on roles.name = map.role_name
join public.app_permissions permissions
  on permissions.screen_key = map.screen_key
 and permissions.action_key = map.action_key
on conflict do nothing;

do $$
declare
  existing_constraint text;
begin
  select c.conname
    into existing_constraint
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'audit_log'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%event_type%';

  if existing_constraint is not null then
    execute format('alter table public.audit_log drop constraint %I', existing_constraint);
  end if;

  alter table public.audit_log
    add constraint audit_log_event_type_check
    check (
      event_type in (
        'material_created',
        'material_updated',
        'price_updated',
        'provider_created',
        'user_created',
        'user_updated',
        'user_deactivated',
        'user_deleted',
        'role_created',
        'role_updated',
        'role_assigned',
        'superadmin_bootstrap'
      )
    );
end $$;

create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select lower(btrim(p_username));
$$;

create or replace function public.username_to_auth_email(p_username text)
returns text
language sql
immutable
as $$
  select public.normalize_username(p_username) || '@usuarios.mi-punto-de-venta.local';
$$;

create or replace function public.assert_valid_username(p_username text)
returns void
language plpgsql
immutable
as $$
begin
  if p_username is null or public.normalize_username(p_username) = '' then
    raise exception 'El usuario es obligatorio.';
  end if;

  if public.normalize_username(p_username) !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'El usuario debe tener entre 3 y 30 caracteres y solo usar letras, numeros, punto, guion o guion bajo.';
  end if;
end;
$$;

create or replace function public.current_app_is_superadmin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_profiles
    where id = auth.uid()
      and is_superadmin = true
      and status = 'active'
  );
$$;

create or replace function public.current_app_is_manager()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.app_profiles profiles
    join public.app_user_roles user_roles on user_roles.user_id = profiles.id
    join public.app_roles roles on roles.id = user_roles.role_id
    where profiles.id = auth.uid()
      and profiles.status = 'active'
      and roles.name = 'manager'
  );
$$;

create or replace function public.bootstrap_superadmin(
  p_user_id uuid,
  p_username text,
  p_full_name text default 'Administrador General'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_username text;
  internal_email text;
begin
  if exists(select 1 from public.app_profiles) then
    raise exception 'El superadministrador inicial ya fue creado.';
  end if;

  if not exists(select 1 from auth.users where id = p_user_id) then
    raise exception 'El usuario auth indicado no existe.';
  end if;

  perform public.assert_valid_username(p_username);

  normalized_username := public.normalize_username(p_username);
  internal_email := public.username_to_auth_email(normalized_username);

  insert into public.app_profiles (id, username, full_name, email, status, is_superadmin)
  values (p_user_id, normalized_username, p_full_name, internal_email, 'active', true);

  insert into public.audit_log (entity_type, entity_id, event_type, new_values, notes, performed_by)
  values (
    'app_profile',
    p_user_id,
    'superadmin_bootstrap',
    jsonb_build_object('username', normalized_username, 'full_name', p_full_name),
    'Creacion del superadministrador inicial',
    'bootstrap'
  );

  return p_user_id;
end;
$$;

drop function if exists public.create_app_role(text, text, uuid[]);
drop function if exists public.update_app_role(uuid, text, text, uuid[]);
drop function if exists public.delete_app_role(uuid);

alter table public.app_profiles enable row level security;
alter table public.app_roles enable row level security;
alter table public.app_permissions enable row level security;
alter table public.app_role_permissions enable row level security;
alter table public.app_user_roles enable row level security;

drop policy if exists "profiles_self_or_superadmin_select" on public.app_profiles;
create policy "profiles_self_or_superadmin_select"
on public.app_profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.current_app_is_superadmin()
  or public.current_app_is_manager()
);

drop policy if exists "roles_authenticated_select" on public.app_roles;
create policy "roles_authenticated_select"
on public.app_roles
for select
to authenticated
using (true);

drop policy if exists "permissions_authenticated_select" on public.app_permissions;
create policy "permissions_authenticated_select"
on public.app_permissions
for select
to authenticated
using (true);

drop policy if exists "role_permissions_authenticated_select" on public.app_role_permissions;
create policy "role_permissions_authenticated_select"
on public.app_role_permissions
for select
to authenticated
using (true);

drop policy if exists "user_roles_self_or_superadmin_select" on public.app_user_roles;
create policy "user_roles_self_or_superadmin_select"
on public.app_user_roles
for select
to authenticated
using (
  user_id = auth.uid()
  or public.current_app_is_superadmin()
  or public.current_app_is_manager()
);

grant execute on function public.current_app_is_superadmin() to authenticated;
grant execute on function public.current_app_is_manager() to authenticated;
grant execute on function public.bootstrap_superadmin(uuid, text, text) to authenticated;

comment on table public.app_profiles is
  'Perfiles de acceso de la aplicacion, enlazados a auth.users con identificador visible por username.';

comment on table public.app_roles is
  'Catalogo de roles para asignacion de permisos por pantalla y accion.';

comment on table public.app_permissions is
  'Catalogo de permisos atomicos por pantalla y accion.';
