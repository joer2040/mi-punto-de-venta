-- Fase 1: Base financiera del ledger de doble partida.
-- Crea catálogo de cuentas, configuración del ledger, asientos,
-- líneas, idempotencia y auditoría financiera.
-- Migración aditiva e idempotente. No modifica esquema histórico.

begin;

-- ============================================================
-- 1. Catálogo de cuentas financieras
-- ============================================================

create table if not exists public.financial_accounts (
  id           uuid    primary key default gen_random_uuid(),
  code         text    not null,
  name         text    not null,
  account_type text    not null,
  is_system    boolean not null default false,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint financial_accounts_account_type_check
    check (account_type in ('asset', 'liability', 'equity', 'income', 'expense'))
);

create unique index if not exists financial_accounts_code_idx
  on public.financial_accounts (code);

comment on table public.financial_accounts is
  'Catálogo de cuentas del ledger de doble partida. Cuentas del sistema no son eliminables.';

-- Protección: cuentas del sistema no se pueden eliminar
create or replace function public.protect_system_financial_accounts()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
begin
  if old.is_system then
    raise exception 'No se puede eliminar la cuenta del sistema "%".', old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_protect_system_accounts on public.financial_accounts;

create trigger trg_protect_system_accounts
  before delete on public.financial_accounts
  for each row
  execute function public.protect_system_financial_accounts();

-- ============================================================
-- 2. Configuración del ledger (singleton)
-- ============================================================

create table if not exists public.ledger_settings (
  id                      boolean     primary key default true,
  ledger_cutover_at       timestamptz,
  initial_journal_entry_id uuid,
  activated_by            uuid        references public.app_profiles(id),
  activated_at            timestamptz,
  created_at              timestamptz not null default now(),
  constraint ledger_settings_singleton check (id = true)
);

comment on table public.ledger_settings is
  'Singleton de configuración del ledger. Solo puede existir una fila (id = true).';

-- ============================================================
-- 3. Asientos contables (cabecera inmutable)
-- ============================================================

create table if not exists public.journal_entries (
  id               uuid        primary key default gen_random_uuid(),
  entry_number     text        not null,
  entry_type       text        not null,
  status           text        not null default 'pending',
  occurred_at      timestamptz not null,
  source_type      text,
  source_id        uuid,
  reversal_of_id   uuid        references public.journal_entries(id),
  created_by       uuid        not null references public.app_profiles(id),
  authorization_id uuid,
  idempotency_key  text,
  created_at       timestamptz not null default now(),
  constraint journal_entries_entry_type_check check (
    entry_type in (
      'initial_balance', 'sale', 'purchase', 'expense',
      'transfer', 'owner_contribution', 'owner_withdrawal',
      'cash_discrepancy', 'reversal'
    )
  ),
  constraint journal_entries_status_check check (
    status in ('pending', 'confirmed', 'reversed')
  )
);

create unique index if not exists journal_entries_number_idx
  on public.journal_entries (entry_number);

create unique index if not exists journal_entries_idempotency_idx
  on public.journal_entries (idempotency_key)
  where idempotency_key is not null;

create index if not exists journal_entries_source_idx
  on public.journal_entries (source_type, source_id);

create index if not exists journal_entries_occurred_at_idx
  on public.journal_entries (occurred_at desc);

comment on table public.journal_entries is
  'Cabecera inmutable de asientos contables. Una vez confirmado solo se corrige por reversa autorizada.';

-- FK diferida: ledger_settings → journal_entries (tabla ya creada)
do $$
begin
  alter table public.ledger_settings
    add constraint ledger_settings_initial_entry_fkey
    foreign key (initial_journal_entry_id)
    references public.journal_entries(id);
exception
  when duplicate_object then null;
end $$;

-- ============================================================
-- 4. Líneas de asiento (partidas de doble partida)
-- ============================================================

create table if not exists public.journal_lines (
  id                   uuid         primary key default gen_random_uuid(),
  journal_entry_id     uuid         not null references public.journal_entries(id),
  financial_account_id uuid         not null references public.financial_accounts(id),
  debit                numeric(14,2) not null default 0.00,
  credit               numeric(14,2) not null default 0.00,
  description          text,
  created_at           timestamptz  not null default now(),
  constraint journal_lines_debit_non_negative  check (debit  >= 0),
  constraint journal_lines_credit_non_negative check (credit >= 0),
  constraint journal_lines_not_both_sides      check (not (debit > 0 and credit > 0)),
  constraint journal_lines_one_side_required   check (debit > 0 or credit > 0)
);

create index if not exists journal_lines_entry_idx
  on public.journal_lines (journal_entry_id);

create index if not exists journal_lines_account_idx
  on public.journal_lines (financial_account_id);

comment on table public.journal_lines is
  'Partidas de asientos contables. Cada línea tiene cargo o abono, nunca ambos. FK a financial_accounts impide eliminar cuentas con movimientos.';

-- ============================================================
-- 5. Trigger: validar balance al confirmar asiento
--    El workflow es: INSERT pending → INSERT lines → UPDATE a confirmed
-- ============================================================

create or replace function public.assert_journal_entry_balanced()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_debit  numeric(14,2);
  v_credit numeric(14,2);
begin
  select
    coalesce(sum(debit),  0),
    coalesce(sum(credit), 0)
  into v_debit, v_credit
  from public.journal_lines
  where journal_entry_id = new.id;

  if v_debit = 0 and v_credit = 0 then
    raise exception 'El asiento % no tiene líneas.', new.id;
  end if;

  if v_debit <> v_credit then
    raise exception
      'El asiento % no está balanceado: débitos=% créditos=%.',
      new.id, v_debit, v_credit;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assert_journal_entry_balanced on public.journal_entries;

create trigger trg_assert_journal_entry_balanced
  before update on public.journal_entries
  for each row
  when (new.status = 'confirmed' and old.status = 'pending')
  execute function public.assert_journal_entry_balanced();

-- ============================================================
-- 6. Idempotencia de operaciones financieras
-- ============================================================

create table if not exists public.idempotency_requests (
  id              uuid        primary key default gen_random_uuid(),
  scope           text        not null,
  idempotency_key text        not null,
  request_hash    text        not null,
  status          text        not null default 'completed',
  response_json   jsonb,
  created_at      timestamptz not null default now(),
  constraint idempotency_requests_scope_key_unique
    unique (scope, idempotency_key),
  constraint idempotency_requests_status_check
    check (status in ('processing', 'completed', 'conflict'))
);

create index if not exists idempotency_requests_created_at_idx
  on public.idempotency_requests (created_at desc);

comment on table public.idempotency_requests is
  'Claves de idempotencia por alcance. Misma clave + misma carga → resultado original. Misma clave + carga distinta → conflict.';

-- ============================================================
-- 7. Auditoría de eventos financieros
--    Separada de audit_log para no romper el CHECK histórico.
-- ============================================================

create table if not exists public.audit_events (
  id              uuid        primary key default gen_random_uuid(),
  actor_id        uuid        references public.app_profiles(id),
  action          text        not null,
  entity_type     text        not null,
  entity_id       uuid,
  values_snapshot jsonb,
  result          text        not null default 'success',
  cause           text,
  occurred_at     timestamptz not null default now(),
  constraint audit_events_result_check
    check (result in ('success', 'failure', 'rejected'))
);

create index if not exists audit_events_entity_idx
  on public.audit_events (entity_type, entity_id);

create index if not exists audit_events_actor_idx
  on public.audit_events (actor_id);

create index if not exists audit_events_occurred_at_idx
  on public.audit_events (occurred_at desc);

comment on table public.audit_events is
  'Bitácora inmutable de eventos financieros del ledger. No modifica audit_log histórico.';

-- ============================================================
-- 8. Permisos de base de datos (patrón del proyecto)
-- ============================================================

grant all on table public.financial_accounts    to service_role;
grant all on table public.ledger_settings       to service_role;
grant all on table public.journal_entries       to service_role;
grant all on table public.journal_lines         to service_role;
grant all on table public.idempotency_requests  to service_role;
grant all on table public.audit_events          to service_role;

-- ============================================================
-- 9. Seed: cuentas del sistema (idempotente por ON CONFLICT)
-- ============================================================

insert into public.financial_accounts (code, name, account_type, is_system)
values
  ('1101', 'Caja operativa',                   'asset',   true),
  ('1102', 'Caja fuerte',                       'asset',   true),
  ('1103', 'Banco',                             'asset',   true),
  ('1201', 'Compras de mercancía por aplicar', 'asset',   true),
  ('1202', 'Adquisiciones por clasificar',      'asset',   true),
  ('4101', 'Ingresos por ventas',               'income',  true),
  ('4102', 'Sobrantes de caja',                 'income',  true),
  ('5101', 'Faltantes de caja',                 'expense', true),
  ('3101', 'Aportaciones del propietario',      'equity',  true),
  ('3102', 'Retiros del propietario',           'equity',  true)
on conflict (code) do nothing;

commit;
