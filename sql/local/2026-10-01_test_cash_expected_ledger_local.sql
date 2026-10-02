-- ============================================================
-- CAJA-03B: EFECTIVO ESPERADO DESDE LEDGER 1101 — PRUEBAS CONDUCTUALES
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- Requiere 20261001235354_cash_expected_from_ledger.sql aplicada.
-- Un único BEGIN/ROLLBACK — ningún cambio persiste. Fixtures etiquetados CAJA03B-*.
--
-- S1 (sesión acumulativa, apertura 100):
--   B1  base sin movimientos                         → 100
--   B2  venta efectivo 50                            → 150 (sales_cash 50)
--   B3  venta tarjeta 80                             → 150
--   B4  venta mixta 100 = 60 efectivo + 40 tarjeta   → 210 (legacy dominante contaría 100)
--   B5  venta mixta 100 = 40 efectivo + 60 tarjeta   → 250 (legacy dominante contaría 0)
--   B6  compra Caja operativa 30                     → 220 (purchases_cash 30, Cr 1101)
--   B7  compra Caja fuerte 30                        → 220
--   B8  traspaso 1102→1101 40                        → 260
--   B9  traspaso 1101→1103 25                        → 235
--   B10 traspaso 1102→1103                           → 235
--   B11 aportación →1101 20                          → 255
--   B12 idempotencia: replay de compra no agrega línea 1101
--   B13 reversa de venta efectivo 50                 → 205 (original reversed, espejo sin FO)
--   B14 reversa de reversa                           → rechazada, sin filas
--   B15 primer conteo 200 (diff −5) congela expected/sales/breakdown; metadata existente preservada
--   B16 guards post-conteo: compra caja_operativa, traspaso 1101, aportación 1101, reversa 1101 rechazados;
--       1102→1103 y compra tarjeta permitidos
--   B17 recuento usa expected congelado aunque el ledger cambie fuera de banda; snapshot intacto
-- S2  close_cash_session_atomic (legacy) usa helper: compra cajón 30 + mixta 40/60 → 110 (legacy daría 100)
-- S3  sesión histórica cerrada sin snapshot: helper devuelve valores almacenados, sin recalcular
--
-- Concurrencia reversa vs primer conteo (manual, dos sesiones psql reales, fixtures confirmados localmente):
--   Fixture: caja abierta (apertura 100) + compra caja_operativa 30 → asiento J (expected 70).
--   A) sesión 1: begin; select record_first_cash_count_atomic(S, 50, U); select pg_sleep(4); commit;
--      sesión 2 (1 s después): select reverse_journal_entry(J, U2, 'race', U, null);
--      → sesión 2 espera el commit de 1 y se rechaza ("proceso de cierre"); expected congelado 70, J confirmed.
--   B) sesión 1: begin; select reverse_journal_entry(J, U2, 'race', U, null); select pg_sleep(4); commit;
--      sesión 2 (1 s después): select record_first_cash_count_atomic(S, 50, U);
--      → sesión 2 espera el commit de 1 y congela 100 (ya sin la compra revertida).
--   No existe tercer resultado (expected congelado y luego reversa 1101 confirmada).
--
-- Ejecutar como:
--   docker cp sql/local/2026-10-01_test_cash_expected_ledger_local.sql \
--     supabase_db_mi-punto-de-venta:/tmp/test_caja03b.sql
--   docker exec supabase_db_mi-punto-de-venta \
--     bash -c "psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/test_caja03b.sql 2>&1"
-- ============================================================

begin;

do $$
declare
  v_user_a     uuid := '3b000000-0000-0000-0000-000000000001';  -- crea movimientos
  v_user_b     uuid := '3b000000-0000-0000-0000-000000000002';  -- autoriza reversas
  v_center_id  uuid;
  v_bar_id     uuid;
  v_provider   uuid;
  v_material   uuid;
  v_table_id   uuid;
  s1           uuid;
  s2           uuid;
  s3           uuid;
  r            record;
  v_result     jsonb;
  v_items30    jsonb := '[{"item_description":"CAJA03B gasto","quantity":1,"unit_cost":30}]';
  v_sale_je    uuid;
  v_drawer_je  uuid;
  v_mirror_je  uuid;
  v_ok         boolean;
  v_msg        text;
  c_je         integer;
  c_fo         integer;
  c_1101       integer;
  v_meta       jsonb;
  v_snap       jsonb;
  CLOSING_MSG  constant text := '%proceso de cierre%';
begin
  raise notice 'CAJA-03B — inicio (LOCAL, BEGIN/ROLLBACK)';

  -- ── PRE ────────────────────────────────────────────────────────────────
  if exists (select 1 from public.cash_sessions where status = 'open') then
    raise exception '[PRE] Existe una caja abierta persistente.';
  end if;
  if public.active_pos_operation_count() > 0 then
    raise exception '[PRE] Hay estaciones ocupadas.';
  end if;

  select id into v_center_id from public.centers limit 1;
  select id into v_bar_id from public.centers where lower(trim(name)) = 'bar principal';
  select id into v_provider from public.providers limit 1;
  select i.material_id into v_material
  from public.inventory i
  join public.materials m on m.id = i.material_id
  join public.categories k on k.id = m.cat_id
  where i.center_id = v_bar_id and k.is_for_sale and i.precio_venta > 0
  limit 1;
  select id into v_table_id from public.tables where status = 'libre' limit 1;
  if v_center_id is null or v_bar_id is null or v_provider is null or v_material is null or v_table_id is null then
    raise exception '[PRE] Faltan centro/Bar Principal/proveedor/material vendible/estación libre.';
  end if;

  -- precio 100 y stock amplio (revertido al final)
  update public.inventory set precio_venta = 100, stock_actual = 1000
   where material_id = v_material and center_id = v_bar_id;

  insert into auth.users (id) values (v_user_a), (v_user_b);
  insert into public.app_profiles (id, username, email, is_superadmin) values
    (v_user_a, 'test_caja03b_a', 'test_caja03b_a@app.local', true),
    (v_user_b, 'test_caja03b_b', 'test_caja03b_b@app.local', true);

  insert into public.ledger_settings (id, ledger_cutover_at, activated_by, activated_at)
  values (true, now() - interval '1 minute', v_user_a, now())
  on conflict (id) do update set ledger_cutover_at = excluded.ledger_cutover_at;

  -- ══ S1 ═════════════════════════════════════════════════════════════════
  insert into public.cash_sessions (status, opening_amount, opened_by, report_pdf_metadata)
  values ('open', 100.00, v_user_a, '{"existing_key":"keep-me"}')
  returning id into s1;

  -- B1 base
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 100 or r.is_frozen or r.net_movement <> 0 or r.sales_cash <> 0
     or r.purchases_cash <> 0 or r.transfers_net <> 0 or r.contributions <> 0 or r.other_net <> 0 then
    raise exception 'B1 FAIL: %', row_to_json(r);
  end if;
  raise notice 'B1 PASS — base 100, breakdown en cero';

  -- B2–B5 ventas reales vía finalize_pos_sale
  declare
    v_specs jsonb := jsonb_build_array(
      jsonb_build_object('name','B2','pay','[{"method":"Efectivo","amount":100}]'::jsonb,'qty',0.5,'exp',150,'sales',50),
      jsonb_build_object('name','B3','pay','[{"method":"Tarjeta","amount":80}]'::jsonb,'qty',0.8,'exp',150,'sales',50),
      jsonb_build_object('name','B4','pay','[{"method":"Efectivo","amount":60},{"method":"Tarjeta","amount":40}]'::jsonb,'qty',1,'exp',210,'sales',110),
      jsonb_build_object('name','B5','pay','[{"method":"Efectivo","amount":40},{"method":"Tarjeta","amount":60}]'::jsonb,'qty',1,'exp',250,'sales',150)
    );
    v_spec  jsonb;
    v_order uuid;
    v_pay   jsonb;
    v_total numeric;
  begin
    for v_spec in select * from jsonb_array_elements(v_specs) loop
      v_order := gen_random_uuid();
      v_total := 100 * (v_spec->>'qty')::numeric;
      -- B2: pago 50 en efectivo (qty 0.5)
      v_pay := case when v_spec->>'name' = 'B2' then '[{"method":"Efectivo","amount":50}]'::jsonb else v_spec->'pay' end;
      insert into public.table_orders (id, table_id, items, total)
      values (v_order, v_table_id, '[]'::jsonb, v_total);
      update public.tables set status = 'ocupada', current_order_id = v_order where id = v_table_id;
      v_result := public.finalize_pos_sale(
        v_table_id,
        jsonb_build_array(jsonb_build_object('order_id', v_order, 'material_id', v_material, 'quantity', (v_spec->>'qty'))),
        v_pay, v_user_a, null);
      if v_spec->>'name' = 'B2' then v_sale_je := (v_result->>'journal_entry_id')::uuid; end if;

      select * into r from public.get_cash_session_expected(s1);
      if r.expected_cash_total <> (v_spec->>'exp')::numeric or r.sales_cash <> (v_spec->>'sales')::numeric then
        raise exception '% FAIL: expected=% sales=% (esperado % / %)', v_spec->>'name',
          r.expected_cash_total, r.sales_cash, v_spec->>'exp', v_spec->>'sales';
      end if;
      raise notice '% PASS — expected % (sales_cash %)', v_spec->>'name', r.expected_cash_total, r.sales_cash;
    end loop;
  end;

  -- legacy dominante por venta mixta: B4 contaría 100 (ledger 60), B5 contaría 0 (ledger 40)
  declare v_legacy jsonb;
  begin
    select jsonb_object_agg(s.payment_method, s.total_amount) into v_legacy
    from public.sales s
    where s.cash_session_id = s1 and s.total_amount = 100;
    if (v_legacy->>'Efectivo')::numeric <> 100 or (v_legacy->>'Tarjeta')::numeric <> 100 then
      raise exception 'B4/B5 FAIL: método dominante inesperado %', v_legacy;
    end if;
    raise notice 'B4/B5 PASS — mixtas: legacy 100/0 por método dominante vs ledger 60/40 (bug eliminado)';
  end;

  -- B6 compra Caja operativa 30
  v_result := public.create_purchase_with_ledger(v_provider, v_center_id, 'CAJA03B-B6', v_items30,
    '{"method":"Efectivo","amount":30,"cash_source":"caja_operativa"}', v_user_a, 'caja03b-b6');
  v_drawer_je := (v_result->>'journal_entry_id')::uuid;
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 220 or r.purchases_cash <> 30 then raise exception 'B6 FAIL: %', row_to_json(r); end if;
  if not exists (select 1 from public.journal_lines jl join public.financial_accounts a on a.id = jl.financial_account_id
                  where jl.journal_entry_id = v_drawer_je and a.code = '1101' and jl.credit = 30) then
    raise exception 'B6 FAIL: sin Cr 1101 30';
  end if;
  raise notice 'B6 PASS — compra cajón 30 → 220, purchases_cash 30, Cr 1101';

  -- B7 compra Caja fuerte
  perform public.create_purchase_with_ledger(v_provider, v_center_id, 'CAJA03B-B7', v_items30,
    '{"method":"Efectivo","amount":30,"cash_source":"caja_fuerte"}', v_user_a, null);
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 220 then raise exception 'B7 FAIL: %', row_to_json(r); end if;
  raise notice 'B7 PASS — compra caja fuerte sin efecto (220)';

  -- B8–B10 traspasos
  perform public.record_transfer('1102', '1101', 40, 'CAJA03B-B8', v_user_a, null);
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 260 or r.transfers_net <> 40 then raise exception 'B8 FAIL: %', row_to_json(r); end if;
  raise notice 'B8 PASS — 1102→1101 40 → 260';

  perform public.record_transfer('1101', '1103', 25, 'CAJA03B-B9', v_user_a, null);
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 235 or r.transfers_net <> 15 then raise exception 'B9 FAIL: %', row_to_json(r); end if;
  raise notice 'B9 PASS — 1101→1103 25 → 235 (transfers_net 15)';

  perform public.record_transfer('1102', '1103', 10, 'CAJA03B-B10', v_user_a, null);
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 235 or r.transfers_net <> 15 then raise exception 'B10 FAIL: %', row_to_json(r); end if;
  raise notice 'B10 PASS — 1102→1103 sin efecto';

  -- B11 aportación
  perform public.record_owner_contribution('1101', 20, 'CAJA03B-B11', v_user_a, null);
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 255 or r.contributions <> 20 then raise exception 'B11 FAIL: %', row_to_json(r); end if;
  raise notice 'B11 PASS — aportación 20 → 255';

  -- B12 idempotencia
  select count(*) into c_1101 from public.journal_lines jl join public.financial_accounts a on a.id = jl.financial_account_id where a.code = '1101';
  perform public.create_purchase_with_ledger(v_provider, v_center_id, 'CAJA03B-B6', v_items30,
    '{"method":"Efectivo","amount":30,"cash_source":"caja_operativa"}', v_user_a, 'caja03b-b6');
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 255
     or (select count(*) from public.journal_lines jl join public.financial_accounts a on a.id = jl.financial_account_id where a.code = '1101') <> c_1101 then
    raise exception 'B12 FAIL: replay agregó movimiento 1101';
  end if;
  raise notice 'B12 PASS — replay idempotente sin línea 1101 extra';

  -- B13 reversa de venta efectivo 50
  v_result := public.reverse_journal_entry(v_sale_je, v_user_b, 'CAJA03B-B13', v_user_a, null);
  v_mirror_je := (v_result->>'reversal_entry_id')::uuid;
  if (select status from public.journal_entries where id = v_sale_je) <> 'reversed'
     or (select status from public.journal_entries where id = v_mirror_je) <> 'confirmed'
     or exists (select 1 from public.financial_operations where journal_entry_id = v_mirror_je) then
    raise exception 'B13 FAIL: semántica de reversa inesperada';
  end if;
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 205 or r.sales_cash <> 100 then raise exception 'B13 FAIL: %', row_to_json(r); end if;
  raise notice 'B13 PASS — reversa venta 50 → 205; original reversed, espejo confirmado sin FO';

  -- B14 reversa de reversa
  select count(*) into c_je from public.journal_entries;
  select count(*) into c_fo from public.financial_operations;
  v_ok := false; v_msg := null;
  begin
    perform public.reverse_journal_entry(v_mirror_je, v_user_b, 'CAJA03B-B14', v_user_a, null);
  exception when others then v_ok := sqlerrm like '%No se puede revertir un asiento de reversa%'; v_msg := sqlerrm;
  end;
  if not v_ok or (select count(*) from public.journal_entries) <> c_je
     or (select count(*) from public.financial_operations) <> c_fo then
    raise exception 'B14 FAIL: %', coalesce(v_msg, 'aceptada');
  end if;
  select * into r from public.get_cash_session_expected(s1);
  if r.expected_cash_total <> 205 then raise exception 'B14 FAIL: expected cambió'; end if;
  raise notice 'B14 PASS — reversa de reversa rechazada, sin filas';

  -- B15 primer conteo con diferencia
  select * into r from public.get_cash_session_expected(s1);   -- valores vivos justo antes
  v_result := public.record_first_cash_count_atomic(s1, 200.00, v_user_a);
  if v_result->>'close_result' <> 'difference_detected' or (v_result->>'expected_cash')::numeric <> 205
     or (v_result->>'difference')::numeric <> -5 then
    raise exception 'B15 FAIL: %', v_result;
  end if;
  select report_pdf_metadata into v_meta from public.cash_sessions where id = s1;
  v_snap := v_meta -> 'cash_expected_breakdown';
  if v_meta->>'existing_key' is distinct from 'keep-me' then raise exception 'B15 FAIL: metadata perdida %', v_meta; end if;
  if (select expected_cash_total from public.cash_sessions where id = s1) <> r.expected_cash_total
     or (select sales_cash_total from public.cash_sessions where id = s1) <> r.sales_cash
     or (select difference_amount from public.cash_sessions where id = s1) <> -5
     or (select first_counted_cash from public.cash_sessions where id = s1) <> 200
     or (v_snap->>'expected_cash_total')::numeric <> r.expected_cash_total
     or (v_snap->>'sales_cash')::numeric <> r.sales_cash
     or (v_snap->>'purchases_cash')::numeric <> r.purchases_cash
     or (v_snap->>'transfers_net')::numeric <> r.transfers_net
     or (v_snap->>'contributions')::numeric <> r.contributions
     or (v_snap->>'other_net')::numeric <> r.other_net
     or (v_snap->>'net_movement')::numeric <> r.net_movement
     or (v_snap->>'opening_amount')::numeric <> 100 then
    raise exception 'B15 FAIL: snapshot incoherente %', v_snap;
  end if;
  select * into r from public.get_cash_session_expected(s1);
  if not r.is_frozen or r.expected_cash_total <> 205 or r.purchases_cash <> 30 then
    raise exception 'B15 FAIL: helper post-conteo %', row_to_json(r);
  end if;
  raise notice 'B15 PASS — primer conteo congela 205/sales 100/breakdown; existing_key preservada';

  -- B16 guards post-conteo
  v_ok := false; v_msg := null;
  begin
    perform public.create_purchase_with_ledger(v_provider, v_center_id, 'CAJA03B-B16a', v_items30,
      '{"method":"Efectivo","amount":30,"cash_source":"caja_operativa"}', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm; end;
  if not v_ok then raise exception 'B16 compra FAIL: %', coalesce(v_msg,'aceptada'); end if;
  v_ok := false; v_msg := null;
  begin perform public.record_transfer('1101', '1102', 5, 'CAJA03B-B16', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm; end;
  if not v_ok then raise exception 'B16 traspaso FAIL: %', coalesce(v_msg,'aceptado'); end if;
  v_ok := false; v_msg := null;
  begin perform public.record_owner_contribution('1101', 5, 'CAJA03B-B16', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm; end;
  if not v_ok then raise exception 'B16 aportación FAIL: %', coalesce(v_msg,'aceptada'); end if;
  v_ok := false; v_msg := null;
  begin perform public.reverse_journal_entry(v_drawer_je, v_user_b, 'CAJA03B-B16', v_user_a, null);
  exception when others then v_ok := sqlerrm like CLOSING_MSG; v_msg := sqlerrm; end;
  if not v_ok then raise exception 'B16 reversa FAIL: %', coalesce(v_msg,'aceptada'); end if;
  perform public.record_transfer('1102', '1103', 5, 'CAJA03B-B16-ok', v_user_a, null);
  perform public.create_purchase_with_ledger(v_provider, v_center_id, 'CAJA03B-B16-card', v_items30,
    '{"method":"Tarjeta","amount":30}', v_user_a, null);
  raise notice 'B16 PASS — 1101 bloqueado tras conteo (compra/traspaso/aportación/reversa); 1102→1103 y tarjeta permitidos';

  -- B17 recuento con cambio fuera de banda en el ledger (inserción directa, no vía RPC)
  insert into public.financial_operations (operation_type, total_amount, cash_session_id, journal_entry_id, performed_by)
  select 'purchase', 30, s1, v_drawer_je, v_user_a;   -- duplicaría −30 si se recalculara
  v_result := public.submit_cash_recount_atomic(s1, 205.00, v_user_a);
  if v_result->>'close_result' <> 'closed' or (v_result->>'expected_cash')::numeric <> 205 then
    raise exception 'B17 FAIL: %', v_result;
  end if;
  if (select expected_cash_total from public.cash_sessions where id = s1) <> 205
     or (select sales_cash_total from public.cash_sessions where id = s1) <> 100
     or (select report_pdf_metadata -> 'cash_expected_breakdown' from public.cash_sessions where id = s1) <> v_snap
     or (select report_pdf_metadata ->> 'existing_key' from public.cash_sessions where id = s1) is distinct from 'keep-me'
     or (select report_pdf_metadata ->> 'suggested_file_name' from public.cash_sessions where id = s1) is null then
    raise exception 'B17 FAIL: snapshot alterado por recuento';
  end if;
  raise notice 'B17 PASS — recuento contra expected congelado (205), snapshot y metadata intactos';

  -- ══ S2: close_cash_session_atomic legacy ══════════════════════════════
  insert into public.cash_sessions (status, opening_amount, opened_by)
  values ('open', 100.00, v_user_a) returning id into s2;
  perform public.create_purchase_with_ledger(v_provider, v_center_id, 'CAJA03B-S2', v_items30,
    '{"method":"Efectivo","amount":30,"cash_source":"caja_operativa"}', v_user_a, null);
  declare v_order uuid := gen_random_uuid();
  begin
    insert into public.table_orders (id, table_id, items, total) values (v_order, v_table_id, '[]'::jsonb, 100);
    update public.tables set status = 'ocupada', current_order_id = v_order where id = v_table_id;
    perform public.finalize_pos_sale(v_table_id,
      jsonb_build_array(jsonb_build_object('order_id', v_order, 'material_id', v_material, 'quantity', 1)),
      '[{"method":"Efectivo","amount":40},{"method":"Tarjeta","amount":60}]'::jsonb, v_user_a, null);
  end;
  v_result := public.close_cash_session_atomic(v_user_a);
  if not (v_result->>'ok')::boolean
     or (select expected_cash_total from public.cash_sessions where id = s2) <> 110
     or (select sales_cash_total from public.cash_sessions where id = s2) <> 40
     or (select (report_pdf_metadata -> 'cash_expected_breakdown' ->> 'purchases_cash')::numeric from public.cash_sessions where id = s2) <> 30 then
    raise exception 'S2 FAIL: % / %', v_result, (select row_to_json(c) from public.cash_sessions c where id = s2);
  end if;
  raise notice 'S2 PASS — close_cash_session_atomic usa helper: 110 (legacy daría 100)';

  -- ══ S3: histórica cerrada sin snapshot ════════════════════════════════
  insert into public.cash_sessions (status, opening_amount, opened_by, closed_at, closed_by,
                                    sales_cash_total, expected_cash_total, closing_amount, first_counted_cash, difference_amount)
  values ('closed', 200.00, v_user_a, now(), v_user_a, 300.00, 500.00, 500.00, 500.00, 0)
  returning id into s3;
  insert into public.financial_operations (operation_type, total_amount, cash_session_id, journal_entry_id, performed_by)
  values ('purchase', 30, s3, v_drawer_je, v_user_a);   -- vínculo histórico que NO debe recalcularse
  select * into r from public.get_cash_session_expected(s3);
  if not r.is_frozen or r.expected_cash_total <> 500 or r.sales_cash <> 300 or r.opening_amount <> 200
     or r.other_net <> 0 or r.net_movement <> 300
     or r.purchases_cash is not null or r.transfers_net is not null or r.contributions is not null then
    raise exception 'S3 FAIL: %', row_to_json(r);
  end if;
  raise notice 'S3 PASS — histórica: valores almacenados, detalle NULL, other_net = expected−opening−sales';

  -- sesión inexistente → 0 filas
  if exists (select 1 from public.get_cash_session_expected(gen_random_uuid())) then
    raise exception 'S4 FAIL: sesión inexistente devolvió filas';
  end if;
  raise notice 'S4 PASS — sesión inexistente sin filas';

  raise notice 'CAJA-03B — TODAS LAS PRUEBAS PASS';
end;
$$;

rollback;
