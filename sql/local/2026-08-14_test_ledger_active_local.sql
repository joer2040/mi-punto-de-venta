-- ============================================================
-- R5: SIMULACIÓN DE LEDGER ACTIVO — PRUEBAS CONDUCTUALES
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- ============================================================
-- Propósito:
--   Verificar comportamiento del sistema con ledger activo:
--   1. Infraestructura ledger: journal_entries, get_account_balances,
--      get_journal_report, get_account_ledger.
--   2. finalize_pos_sale con cutover en el FUTURO (venta pre-corte):
--      no crea journal_entry — comportamiento equivalente a ledger inactivo.
--   3. finalize_pos_sale con cutover en el PRESENTE (venta post-corte):
--      detecta BUG-M24-001 (GROUP BY inválido en journal_lines INSERT).
--
-- Restricciones de diseño:
--   • Un único BEGIN/ROLLBACK — ningún cambio persiste.
--   • Sin bypass de triggers (set_config): trigger M18 satisfecho por
--     caja abierta dentro de la misma transacción.
--   • activate_ledger() NO se llama: exige sin mesas ocupadas (la mesa
--     R4 ...0007 puede estar ocupada en estado persistente). Se inserta
--     directamente en ledger_settings — suficiente para disparar la
--     rama ledger de finalize_pos_sale.
--
-- Bug encontrado:
--   BUG-M24-001: finalize_pos_sale (20260811140000_sale_financial_entries.sql
--   línea ~577-590) usa GROUP BY lower(trim(pay->>'method')) pero referencia
--   trim(pay->>'method') en el campo description sin incluirlo en GROUP BY.
--   PostgreSQL rechaza la sentencia en runtime para TODO tipo de pago.
--   La rama nunca fue ejecutada en R4 porque el ledger estaba inactivo.
--
-- Ejecutar como:
--   docker cp sql/local/2026-08-14_test_ledger_active_local.sql \
--     supabase_db_mi-punto-de-venta:/tmp/test_r5.sql
--   docker exec supabase_db_mi-punto-de-venta \
--     bash -c "psql -U postgres -d postgres -f /tmp/test_r5.sql 2>&1"
-- ============================================================

begin;

do $$
declare
  -- UUIDs R5 (rango 2000..., no colisionan con R4 rango 1000...)
  v_user_id     uuid    := '20000000-0000-0000-0000-000000000001';
  v_table_id    uuid    := '20000000-0000-0000-0000-000000000002';
  v_order_1     uuid    := '20000000-0000-0000-0000-000000000011'; -- TB-R5-05 (pre-corte)
  v_order_2     uuid    := '20000000-0000-0000-0000-000000000012'; -- TB-R5-06 (bug)
  v_material_id uuid    := '20000000-0000-0000-0000-000000000009';
  v_cat_id      uuid;
  v_center_id   uuid;
  v_item_price  numeric := 150.00;

  -- IDs de cuentas del sistema (cargados en pre-validación)
  v_acct_1101   uuid;   -- Caja operativa
  v_acct_1102   uuid;   -- Caja fuerte
  v_acct_1103   uuid;   -- Banco
  v_acct_4101   uuid;   -- Ingresos por ventas
  v_acct_3101   uuid;   -- Aportaciones del propietario

  -- Para TB-R5-01/02/03/04 — journal_entry manual
  v_entry_id    uuid;

  -- Para TB-R5-05/06 — finalize_pos_sale
  v_result      jsonb;
  v_sale_id     uuid;

  -- Auxiliares
  v_count   integer;
  v_balance numeric(14,2);
  v_rows    integer;
begin

  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'R5: SIMULACIÓN LEDGER ACTIVO — inicio';
  raise notice 'EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.';
  raise notice 'Ningún cambio persiste (único BEGIN/ROLLBACK).';
  raise notice '══════════════════════════════════════════════════════════════';

  -- ── PRE-VALIDACIONES ─────────────────────────────────────────────────────

  if exists (
    select 1 from public.ledger_settings
    where id = true and ledger_cutover_at is not null
  ) then
    raise exception
      '[PRE] Ledger ya activo en estado persistente. '
      'R5 requiere ledger inactivo como punto de partida.';
  end if;

  select id into v_acct_1101 from public.financial_accounts where code='1101' and is_active and is_system;
  select id into v_acct_1102 from public.financial_accounts where code='1102' and is_active and is_system;
  select id into v_acct_1103 from public.financial_accounts where code='1103' and is_active and is_system;
  select id into v_acct_4101 from public.financial_accounts where code='4101' and is_active and is_system;
  select id into v_acct_3101 from public.financial_accounts where code='3101' and is_active and is_system;

  if v_acct_1101 is null or v_acct_1103 is null or v_acct_4101 is null or v_acct_3101 is null then
    raise exception '[PRE] Cuentas del sistema incompletas (1101, 1103, 4101, 3101).';
  end if;

  select count(*) into v_count from public.categories where lower(trim(name)) = 'botella';
  if v_count <> 1 then
    raise exception '[PRE] Exactamente 1 categoría Botella requerida; encontradas: %.', v_count;
  end if;
  select id into v_cat_id from public.categories where lower(trim(name)) = 'botella';

  select count(*) into v_count from public.centers where lower(trim(name)) = 'bar principal';
  if v_count <> 1 then
    raise exception '[PRE] Exactamente 1 centro Bar Principal requerido; encontrados: %.', v_count;
  end if;
  select id into v_center_id from public.centers where lower(trim(name)) = 'bar principal';

  raise notice '[PRE] OK — catálogo y entorno verificados';
  raise notice '[PRE] v_cat_id=% v_center_id=%', v_cat_id, v_center_id;

  -- ── SETUP ────────────────────────────────────────────────────────────────

  insert into auth.users (id) values (v_user_id);
  insert into public.app_profiles (id, username, email, is_superadmin)
  values (v_user_id, 'test_r5_ledger', 'test_r5_ledger@app.local', true);

  insert into public.materials (id, cat_id, name)
  values (v_material_id, v_cat_id, 'Material R5 Ledger');

  -- handle_new_material crea inventory en (SELECT id FROM centers LIMIT 1)
  update public.inventory
     set precio_venta = v_item_price, stock_actual = 10
   where material_id = v_material_id and center_id = v_center_id;

  if not found then
    -- El trigger eligió otro centro; insertar explícitamente para Bar Principal
    insert into public.inventory (material_id, center_id, stock_actual, costo_promedio, precio_venta)
    values (v_material_id, v_center_id, 10, 0, v_item_price);
    raise notice '[SETUP] inventory para Bar Principal insertado manualmente (trigger usó otro centro)';
  end if;

  -- Mesa R5 libre (trigger WHEN new.status=ocupada → false → no dispara)
  insert into public.tables (id, number, status, current_order_id)
  values (v_table_id, 'T-R5-LEDGER', 'libre', null);

  -- Activar ledger con cutover = now() (transacción-local → revierte con ROLLBACK)
  -- ON CONFLICT para el caso en que ya existe fila (no esperado; pre-validado arriba)
  insert into public.ledger_settings (id, ledger_cutover_at, activated_by, activated_at)
  values (true, now(), v_user_id, now())
  on conflict (id) do update
    set ledger_cutover_at = excluded.ledger_cutover_at,
        activated_by      = excluded.activated_by,
        activated_at      = excluded.activated_at;

  raise notice '[SETUP] Completado: usuario, material, mesa, ledger activo (cutover=now())';

  -- ══════════════════════════════════════════════════════════════════════════
  -- TB-R5-01: Trigger assert_journal_entry_balanced rechaza asiento vacío
  -- ══════════════════════════════════════════════════════════════════════════
  begin
    insert into public.journal_entries
      (id, entry_number, entry_type, status, occurred_at, created_by)
    values
      (gen_random_uuid(), 'JE-R5-EMPTY', 'initial_balance', 'pending', now(), v_user_id)
    returning id into v_entry_id;

    -- UPDATE a confirmed SIN líneas → trigger debe rechazar
    update public.journal_entries set status = 'confirmed' where id = v_entry_id;

    -- Si llegamos aquí, el trigger falló
    raise exception 'TB-R5-01 FAIL — trigger no rechazó asiento vacío';
  exception
    when others then
      if sqlerrm like '%no tiene líneas%' or sqlerrm like '%no line%' then
        raise notice 'TB-R5-01 PASS — trigger rechazó asiento sin líneas: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R5-01 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ══════════════════════════════════════════════════════════════════════════
  -- TB-R5-02: Asiento inicial balanceado se confirma y aparece en balances
  -- Líneas: debit 1101 (1000) + credit 3101 (1000)
  -- ══════════════════════════════════════════════════════════════════════════
  insert into public.journal_entries
    (id, entry_number, entry_type, status, occurred_at, created_by)
  values
    (gen_random_uuid(), 'JE-R5-INICIAL-001', 'initial_balance', 'pending', now(), v_user_id)
  returning id into v_entry_id;

  insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit, description)
  values
    (v_entry_id, v_acct_1101, 1000.00, 0, 'Saldo inicial Caja operativa R5'),
    (v_entry_id, v_acct_3101, 0, 1000.00, 'Capital inicial R5');

  update public.journal_entries set status = 'confirmed' where id = v_entry_id;

  -- Verificar que el trigger aceptó el asiento
  if not exists (
    select 1 from public.journal_entries
    where id = v_entry_id and status = 'confirmed'
  ) then
    raise exception 'TB-R5-02 FAIL — journal_entry no quedó confirmed';
  end if;

  -- get_account_balances: 1101 debe mostrar 1000.00
  select balance into v_balance
  from public.get_account_balances()
  where code = '1101';
  if v_balance <> 1000.00 then
    raise exception 'TB-R5-02 FAIL — 1101 balance esperado=1000.00, obtenido=%', v_balance;
  end if;

  -- get_account_balances: 3101 debe mostrar 1000.00 (equity: credit-debit)
  select balance into v_balance
  from public.get_account_balances()
  where code = '3101';
  if v_balance <> 1000.00 then
    raise exception 'TB-R5-02 FAIL — 3101 balance esperado=1000.00, obtenido=%', v_balance;
  end if;

  raise notice 'TB-R5-02 PASS — asiento inicial confirmado; 1101 y 3101 balance = 1000.00';

  -- ══════════════════════════════════════════════════════════════════════════
  -- TB-R5-03: get_journal_report devuelve el asiento del día
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_rows
  from public.get_journal_report(current_date, current_date)
  where entry_id = v_entry_id;

  if v_rows = 0 then
    raise exception 'TB-R5-03 FAIL — get_journal_report no devuelve el asiento JE-R5-INICIAL-001';
  end if;

  raise notice 'TB-R5-03 PASS — get_journal_report devuelve % línea(s) para JE-R5-INICIAL-001', v_rows;

  -- ══════════════════════════════════════════════════════════════════════════
  -- TB-R5-04: get_account_ledger muestra mayor con saldo acumulado correcto
  -- ══════════════════════════════════════════════════════════════════════════
  select count(*) into v_rows
  from public.get_account_ledger('1101')
  where entry_id = v_entry_id
    and debit = 1000.00
    and running_balance = 1000.00;

  if v_rows <> 1 then
    raise exception 'TB-R5-04 FAIL — get_account_ledger no muestra running_balance=1000.00 para 1101';
  end if;

  raise notice 'TB-R5-04 PASS — get_account_ledger 1101: debit=1000.00, running_balance=1000.00';

  -- ══════════════════════════════════════════════════════════════════════════
  -- TB-R5-05: finalize_pos_sale con cutover en el FUTURO (venta pre-corte)
  -- Espera: venta exitosa, journal_entry_id IS NULL, financial_operation_id IS NULL
  -- ══════════════════════════════════════════════════════════════════════════

  -- Abrir caja (INSERT directo; open_cash_session_atomic rechazaría si hay
  -- mesas ocupadas en estado persistente, p. ej. la mesa R4 ...0007)
  insert into public.cash_sessions (status, opening_amount, opened_by)
  values ('open', 500.00, v_user_id);

  -- Mover cutover al FUTURO: finalize_pos_sale verá v_sale_created_at < v_ledger_cutover_at
  -- → condición FALSE → no ejecuta rama ledger → no toca journal_lines
  update public.ledger_settings
     set ledger_cutover_at = now() + interval '1 hour'
   where id = true;

  -- Ocupar mesa con orden 1 (trigger M18 satisfecho por caja abierta)
  insert into public.table_orders (id, table_id, items, total)
  values (v_order_1, v_table_id, '[]', 0);
  update public.tables
     set status = 'ocupada', current_order_id = v_order_1
   where id = v_table_id;

  v_result := public.finalize_pos_sale(
    v_table_id,
    jsonb_build_array(jsonb_build_object(
      'order_id',    v_order_1::text,
      'material_id', v_material_id::text,
      'quantity',    '1'
    )),
    '[{"method":"Tarjeta","amount":150}]'::jsonb,
    v_user_id,
    null
  );

  v_sale_id := (v_result->>'id')::uuid;

  -- Con cutover en el futuro, la rama ledger NO se ejecuta
  if (v_result->>'journal_entry_id') is not null then
    raise exception 'TB-R5-05 FAIL — journal_entry_id no debería existir para venta pre-corte';
  end if;
  if (v_result->>'financial_operation_id') is not null then
    raise exception 'TB-R5-05 FAIL — financial_operation_id no debería existir para venta pre-corte';
  end if;
  if not exists (select 1 from public.sales where id = v_sale_id) then
    raise exception 'TB-R5-05 FAIL — venta no registrada en sales';
  end if;

  raise notice 'TB-R5-05 PASS — finalize_pos_sale pre-corte: venta OK, journal_entry_id=null';
  -- finalize_pos_sale liberó la mesa y eliminó table_orders para v_order_1

  -- ══════════════════════════════════════════════════════════════════════════
  -- TB-R5-06: finalize_pos_sale con cutover en el PRESENTE (venta post-corte)
  -- Post-M29: espera venta exitosa con journal_entry_id NOT NULL y balances
  -- correctos en 1103 (Banco/Tarjeta = 150.00) y 4101 (Ingresos = 150.00).
  -- ══════════════════════════════════════════════════════════════════════════

  -- Restaurar cutover al presente (v_sale_created_at = now() = v_ledger_cutover_at → >=)
  update public.ledger_settings
     set ledger_cutover_at = now()
   where id = true;

  -- Restaurar mesa con orden 2
  insert into public.table_orders (id, table_id, items, total)
  values (v_order_2, v_table_id, '[]', 0);
  update public.tables
     set status = 'ocupada', current_order_id = v_order_2
   where id = v_table_id;

  begin
    v_result := public.finalize_pos_sale(
      v_table_id,
      jsonb_build_array(jsonb_build_object(
        'order_id',    v_order_2::text,
        'material_id', v_material_id::text,
        'quantity',    '1'
      )),
      '[{"method":"Tarjeta","amount":150}]'::jsonb,
      v_user_id,
      null
    );

    -- Verificar journal_entry_id no nulo (ledger rama ejecutada)
    if (v_result->>'journal_entry_id') is null then
      raise exception 'TB-R5-06 FAIL — journal_entry_id es null; rama ledger no se ejecutó';
    end if;

    -- Verificar balance 1103 (Banco — Tarjeta) = 150.00
    select balance into v_balance
    from public.get_account_balances()
    where code = '1103';
    if v_balance <> 150.00 then
      raise exception 'TB-R5-06 FAIL — 1103 balance esperado=150.00, obtenido=%', v_balance;
    end if;

    -- Verificar balance 4101 (Ingresos por ventas) = 150.00
    select balance into v_balance
    from public.get_account_balances()
    where code = '4101';
    if v_balance <> 150.00 then
      raise exception 'TB-R5-06 FAIL — 4101 balance esperado=150.00, obtenido=%', v_balance;
    end if;

    raise notice 'TB-R5-06 PASS — finalize_pos_sale post-corte: journal_entry_id=%, 1103=150.00, 4101=150.00',
      v_result->>'journal_entry_id';
  exception
    when others then
      if sqlerrm like '%GROUP BY%' or sqlerrm like '%appear in the GROUP BY%' then
        raise exception 'TB-R5-06 FAIL — BUG-M24-001 aún presente tras M29: %', sqlerrm;
      else
        raise exception 'TB-R5-06 ERROR: %', sqlerrm;
      end if;
  end;

  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'R5 COMPLETADO (post-M29).';
  raise notice '  TB-R5-01 PASS — trigger rechaza asiento sin líneas';
  raise notice '  TB-R5-02 PASS — asiento balanceado + get_account_balances OK';
  raise notice '  TB-R5-03 PASS — get_journal_report OK';
  raise notice '  TB-R5-04 PASS — get_account_ledger running_balance OK';
  raise notice '  TB-R5-05 PASS — finalize_pos_sale pre-corte (journal_entry_id=null)';
  raise notice '  TB-R5-06 PASS — finalize_pos_sale post-corte: asiento contable OK (M29)';
  raise notice 'ROLLBACK garantiza que NINGÚN cambio persiste.';
  raise notice '══════════════════════════════════════════════════════════════';

end $$;

rollback;
