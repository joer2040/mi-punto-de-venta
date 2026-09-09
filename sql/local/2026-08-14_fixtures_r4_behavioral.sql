-- ============================================================
-- FIXTURES LOCALES: R4 PRUEBAS CONDUCTUALES
-- ============================================================
-- EXCLUSIVAMENTE LOCAL. PROHIBIDO EJECUTAR EN DEV O PRD.
-- ============================================================
-- Propósito:
--   Crear los datos mínimos para ejecutar TB-01 a TB-13.
--   Idempotente: reutiliza fixtures si ya existen Y corresponden
--   exactamente a los datos esperados. Lanza excepción si un UUID
--   ya existe con datos distintos.
--
-- Prerequisitos:
--   1. Bootstrap M14 ejecutado (org, centro Bar Principal, uom, proveedor)
--   2. Bootstrap M16 ejecutado (categoría Botella)
--   3. Las 28 migraciones aplicadas (M1-M28)
--   4. Ledger INACTIVO (sin ledger_cutover_at en ledger_settings)
--
-- Método de ejecución:
--   docker cp sql/local/2026-08-14_fixtures_r4_behavioral.sql \
--     supabase_db_mi-punto-de-venta:/tmp/fixtures_r4.sql
--   docker exec supabase_db_mi-punto-de-venta \
--     psql -U postgres -d postgres -f /tmp/fixtures_r4.sql
--
-- UUIDs fijos:
--   F1/F2  auth.users / app_profiles : 10000000-0000-0000-0000-000000000006
--   F3     tables                    : 10000000-0000-0000-0000-000000000007
--   F4     table_orders              : 10000000-0000-0000-0000-000000000008
--   F5     materials                 : 10000000-0000-0000-0000-000000000009
--   F6     inventory (UPDATE)        : (material_id=...0009, center_id=...0002)
--   Botella    categories            : 10000000-0000-0000-0000-000000000005
--   Bar Principal centers            : 10000000-0000-0000-0000-000000000002
--
-- Alternativa A (Sección 3.6 de FASE3_R4_FIXTURES_PRECHECK.md):
--   PERFORM set_config('session_replication_role', 'replica', true) cubre
--   EXCLUSIVAMENTE el INSERT de table_orders (F4) y el UPDATE de tables (F3b).
--   El tercer argumento true = transaction-local; revierte al commit.
--   Todos los demás fixtures ocurren fuera de esa ventana.
-- ============================================================

begin;

do $$
declare
  v_user_id     uuid    := '10000000-0000-0000-0000-000000000006';
  v_table_id    uuid    := '10000000-0000-0000-0000-000000000007';
  v_order_id    uuid    := '10000000-0000-0000-0000-000000000008';
  v_material_id uuid    := '10000000-0000-0000-0000-000000000009';
  v_cat_id      uuid    := '10000000-0000-0000-0000-000000000005';
  v_center_id   uuid    := '10000000-0000-0000-0000-000000000002';
  v_item_price  numeric := 150.00;
  v_count       integer;
begin

  raise notice '============================================================';
  raise notice 'Fixtures R4: inicio';
  raise notice 'EXCLUSIVAMENTE LOCAL. PROHIBIDO EN DEV O PRD.';
  raise notice '============================================================';

  -- ── PRE-VALIDACIONES ─────────────────────────────────────────────────────
  -- Fallar temprano. Verificar entorno Y que los UUIDs de referencia
  -- sean exactamente los datos esperados.

  -- Exactamente 1 categoría Botella en toda la tabla
  select count(*) into v_count
  from public.categories
  where lower(trim(name)) = 'botella';

  if v_count <> 1 then
    raise exception
      '[PRE] Se esperaba exactamente 1 categoría Botella; encontradas: %. '
      'Ejecutar bootstrap M16 primero.',
      v_count;
  end if;

  -- El UUID ...0005 corresponde a esa categoría
  if not exists (
    select 1 from public.categories
    where id = v_cat_id and lower(trim(name)) = 'botella'
  ) then
    raise exception
      '[PRE] UUID % existe pero no corresponde a categoría Botella. '
      'Conflicto de datos.',
      v_cat_id;
  end if;

  -- Exactamente 1 centro Bar Principal en toda la tabla
  select count(*) into v_count
  from public.centers
  where lower(trim(name)) = 'bar principal';

  if v_count <> 1 then
    raise exception
      '[PRE] Se esperaba exactamente 1 centro Bar Principal; encontrados: %. '
      'Ejecutar bootstrap M14 primero.',
      v_count;
  end if;

  -- El UUID ...0002 corresponde a ese centro
  if not exists (
    select 1 from public.centers
    where id = v_center_id and lower(trim(name)) = 'bar principal'
  ) then
    raise exception
      '[PRE] UUID % existe pero no corresponde a centro Bar Principal. '
      'Conflicto de datos.',
      v_center_id;
  end if;

  -- Ledger inactivo
  if exists (
    select 1 from public.ledger_settings
    where id = true and ledger_cutover_at is not null
  ) then
    raise exception '[PRE] Ledger activo. Estos fixtures asumen ledger inactivo.';
  end if;

  raise notice '[PRE] OK — exactamente 1 Botella, 1 Bar Principal, ledger inactivo';

  -- ── F1: auth.users ────────────────────────────────────────────────────────
  -- Solo id es NOT NULL. ON DELETE CASCADE propaga a app_profiles.
  -- No hay campo de negocio adicional que validar al reutilizar.

  if not exists (select 1 from auth.users where id = v_user_id) then
    insert into auth.users (id) values (v_user_id);
    raise notice '[F1] auth.users INSERTADO  id=%', v_user_id;
  else
    raise notice '[F1] auth.users REUTILIZADO id=%', v_user_id;
  end if;

  -- ── F2: app_profiles ──────────────────────────────────────────────────────
  -- Campos obligatorios: id, username, email.
  -- full_name omitido (NULL permitido). status usa default 'active'.

  if not exists (select 1 from public.app_profiles where id = v_user_id) then
    insert into public.app_profiles (id, username, email, is_superadmin)
    values (v_user_id, 'test_user_r4', 'test_user_r4@app.local', true);
    raise notice '[F2] app_profiles INSERTADO  id=% username=test_user_r4', v_user_id;
  else
    if not exists (
      select 1 from public.app_profiles
      where id       = v_user_id
        and username = 'test_user_r4'
        and email    = 'test_user_r4@app.local'
    ) then
      raise exception
        '[F2] UUID % existe en app_profiles con datos distintos a los esperados '
        '(username=test_user_r4, email=test_user_r4@app.local). '
        'No se puede reutilizar sin modificar.',
        v_user_id;
    end if;
    raise notice '[F2] app_profiles REUTILIZADO id=%', v_user_id;
  end if;

  -- ── F3a: tables (libre) ───────────────────────────────────────────────────
  -- INSERT con status='libre', current_order_id=NULL.
  -- Trigger WHEN = false para este estado → sin bypass requerido.

  if not exists (select 1 from public.tables where id = v_table_id) then
    insert into public.tables (id, number, status, current_order_id)
    values (v_table_id, 'T-TEST-R4', 'libre', null);
    raise notice '[F3a] tables INSERTADA  id=% number=T-TEST-R4 status=libre', v_table_id;
  else
    if not exists (
      select 1 from public.tables
      where id     = v_table_id
        and number = 'T-TEST-R4'
    ) then
      raise exception
        '[F3a] UUID % existe en tables con number distinto a T-TEST-R4. '
        'No se puede reutilizar sin modificar.',
        v_table_id;
    end if;
    raise notice '[F3a] tables REUTILIZADA id=%', v_table_id;
  end if;

  -- ── INICIO VENTANA MÍNIMA DE BYPASS ──────────────────────────────────────
  -- Cubre EXCLUSIVAMENTE F4 (INSERT table_orders) y F3b (UPDATE tables).
  -- set_config con is_local=true equivale a SET LOCAL: revierte al commit.

  perform set_config('session_replication_role', 'replica', true);

  -- F4: table_orders
  -- Trigger sin cláusula WHEN → siempre dispara → requiere bypass.

  if not exists (select 1 from public.table_orders where id = v_order_id) then
    insert into public.table_orders (id, table_id, items, total)
    values (v_order_id, v_table_id, '[]', 0);
    raise notice '[F4]  table_orders INSERTADA  id=% table_id=%', v_order_id, v_table_id;
  else
    if not exists (
      select 1 from public.table_orders
      where id       = v_order_id
        and table_id = v_table_id
    ) then
      raise exception
        '[F4] UUID % existe en table_orders con table_id distinto a %. '
        'No se puede reutilizar sin modificar.',
        v_order_id, v_table_id;
    end if;
    raise notice '[F4]  table_orders REUTILIZADA id=%', v_order_id;
  end if;

  -- F3b: UPDATE tables a 'ocupada'
  -- Trigger WHEN = true para este destino → requiere bypass.

  update public.tables
     set status           = 'ocupada',
         current_order_id = v_order_id
   where id = v_table_id
     and (status <> 'ocupada' or current_order_id is distinct from v_order_id);

  if found then
    raise notice '[F3b] tables ACTUALIZADA  id=% → status=ocupada current_order_id=%',
      v_table_id, v_order_id;
  else
    raise notice '[F3b] tables ya en estado ocupada con order correcto — sin cambio';
  end if;

  perform set_config('session_replication_role', 'origin', true);

  -- ── FIN VENTANA DE BYPASS — todos los triggers restaurados ────────────────

  -- ── F5: materials ─────────────────────────────────────────────────────────
  -- FUERA del bypass. Trigger on_material_created dispara → INSERT automático
  -- en inventory con center_id = Bar Principal.

  if not exists (select 1 from public.materials where id = v_material_id) then
    insert into public.materials (id, cat_id, name)
    values (v_material_id, v_cat_id, 'Material Test R4');
    raise notice '[F5]  materials INSERTADO  id=% cat_id=% name=Material Test R4',
      v_material_id, v_cat_id;
  else
    if not exists (
      select 1 from public.materials
      where id     = v_material_id
        and name   = 'Material Test R4'
        and cat_id = v_cat_id
    ) then
      raise exception
        '[F5] UUID % existe en materials con datos distintos a los esperados '
        '(name=Material Test R4, cat_id=%). '
        'No se puede reutilizar sin modificar.',
        v_material_id, v_cat_id;
    end if;
    raise notice '[F5]  materials REUTILIZADO id=%', v_material_id;
  end if;

  -- ── F6: inventory (UPDATE de fila auto-creada por trigger) ───────────────
  -- on_material_created creó la fila con center_id = Bar Principal.
  -- Solo actualizar precio_venta y stock_actual.

  update public.inventory
     set precio_venta = v_item_price,
         stock_actual = 10
   where material_id = v_material_id
     and center_id   = v_center_id;

  if found then
    raise notice '[F6]  inventory ACTUALIZADO  material_id=% center_id=% precio_venta=% stock_actual=10',
      v_material_id, v_center_id, v_item_price;
  else
    raise exception
      '[F6] inventory no encontrado para material_id=%. '
      'Verificar que trigger on_material_created ejecutó correctamente.',
      v_material_id;
  end if;

  -- ── RESUMEN ───────────────────────────────────────────────────────────────
  raise notice '------------------------------------------------------------';
  raise notice 'Fixtures R4: COMPLETADOS';
  raise notice '';
  raise notice 'Sustituir en sql/local/2026-08-11_test_behavioral_ledger_local.sql:';
  raise notice '  <test_table_id>    = %', v_table_id;
  raise notice '  <test_order_id>    = %', v_order_id;
  raise notice '  <test_material_id> = %', v_material_id;
  raise notice '  <test_user_id>     = %', v_user_id;
  raise notice '  <test_item_price>  = %', v_item_price;
  raise notice '------------------------------------------------------------';

end $$;

commit;
