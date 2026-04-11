-- ERP history setup for La Carreta
-- Apply this script in the Supabase SQL editor before relying on the
-- new inventory history and audit features in production.

create extension if not exists pgcrypto;

alter table if exists public.sales
  add column if not exists document_number text;

create index if not exists idx_sales_document_number
  on public.sales(document_number);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  center_id uuid not null references public.centers(id),
  material_id uuid not null references public.materials(id),
  movement_type text not null check (movement_type in ('purchase', 'sale', 'manual_adjustment', 'initial_stock')),
  direction text not null check (direction in ('in', 'out', 'adjust')),
  quantity numeric(12,3) not null check (quantity > 0),
  before_stock numeric(12,3),
  after_stock numeric(12,3),
  unit_cost numeric(12,2),
  unit_price numeric(12,2),
  reference_table text,
  reference_id uuid,
  reference_number text,
  reason_code text,
  notes text,
  performed_by text
);

create index if not exists idx_inventory_movements_material_created_at
  on public.inventory_movements(material_id, created_at desc);

create index if not exists idx_inventory_movements_center_created_at
  on public.inventory_movements(center_id, created_at desc);

create index if not exists idx_inventory_movements_reference
  on public.inventory_movements(reference_table, reference_id);

create table if not exists public.inventory_adjustments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  center_id uuid not null references public.centers(id),
  material_id uuid not null references public.materials(id),
  previous_stock numeric(12,3) not null,
  new_stock numeric(12,3) not null,
  difference_qty numeric(12,3) not null,
  reason_code text not null check (reason_code in ('manual_count', 'correction', 'damage', 'loss', 'opening_balance')),
  notes text,
  authorization_code text,
  performed_by text
);

create index if not exists idx_inventory_adjustments_material_created_at
  on public.inventory_adjustments(material_id, created_at desc);

create index if not exists idx_inventory_adjustments_center_created_at
  on public.inventory_adjustments(center_id, created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null check (event_type in ('material_created', 'material_updated', 'price_updated', 'provider_created')),
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  notes text,
  performed_by text
);

create index if not exists idx_audit_log_entity
  on public.audit_log(entity_type, entity_id, created_at desc);

create index if not exists idx_audit_log_event_type
  on public.audit_log(event_type, created_at desc);

comment on table public.inventory_movements is
  'Libro historico de movimientos de inventario para compras, ventas y ajustes.';

comment on table public.inventory_adjustments is
  'Documento formal para correcciones manuales de inventario.';

comment on table public.audit_log is
  'Bitacora administrativa para cambios de catalogos y datos maestros.';

-- Important:
-- If your current database already has triggers that update inventory from
-- purchase_items or sale_items, keep them. This script only adds history
-- tables and does not replace the existing stock update mechanism.
