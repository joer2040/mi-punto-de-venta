begin;

create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'open' check (status in ('open', 'closed')),
  opening_amount numeric(12,2) not null check (opening_amount > 0),
  sales_cash_total numeric(12,2) not null default 0.00,
  expected_cash_total numeric(12,2) not null default 0.00,
  closing_amount numeric(12,2) not null default 0.00,
  profit_total numeric(12,2) not null default 0.00,
  opened_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone,
  opened_by uuid not null,
  closed_by uuid,
  report_pdf_metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

comment on table public.cash_sessions is
  'Sesion global de caja para apertura, seguimiento de ventas en efectivo y corte.';

create unique index if not exists cash_sessions_single_open_idx
  on public.cash_sessions (status)
  where status = 'open';

create index if not exists cash_sessions_opened_at_idx
  on public.cash_sessions (opened_at desc);

create table if not exists public.cash_session_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  snapshot_type text not null check (snapshot_type in ('opening', 'closing')),
  material_id uuid not null references public.materials(id),
  material_name text not null,
  quantity numeric(12,4) not null default 0.0000,
  average_cost numeric(12,2) not null default 0.00,
  created_at timestamp with time zone not null default now()
);

comment on table public.cash_session_inventory_snapshots is
  'Snapshot del inventario al abrir y cerrar una sesion de caja.';

create index if not exists cash_session_inventory_snapshots_session_idx
  on public.cash_session_inventory_snapshots (cash_session_id, snapshot_type, material_name);

alter table public.sales
  add column if not exists cash_session_id uuid;

do $$
begin
  alter table public.sales
    add constraint sales_cash_session_id_fkey
    foreign key (cash_session_id) references public.cash_sessions(id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists sales_cash_session_id_idx
  on public.sales (cash_session_id);

grant all on table public.cash_sessions to service_role;
grant all on table public.cash_session_inventory_snapshots to service_role;

commit;
