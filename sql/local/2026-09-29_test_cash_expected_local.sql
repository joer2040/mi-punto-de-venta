-- ============================================================
-- CAJA-03A: ORIGEN DEL EFECTIVO + COUNT GUARDS — PRUEBAS CONDUCTUALES
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- Requiere migración 20260929100000_purchase_cash_source_and_count_guard.sql aplicada.
-- Un único BEGIN/ROLLBACK — ningún cambio persiste.
--
-- T1  Efectivo + caja_operativa → 1101, FO.cash_session_id = caja abierta, Cr 1101
-- T2  Efectivo + caja_fuerte    → 1102, FO.cash_session_id NULL, Cr 1102 (sin caja abierta)
-- T3  Rechazos: efectivo sin/inválido cash_source; tarjeta/transferencia + cash_source
-- T11 Tras primer conteo se bloquean: compra caja_operativa, traspaso 1101,
--     aportación 1101, reversa de asiento 1101 de la caja, venta (guard existente)
-- T12 Tras primer conteo se permiten: compra tarjeta, compra caja_fuerte,
--     traspaso 1102↔1103, reversa de asiento no-1101
--
-- CAJA-03B extenderá este archivo con T4–T10, T13–T14.
--
-- Ejecutar como:
--   docker cp sql/local/2026-09-29_test_cash_expected_local.sql \
--     supabase_db_mi-punto-de-venta:/tmp/test_caja03a.sql
--   docker exec supabase_db_mi-punto-de-venta \
--     bash -c "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/test_caja03a.sql 2>&1"
-- ============================================================

begin;

do $$
declare
  v_user_a     uuid := '30000000-0000-0000-0000-000000000001';  -- crea movimientos
  v_user_b     uuid := '30000000-0000-0000-0000-000000000002';  -- autoriza reversas
  v_center_id  uuid;
  v_provider   uuid;
  v_session_id uuid;
  v_items      jsonb := '[{"item_description":"CAJA-03A test","quantity":1,"unit_cost":100}]';
  v_result     jsonb;
  v_drawer_je  uuid;   -- asiento de compra caja_operativa (para reversa bloqueada)
  v_card_je    uuid;   -- asiento de compra tarjeta (para reversa permitida)
  v_code       text;
  v_session    uuid;
  v_ok         boolean;
  v_msg        text;
  CLOSING_MSG  constant text := '%proceso de cierre%';
begin
  raise notice 'CAJA-03A — inicio (LOCAL, BEGIN/ROLLBACK)';

  -- ── PRE ────────────────────────────────────────────────────────────────
  if exists (select 1 from public.cash_sessions where status = 'open') then
    raise exception '[PRE] Existe una caja abierta persistente; T2 requiere que no haya caja abierta.';
  end if;

  select id into v_center_id from public.centers limit 1;
  select id into v_provider  from public.providers limit 1;
  if v_center_id is null or v_provider is null then
    raise exception '[PRE] Se requiere al menos un centro y un proveedor.';
  end if;

  insert into auth.users (id) values (v_user_a), (v_user_b);
  insert into public.app_profiles (id, username, email, is_superadmin) values
    (v_user_a, 'test_caja03a_a', 'test_caja03a_a@app.local', true),
    (v_user_b, 'test_caja03a_b', 'test_caja03a_b@app.local', true);

  insert into public.ledger_settings (id, ledger_cutover_at, activated_by, activated_at)
  values (true, now() - interval '1 minute', v_user_a, now())
  on conflict (id) do update set ledger_cutover_at = excluded.ledger_cutover_at;

  -- ── T2: caja_fuerte sin caja abierta ───────────────────────────────────
  v_result := public.create_purchase_with_ledger(v_provider, v_center_id, 'T2', v_items,
    '{"method":"Efectivo","amount":100,"cash_source":"caja_fuerte"}', v_user_a, null);

  select a.code into v_code from public.financial_payments fp
    join public.financial_accounts a on a.id = fp.financial_account_id
   where fp.financial_operation_id = (v_result->>'financial_operation_id')::uuid;
  select cash_session_id into v_session from public.financial_operations
   where id = (v_result->>'financial_operation_id')::uuid;
  if v_code <> '1102' or v_session is not null then
    raise exception 'T2 FAIL: payment=% session=%', v_code, v_session;
  end if;
  select a.code into v_code from public.journal_lines jl
    join public.financial_accounts a on a.id = jl.financial_account_id
   where jl.journal_entry_id = (v_result->>'journal_entry_id')::uuid and jl.credit > 0;
  if v_code <> '1102' then raise exception 'T2 FAIL: credit=%', v_code; end if;
  raise notice 'T2 PASS — caja_fuerte → 1102, session NULL, Cr 1102, sin caja abierta';

  -- caja_operativa sin caja abierta → rechazo
  v_ok := false;
  begin
    perform public.create_purchase_with_ledger(v_provider, v_center_id, 'T1-nosession', v_items,
      '{"method":"Efectivo","amount":100,"cash_source":"caja_operativa"}', v_user_a, null);
  exception when others then v_ok := sqlerrm like '%No hay una caja abierta%'; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'T1-pre FAIL: %', coalesce(v_msg, 'sin error'); end if;
  raise notice 'T1-pre PASS — caja_operativa exige caja abierta';

  -- ── Abrir caja ─────────────────────────────────────────────────────────
  insert into public.cash_sessions (status, opening_amount, opened_by)
  values ('open', 1000.00, v_user_a)
  returning id into v_session_id;

  -- ── T1: caja_operativa ─────────────────────────────────────────────────
  v_result := public.create_purchase_with_ledger(v_provider, v_center_id, 'T1', v_items,
    '{"method":"Efectivo","amount":100,"cash_source":"caja_operativa"}', v_user_a, null);
  v_drawer_je := (v_result->>'journal_entry_id')::uuid;

  select a.code into v_code from public.financial_payments fp
    join public.financial_accounts a on a.id = fp.financial_account_id
   where fp.financial_operation_id = (v_result->>'financial_operation_id')::uuid;
  select cash_session_id into v_session from public.financial_operations
   where id = (v_result->>'financial_operation_id')::uuid;
  if v_code <> '1101' or v_session is distinct from v_session_id then
    raise exception 'T1 FAIL: payment=% session=%', v_code, v_session;
  end if;
  select a.code into v_code from public.journal_lines jl
    join public.financial_accounts a on a.id = jl.financial_account_id
   where jl.journal_entry_id = v_drawer_je and jl.credit > 0;
  if v_code <> '1101' then raise exception 'T1 FAIL: credit=%', v_code; end if;
  raise notice 'T1 PASS — caja_operativa → 1101, session = caja abierta, Cr 1101';

  -- Compra tarjeta (para reversa permitida en T12)
  v_result := public.create_purchase_with_ledger(v_provider, v_center_id, 'T12-card-src', v_items,
    '{"method":"Tarjeta","amount":100}', v_user_a, null);
  v_card_je := (v_result->>'journal_entry_id')::uuid;

  -- ── T3: combinaciones inválidas ────────────────────────────────────────
  declare
    v_cases jsonb := jsonb_build_array(
      jsonb_build_object('p', '{"method":"Efectivo","amount":100}'::jsonb,                                 'm', '%origen del efectivo%'),
      jsonb_build_object('p', '{"method":"Efectivo","amount":100,"cash_source":"bolsillo"}'::jsonb,        'm', '%origen del efectivo%'),
      jsonb_build_object('p', '{"method":"Tarjeta","amount":100,"cash_source":"caja_operativa"}'::jsonb,   'm', '%solo aplica a pagos en Efectivo%'),
      jsonb_build_object('p', '{"method":"Transferencia","amount":100,"cash_source":"caja_fuerte"}'::jsonb,'m', '%solo aplica a pagos en Efectivo%')
    );
    v_case jsonb;
  begin
    for v_case in select * from jsonb_array_elements(v_cases) loop
      v_ok := false; v_msg := null;
      begin
        perform public.create_purchase_with_ledger(v_provider, v_center_id, 'T3', v_items,
          v_case->'p', v_user_a, null);
      exception when others then v_ok := sqlerrm like (v_case->>'m'); v_msg := sqlerrm;
      end;
      if not v_ok then raise exception 'T3 FAIL (%): %', v_case->'p', coalesce(v_msg, 'sin error'); end if;
    end loop;
  end;
  raise notice 'T3 PASS — 4 combinaciones inválidas rechazadas';

  -- ── Primer conteo (simulado dentro de la transacción) ──────────────────
  update public.cash_sessions set first_counted_cash = 900.00 where id = v_session_id;

  -- ── T11: bloqueos ──────────────────────────────────────────────────────
  v_ok := false; v_msg := null;
  begin
    perform public.create_purchase_with_ledger(v_provider, v_center_id, 'T11-a', v_items,
      '{"method":"Efectivo","amount":100,"cash_source":"caja_operativa"}', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'T11 compra caja_operativa FAIL: %', coalesce(v_msg, 'sin error'); end if;

  v_ok := false; v_msg := null;
  begin
    perform public.record_transfer('1101', '1102', 50, 'T11', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'T11 traspaso 1101→1102 FAIL: %', coalesce(v_msg, 'sin error'); end if;

  v_ok := false; v_msg := null;
  begin
    perform public.record_transfer('1102', '1101', 50, 'T11', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'T11 traspaso 1102→1101 FAIL: %', coalesce(v_msg, 'sin error'); end if;

  v_ok := false; v_msg := null;
  begin
    perform public.record_owner_contribution('1101', 50, 'T11', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'T11 aportación 1101 FAIL: %', coalesce(v_msg, 'sin error'); end if;

  v_ok := false; v_msg := null;
  begin
    perform public.reverse_journal_entry(v_drawer_je, v_user_b, 'T11', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm;
  end;
  if not v_ok then raise exception 'T11 reversa asiento 1101 FAIL: %', coalesce(v_msg, 'sin error'); end if;

  -- Venta: guard existente en finalize_pos_sale (verificación estática, sin montar mesa/pedido)
  if pg_get_functiondef('public.finalize_pos_sale(uuid, jsonb, jsonb, uuid, text)'::regprocedure)
       not like '%first_counted_cash is not null%' then
    raise exception 'T11 venta FAIL: guard de cierre ausente en finalize_pos_sale';
  end if;
  raise notice 'T11 PASS — compra caja_operativa, traspasos 1101, aportación 1101, reversa 1101 bloqueados; guard de venta presente';

  -- ── T12: permitidos durante el conteo ──────────────────────────────────
  perform public.create_purchase_with_ledger(v_provider, v_center_id, 'T12-card', v_items,
    '{"method":"Tarjeta","amount":100}', v_user_a, null);
  perform public.create_purchase_with_ledger(v_provider, v_center_id, 'T12-safe', v_items,
    '{"method":"Efectivo","amount":100,"cash_source":"caja_fuerte"}', v_user_a, null);
  perform public.record_transfer('1102', '1103', 50, 'T12', v_user_a, null);
  perform public.record_transfer('1103', '1102', 50, 'T12', v_user_a, null);
  perform public.reverse_journal_entry(v_card_je, v_user_b, 'T12', v_user_a, null);
  raise notice 'T12 PASS — compra tarjeta, compra caja_fuerte, traspasos 1102↔1103, reversa no-1101 permitidos';

  raise notice 'CAJA-03A — TODAS LAS PRUEBAS PASS';
end;
$$;

rollback;
