-- Fase 6: Fondos y reversas.
-- Tablas: financial_authorizations, cash_discrepancy_resolutions.
-- RPCs: record_transfer, record_owner_contribution, record_owner_withdrawal,
--       reverse_journal_entry, resolve_cash_discrepancy.

begin;

-- ============================================================
-- 1. Autorizaciones financieras
-- ============================================================

create table if not exists public.financial_authorizations (
  id             uuid        primary key default gen_random_uuid(),
  request_type   text        not null,
  entity_type    text        not null,
  entity_id      uuid        not null,
  requested_by   uuid        not null references public.app_profiles(id),
  authorized_by  uuid        not null references public.app_profiles(id),
  decision       text        not null default 'approved',
  justification  text,
  created_at     timestamptz not null default now(),
  constraint financial_authorizations_decision_check check (
    decision in ('approved', 'rejected')
  ),
  constraint financial_authorizations_no_self_auth check (
    requested_by <> authorized_by
  )
);

create index if not exists financial_authorizations_entity_idx
  on public.financial_authorizations (entity_type, entity_id);

comment on table public.financial_authorizations is
  'Registro de autorizaciones para reversas y operaciones sensibles. El autorizador siempre debe ser distinto del solicitante.';

-- ============================================================
-- 2. Resoluciones de diferencias de caja
-- ============================================================

create table if not exists public.cash_discrepancy_resolutions (
  id               uuid        primary key default gen_random_uuid(),
  cash_session_id  uuid        not null references public.cash_sessions(id),
  resolution_type  text        not null,
  amount           numeric(14,2) not null,
  motive           text        not null,
  journal_entry_id uuid        references public.journal_entries(id),
  resolved_by      uuid        not null references public.app_profiles(id),
  created_at       timestamptz not null default now(),
  constraint cash_discrepancy_resolutions_type_check check (
    resolution_type in ('shortage', 'surplus', 'omitted_event')
  ),
  constraint cash_discrepancy_resolutions_amount_check check (amount > 0)
);

create unique index if not exists cash_discrepancy_resolutions_session_ux
  on public.cash_discrepancy_resolutions (cash_session_id);

create index if not exists cash_discrepancy_resolutions_entry_idx
  on public.cash_discrepancy_resolutions (journal_entry_id)
  where journal_entry_id is not null;

comment on table public.cash_discrepancy_resolutions is
  'Cierra diferencias pendientes de sesiones de caja. Una resolución por sesión.';

grant all on table public.financial_authorizations     to service_role;
grant all on table public.cash_discrepancy_resolutions to service_role;

-- ============================================================
-- 3. RPC record_transfer
--    Traspaso entre cuentas de fondos: 1101, 1102, 1103.
-- ============================================================

create or replace function public.record_transfer(
  p_from_code       text,
  p_to_code         text,
  p_amount          numeric(14,2),
  p_description     text,
  p_performed_by    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_from_acct_id     uuid;
  v_to_acct_id       uuid;
  v_cash_session_id  uuid;
  v_journal_entry_id uuid;
  v_financial_op_id  uuid;
  v_entry_number     text;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
  FUND_CODES         constant text[] := array['1101','1102','1103'];
begin

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;
  if p_from_code is null or p_to_code is null then
    raise exception 'Falta cuenta origen o destino.';
  end if;
  if p_from_code = p_to_code then
    raise exception 'Las cuentas origen y destino deben ser distintas.';
  end if;
  if not (p_from_code = any(FUND_CODES)) then
    raise exception 'Cuenta origen no permitida para traspasos: %.', p_from_code;
  end if;
  if not (p_to_code = any(FUND_CODES)) then
    raise exception 'Cuenta destino no permitida para traspasos: %.', p_to_code;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe del traspaso debe ser mayor que cero.';
  end if;

  -- Ledger activo
  if not exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    raise exception 'El ledger no está activo. Activa el ledger antes de registrar traspasos.';
  end if;

  -- Caja requerida si alguna cuenta es 1101
  if p_from_code = '1101' or p_to_code = '1101' then
    select id into v_cash_session_id
    from public.cash_sessions where status = 'open'
    for update;
    if v_cash_session_id is null then
      raise exception 'No hay caja abierta. Caja operativa (1101) requiere sesión activa.';
    end if;
  end if;

  -- Cuentas
  select id into v_from_acct_id from public.financial_accounts where code = p_from_code and is_active;
  select id into v_to_acct_id   from public.financial_accounts where code = p_to_code   and is_active;
  if v_from_acct_id is null or v_to_acct_id is null then
    raise exception 'Una de las cuentas del traspaso no está disponible.';
  end if;

  -- Idempotencia
  v_idem_hash := md5(jsonb_build_object(
    'from', p_from_code, 'to', p_to_code,
    'amount', p_amount, 'description', coalesce(p_description,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'transfer' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  v_entry_number := 'JE-TRP-' || upper(substr(gen_random_uuid()::text, 1, 8));

  -- Asiento
  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, created_by, idempotency_key)
  values
    (v_entry_number, 'transfer', 'pending', now(), p_performed_by, p_idempotency_key)
  returning id into v_journal_entry_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_journal_entry_id, v_to_acct_id,   p_amount, 0,        coalesce(p_description,'Traspaso') || ' — entrada'),
    (v_journal_entry_id, v_from_acct_id, 0,        p_amount, coalesce(p_description,'Traspaso') || ' — salida');

  update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

  -- Operación financiera
  insert into public.financial_operations
    (operation_type, total_amount, cash_session_id, journal_entry_id, performed_by, idempotency_key)
  values
    ('transfer', p_amount, v_cash_session_id, v_journal_entry_id, p_performed_by, p_idempotency_key)
  returning id into v_financial_op_id;

  -- Auditoría
  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'transfer_recorded', 'journal_entries', v_journal_entry_id,
    jsonb_build_object(
      'from_code', p_from_code, 'to_code', p_to_code,
      'amount', p_amount, 'entry_number', v_entry_number
    ), 'success'
  );

  v_result := jsonb_build_object(
    'journal_entry_id',       v_journal_entry_id,
    'financial_operation_id', v_financial_op_id,
    'entry_number',           v_entry_number,
    'from_code',              p_from_code,
    'to_code',                p_to_code,
    'amount',                 p_amount
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('transfer', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

-- ============================================================
-- 4. RPC record_owner_contribution
--    Aportación del propietario: débito cuenta fondos, crédito 3101.
-- ============================================================

create or replace function public.record_owner_contribution(
  p_destination_code text,
  p_amount           numeric(14,2),
  p_description      text,
  p_performed_by     uuid,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_dest_acct_id     uuid;
  v_aport_acct_id    uuid;
  v_cash_session_id  uuid;
  v_journal_entry_id uuid;
  v_financial_op_id  uuid;
  v_entry_number     text;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
  FUND_CODES         constant text[] := array['1101','1102','1103'];
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if not (p_destination_code = any(FUND_CODES)) then
    raise exception 'Cuenta destino no válida para aportación: %.', p_destination_code;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe de la aportación debe ser mayor que cero.';
  end if;

  if not exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    raise exception 'El ledger no está activo.';
  end if;

  -- 1101 requiere caja abierta
  if p_destination_code = '1101' then
    select id into v_cash_session_id from public.cash_sessions where status = 'open' for update;
    if v_cash_session_id is null then
      raise exception 'No hay caja abierta. Aportación a Caja operativa requiere sesión activa.';
    end if;
  end if;

  select id into v_dest_acct_id  from public.financial_accounts where code = p_destination_code and is_active;
  select id into v_aport_acct_id from public.financial_accounts where code = '3101' and is_active;
  if v_dest_acct_id is null or v_aport_acct_id is null then
    raise exception 'Cuentas del sistema incompletas.';
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'type','contribution','dest', p_destination_code,
    'amount', p_amount, 'description', coalesce(p_description,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'contribution' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  v_entry_number := 'JE-APT-' || upper(substr(gen_random_uuid()::text, 1, 8));

  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, created_by, idempotency_key)
  values
    (v_entry_number, 'owner_contribution', 'pending', now(), p_performed_by, p_idempotency_key)
  returning id into v_journal_entry_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_journal_entry_id, v_dest_acct_id,  p_amount, 0,        coalesce(p_description,'Aportación del propietario')),
    (v_journal_entry_id, v_aport_acct_id, 0,        p_amount, coalesce(p_description,'Aportación del propietario'));

  update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

  insert into public.financial_operations
    (operation_type, total_amount, cash_session_id, journal_entry_id, performed_by, idempotency_key)
  values
    ('owner_contribution', p_amount, v_cash_session_id, v_journal_entry_id, p_performed_by, p_idempotency_key)
  returning id into v_financial_op_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'owner_contribution_recorded', 'journal_entries', v_journal_entry_id,
    jsonb_build_object('destination_code', p_destination_code, 'amount', p_amount,
                       'entry_number', v_entry_number), 'success'
  );

  v_result := jsonb_build_object(
    'journal_entry_id',       v_journal_entry_id,
    'financial_operation_id', v_financial_op_id,
    'entry_number',           v_entry_number,
    'destination_code',       p_destination_code,
    'amount',                 p_amount
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('contribution', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

-- ============================================================
-- 5. RPC record_owner_withdrawal
--    Retiro del propietario: débito 3102, crédito cuenta fondos.
--    Prohibido desde Caja operativa (1101).
--    Requiere autorización de usuario distinto.
-- ============================================================

create or replace function public.record_owner_withdrawal(
  p_source_code     text,
  p_amount          numeric(14,2),
  p_description     text,
  p_performed_by    uuid,
  p_authorized_by   uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_source_acct_id   uuid;
  v_retiros_acct_id  uuid;
  v_auth_id          uuid;
  v_journal_entry_id uuid;
  v_financial_op_id  uuid;
  v_entry_number     text;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
  ALLOWED_CODES      constant text[] := array['1102','1103'];
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if p_authorized_by is null then raise exception 'El retiro del propietario requiere autorización.'; end if;
  if p_performed_by = p_authorized_by then
    raise exception 'El retiro debe ser autorizado por un usuario distinto al solicitante.';
  end if;
  if not (p_source_code = any(ALLOWED_CODES)) then
    raise exception 'Retiros desde Caja operativa (1101) están prohibidos. Usa Caja fuerte o Banco.';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe del retiro debe ser mayor que cero.';
  end if;

  if not exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    raise exception 'El ledger no está activo.';
  end if;

  -- Verificar que el autorizador es superadmin o manager
  if not exists (
    select 1 from public.app_profiles p
    left join public.app_user_roles ur on ur.user_id = p.id
    left join public.app_roles r on r.id = ur.role_id
    where p.id = p_authorized_by
      and p.status = 'active'
      and (p.is_superadmin = true or lower(trim(r.name)) in ('manager','administrador operativo'))
  ) then
    raise exception 'El autorizador no tiene los permisos necesarios.';
  end if;

  select id into v_source_acct_id  from public.financial_accounts where code = p_source_code and is_active;
  select id into v_retiros_acct_id from public.financial_accounts where code = '3102' and is_active;
  if v_source_acct_id is null or v_retiros_acct_id is null then
    raise exception 'Cuentas del sistema incompletas.';
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'type','withdrawal', 'source', p_source_code,
    'amount', p_amount, 'authorized_by', p_authorized_by,
    'description', coalesce(p_description,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'withdrawal' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  -- Registro de autorización
  insert into public.financial_authorizations
    (request_type, entity_type, entity_id, requested_by, authorized_by, justification)
  values
    ('owner_withdrawal', 'pending', gen_random_uuid(), p_performed_by, p_authorized_by,
     coalesce(p_description, 'Retiro del propietario'))
  returning id into v_auth_id;

  v_entry_number := 'JE-RET-' || upper(substr(gen_random_uuid()::text, 1, 8));

  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, created_by, authorization_id, idempotency_key)
  values
    (v_entry_number, 'owner_withdrawal', 'pending', now(), p_performed_by, v_auth_id, p_idempotency_key)
  returning id into v_journal_entry_id;

  -- Actualizar entity_id de la autorización al asiento real
  update public.financial_authorizations set entity_id = v_journal_entry_id where id = v_auth_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_journal_entry_id, v_retiros_acct_id, p_amount, 0,        coalesce(p_description,'Retiro del propietario')),
    (v_journal_entry_id, v_source_acct_id,  0,        p_amount, coalesce(p_description,'Retiro del propietario'));

  update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

  insert into public.financial_operations
    (operation_type, total_amount, journal_entry_id, performed_by, idempotency_key)
  values
    ('owner_withdrawal', p_amount, v_journal_entry_id, p_performed_by, p_idempotency_key)
  returning id into v_financial_op_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'owner_withdrawal_recorded', 'journal_entries', v_journal_entry_id,
    jsonb_build_object('source_code', p_source_code, 'amount', p_amount,
                       'authorized_by', p_authorized_by, 'entry_number', v_entry_number), 'success'
  );

  v_result := jsonb_build_object(
    'journal_entry_id',       v_journal_entry_id,
    'financial_operation_id', v_financial_op_id,
    'authorization_id',       v_auth_id,
    'entry_number',           v_entry_number,
    'source_code',            p_source_code,
    'amount',                 p_amount
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('withdrawal', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

-- ============================================================
-- 6. RPC reverse_journal_entry
--    Reversa autorizada: crea asiento espejo, marca original como 'reversed'.
--    El autorizador debe ser distinto del creador original.
-- ============================================================

create or replace function public.reverse_journal_entry(
  p_journal_entry_id uuid,
  p_authorized_by    uuid,
  p_justification    text,
  p_performed_by     uuid,
  p_idempotency_key  text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_original         public.journal_entries%rowtype;
  v_reversal_id      uuid;
  v_auth_id          uuid;
  v_entry_number     text;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if p_authorized_by is null then raise exception 'La reversa requiere autorización.'; end if;
  if p_performed_by = p_authorized_by then
    raise exception 'La reversa debe ser autorizada por un usuario distinto al solicitante.';
  end if;
  if p_journal_entry_id is null then raise exception 'Falta journal_entry_id.'; end if;

  -- Leer asiento original
  select * into v_original
  from public.journal_entries
  where id = p_journal_entry_id
  for share;

  if not found then
    raise exception 'Asiento no encontrado.';
  end if;
  if v_original.status <> 'confirmed' then
    raise exception 'Solo se pueden revertir asientos confirmados (status=confirmed). Este tiene status=%.', v_original.status;
  end if;
  if v_original.created_by = p_authorized_by then
    raise exception 'El autorizador no puede ser el mismo usuario que creó el asiento original.';
  end if;

  v_idem_hash := md5(jsonb_build_object(
    'entry_id', p_journal_entry_id, 'authorized_by', p_authorized_by,
    'justification', coalesce(p_justification,'')
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'reversal' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  -- Registro de autorización
  insert into public.financial_authorizations
    (request_type, entity_type, entity_id, requested_by, authorized_by, justification)
  values
    ('reversal', 'journal_entries', p_journal_entry_id, p_performed_by, p_authorized_by,
     coalesce(p_justification,'Reversa autorizada'))
  returning id into v_auth_id;

  v_entry_number := 'JE-REV-' || upper(substr(gen_random_uuid()::text, 1, 8));

  -- Asiento de reversa (espejo)
  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at, source_type, source_id,
     reversal_of_id, created_by, authorization_id, idempotency_key)
  values
    (v_entry_number, 'reversal', 'pending', now(),
     v_original.source_type, v_original.source_id,
     p_journal_entry_id, p_performed_by, v_auth_id, p_idempotency_key)
  returning id into v_reversal_id;

  -- Líneas espejo (débito ↔ crédito invertidos)
  insert into public.journal_lines
    (journal_entry_id, financial_account_id, debit, credit, description)
  select
    v_reversal_id,
    financial_account_id,
    credit,   -- invertir
    debit,    -- invertir
    'REVERSA: ' || coalesce(description, '')
  from public.journal_lines
  where journal_entry_id = p_journal_entry_id;

  -- Confirmar reversa (trigger valida balance)
  update public.journal_entries set status = 'confirmed' where id = v_reversal_id;

  -- Marcar original como revertido
  update public.journal_entries set status = 'reversed' where id = p_journal_entry_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'journal_entry_reversed', 'journal_entries', p_journal_entry_id,
    jsonb_build_object(
      'reversal_entry_id', v_reversal_id, 'authorized_by', p_authorized_by,
      'justification', p_justification, 'entry_number', v_entry_number
    ), 'success'
  );

  v_result := jsonb_build_object(
    'reversal_entry_id',    v_reversal_id,
    'original_entry_id',   p_journal_entry_id,
    'authorization_id',    v_auth_id,
    'entry_number',        v_entry_number
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('reversal', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

-- ============================================================
-- 7. RPC resolve_cash_discrepancy
--    Cierra diferencia pendiente de una sesión de caja.
--    shortage: débito 5101 Faltantes, crédito 1101.
--    surplus:  débito 1101, crédito 4102 Sobrantes.
-- ============================================================

create or replace function public.resolve_cash_discrepancy(
  p_cash_session_id uuid,
  p_resolution_type text,
  p_amount          numeric(14,2),
  p_motive          text,
  p_performed_by    uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_session          public.cash_sessions%rowtype;
  v_journal_entry_id uuid;
  v_resolution_id    uuid;
  v_entry_number     text;
  v_debit_acct_id    uuid;
  v_credit_acct_id   uuid;
  v_acct_caja_op     uuid;
  v_acct_faltantes   uuid;
  v_acct_sobrantes   uuid;
  v_idem_hash        text;
  v_idem_row         public.idempotency_requests%rowtype;
  v_result           jsonb;
begin

  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if p_cash_session_id is null then raise exception 'Falta cash_session_id.'; end if;
  if p_resolution_type not in ('shortage','surplus','omitted_event') then
    raise exception 'Tipo de resolución inválido: %. Usa shortage, surplus u omitted_event.', p_resolution_type;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe de la resolución debe ser mayor que cero.';
  end if;
  if coalesce(trim(p_motive), '') = '' then
    raise exception 'El motivo de la resolución es obligatorio.';
  end if;

  -- Verificar sesión
  select * into v_session from public.cash_sessions where id = p_cash_session_id for share;
  if not found then raise exception 'Sesión de caja no encontrada.'; end if;
  if v_session.status <> 'closed_with_pending_difference' then
    raise exception 'Solo se pueden resolver sesiones con diferencia pendiente. Esta tiene status=%.', v_session.status;
  end if;

  -- Verificar que no haya resolución existente
  if exists (select 1 from public.cash_discrepancy_resolutions where cash_session_id = p_cash_session_id) then
    raise exception 'Esta sesión ya tiene una resolución registrada.';
  end if;

  if not exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    raise exception 'El ledger no está activo.';
  end if;

  -- Cuentas
  select id into v_acct_caja_op   from public.financial_accounts where code = '1101' and is_active;
  select id into v_acct_faltantes from public.financial_accounts where code = '5101' and is_active;
  select id into v_acct_sobrantes from public.financial_accounts where code = '4102' and is_active;
  if v_acct_caja_op is null or v_acct_faltantes is null or v_acct_sobrantes is null then
    raise exception 'Cuentas del sistema incompletas.';
  end if;

  -- Mapeo contable
  case p_resolution_type
    when 'shortage', 'omitted_event' then
      v_debit_acct_id  := v_acct_faltantes;
      v_credit_acct_id := v_acct_caja_op;
    when 'surplus' then
      v_debit_acct_id  := v_acct_caja_op;
      v_credit_acct_id := v_acct_sobrantes;
  end case;

  v_idem_hash := md5(jsonb_build_object(
    'session', p_cash_session_id, 'type', p_resolution_type,
    'amount', p_amount, 'motive', p_motive
  )::text);
  if p_idempotency_key is not null then
    select * into v_idem_row
    from public.idempotency_requests
    where scope = 'discrepancy' and idempotency_key = p_idempotency_key for share;
    if found then
      if v_idem_row.request_hash = v_idem_hash then return v_idem_row.response_json; end if;
      raise exception 'Clave de idempotencia "%" ya usada con carga distinta.', p_idempotency_key;
    end if;
  end if;

  v_entry_number := 'JE-DIF-' || upper(substr(gen_random_uuid()::text, 1, 8));

  insert into public.journal_entries
    (entry_number, entry_type, status, occurred_at,
     source_type, source_id, created_by, idempotency_key)
  values
    (v_entry_number, 'cash_discrepancy', 'pending', now(),
     'cash_sessions', p_cash_session_id, p_performed_by, p_idempotency_key)
  returning id into v_journal_entry_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_journal_entry_id, v_debit_acct_id,  p_amount, 0,        p_motive),
    (v_journal_entry_id, v_credit_acct_id, 0,        p_amount, p_motive);

  update public.journal_entries set status = 'confirmed' where id = v_journal_entry_id;

  -- Registro de resolución
  insert into public.cash_discrepancy_resolutions
    (cash_session_id, resolution_type, amount, motive, journal_entry_id, resolved_by)
  values
    (p_cash_session_id, p_resolution_type, p_amount, p_motive, v_journal_entry_id, p_performed_by)
  returning id into v_resolution_id;

  insert into public.audit_events
    (actor_id, action, entity_type, entity_id, values_snapshot, result)
  values (
    p_performed_by, 'discrepancy_resolved', 'cash_sessions', p_cash_session_id,
    jsonb_build_object(
      'resolution_type', p_resolution_type, 'amount', p_amount,
      'motive', p_motive, 'entry_number', v_entry_number,
      'journal_entry_id', v_journal_entry_id
    ), 'success'
  );

  v_result := jsonb_build_object(
    'resolution_id',     v_resolution_id,
    'journal_entry_id',  v_journal_entry_id,
    'entry_number',      v_entry_number,
    'cash_session_id',   p_cash_session_id,
    'resolution_type',   p_resolution_type,
    'amount',            p_amount
  );

  if p_idempotency_key is not null then
    insert into public.idempotency_requests (scope, idempotency_key, request_hash, status, response_json)
    values ('discrepancy', p_idempotency_key, v_idem_hash, 'completed', v_result)
    on conflict (scope, idempotency_key) do nothing;
  end if;

  return v_result;
end;
$$;

-- ============================================================
-- 8. Grants
-- ============================================================

do $$
declare
  fn record;
begin
  for fn in
    select routine_name, string_agg(
      case p.udt_name
        when 'uuid'    then 'uuid'
        when 'numeric' then 'numeric'
        when 'text'    then 'text'
        when 'bool'    then 'boolean'
        else p.udt_name
      end,
      ', ' order by p.ordinal_position
    ) as args
    from information_schema.routines r
    join information_schema.parameters p
      on p.specific_name   = r.specific_name
     and p.specific_schema = r.routine_schema
     and p.parameter_mode  = 'IN'
    where r.routine_schema = 'public'
      and r.routine_name in (
        'record_transfer', 'record_owner_contribution',
        'record_owner_withdrawal', 'reverse_journal_entry',
        'resolve_cash_discrepancy'
      )
    group by r.routine_name
  loop
    execute format(
      'revoke all on function public.%I(%s) from public, anon, authenticated',
      fn.routine_name, fn.args
    );
    execute format(
      'grant execute on function public.%I(%s) to service_role',
      fn.routine_name, fn.args
    );
  end loop;
end $$;

commit;
