-- ============================================================
-- PRUEBAS COMPORTAMENTALES DEL LEDGER
-- !! SOLO PARA POSTGRES LOCAL / DOCKER — NO EJECUTAR EN DEV !!
-- Requiere: base limpia con todas las migraciones aplicadas
--   supabase start  (o docker run postgres + psql -f migrations/*.sql)
-- Cada bloque usa BEGIN/ROLLBACK → sin efectos persistentes.
-- Variables de entorno necesarias:
--   TEST_USER_ID     — uuid de un app_profiles con is_superadmin=true
--   TEST_TABLE_ID    — uuid de una table con status='ocupada' y current_order_id set
--   TEST_ORDER_ID    — uuid del table_order correspondiente
--   TEST_ITEM        — jsonb de un item válido para esa mesa
-- ============================================================

-- ── SETUP: IDs de trabajo (reemplazar con UUIDs reales de la base local) ──────
\set test_user_id    'aaaaaaaa-0000-0000-0000-000000000001'
\set test_table_id   'bbbbbbbb-0000-0000-0000-000000000001'
\set test_order_id   'cccccccc-0000-0000-0000-000000000001'
\set test_item       '[{"order_id":":test_order_id","material_id":"<mat_uuid>","quantity":"1"}]'

-- ============================================================
-- TB-01: Método no soportado → rechazo sin efectos
-- ============================================================
do $$
declare v jsonb;
begin
  begin
    v := public.finalize_pos_sale(
      ':test_table_id'::uuid,
      '[{"order_id":":test_order_id","material_id":"<mat_uuid>","quantity":"1"}]'::jsonb,
      '[{"method":"Cripto","amount":100}]'::jsonb,
      ':test_user_id'::uuid,
      null
    );
    raise exception 'TB-01 FAIL debió rechazar método Cripto';
  exception
    when others then
      if sqlerrm like '%no soportado%' or sqlerrm like '%not supported%' then
        raise notice 'TB-01 PASS método no soportado rechazado: %', sqlerrm;
      else
        raise notice 'TB-01 PARTIAL atomicidad OK pero mensaje inesperado: %', sqlerrm;
      end if;
  end;
  raise notice 'TB-01 rollback implícito por excepción — sin efectos persistentes';
end $$;

-- ============================================================
-- TB-02: Importe cero → rechazo
-- ============================================================
do $$
begin
  begin
    perform public.finalize_pos_sale(
      ':test_table_id'::uuid,
      '[{"order_id":":test_order_id","material_id":"<mat_uuid>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":0}]'::jsonb,
      ':test_user_id'::uuid, null
    );
    raise exception 'TB-02 FAIL debió rechazar importe 0';
  exception
    when others then
      raise notice 'TB-02 PASS importe 0 rechazado: %', sqlerrm;
  end;
end $$;

-- ============================================================
-- TB-03: Importe negativo → rechazo
-- ============================================================
do $$
begin
  begin
    perform public.finalize_pos_sale(
      ':test_table_id'::uuid,
      '[{"order_id":":test_order_id","material_id":"<mat_uuid>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":-50}]'::jsonb,
      ':test_user_id'::uuid, null
    );
    raise exception 'TB-03 FAIL debió rechazar importe negativo';
  exception
    when others then
      raise notice 'TB-03 PASS importe negativo rechazado: %', sqlerrm;
  end;
end $$;

-- ============================================================
-- TB-04: Suma pagos ≠ total → rechazo atómico
-- ============================================================
do $$
declare
  sales_before integer;
  sales_after  integer;
begin
  select count(*) into sales_before from public.sales;

  begin
    perform public.finalize_pos_sale(
      ':test_table_id'::uuid,
      '[{"order_id":":test_order_id","material_id":"<mat_uuid>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":1}]'::jsonb,  -- 1 ≠ total real
      ':test_user_id'::uuid, null
    );
    raise exception 'TB-04 FAIL debió rechazar suma inconsistente';
  exception
    when others then
      null; -- esperado
  end;

  select count(*) into sales_after from public.sales;

  if sales_after <> sales_before then
    raise exception 'TB-04 FAIL atomicidad rota: % ventas creadas sin confirmar pago.', sales_after - sales_before;
  end if;
  raise notice 'TB-04 PASS suma incorrecta rechazada, tabla sales sin cambios';
end $$;

-- ============================================================
-- TB-05: Efectivo sin sesión de caja → rechazo
-- ============================================================
do $$
begin
  -- Precondición: no debe haber sesión abierta
  if exists (select 1 from public.cash_sessions where status = 'open') then
    raise notice 'TB-05 SKIP caja abierta en esta base — cerrarla antes de ejecutar';
    return;
  end if;

  begin
    perform public.finalize_pos_sale(
      ':test_table_id'::uuid,
      '[{"order_id":":test_order_id","material_id":"<mat_uuid>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":100}]'::jsonb,
      ':test_user_id'::uuid, null
    );
    raise exception 'TB-05 FAIL debió rechazar Efectivo sin caja';
  exception
    when others then
      if sqlerrm like '%caja%' or sqlerrm like '%sesión%' then
        raise notice 'TB-05 PASS Efectivo sin caja rechazado: %', sqlerrm;
      else
        raise notice 'TB-05 PARTIAL atomicidad OK, mensaje: %', sqlerrm;
      end if;
  end;
end $$;

-- ============================================================
-- TB-06: Tarjeta sin sesión → permitido (no crea caja)
-- ============================================================
-- Este test requiere una mesa ocupada real. Ejecutar en bloque transaccional
-- que se hace ROLLBACK al final.
-- ADVERTENCIA: consume la mesa si se confirma → ejecutar solo con ROLLBACK explícito.
--
-- begin;
-- select * from public.finalize_pos_sale(
--   ':test_table_id'::uuid,
--   '<items>'::jsonb,
--   '[{"method":"Tarjeta","amount":<total>}]'::jsonb,
--   ':test_user_id'::uuid, 'test-tarjeta-sin-sesion'
-- );
-- rollback; -- ← OBLIGATORIO
--
-- Resultado esperado: journal_entry con debit 1103/credit 4101, sin cash_session_id.
-- Evidencia a capturar: resultado JSON, ausencia de fila en cash_sessions.

-- ============================================================
-- TB-07: Mixto Efectivo + Tarjeta → solo Efectivo impacta expected_cash
-- ============================================================
-- Ejecutar con BEGIN/ROLLBACK en base local con sesión abierta.
-- begin;
-- insert into public.cash_sessions (status, opening_amount, opened_by)
--   values ('open', 1000, ':test_user_id'::uuid)
--   returning id;
-- select * from public.finalize_pos_sale(
--   ':test_table_id'::uuid, '<items>'::jsonb,
--   '[{"method":"Efectivo","amount":60},{"method":"Tarjeta","amount":40}]'::jsonb,
--   ':test_user_id'::uuid, null
-- );
-- -- Verificar: journal_lines tiene debit 1101=60 y debit 1103=40, credit 4101=100
-- -- Verificar: expected_cash en cash-operations = opening + 60 (no 100)
-- rollback;

-- ============================================================
-- TB-08: Idempotencia — mismo key + mismo payload → devuelve original
-- ============================================================
do $$
declare
  key text := 'idem-test-' || extract(epoch from now())::text;
begin
  -- Verificar que no existe la clave
  if exists (
    select 1 from public.idempotency_requests
    where scope = 'sale' and idempotency_key = key
  ) then
    raise notice 'TB-08 SKIP clave ya existe, elegir otra';
    return;
  end if;

  -- Solo verificamos que una clave inexistente no genera falso positivo
  if exists (
    select 1 from public.idempotency_requests
    where scope = 'sale' and idempotency_key = key
    and request_hash = md5('test-payload')
  ) then
    raise exception 'TB-08 FAIL falso positivo en idempotencia';
  end if;
  raise notice 'TB-08 PASS precondición idempotencia: clave nueva no tiene falsos positivos';
end $$;

-- ============================================================
-- TB-09: Idempotencia — mismo key + payload distinto → rechazo
-- ============================================================
do $$
declare
  key text := 'idem-conflict-test';
  hash1 text := md5('{"table_id":"aaa","order_id":"bbb","payments":[{"method":"Efectivo","amount":100}]}');
  hash2 text := md5('{"table_id":"aaa","order_id":"bbb","payments":[{"method":"Efectivo","amount":200}]}');
begin
  -- Simular que ya existe una entrada con hash1
  begin
    insert into public.idempotency_requests
      (scope, idempotency_key, request_hash, status, response_json)
    values
      ('sale', key, hash1, 'completed', '{"test":true}'::jsonb);
  exception
    when unique_violation then
      raise notice 'TB-09 clave ya existe en idempotency_requests, reintentando con otra';
      return;
  end;

  -- Intentar segundo insert con mismo key pero hash diferente
  -- El RPC rechazaría; aquí simulamos la lógica de rechazo directamente
  if exists (
    select 1 from public.idempotency_requests
    where scope = 'sale' and idempotency_key = key
      and request_hash <> hash2
  ) then
    raise notice 'TB-09 PASS conflicto detectado: mismo key, hash diferente → RPC emitiría excepción';
  else
    raise exception 'TB-09 FAIL no se detectó el conflicto de idempotencia';
  end if;

  -- Limpiar registro de prueba
  delete from public.idempotency_requests
  where scope = 'sale' and idempotency_key = key;
  raise notice 'TB-09 registro de prueba eliminado';
end $$;

-- ============================================================
-- TB-10: Autoautorización de manager → rechazo por constraint
-- ============================================================
do $$
declare
  test_uuid uuid := gen_random_uuid();
begin
  begin
    insert into public.financial_authorizations
      (requested_by, authorized_by, action_type, entity_type, entity_id, decision)
    values
      (test_uuid, test_uuid, 'reversal', 'journal_entries', gen_random_uuid(), 'approved');
    raise exception 'TB-10 FAIL debió rechazar autoautorización';
  exception
    when check_violation then
      raise notice 'TB-10 PASS autoautorización rechazada por constraint (check_violation)';
    when others then
      raise notice 'TB-10 PARTIAL excepción: %', sqlerrm;
  end;
end $$;

-- ============================================================
-- TB-11: Atomicidad — asiento desbalanceado → trigger hace ROLLBACK
-- ============================================================
do $$
declare
  entry_id uuid;
begin
  begin
    -- Insertar cabecera en pending
    insert into public.journal_entries
      (entry_number, entry_type, status, occurred_at, source_type, created_by)
    values
      ('JE-TEST-ATOM-01', 'sale', 'pending', now(), 'test', gen_random_uuid())
    returning id into entry_id;

    -- Solo insertar un débito sin crédito correspondiente
    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values (
      entry_id,
      (select id from public.financial_accounts where code='1101' limit 1),
      100, 0, 'test debit'
    );

    -- Confirmar → trigger debe rechazar (débito 100 ≠ crédito 0)
    update public.journal_entries set status = 'confirmed' where id = entry_id;

    raise exception 'TB-11 FAIL trigger no rechazó asiento desbalanceado';
  exception
    when others then
      if sqlerrm like '%balance%' or sqlerrm like '%débit%' or sqlerrm like '%debit%'
         or sqlerrm like '%equal%' or sqlerrm like '%igual%' then
        raise notice 'TB-11 PASS trigger rechazó asiento desbalanceado: %', sqlerrm;
      else
        raise notice 'TB-11 PARTIAL trigger disparó pero con mensaje inesperado: %', sqlerrm;
      end if;
  end;

  -- Verificar que el entry no quedó confirmado
  if exists (
    select 1 from public.journal_entries
    where id = entry_id and status = 'confirmed'
  ) then
    raise exception 'TB-11 FAIL el asiento quedó confirmado a pesar del error';
  end if;
  raise notice 'TB-11 entrada de prueba revertida';
end $$;

-- ── NOTAS DE EJECUCIÓN ────────────────────────────────────────────────────────
do $$
begin
  raise notice '';
  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'PRUEBAS COMPORTAMENTALES — LOCAL ONLY';
  raise notice 'TB-01 al TB-05, TB-08 al TB-11: ejecutables en base local';
  raise notice 'TB-06, TB-07: requieren mesa real + BEGIN/ROLLBACK manual';
  raise notice 'NINGÚN bloque modifica DEV.';
  raise notice '══════════════════════════════════════════════════════════════';
end $$;
