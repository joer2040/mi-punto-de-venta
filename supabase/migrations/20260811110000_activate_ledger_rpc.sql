-- Fase 2: Activación del ledger.
-- Tabla bank_reconciliation_items + RPC activate_ledger.
-- Migración aditiva e idempotente.

begin;

-- ============================================================
-- 1. Partidas bancarias pendientes al corte
-- ============================================================

create table if not exists public.bank_reconciliation_items (
  id                uuid         primary key default gen_random_uuid(),
  journal_entry_id  uuid         not null references public.journal_entries(id),
  description       text         not null,
  amount            numeric(14,2) not null,
  item_type         text         not null,
  status            text         not null default 'pending',
  reconciled_at     timestamptz,
  created_by        uuid         not null references public.app_profiles(id),
  created_at        timestamptz  not null default now(),
  constraint bank_reconciliation_items_amount_check
    check (amount > 0),
  constraint bank_reconciliation_items_item_type_check
    check (item_type in ('deposit', 'charge')),
  constraint bank_reconciliation_items_status_check
    check (status in ('pending', 'reconciled'))
);

create index if not exists bank_reconciliation_items_entry_idx
  on public.bank_reconciliation_items (journal_entry_id);

create index if not exists bank_reconciliation_items_status_idx
  on public.bank_reconciliation_items (status)
  where status = 'pending';

comment on table public.bank_reconciliation_items is
  'Partidas bancarias pendientes identificadas al corte del ledger para conciliación posterior.';

grant all on table public.bank_reconciliation_items to service_role;

-- ============================================================
-- 2. RPC: activate_ledger
--    Única operación autorizada solo para Superadministrador.
--    Atómica: ledger_settings + journal_entry + lines + audit.
--    Idempotente: misma clave + misma carga → resultado original.
-- ============================================================

create or replace function public.activate_ledger(
  p_performed_by           uuid,
  p_opening_cash_operativa numeric(14,2),
  p_opening_cash_fuerte    numeric(14,2),
  p_opening_banco          numeric(14,2),
  p_bank_pending_items     jsonb    default '[]'::jsonb,
  p_idempotency_key        text     default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_idem_row    public.idempotency_requests%rowtype;
  v_settings    public.ledger_settings%rowtype;
  v_entry_id    uuid;
  v_acct_op     uuid;
  v_acct_ft     uuid;
  v_acct_banco  uuid;
  v_acct_aporta uuid;
  v_total       numeric(14,2);
  v_cutover_at  timestamptz;
  v_req_hash    text;
  v_result      jsonb;
begin
  -- Calcular hash del payload para idempotencia
  v_req_hash := md5(jsonb_build_object(
    'cash_operativa', p_opening_cash_operativa,
    'cash_fuerte',    p_opening_cash_fuerte,
    'banco',          p_opening_banco,
    'bank_items',     coalesce(p_bank_pending_items, '[]'::jsonb)
  )::text);

  -- Verificar idempotencia previa
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'activate_ledger'
      and idempotency_key = p_idempotency_key
    for share;

    if found then
      if v_idem_row.request_hash = v_req_hash then
        return v_idem_row.response_json;
      else
        raise exception 'La clave de idempotencia "%" ya fue usada con una carga distinta.', p_idempotency_key;
      end if;
    end if;
  end if;

  -- Verificar permiso: solo Superadministrador
  perform 1 from public.app_profiles
  where id = p_performed_by
    and is_superadmin = true
    and status = 'active';

  if not found then
    raise exception 'Solo un Superadministrador activo puede activar el ledger.';
  end if;

  -- Verificar que el ledger no esté ya activado
  select * into v_settings from public.ledger_settings where id = true;
  if found and v_settings.ledger_cutover_at is not null then
    raise exception 'El ledger ya fue activado el %.', v_settings.activated_at;
  end if;

  -- Precondición: sin sesión de caja abierta
  if exists (select 1 from public.cash_sessions where status = 'open') then
    raise exception 'Existe una sesión de caja abierta. Ciérrala antes de activar el ledger.';
  end if;

  -- Precondición: sin pedidos activos en mesas
  if exists (select 1 from public.tables where lower(trim(status)) = 'ocupada') then
    raise exception 'Hay mesas con pedidos activos. Ciérralos antes de activar el ledger.';
  end if;

  -- Validar montos
  if coalesce(p_opening_cash_operativa, 0) < 0
     or coalesce(p_opening_cash_fuerte, 0) < 0
     or coalesce(p_opening_banco, 0) < 0 then
    raise exception 'Los saldos iniciales no pueden ser negativos.';
  end if;

  v_total :=
    coalesce(p_opening_cash_operativa, 0) +
    coalesce(p_opening_cash_fuerte, 0) +
    coalesce(p_opening_banco, 0);

  if v_total <= 0 then
    raise exception 'El saldo inicial total debe ser mayor que cero.';
  end if;

  -- Obtener IDs de cuentas sistema
  select id into v_acct_op    from public.financial_accounts where code = '1101' and is_active and is_system;
  select id into v_acct_ft    from public.financial_accounts where code = '1102' and is_active and is_system;
  select id into v_acct_banco from public.financial_accounts where code = '1103' and is_active and is_system;
  select id into v_acct_aporta from public.financial_accounts where code = '3101' and is_active and is_system;

  if v_acct_op is null or v_acct_ft is null or v_acct_banco is null or v_acct_aporta is null then
    raise exception 'Cuentas del sistema incompletas. Verifica el catálogo financiero.';
  end if;

  v_cutover_at := now();

  -- Crear cabecera del asiento inicial (pending)
  insert into public.journal_entries (
    entry_number,
    entry_type,
    status,
    occurred_at,
    source_type,
    created_by,
    idempotency_key
  )
  values (
    'JE-INICIAL-' || upper(substr(gen_random_uuid()::text, 1, 8)),
    'initial_balance',
    'pending',
    v_cutover_at,
    'ledger_activation',
    p_performed_by,
    p_idempotency_key
  )
  returning id into v_entry_id;

  -- Líneas de débito: activos con saldo > 0
  if coalesce(p_opening_cash_operativa, 0) > 0 then
    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values
      (v_entry_id, v_acct_op, p_opening_cash_operativa, 0, 'Saldo inicial Caja operativa');
  end if;

  if coalesce(p_opening_cash_fuerte, 0) > 0 then
    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values
      (v_entry_id, v_acct_ft, p_opening_cash_fuerte, 0, 'Saldo inicial Caja fuerte');
  end if;

  if coalesce(p_opening_banco, 0) > 0 then
    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values
      (v_entry_id, v_acct_banco, p_opening_banco, 0, 'Saldo inicial Banco');
  end if;

  -- Línea de crédito: aportaciones del propietario (balance)
  insert into public.journal_lines
    (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_entry_id, v_acct_aporta, 0, v_total, 'Capital inicial al corte del ledger');

  -- Confirmar asiento — trigger valida débitos = créditos
  update public.journal_entries
     set status = 'confirmed'
   where id = v_entry_id;

  -- Registrar partidas bancarias pendientes (informativas, no generan asiento)
  if p_bank_pending_items is not null
     and jsonb_typeof(p_bank_pending_items) = 'array'
     and jsonb_array_length(p_bank_pending_items) > 0 then

    insert into public.bank_reconciliation_items
      (journal_entry_id, description, amount, item_type, created_by)
    select
      v_entry_id,
      trim(item->>'description'),
      (item->>'amount')::numeric(14,2),
      lower(trim(item->>'item_type')),
      p_performed_by
    from jsonb_array_elements(p_bank_pending_items) as item
    where nullif(trim(item->>'description'), '') is not null
      and nullif(item->>'amount', '') is not null
      and (item->>'amount')::numeric(14,2) > 0
      and lower(trim(item->>'item_type')) in ('deposit', 'charge');
  end if;

  -- Activar ledger (upsert singleton)
  insert into public.ledger_settings
    (id, ledger_cutover_at, initial_journal_entry_id, activated_by, activated_at)
  values
    (true, v_cutover_at, v_entry_id, p_performed_by, v_cutover_at)
  on conflict (id) do update
    set ledger_cutover_at        = excluded.ledger_cutover_at,
        initial_journal_entry_id = excluded.initial_journal_entry_id,
        activated_by             = excluded.activated_by,
        activated_at             = excluded.activated_at;

  -- Auditoría
  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by,
    'ledger_activated',
    'ledger_settings',
    v_entry_id,
    jsonb_build_object(
      'ledger_cutover_at',         v_cutover_at,
      'opening_cash_operativa',    p_opening_cash_operativa,
      'opening_cash_fuerte',       p_opening_cash_fuerte,
      'opening_banco',             p_opening_banco,
      'total_initial_balance',     v_total,
      'initial_journal_entry_id',  v_entry_id
    ),
    'success'
  );

  v_result := jsonb_build_object(
    'ledger_cutover_at',          v_cutover_at,
    'initial_journal_entry_id',   v_entry_id,
    'activated_at',               v_cutover_at,
    'total_initial_balance',      v_total
  );

  -- Registrar idempotencia
  if p_idempotency_key is not null then
    insert into public.idempotency_requests
      (scope, idempotency_key, request_hash, status, response_json)
    values
      ('activate_ledger', p_idempotency_key, v_req_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

revoke all on function public.activate_ledger(uuid, numeric, numeric, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.activate_ledger(uuid, numeric, numeric, numeric, jsonb, text)
  to service_role;

commit;
