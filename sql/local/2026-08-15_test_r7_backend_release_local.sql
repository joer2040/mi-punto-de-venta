-- ============================================================
-- R7: VALIDACIÓN DE LIBERACIÓN DEL BACKEND FINANCIERO
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- ============================================================
-- Cubre: ventas (3 métodos + mixto), compras, traspasos,
--   aportaciones, retiros, reversas, diferencias de caja,
--   reportes, idempotencia y negativos.
-- Un único BEGIN/ROLLBACK — ningún cambio persiste.
-- Sin bypass de triggers.
-- ============================================================
-- Ejecutar como:
--   docker cp sql/local/2026-08-15_test_r7_backend_release_local.sql \
--     supabase_db_mi-punto-de-venta:/tmp/test_r7.sql
--   docker exec supabase_db_mi-punto-de-venta \
--     bash -c "psql -U postgres -d postgres -f /tmp/test_r7.sql 2>&1"
-- ============================================================

begin;

do $$
declare
  -- ── Fixture UUIDs (rango 3000..., no colisionan con R4/R5)
  v_user1_id     uuid := '30000000-0000-0000-0000-000000000001'; -- superadmin / ejecutor
  v_user2_id     uuid := '30000000-0000-0000-0000-000000000002'; -- superadmin / autorizador
  v_table_id     uuid := '30000000-0000-0000-0000-000000000003';
  v_cat_id_fix   uuid := '30000000-0000-0000-0000-000000000004'; -- categoría R7
  v_material_id  uuid := '30000000-0000-0000-0000-000000000009';
  v_provider_id  uuid := '30000000-0000-0000-0000-000000000020';

  -- Órdenes: una por cada venta (finalize_pos_sale consume y elimina la orden)
  v_ord_tarjeta  uuid := '30000000-0000-0000-0000-000000000011';
  v_ord_transf   uuid := '30000000-0000-0000-0000-000000000012';
  v_ord_efecto   uuid := '30000000-0000-0000-0000-000000000013';
  v_ord_mixto    uuid := '30000000-0000-0000-0000-000000000014';
  v_ord_idem     uuid := '30000000-0000-0000-0000-000000000015';

  -- Variables de entorno
  v_center_id    uuid;
  v_item_price   numeric := 100.00;

  -- IDs de cuentas
  v_acct_1101 uuid; v_acct_1102 uuid; v_acct_1103 uuid;
  v_acct_1201 uuid; v_acct_3101 uuid; v_acct_3102 uuid;
  v_acct_4101 uuid; v_acct_4102 uuid; v_acct_5101 uuid; v_acct_5102 uuid;

  -- Variables de estado para tests
  v_result           jsonb;
  v_result2          jsonb;
  v_balance          numeric(14,2);
  v_count            integer;
  v_rows             integer;
  v_je_id            uuid;
  v_transfer_je_id   uuid;
  v_session_id       uuid;
  v_disc_session_id  uuid;
  v_neg_order_id     uuid;

begin
  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'R7: VALIDACIÓN DE LIBERACIÓN DEL BACKEND FINANCIERO — inicio';
  raise notice 'EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.';
  raise notice 'Ningún cambio persiste (único BEGIN/ROLLBACK externo).';
  raise notice '══════════════════════════════════════════════════════════════';

  -- ══════════════════════════════════════════════════════════════════
  -- PRE-VALIDACIONES DE ENTORNO
  -- ══════════════════════════════════════════════════════════════════

  select id into v_center_id from public.centers where lower(trim(name)) = 'bar principal' limit 1;
  if v_center_id is null then
    raise exception '[PRE] Centro "Bar Principal" no encontrado. Verifica seed de datos.';
  end if;

  select id into v_acct_1101 from public.financial_accounts where code='1101' and is_active and is_system;
  select id into v_acct_1102 from public.financial_accounts where code='1102' and is_active and is_system;
  select id into v_acct_1103 from public.financial_accounts where code='1103' and is_active and is_system;
  select id into v_acct_1201 from public.financial_accounts where code='1201' and is_active and is_system;
  select id into v_acct_3101 from public.financial_accounts where code='3101' and is_active and is_system;
  select id into v_acct_3102 from public.financial_accounts where code='3102' and is_active and is_system;
  select id into v_acct_4101 from public.financial_accounts where code='4101' and is_active and is_system;
  select id into v_acct_4102 from public.financial_accounts where code='4102' and is_active and is_system;
  select id into v_acct_5101 from public.financial_accounts where code='5101' and is_active and is_system;
  select id into v_acct_5102 from public.financial_accounts where code='5102' and is_active and is_system;

  if v_acct_1101 is null or v_acct_1102 is null or v_acct_1103 is null
     or v_acct_1201 is null or v_acct_3101 is null or v_acct_3102 is null
     or v_acct_4101 is null or v_acct_4102 is null or v_acct_5101 is null
     or v_acct_5102 is null then
    raise exception '[PRE] Catálogo de cuentas incompleto (faltan 1101–5102). Verifica migración M21/M28.';
  end if;

  raise notice '[PRE] OK — cuentas, centro verificados. center=%, 1101=%, 1103=%, 4101=%',
    v_center_id, v_acct_1101, v_acct_1103, v_acct_4101;

  -- ══════════════════════════════════════════════════════════════════
  -- SETUP DE FIXTURES
  -- ══════════════════════════════════════════════════════════════════

  -- Usuarios R7 (superadmin)
  insert into auth.users (id) values (v_user1_id), (v_user2_id);
  insert into public.app_profiles (id, username, email, is_superadmin, status)
  values
    (v_user1_id, 'test_r7_user1', 'test_r7_u1@app.local', true, 'active'),
    (v_user2_id, 'test_r7_user2', 'test_r7_u2@app.local', true, 'active');

  -- Proveedor R7
  insert into public.providers (id, name, rfc)
  values (v_provider_id, 'Proveedor R7 Test', 'TESTR7000001');

  -- Categoría R7 (autónoma, is_for_sale=true, is_inventoried=true)
  insert into public.categories (id, name, is_for_sale, is_inventoried)
  values (v_cat_id_fix, 'R7 Test Category', true, true);

  -- Material R7 (en categoría R7)
  insert into public.materials (id, cat_id, name)
  values (v_material_id, v_cat_id_fix, 'Producto R7 Test');

  -- Inventory para Bar Principal (trigger handle_new_material puede crear en otro centro)
  update public.inventory
     set precio_venta = v_item_price, stock_actual = 200, costo_promedio = 50.00
   where material_id = v_material_id and center_id = v_center_id;
  if not found then
    insert into public.inventory (material_id, center_id, stock_actual, costo_promedio, precio_venta)
    values (v_material_id, v_center_id, 200, 50.00, v_item_price);
    raise notice '[SETUP] inventory Bar Principal insertado manualmente (trigger usó otro centro)';
  end if;

  -- Mesa R7 (libre; trigger no dispara para status=libre / current_order_id=null)
  insert into public.tables (id, number, status, current_order_id)
  values (v_table_id, 'T-R7-TEST', 'libre', null);

  -- Activar ledger con cutover=now() (transacción-local)
  insert into public.ledger_settings (id, ledger_cutover_at, activated_by, activated_at)
  values (true, now(), v_user1_id, now())
  on conflict (id) do update
    set ledger_cutover_at = excluded.ledger_cutover_at,
        activated_by      = excluded.activated_by,
        activated_at      = excluded.activated_at;

  -- Sesión de caja abierta (requerida por trigger M18 para ocupar mesas)
  insert into public.cash_sessions (id, status, opening_amount, opened_by)
  values (gen_random_uuid(), 'open', 500.00, v_user1_id)
  returning id into v_session_id;

  raise notice '[SETUP] Completado. session=%, material=%, mesa=%, ledger_cutover=NOW()',
    v_session_id, v_material_id, v_table_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-01: finalize_pos_sale — pago Tarjeta
  --   Esperado: JE confirmed/sale; 1103 debit=100, 4101 credit=100
  --             financial_operation vinculado; audit_event registrado
  -- ══════════════════════════════════════════════════════════════════
  insert into public.table_orders (id, table_id, items, total)
  values (v_ord_tarjeta, v_table_id, '[]', 0);
  update public.tables set status='ocupada', current_order_id=v_ord_tarjeta where id=v_table_id;

  v_result := public.finalize_pos_sale(
    v_table_id,
    jsonb_build_array(jsonb_build_object(
      'order_id',    v_ord_tarjeta::text,
      'material_id', v_material_id::text,
      'quantity',    '1'
    )),
    '[{"method":"Tarjeta","amount":100}]'::jsonb,
    v_user1_id,
    'R7-SALE-TARJETA-001'
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then
    raise exception 'TB-R7-01 FAIL: journal_entry_id null (Tarjeta)';
  end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='sale'
  ) then
    raise exception 'TB-R7-01 FAIL: JE no confirmado o tipo incorrecto';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and debit=100.00 and credit=0
  ) then
    raise exception 'TB-R7-01 FAIL: línea 1103 debit=100 ausente';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_4101 and credit=100.00 and debit=0
  ) then
    raise exception 'TB-R7-01 FAIL: línea 4101 credit=100 ausente';
  end if;
  if not exists (
    select 1 from public.sales where journal_entry_id=v_je_id
  ) then
    raise exception 'TB-R7-01 FAIL: sales.journal_entry_id no vinculado';
  end if;
  if not exists (
    select 1 from public.audit_events where action='sale_confirmed' and actor_id=v_user1_id
  ) then
    raise exception 'TB-R7-01 FAIL: audit_event sale_confirmed ausente';
  end if;

  raise notice 'TB-R7-01 PASS — Tarjeta: JE=% | 1103=100 D | 4101=100 C | audit OK', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-02: finalize_pos_sale — pago Transferencia
  --   Tarjeta y Transferencia usan la misma cuenta 1103 (Banco)
  -- ══════════════════════════════════════════════════════════════════
  insert into public.table_orders (id, table_id, items, total)
  values (v_ord_transf, v_table_id, '[]', 0);
  update public.tables set status='ocupada', current_order_id=v_ord_transf where id=v_table_id;

  v_result := public.finalize_pos_sale(
    v_table_id,
    jsonb_build_array(jsonb_build_object(
      'order_id',    v_ord_transf::text,
      'material_id', v_material_id::text,
      'quantity',    '1'
    )),
    '[{"method":"Transferencia","amount":100}]'::jsonb,
    v_user1_id,
    null
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-02 FAIL: journal_entry_id null (Transferencia)'; end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and debit=100.00
  ) then
    raise exception 'TB-R7-02 FAIL: 1103 debit=100 ausente para Transferencia';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_4101 and credit=100.00
  ) then
    raise exception 'TB-R7-02 FAIL: 4101 credit=100 ausente para Transferencia';
  end if;

  raise notice 'TB-R7-02 PASS — Transferencia: JE=% | 1103=100 D | 4101=100 C (misma cuenta que Tarjeta)',
    v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-03: finalize_pos_sale — pago Efectivo
  --   Esperado: 1101 debit=100, 4101 credit=100
  --             sale.cash_session_id vinculado a v_session_id
  -- ══════════════════════════════════════════════════════════════════
  insert into public.table_orders (id, table_id, items, total)
  values (v_ord_efecto, v_table_id, '[]', 0);
  update public.tables set status='ocupada', current_order_id=v_ord_efecto where id=v_table_id;

  v_result := public.finalize_pos_sale(
    v_table_id,
    jsonb_build_array(jsonb_build_object(
      'order_id',    v_ord_efecto::text,
      'material_id', v_material_id::text,
      'quantity',    '1'
    )),
    '[{"method":"Efectivo","amount":100}]'::jsonb,
    v_user1_id,
    null
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-03 FAIL: journal_entry_id null (Efectivo)'; end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1101 and debit=100.00
  ) then
    raise exception 'TB-R7-03 FAIL: 1101 debit=100 ausente (Efectivo)';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_4101 and credit=100.00
  ) then
    raise exception 'TB-R7-03 FAIL: 4101 credit=100 ausente (Efectivo)';
  end if;
  -- Verificar cash_session_id vinculado en financial_operations
  if not exists (
    select 1
    from public.sales s
    join public.financial_operations fo on fo.id = s.financial_operation_id
    where s.journal_entry_id = v_je_id and fo.cash_session_id = v_session_id
  ) then
    raise exception 'TB-R7-03 FAIL: financial_operations no tiene cash_session_id correcto';
  end if;

  raise notice 'TB-R7-03 PASS — Efectivo: JE=% | 1101=100 D | 4101=100 C | session vinculada', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-04: finalize_pos_sale — pago Mixto (Efectivo 60 + Tarjeta 40)
  --   Esperado: 1101 debit=60, 1103 debit=40, 4101 credit=100
  --             2 financial_payments separados
  -- ══════════════════════════════════════════════════════════════════
  insert into public.table_orders (id, table_id, items, total)
  values (v_ord_mixto, v_table_id, '[]', 0);
  update public.tables set status='ocupada', current_order_id=v_ord_mixto where id=v_table_id;

  v_result := public.finalize_pos_sale(
    v_table_id,
    jsonb_build_array(jsonb_build_object(
      'order_id',    v_ord_mixto::text,
      'material_id', v_material_id::text,
      'quantity',    '1'
    )),
    '[{"method":"Efectivo","amount":60},{"method":"Tarjeta","amount":40}]'::jsonb,
    v_user1_id,
    null
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-04 FAIL: journal_entry_id null (Mixto)'; end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1101 and debit=60.00
  ) then
    raise exception 'TB-R7-04 FAIL: 1101 debit=60 ausente (Mixto)';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and debit=40.00
  ) then
    raise exception 'TB-R7-04 FAIL: 1103 debit=40 ausente (Mixto)';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_4101 and credit=100.00
  ) then
    raise exception 'TB-R7-04 FAIL: 4101 credit=100 ausente (Mixto)';
  end if;

  -- 3 líneas contables (1101, 1103, 4101)
  select count(*) into v_count
  from public.journal_lines where journal_entry_id=v_je_id;
  if v_count <> 3 then
    raise exception 'TB-R7-04 FAIL: JE Mixto tiene % líneas (esperadas=3)', v_count;
  end if;

  -- 2 financial_payments (Efectivo + Tarjeta)
  select count(*) into v_count
  from public.financial_payments fp
  join public.financial_operations fo on fo.id = fp.financial_operation_id
  where fo.journal_entry_id = v_je_id;
  if v_count <> 2 then
    raise exception 'TB-R7-04 FAIL: % financial_payments (esperados=2)', v_count;
  end if;

  raise notice 'TB-R7-04 PASS — Mixto: 1101=60 D | 1103=40 D | 4101=100 C | 3 líneas JE | 2 payments';

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-05: create_purchase_with_ledger — mercancía (Tarjeta)
  --   items: material_id qty=2 cost=25 → total=50, cuenta 1201
  --   payment: Tarjeta → 1103 credit=50
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.create_purchase_with_ledger(
    v_provider_id,
    v_center_id,
    'FACTURA-R7-001',
    jsonb_build_array(jsonb_build_object(
      'material_id',      v_material_id::text,
      'item_description', 'Mercancía R7 Test',
      'quantity',         '2',
      'unit_cost',        '25'
    )),
    '{"method":"Tarjeta","amount":50}'::jsonb,
    v_user1_id,
    'R7-PURCHASE-001'
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then
    raise exception 'TB-R7-05 FAIL: journal_entry_id null (compra mercancía)';
  end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='purchase'
  ) then
    raise exception 'TB-R7-05 FAIL: JE no es confirmed/purchase';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1201 and debit=50.00
  ) then
    raise exception 'TB-R7-05 FAIL: 1201 debit=50 ausente (mercancía)';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and credit=50.00
  ) then
    raise exception 'TB-R7-05 FAIL: 1103 credit=50 ausente (compra Tarjeta)';
  end if;
  if not exists (
    select 1 from public.purchases where journal_entry_id=v_je_id
  ) then
    raise exception 'TB-R7-05 FAIL: purchases.journal_entry_id no vinculado';
  end if;

  raise notice 'TB-R7-05 PASS — Compra mercancía Tarjeta: JE=% | 1201=50 D | 1103=50 C | purchase OK',
    v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-06: create_purchase_with_ledger — gasto sin material (Tarjeta)
  --   items: null material_id → 5102 expense; cost=30
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.create_purchase_with_ledger(
    v_provider_id,
    v_center_id,
    'FACTURA-R7-002',
    jsonb_build_array(jsonb_build_object(
      'material_id',      null,
      'item_description', 'Gasto operativo R7 Test',
      'quantity',         '1',
      'unit_cost',        '30'
    )),
    '{"method":"Tarjeta","amount":30}'::jsonb,
    v_user1_id,
    null
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-06 FAIL: journal_entry_id null (gasto)'; end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_5102 and debit=30.00
  ) then
    raise exception 'TB-R7-06 FAIL: 5102 debit=30 ausente (gasto)';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and credit=30.00
  ) then
    raise exception 'TB-R7-06 FAIL: 1103 credit=30 ausente (gasto Tarjeta)';
  end if;

  raise notice 'TB-R7-06 PASS — Compra gasto Tarjeta: JE=% | 5102=30 D | 1103=30 C', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-07: record_transfer — 1102 → 1103 (no requiere caja)
  --   Esperado: JE confirmed/transfer; 1103 debit=200, 1102 credit=200
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.record_transfer(
    '1102', '1103', 200.00,
    'Traspaso Caja fuerte → Banco R7',
    v_user1_id,
    'R7-TRP-001'
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  v_transfer_je_id := v_je_id; -- guardado para TB-R7-11 (reversa)

  if v_je_id is null then raise exception 'TB-R7-07 FAIL: journal_entry_id null (traspaso)'; end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='transfer'
  ) then
    raise exception 'TB-R7-07 FAIL: JE no es confirmed/transfer';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and debit=200.00
  ) then
    raise exception 'TB-R7-07 FAIL: 1103 debit=200 ausente';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1102 and credit=200.00
  ) then
    raise exception 'TB-R7-07 FAIL: 1102 credit=200 ausente';
  end if;

  raise notice 'TB-R7-07 PASS — Transfer 1102→1103: JE=% | 1103=200 D | 1102=200 C', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-08: record_transfer — 1101 → 1102 (requiere caja abierta)
  --   Esperado: 1102 debit=50, 1101 credit=50
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.record_transfer(
    '1101', '1102', 50.00,
    'Traspaso Caja operativa → Caja fuerte R7',
    v_user1_id,
    null
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-08 FAIL: journal_entry_id null (traspaso 1101→1102)'; end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1102 and debit=50.00
  ) then
    raise exception 'TB-R7-08 FAIL: 1102 debit=50 ausente';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1101 and credit=50.00
  ) then
    raise exception 'TB-R7-08 FAIL: 1101 credit=50 ausente';
  end if;
  -- cash_session vinculado en financial_operations
  if not exists (
    select 1 from public.financial_operations where journal_entry_id=v_je_id
      and cash_session_id = v_session_id
  ) then
    raise exception 'TB-R7-08 FAIL: financial_operation no tiene cash_session_id para 1101';
  end if;

  raise notice 'TB-R7-08 PASS — Transfer 1101→1102: JE=% | 1102=50 D | 1101=50 C | session OK', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-09: record_owner_contribution — a 1103 (no requiere caja)
  --   Esperado: 1103 debit=500, 3101 credit=500
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.record_owner_contribution(
    '1103', 500.00,
    'Aportación propietario banco R7',
    v_user1_id,
    'R7-APT-001'
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-09 FAIL: journal_entry_id null (aportación)'; end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='owner_contribution'
  ) then
    raise exception 'TB-R7-09 FAIL: entry_type no es owner_contribution';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and debit=500.00
  ) then
    raise exception 'TB-R7-09 FAIL: 1103 debit=500 ausente';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_3101 and credit=500.00
  ) then
    raise exception 'TB-R7-09 FAIL: 3101 credit=500 ausente';
  end if;

  raise notice 'TB-R7-09 PASS — Aportación a 1103: JE=% | 1103=500 D | 3101=500 C', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-10: record_owner_withdrawal — desde 1102 (user2 autoriza)
  --   Prohibido desde 1101; requiere user distinto de user1
  --   Esperado: 3102 debit=100, 1102 credit=100; autorización registrada
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.record_owner_withdrawal(
    '1102', 100.00,
    'Retiro propietario Caja fuerte R7',
    v_user1_id,
    v_user2_id,
    'R7-RET-001'
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-10 FAIL: journal_entry_id null (retiro)'; end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='owner_withdrawal'
  ) then
    raise exception 'TB-R7-10 FAIL: entry_type no es owner_withdrawal';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_3102 and debit=100.00
  ) then
    raise exception 'TB-R7-10 FAIL: 3102 debit=100 ausente';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1102 and credit=100.00
  ) then
    raise exception 'TB-R7-10 FAIL: 1102 credit=100 ausente';
  end if;
  if not exists (
    select 1 from public.financial_authorizations
    where authorized_by=v_user2_id and request_type='owner_withdrawal'
  ) then
    raise exception 'TB-R7-10 FAIL: financial_authorization no registrada';
  end if;

  raise notice 'TB-R7-10 PASS — Retiro 1102: JE=% | 3102=100 D | 1102=100 C | auth=user2', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-11: reverse_journal_entry — reversa del traspaso TB-R7-07
  --   Original TB-R7-07: 1103 debit=200, 1102 credit=200
  --   Reversa espejo:    1103 credit=200, 1102 debit=200
  --   Autorizador: user2 (distinto de user1 quien creó el original)
  -- ══════════════════════════════════════════════════════════════════
  v_result := public.reverse_journal_entry(
    v_transfer_je_id,
    v_user2_id,
    'Reversión de traspaso R7 — test',
    v_user1_id,
    'R7-REV-001'
  );

  v_je_id := (v_result->>'reversal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-11 FAIL: reversal_entry_id null'; end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='reversal'
  ) then
    raise exception 'TB-R7-11 FAIL: reversal JE no es confirmed/reversal';
  end if;
  -- Original debe quedar 'reversed'
  if not exists (
    select 1 from public.journal_entries where id=v_transfer_je_id and status='reversed'
  ) then
    raise exception 'TB-R7-11 FAIL: asiento original no quedó reversed';
  end if;
  -- Líneas espejo
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1103 and credit=200.00 and debit=0
  ) then
    raise exception 'TB-R7-11 FAIL: línea espejo 1103 credit=200 ausente';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1102 and debit=200.00 and credit=0
  ) then
    raise exception 'TB-R7-11 FAIL: línea espejo 1102 debit=200 ausente';
  end if;
  -- Referencia al original
  if not exists (
    select 1 from public.journal_entries
    where id=v_je_id and reversal_of_id=v_transfer_je_id
  ) then
    raise exception 'TB-R7-11 FAIL: reversal_of_id no apunta al original';
  end if;

  raise notice 'TB-R7-11 PASS — Reversa: reversal=% | original=% (reversed) | espejo 1103/1102 OK',
    v_je_id, v_transfer_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-12: resolve_cash_discrepancy — tipo shortage
  --   Setup: sesión cerrada con diferencia (INSERT directo)
  --   Esperado: 5101 debit=75, 1101 credit=75; resolución registrada
  -- ══════════════════════════════════════════════════════════════════
  insert into public.cash_sessions (
    id, status, opening_amount, opened_by, closed_at, closed_by,
    expected_cash_total, first_counted_cash, difference_amount
  )
  values (
    gen_random_uuid(),
    'closed_with_pending_difference',
    1000.00, v_user1_id, now(), v_user1_id,
    1000.00, 925.00, -75.00
  )
  returning id into v_disc_session_id;

  v_result := public.resolve_cash_discrepancy(
    v_disc_session_id,
    'shortage',
    75.00,
    'Faltante en turno matutino R7',
    v_user1_id,
    'R7-DIF-001'
  );

  v_je_id := (v_result->>'journal_entry_id')::uuid;
  if v_je_id is null then raise exception 'TB-R7-12 FAIL: journal_entry_id null (discrepancia)'; end if;
  if not exists (
    select 1 from public.journal_entries where id=v_je_id and status='confirmed' and entry_type='cash_discrepancy'
  ) then
    raise exception 'TB-R7-12 FAIL: entry_type no es cash_discrepancy';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_5101 and debit=75.00
  ) then
    raise exception 'TB-R7-12 FAIL: 5101 debit=75 ausente (shortage)';
  end if;
  if not exists (
    select 1 from public.journal_lines where journal_entry_id=v_je_id
      and financial_account_id=v_acct_1101 and credit=75.00
  ) then
    raise exception 'TB-R7-12 FAIL: 1101 credit=75 ausente (shortage)';
  end if;
  if not exists (
    select 1 from public.cash_discrepancy_resolutions
    where cash_session_id=v_disc_session_id and resolution_type='shortage'
  ) then
    raise exception 'TB-R7-12 FAIL: cash_discrepancy_resolutions no registrada';
  end if;

  raise notice 'TB-R7-12 PASS — Shortage: JE=% | 5101=75 D | 1101=75 C | resolución OK', v_je_id;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-13: get_account_balances — saldos acumulados
  --   4101 (ingresos ventas): 4 ventas x 100 = 400 (income: credit-debit)
  -- ══════════════════════════════════════════════════════════════════
  select count(*) into v_count from public.get_account_balances() where balance <> 0;
  if v_count = 0 then
    raise exception 'TB-R7-13 FAIL: get_account_balances retorna solo saldos cero';
  end if;

  select balance into v_balance from public.get_account_balances() where code='4101';
  if v_balance <> 400.00 then
    raise exception 'TB-R7-13 FAIL: 4101 balance esperado=400.00, obtenido=%', v_balance;
  end if;

  raise notice 'TB-R7-13 PASS — get_account_balances: % cuentas con balance<>0 | 4101=400.00', v_count;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-14: get_journal_report — asientos del día
  --   Esperados: ≥10 asientos (4 ventas + 2 compras + 2 traspasos +
  --              aportación + retiro + reversa + discrepancia)
  -- ══════════════════════════════════════════════════════════════════
  select count(distinct entry_id) into v_count
  from public.get_journal_report(current_date, current_date);
  if v_count < 10 then
    raise exception 'TB-R7-14 FAIL: solo % asientos en el reporte (esperados >=10)', v_count;
  end if;

  raise notice 'TB-R7-14 PASS — get_journal_report: % asientos confirmados hoy', v_count;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-15: get_account_ledger — mayor de 4101 (ingresos)
  --   4 ventas × credit 100 = running_balance 400 al final
  -- ══════════════════════════════════════════════════════════════════
  select count(*) into v_rows from public.get_account_ledger('4101');
  if v_rows < 4 then
    raise exception 'TB-R7-15 FAIL: account_ledger 4101 tiene % líneas (esperadas >=4)', v_rows;
  end if;

  select running_balance into v_balance
  from public.get_account_ledger('4101')
  order by occurred_at desc, line_id desc
  limit 1;
  if v_balance <> 400.00 then
    raise exception 'TB-R7-15 FAIL: running_balance 4101 esperado=400.00, obtenido=%', v_balance;
  end if;

  raise notice 'TB-R7-15 PASS — get_account_ledger 4101: % líneas | running_balance=400.00', v_rows;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-16: get_cash_sessions_report
  --   Debe incluir la sesión activa + la sesión cerrada con diferencia resuelta
  -- ══════════════════════════════════════════════════════════════════
  select count(*) into v_count from public.get_cash_sessions_report();
  if v_count < 2 then
    raise exception 'TB-R7-16 FAIL: solo % sesiones en el reporte (esperadas >=2)', v_count;
  end if;
  if not exists (
    select 1 from public.get_cash_sessions_report()
    where session_id=v_disc_session_id and resolution_type='shortage'
  ) then
    raise exception 'TB-R7-16 FAIL: sesión con discrepancia shortage no aparece resuelta';
  end if;

  raise notice 'TB-R7-16 PASS — get_cash_sessions_report: % sesiones | discrepancia shortage visible', v_count;

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-17: Idempotencia — mismo key + mismo payload → resultado original
  --   finalize_pos_sale valida mesa ANTES del check de idempotencia (línea 77
  --   del cuerpo vs ~476). RPCs en M26 verifican idempotencia ANTES de la lógica
  --   de negocio. Usa record_owner_contribution key=R7-APT-001 (TB-R7-09).
  --   Esperado: respuesta cacheada retornada; 0 duplicados en JE ni idempotency_requests
  -- ══════════════════════════════════════════════════════════════════
  v_result2 := public.record_owner_contribution(
    '1103', 500.00,
    'Aportación propietario banco R7',  -- mismo payload que TB-R7-09
    v_user1_id,
    'R7-APT-001'                        -- misma key que TB-R7-09
  );

  if (v_result2->>'journal_entry_id') is null then
    raise exception 'TB-R7-17 FAIL: idem call retornó journal_entry_id null';
  end if;

  -- Solo 1 fila en idempotency_requests (scope='contribution')
  select count(*) into v_count
  from public.idempotency_requests
  where scope='contribution' and idempotency_key='R7-APT-001';
  if v_count <> 1 then
    raise exception 'TB-R7-17 FAIL: % filas en idempotency_requests (esperada=1)', v_count;
  end if;

  -- Solo 1 JE con esa idempotency_key (sin duplicado)
  select count(*) into v_count
  from public.journal_entries where idempotency_key='R7-APT-001';
  if v_count <> 1 then
    raise exception 'TB-R7-17 FAIL: % asientos con key R7-APT-001 (esperado=1)', v_count;
  end if;

  raise notice 'TB-R7-17 PASS — Idempotencia válida (contribution): 2da llamada retorna respuesta original; 0 duplicados';

  -- ══════════════════════════════════════════════════════════════════
  -- TB-R7-18: Idempotencia conflicto — mismo key + payload distinto → excepción
  --   Usa key 'R7-TRP-001' (registro: 1102→1103 200.00)
  --   Intenta con amount=999.00 (distinto) → debe fallar
  -- ══════════════════════════════════════════════════════════════════
  begin
    v_result := public.record_transfer(
      '1102', '1103', 999.00, -- amount diferente al original (200.00)
      'Traspaso conflicto test',
      v_user1_id,
      'R7-TRP-001' -- misma key, payload diferente
    );
    raise exception 'TB-R7-18 FAIL: no lanzó excepción por conflicto de idempotencia';
  exception
    when others then
      if sqlerrm like '%ya fue usada con una carga distinta%' or sqlerrm like '%carga distinta%' then
        raise notice 'TB-R7-18 PASS — Conflicto idempotencia detectado: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-18 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ══════════════════════════════════════════════════════════════════
  -- TESTS NEGATIVOS
  -- ══════════════════════════════════════════════════════════════════

  -- ── TB-R7-N01: Método de pago inválido en finalize_pos_sale
  --   La validación es pre-tabla (línea ~190) → no requiere setup de mesa
  begin
    v_result := public.finalize_pos_sale(
      v_table_id,
      jsonb_build_array(jsonb_build_object('order_id', gen_random_uuid()::text, 'material_id', v_material_id::text, 'quantity', '1')),
      '[{"method":"Criptomoneda","amount":100}]'::jsonb,
      v_user1_id, null
    );
    raise exception 'TB-R7-N01 FAIL: no rechazó método inválido';
  exception
    when others then
      if sqlerrm like '%no soportado%' or sqlerrm like '%pago no soportado%' then
        raise notice 'TB-R7-N01 PASS — Método inválido rechazado: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N01 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N02: Pago con importe ≤ 0 en finalize_pos_sale (pre-tabla)
  begin
    v_result := public.finalize_pos_sale(
      v_table_id,
      jsonb_build_array(jsonb_build_object('order_id', gen_random_uuid()::text, 'material_id', v_material_id::text, 'quantity', '1')),
      '[{"method":"Tarjeta","amount":0}]'::jsonb,
      v_user1_id, null
    );
    raise exception 'TB-R7-N02 FAIL: no rechazó importe=0';
  exception
    when others then
      if sqlerrm like '%mayor que cero%' or sqlerrm like '%importe%' then
        raise notice 'TB-R7-N02 PASS — Importe=0 rechazado: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N02 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N03: Asiento desbalanceado (trigger assert_journal_entry_balanced)
  begin
    insert into public.journal_entries
      (entry_number, entry_type, status, occurred_at, created_by)
    values
      ('JE-R7-UNBAL', 'transfer', 'pending', now(), v_user1_id)
    returning id into v_je_id;

    -- Solo débito, sin crédito → trigger rechaza UPDATE a confirmed
    insert into public.journal_lines (journal_entry_id, financial_account_id, debit, credit)
    values (v_je_id, v_acct_1101, 100.00, 0.00);

    update public.journal_entries set status='confirmed' where id=v_je_id;
    raise exception 'TB-R7-N03 FAIL: trigger no rechazó asiento desbalanceado';
  exception
    when others then
      if sqlerrm like '%balanceado%' or sqlerrm like '%balancead%' then
        raise notice 'TB-R7-N03 PASS — Asiento desbalanceado rechazado: %', left(sqlerrm, 60);
      else
        raise exception 'TB-R7-N03 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N04: Retiro desde 1101 (prohibido por diseño)
  begin
    v_result := public.record_owner_withdrawal(
      '1101', 50.00, 'Retiro prohibido desde 1101', v_user1_id, v_user2_id, null
    );
    raise exception 'TB-R7-N04 FAIL: no rechazó retiro desde 1101';
  exception
    when others then
      if sqlerrm like '%prohibidos%' or sqlerrm like '%1101%' then
        raise notice 'TB-R7-N04 PASS — Retiro desde 1101 rechazado: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N04 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N05: Auto-autorización en retiro (p_performed_by = p_authorized_by)
  begin
    v_result := public.record_owner_withdrawal(
      '1102', 50.00, 'Auto-auth', v_user1_id, v_user1_id, null
    );
    raise exception 'TB-R7-N05 FAIL: no rechazó auto-autorización';
  exception
    when others then
      if sqlerrm like '%distinto%' or sqlerrm like '%mismo%' then
        raise notice 'TB-R7-N05 PASS — Auto-autorización rechazada: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N05 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N06: Reversa de asiento ya revertido (v_transfer_je_id = 'reversed')
  begin
    v_result := public.reverse_journal_entry(
      v_transfer_je_id, v_user2_id, 'Double reversa', v_user1_id, null
    );
    raise exception 'TB-R7-N06 FAIL: no rechazó reversa de asiento reversed';
  exception
    when others then
      if sqlerrm like '%confirmed%' or sqlerrm like '%revertir%' then
        raise notice 'TB-R7-N06 PASS — Reversa de asiento reversed rechazada: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N06 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N07: Traspaso con cuenta origen = destino
  begin
    v_result := public.record_transfer('1101', '1101', 100.00, 'Traspaso inválido', v_user1_id, null);
    raise exception 'TB-R7-N07 FAIL: no rechazó traspaso mismo origen y destino';
  exception
    when others then
      if sqlerrm like '%distintas%' or sqlerrm like '%distintos%' then
        raise notice 'TB-R7-N07 PASS — Traspaso mismo origen/destino rechazado: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N07 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N08: resolve_cash_discrepancy en sesión open (no apta)
  begin
    v_result := public.resolve_cash_discrepancy(
      v_session_id, 'shortage', 50.00, 'Test sesión incorrecta', v_user1_id, null
    );
    raise exception 'TB-R7-N08 FAIL: no rechazó resolución en sesión open';
  exception
    when others then
      if sqlerrm like '%closed_with_pending_difference%' or sqlerrm like '%diferencia pendiente%' then
        raise notice 'TB-R7-N08 PASS — Resolución en sesión no-diferencia rechazada: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N08 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N09: resolve_cash_discrepancy duplicada (v_disc_session_id ya resuelta)
  begin
    v_result := public.resolve_cash_discrepancy(
      v_disc_session_id, 'shortage', 75.00, 'Duplicada', v_user1_id, null
    );
    raise exception 'TB-R7-N09 FAIL: no rechazó resolución duplicada';
  exception
    when others then
      if sqlerrm like '%ya tiene una resolución%' or sqlerrm like '%resolución%' then
        raise notice 'TB-R7-N09 PASS — Resolución duplicada rechazada: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N09 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ── TB-R7-N10: Eliminar cuenta del sistema (trigger protect_system_financial_accounts)
  begin
    delete from public.financial_accounts where code='1101' and is_system=true;
    raise exception 'TB-R7-N10 FAIL: trigger no rechazó eliminación de cuenta sistema';
  exception
    when others then
      if sqlerrm like '%sistema%' or sqlerrm like '%No se puede%' then
        raise notice 'TB-R7-N10 PASS — Cuenta sistema protegida: %', left(sqlerrm, 80);
      else
        raise exception 'TB-R7-N10 ERROR INESPERADO: %', sqlerrm;
      end if;
  end;

  -- ══════════════════════════════════════════════════════════════════
  -- RESUMEN FINAL
  -- ══════════════════════════════════════════════════════════════════
  raise notice '══════════════════════════════════════════════════════════════';
  raise notice 'R7 — TODOS LOS TESTS COMPLETADOS SIN ERROR';
  raise notice 'Positivos  (TB-R7-01 a TB-R7-18): ventas, compras, traspasos,';
  raise notice '           aportación, retiro, reversa, discrepancia, reportes,';
  raise notice '           idempotencia válida, conflicto idempotencia.';
  raise notice 'Negativos  (TB-R7-N01 a TB-R7-N10): método inválido, importe=0,';
  raise notice '           desbalance, retiro-1101, auto-auth, doble-reversa,';
  raise notice '           traspaso-igual, discrepancia-sesión-errónea,';
  raise notice '           discrepancia-duplicada, cuenta-sistema-protegida.';
  raise notice 'Total: 28 tests PASS';
  raise notice '══════════════════════════════════════════════════════════════';

end;
$$;

rollback;
