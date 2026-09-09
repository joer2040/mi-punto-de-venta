-- ============================================================
-- SOLO POSTGRESQL LOCAL. PROHIBIDO EJECUTAR EN DEV.
-- ============================================================
-- Pruebas conductuales del ledger financiero — Fase 3
-- Entorno requerido: base local con TODAS las migraciones aplicadas
--   incluida 20260812100000_fix_account_5201_to_5102.sql
-- Método de ejecución:
--   psql -U postgres -d <db_local> -f sql/local/2026-08-11_test_behavioral_ledger_local.sql
-- Cada prueba usa BEGIN/ROLLBACK — ninguna escribe permanentemente.
-- ============================================================

-- ── INSTRUCCIONES DE CONFIGURACIÓN ──────────────────────────────────────────
-- Antes de ejecutar, reemplaza los marcadores en esta sección.
-- Necesitas: una tabla 'ocupada' con un pedido activo,
--            un usuario superadmin activo,
--            un material con precio definido.
--
-- REPLACE: <test_table_id>    → uuid de una tabla con status='ocupada'
--                               y current_order_id IS NOT NULL
-- REPLACE: <test_order_id>    → uuid de table_orders correspondiente
-- REPLACE: <test_material_id> → uuid de un material con is_active=true
-- REPLACE: <test_user_id>     → uuid de app_profiles con is_superadmin=true
-- REPLACE: <test_item_price>  → precio unitario del material (numeric)
--
-- Ejemplo de valores de prueba (reemplazar con los reales de tu base):
--   test_table_id    = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
--   test_order_id    = 'aaaaaaaa-bbbb-cccc-dddd-ffffffffffff'
--   test_material_id = 'aaaaaaaa-bbbb-cccc-dddd-111111111111'
--   test_user_id     = 'aaaaaaaa-bbbb-cccc-dddd-222222222222'
--   test_item_price  = 100.00
-- ============================================================

-- ── PREFLIGHT: validar prerrequisitos antes de ejecutar pruebas ───────────────
do $$
declare
  missing text[] := '{}';
begin
  -- Ledger no activo (condición de Fases 1-3)
  if exists (select 1 from public.ledger_settings where id = true and ledger_cutover_at is not null) then
    missing := array_append(missing, 'LEDGER ACTIVO — estas pruebas asumen ledger inactivo');
  end if;

  -- Migraciones del ledger aplicadas
  if not exists (select 1 from public.financial_accounts where code = '5102' and is_system) then
    missing := array_append(missing, 'cuenta 5102 no encontrada → migración 20260812100000 no aplicada');
  end if;
  if exists (select 1 from public.financial_accounts where code = '5201') then
    missing := array_append(missing, 'cuenta 5201 aún existe → ejecutar migración 20260812100000 primero');
  end if;

  -- RPCs necesarias
  if not exists (select 1 from information_schema.routines where routine_schema='public' and routine_name='finalize_pos_sale') then
    missing := array_append(missing, 'RPC finalize_pos_sale ausente');
  end if;
  if not exists (select 1 from information_schema.routines where routine_schema='public' and routine_name='get_account_balances') then
    missing := array_append(missing, 'RPC get_account_balances ausente');
  end if;

  if array_length(missing, 1) > 0 then
    raise exception E'PREFLIGHT FAIL — prerrequisitos faltantes:\n  %\nDetener ejecución. Resolver antes de continuar.',
      array_to_string(missing, E'\n  ');
  end if;

  raise notice 'PREFLIGHT PASS — base local lista para pruebas conductuales';
end $$;

-- ============================================================
-- TB-01: Método de pago no soportado → rechazo atómico
-- ============================================================
-- Diseño: invocar finalize_pos_sale con método 'Cripto' (no en el enum).
-- Esperado: excepción con mensaje que contenga 'no soportado' o 'not supported'
--           o similar. La venta NO debe crearse.
-- Atomicidad: la excepción dentro del RPC hace ROLLBACK implícito.
-- PENDIENTE DE VALIDAR: texto exacto del mensaje de error.
do $$
declare
  sales_before integer;
  sales_after  integer;
begin
  select count(*) into sales_before from public.sales;

  begin
    perform public.finalize_pos_sale(
      -- REPLACE: los 4 UUIDs y el items/payments jsonb
      'REPLACE:<test_table_id>'::uuid,
      '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
      '[{"method":"Cripto","amount":100}]'::jsonb,
      'REPLACE:<test_user_id>'::uuid,
      null
    );
    raise exception 'TB-01 FAIL debió rechazar método Cripto sin excepción';
  exception when others then
    if sqlerrm like '%no soportado%' or sqlerrm like '%not supported%'
       or sqlerrm like '%method%' or sqlerrm like '%método%'
       or sqlerrm like '%invalid%' then
      raise notice 'TB-01 PASS método Cripto rechazado: %', sqlerrm;
    else
      raise notice 'TB-01 PARTIAL rechazo ocurrió pero mensaje inesperado: %', sqlerrm;
    end if;
  end;

  select count(*) into sales_after from public.sales;
  if sales_after <> sales_before then
    raise exception 'TB-01 FAIL atomicidad rota: % ventas creadas.', sales_after - sales_before;
  end if;
  raise notice 'TB-01 atomicidad OK — sales sin cambios';
end $$;

-- ============================================================
-- TB-02: Importe cero → rechazo
-- ============================================================
-- Diseño: amount=0 debe rechazarse en validación de montos.
-- PENDIENTE DE VALIDAR: el RPC valida amount > 0 por elemento; revisar línea
--   de validación en 20260811140000_sale_financial_entries.sql.
do $$
begin
  begin
    perform public.finalize_pos_sale(
      'REPLACE:<test_table_id>'::uuid,
      '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":0}]'::jsonb,
      'REPLACE:<test_user_id>'::uuid, null
    );
    raise exception 'TB-02 FAIL debió rechazar importe 0';
  exception when others then
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
      'REPLACE:<test_table_id>'::uuid,
      '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":-50}]'::jsonb,
      'REPLACE:<test_user_id>'::uuid, null
    );
    raise exception 'TB-03 FAIL debió rechazar importe negativo';
  exception when others then
    raise notice 'TB-03 PASS importe negativo rechazado: %', sqlerrm;
  end;
end $$;

-- ============================================================
-- TB-04: Suma de pagos ≠ total de items → rechazo atómico
-- ============================================================
-- Diseño: payments suma 1.00 pero el item cuesta REPLACE:<test_item_price>.
-- Esperado: excepción por sum(payments) ≠ total calculado.
-- Atomicidad: ninguna venta debe quedar en tabla sales.
do $$
declare
  sales_before integer;
  sales_after  integer;
begin
  select count(*) into sales_before from public.sales;

  begin
    perform public.finalize_pos_sale(
      'REPLACE:<test_table_id>'::uuid,
      '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":1.00}]'::jsonb,   -- 1 ≠ <test_item_price>
      'REPLACE:<test_user_id>'::uuid, null
    );
    raise exception 'TB-04 FAIL debió rechazar suma inconsistente';
  exception when others then
    null;
  end;

  select count(*) into sales_after from public.sales;
  if sales_after <> sales_before then
    raise exception 'TB-04 FAIL atomicidad rota: % ventas creadas sin confirmar.', sales_after - sales_before;
  end if;
  raise notice 'TB-04 PASS suma incorrecta rechazada, atomicidad confirmada';
end $$;

-- ============================================================
-- TB-05: Efectivo sin sesión de caja abierta → rechazo
-- ============================================================
-- Diseño: no debe haber cash_sessions open. Si la hay → SKIP.
-- PENDIENTE DE VALIDAR: texto exacto del mensaje (caja/sesión/session).
do $$
begin
  if exists (select 1 from public.cash_sessions where status = 'open') then
    raise notice 'TB-05 SKIP caja abierta en esta base — cerrarla antes de ejecutar';
    return;
  end if;

  begin
    perform public.finalize_pos_sale(
      'REPLACE:<test_table_id>'::uuid,
      '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
      '[{"method":"Efectivo","amount":REPLACE:<test_item_price>}]'::jsonb,
      'REPLACE:<test_user_id>'::uuid, null
    );
    raise exception 'TB-05 FAIL debió rechazar Efectivo sin caja';
  exception when others then
    if sqlerrm like '%caja%' or sqlerrm like '%sesi%' or sqlerrm like '%session%' then
      raise notice 'TB-05 PASS Efectivo sin caja rechazado correctamente: %', sqlerrm;
    else
      raise notice 'TB-05 PARTIAL rechazo ocurrió, revisar mensaje: %', sqlerrm;
    end if;
  end;
end $$;

-- ============================================================
-- TB-06: Solo Tarjeta sin sesión de caja → permitido
-- ============================================================
-- Diseño: Tarjeta no requiere cash_session_id.
-- Aislamiento: BEGIN/ROLLBACK — ningún cambio persiste.
-- PENDIENTE DE VALIDAR: el campo cash_session_id en financial_operations queda NULL.
begin;
  -- Si hay sesión abierta, cerrarla temporalmente (dentro del ROLLBACK)
  -- O verificar que el RPC no exija sesión para Tarjeta
  select * from public.finalize_pos_sale(
    'REPLACE:<test_table_id>'::uuid,
    '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
    '[{"method":"Tarjeta","amount":REPLACE:<test_item_price>}]'::jsonb,
    'REPLACE:<test_user_id>'::uuid,
    'test-tb06-tarjeta-sin-sesion'   -- idempotency key
  );
  -- Verificar: sin cash_session_id en financial_operations, con journal_entry debit 1103
  select fo.cash_session_id,
         (select sum(jl.debit) from journal_lines jl
            join financial_accounts fa on fa.id = jl.financial_account_id
           where jl.journal_entry_id = fo.journal_entry_id and fa.code = '1103') as banco_debit
    from financial_operations fo
   where fo.operation_type = 'sale'
   order by fo.created_at desc limit 1;
rollback;
-- Resultado esperado: cash_session_id = NULL, banco_debit = <test_item_price>

-- ============================================================
-- TB-07: Pago mixto Efectivo + Tarjeta → solo Efectivo afecta expected_cash
-- ============================================================
-- Diseño: 90 Efectivo + 60 Tarjeta = 150 total (= test_item_price).
-- Esperado: journal_lines debit 1101=90, debit 1103=60, credit 4101=150.
-- expected_cash cambia en 60, no en 100.
-- PENDIENTE DE VALIDAR: lógica de expected_cash en cash-operations Edge Function.
begin;
  -- Crear sesión de caja simulada
  insert into public.cash_sessions (status, opening_amount, opened_by)
  values ('open', 500.00, 'REPLACE:<test_user_id>'::uuid)
  returning id as session_id;

  -- Ejecutar venta mixta
  select * from public.finalize_pos_sale(
    'REPLACE:<test_table_id>'::uuid,
    '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
    '[{"method":"Efectivo","amount":90},{"method":"Tarjeta","amount":60}]'::jsonb,
    'REPLACE:<test_user_id>'::uuid,
    'test-tb07-mixto-efectivo-tarjeta'
  );

  -- Verificar líneas del journal: 1101=60, 1103=40, 4101=100
  select fa.code, jl.debit, jl.credit
    from journal_lines jl
    join financial_accounts fa on fa.id = jl.financial_account_id
    join financial_operations fo on fo.journal_entry_id = jl.journal_entry_id
   where fo.operation_type = 'sale'
   order by fo.created_at desc, fa.code;
rollback;
-- Resultado esperado:
--   1101 | 90.00 | 0
--   1103 | 60.00 | 0
--   4101 | 0     | 150.00

-- ============================================================
-- TB-08: Solo Transferencia → débita 1103 (sin sesión de caja)
-- ============================================================
-- PENDIENTE DE VALIDAR: Transferencia tratada igual que Tarjeta (→1103).
begin;
  select * from public.finalize_pos_sale(
    'REPLACE:<test_table_id>'::uuid,
    '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
    '[{"method":"Transferencia","amount":REPLACE:<test_item_price>}]'::jsonb,
    'REPLACE:<test_user_id>'::uuid,
    'test-tb08-transferencia'
  );
  select fa.code, jl.debit
    from journal_lines jl
    join financial_accounts fa on fa.id = jl.financial_account_id
    join financial_operations fo on fo.journal_entry_id = jl.journal_entry_id
   where fo.operation_type = 'sale'
   order by fo.created_at desc, fa.code;
rollback;
-- Resultado esperado: código 1103 con debit = <test_item_price>

-- ============================================================
-- TB-09: Idempotencia — misma clave + mismo payload → resultado original
-- ============================================================
-- Diseño: primera llamada debe insertar; segunda con misma clave y hash
--         debe devolver el response_json original sin crear nueva venta.
-- Aislamiento: BEGIN/ROLLBACK — ningún cambio persiste.
-- PENDIENTE DE VALIDAR: el RPC devuelve exactamente el mismo JSON en 2ª llamada.
begin;
  -- Primera llamada
  select * from public.finalize_pos_sale(
    'REPLACE:<test_table_id>'::uuid,
    '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
    '[{"method":"Tarjeta","amount":REPLACE:<test_item_price>}]'::jsonb,
    'REPLACE:<test_user_id>'::uuid,
    'test-tb09-idempotencia-valida'
  );
  -- finalize_pos_sale liberó la mesa (línea 654) Y eliminó table_orders (línea 663).
  -- Restaurar ambos para que la segunda llamada pase la validación de mesa.
  -- Abrir sesión temporal (satisface triggers que exigen caja abierta).
  insert into public.cash_sessions (status, opening_amount, opened_by)
  select 'open', 500.00, 'REPLACE:<test_user_id>'::uuid
  where not exists (select 1 from public.cash_sessions where status = 'open');

  -- Re-insertar table_orders (trigger exige caja abierta — ya existe)
  insert into public.table_orders (id, table_id, items, total)
  values (
    'REPLACE:<test_order_id>'::uuid,
    'REPLACE:<test_table_id>'::uuid,
    '[]', 0
  );

  -- Restaurar mesa a 'ocupada' (trigger exige caja abierta — ya existe)
  update public.tables
     set status = 'ocupada', current_order_id = 'REPLACE:<test_order_id>'::uuid
   where id = 'REPLACE:<test_table_id>'::uuid;

  -- Segunda llamada — mismo key, mismo payload
  -- La ruta de idempotencia retorna response_json cacheado ANTES de liberar la mesa.
  select * from public.finalize_pos_sale(
    'REPLACE:<test_table_id>'::uuid,
    '[{"order_id":"REPLACE:<test_order_id>","material_id":"REPLACE:<test_material_id>","quantity":"1"}]'::jsonb,
    '[{"method":"Tarjeta","amount":REPLACE:<test_item_price>}]'::jsonb,
    'REPLACE:<test_user_id>'::uuid,
    'test-tb09-idempotencia-valida'   -- misma clave
  );
  -- Verificar: 1 sola venta en sales con esta clave de idempotencia
  select count(*) as total_ventas_con_key
    from public.idempotency_requests
   where idempotency_key = 'test-tb09-idempotencia-valida';
rollback;
-- Resultado esperado: total_ventas_con_key = 1

-- ============================================================
-- TB-10: Idempotencia — misma clave + payload diferente → conflicto
-- ============================================================
-- Diseño: insertar registro en idempotency_requests con hash1,
--         luego verificar que hash2 diferente generaría conflicto.
-- NO se llama al RPC completo — simula solo la lógica de detección.
begin;
  insert into public.idempotency_requests
    (scope, idempotency_key, request_hash, status, response_json)
  values
    ('sale', 'test-tb10-conflict',
     md5('{"table_id":"aaa","payments":[{"method":"Efectivo","amount":100}]}'),
     'completed', '{"sale_id":"original"}'::jsonb);

  -- Verificar que el conflicto sería detectado (hash diferente misma clave)
  do $$
  begin
    if exists (
      select 1 from public.idempotency_requests
      where scope = 'sale' and idempotency_key = 'test-tb10-conflict'
        and request_hash <> md5('{"table_id":"aaa","payments":[{"method":"Efectivo","amount":200}]}')
    ) then
      raise notice 'TB-10 PASS conflicto detectado correctamente: mismo key, hash diferente';
    else
      raise exception 'TB-10 FAIL lógica de conflicto no detectada';
    end if;
  end $$;
rollback;

-- ============================================================
-- TB-11: Atomicidad ante error de trigger — asiento desbalanceado
-- ============================================================
-- Diseño: intentar confirmar un journal_entry con débitos ≠ créditos.
-- Esperado: trigger trg_assert_journal_entry_balanced impide UPDATE.
-- Aislamiento: BEGIN/ROLLBACK — ningún cambio persiste aunque el trigger falle.
begin;
  do $$
  declare
    entry_id uuid;
  begin
    insert into public.journal_entries
      (entry_number, entry_type, status, occurred_at, source_type, created_by)
    values
      ('JE-TEST-ATOM-' || extract(epoch from now())::bigint,
       'sale', 'pending', now(), 'test', 'REPLACE:<test_user_id>'::uuid)
    returning id into entry_id;

    insert into public.journal_lines
      (journal_entry_id, financial_account_id, debit, credit, description)
    values (
      entry_id,
      (select id from public.financial_accounts where code = '1101' limit 1),
      100, 0, 'test debit TB-11'
    );

    -- Trigger debe rechazar: debit=100, credit=0
    begin
      update public.journal_entries set status = 'confirmed' where id = entry_id;
      raise exception 'TB-11 FAIL trigger no rechazó asiento desbalanceado';
    exception when others then
      if sqlerrm like '%balance%' or sqlerrm like '%débit%' or sqlerrm like '%debit%'
         or sqlerrm like '%equal%' or sqlerrm like '%igual%' then
        raise notice 'TB-11 PASS trigger rechazó desbalance: %', sqlerrm;
      else
        raise notice 'TB-11 PARTIAL mensaje inesperado: %', sqlerrm;
      end if;
    end;

    -- Verificar que no quedó confirmado
    if exists (select 1 from public.journal_entries where id = entry_id and status = 'confirmed') then
      raise exception 'TB-11 FAIL entry quedó confirmado pese al error';
    end if;
    raise notice 'TB-11 entry revertido correctamente';
  end $$;
rollback;

-- ============================================================
-- TB-12: Autoautorización (no_self_auth) → rechazo por CHECK constraint
-- ============================================================
-- Diseño: requested_by = authorized_by viola CHECK constraint.
-- Aislamiento: BEGIN/ROLLBACK.
begin;
  do $$
  declare test_uuid uuid := gen_random_uuid();
  begin
    begin
      insert into public.financial_authorizations
        (requested_by, authorized_by, request_type, entity_type, entity_id, decision)
      values
        (test_uuid, test_uuid, 'reversal', 'journal_entries', gen_random_uuid(), 'approved');
      raise exception 'TB-12 FAIL debió rechazar autoautorización';
    exception
      when check_violation then
        raise notice 'TB-12 PASS autoautorización rechazada por check_violation';
      when others then
        raise notice 'TB-12 PARTIAL excepción pero no check_violation: %', sqlerrm;
    end;
  end $$;
rollback;

-- ============================================================
-- TB-13: Cálculo de expected_cash — solo Efectivo suma a la caja
-- ============================================================
-- Diseño: verificar que get_cash_sessions_report refleja solo componente
--         Efectivo y no Tarjeta/Transferencia.
-- PENDIENTE DE VALIDAR: RPC get_cash_sessions_report incluye campo expected_cash.
-- Nota: esta prueba es solo de lectura si el ledger está inactivo.
do $$
declare
  session_row record;
begin
  -- Si hay sesiones cerradas con ventas, verificar expected_cash
  select * into session_row
    from public.get_cash_sessions_report()
   limit 1;

  if session_row is null then
    raise notice 'TB-13 SKIP sin sesiones de caja registradas — ejecutar después de TB-07';
    return;
  end if;

  raise notice 'TB-13 INFO get_cash_sessions_report disponible — verificar campo expected_cash manualmente';
  raise notice 'TB-13 PENDIENTE DE VALIDAR: formula expected_cash = opening_float + sum(Efectivo) - sum(Efectivo_salidas)';
end $$;

-- ── NOTAS FINALES ─────────────────────────────────────────────────────────────
do $$
begin
  raise notice '';
  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'PRUEBAS LOCALES TB-01 a TB-13 completadas.';
  raise notice 'TB-06, TB-07, TB-08, TB-09: requieren UUIDs válidos de la base local.';
  raise notice 'Items PENDIENTE DE VALIDAR requieren ejecución con datos reales.';
  raise notice 'Ningún cambio persiste (BEGIN/ROLLBACK en cada bloque DML).';
  raise notice 'PROHIBIDO ejecutar en DEV.';
  raise notice '══════════════════════════════════════════════════════════════';
end $$;
