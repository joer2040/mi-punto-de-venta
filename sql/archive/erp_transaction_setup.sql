-- Historical/manual support script.
-- Source of truth now lives in supabase/migrations and supabase/functions.
-- Keep this file as reference or for controlled SQL Editor use only.
--
-- ERP transaction audit extensions for mi-punto-de-venta
-- Run this script in the Supabase SQL editor.

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
        'purchase_created',
        'inventory_adjusted',
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
