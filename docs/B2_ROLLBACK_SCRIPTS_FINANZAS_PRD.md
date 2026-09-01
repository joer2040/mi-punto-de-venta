# B2 — Rollback Scripts Finanzas PRD

**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`  
**Estado:** Borrador listo para revisión — NO ejecutado. PRD no tocado.

> ⚠️ **ADVERTENCIA GENERAL:** Ningún script de este documento debe ejecutarse sin:
> 1. Diagnóstico confirmado del síntoma exacto.
> 2. Backup/snapshot PRD verificado.
> 3. Autorización explícita de quien coordina el deploy.
> 4. Segunda revisión técnica del SQL antes de pegar en consola.

---

## 1. Resumen ejecutivo

Este documento contiene los scripts SQL finales y guías de acción para los escenarios de falla o degradación durante el deploy coordinado del módulo Finanzas a PRD.

Cubre:
- Fallas de EF después de migraciones exitosas (Escenario A)
- Falla de migración `20260811140000` con pérdida de función (Escenario B — contingencia extrema)
- Bug GROUP BY activo en `finalize_pos_sale` si falta `20260815100000` (Escenario C)
- Módulo Finanzas invisible por permisos sin seed (Escenario D)
- Falla de EF `financial-operations` (Escenario E)

La mayoría de escenarios se resuelven sin SQL de rollback destructivo.

---

## 2. Alcance

| Ítem | Incluido |
|---|---|
| Scripts de diagnóstico (SELECT) | ✅ |
| SQL de recuperación por escenario | ✅ |
| SQL de reversión de datos financieros | ❌ No aplica — no se activa ledger en deploy inicial |
| Rollback de `cash_sessions` o `sales` | ❌ No aplica — sin cambios destructivos en esas tablas |
| Reversión de permisos si fuera necesario | ✅ Escenario D |
| Reversión de EF (instrucciones) | ✅ Escenarios A y E |

---

## 3. Escenarios cubiertos

| ID | Síntoma principal | Requiere SQL | Severidad |
|---|---|---|---|
| A | POS falla: `function finalize_pos_sale(uuid, jsonb, text, uuid) does not exist` | No | Alta |
| B | POS falla: función `finalize_pos_sale` no encontrada en ninguna firma | Sí — contingencia extrema | Crítica |
| C | POS falla durante venta cuando ledger activo: `column "pay" must appear in GROUP BY` | Sí — re-aplicar fix | Media |
| D | Finanzas no visible para Manager/Admin | Sí — seed permisos | Baja |
| E | Finanzas reportes fallan: EF `financial-operations` no responde | No | Media |

---

## 4. Scripts SQL

---

### Escenario A — EF pos-operations desfasada después de migración exitosa

**Síntoma:**
```
ERROR: function finalize_pos_sale(uuid, jsonb, text, uuid) does not exist
```
Visible en logs de Edge Functions (`pos-operations`) o como respuesta 400/500 en POS.

**Causa probable:** Las migraciones se aplicaron correctamente (nueva firma DB existe), pero la EF `pos-operations` aún llama la firma antigua `(uuid, jsonb, text, uuid)`.

**Precondición para confirmar:**
- Ejecutar diagnóstico Q1 (ver Sección 5) — confirmar que firma `(uuid, jsonb, jsonb, uuid, text)` existe.
- Confirmar que firma `(uuid, jsonb, text, uuid)` NO existe.

**Acción — SIN SQL:**
1. Re-desplegar EF `pos-operations` desde el código de `chore/code-cleanup` (rama DEV).
2. Verificar en Supabase dashboard que la nueva EF fue actualizada.
3. Ejecutar venta de prueba en PRD.

**No requiere SQL de rollback.** La DB está en estado correcto. Solo la EF está desfasada.

**Criterio de éxito:**
- POS completa venta sin error.
- Logs de `pos-operations` sin excepciones de función.

---

### Escenario B — Función finalize_pos_sale desaparecida (contingencia extrema)

> **USAR SOLO BAJO AUTORIZACIÓN EXPLÍCITA**  
> Este escenario es una contingencia extrema. La migración `20260811140000` opera dentro de `begin; commit;`, por lo que una falla en la migración debería hacer rollback automático de todo, incluyendo el DROP de la función. Este script solo aplica si por alguna razón el estado de la DB quedó con la función ausente sin que las nuevas tablas/firma hayan sido creadas.

**Síntoma:**
```
ERROR: function finalize_pos_sale() does not exist
```
Y el diagnóstico Q1 (Sección 5) muestra cero filas (ninguna firma de `finalize_pos_sale` existe en DB).

**Precondición:**
- Diagnóstico Q1 confirma que `finalize_pos_sale` no existe en ninguna firma.
- Diagnóstico Q2 confirma que `20260811140000` NO aparece en migraciones aplicadas.
- Diagnóstico Q3 confirma que tablas `financial_operations` y `financial_payments` NO existen (si existen, la situación es distinta — contactar revisión técnica).

**Objetivo:** Restaurar firma antigua `finalize_pos_sale(uuid, jsonb, text, uuid)` para que PRD POS funcione mientras se investiga.

**Fuente original:** `supabase/migrations/20260715221000_harden_finalize_pos_sale.sql`

---

#### SCRIPT B — CONTINGENCIA EXTREMA

```sql
-- ============================================================
-- SCRIPT B: RESTAURAR finalize_pos_sale FIRMA ANTIGUA
-- USAR SOLO BAJO AUTORIZACIÓN EXPLÍCITA
-- Fuente: supabase/migrations/20260715221000_harden_finalize_pos_sale.sql
-- Precondición: ninguna firma de finalize_pos_sale existe en public
-- ============================================================

create or replace function public.finalize_pos_sale(
  p_table_id uuid,
  p_items jsonb,
  p_payment_method text,
  p_performed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_table public.tables%rowtype;
  v_order public.table_orders%rowtype;
  v_expected_order_id uuid;
  v_center_id uuid;
  v_cash_session_id uuid;
  v_sale_id uuid;
  v_sale_created_at timestamptz;
  v_document_number text;
  v_payment_method text;
  v_sequence integer;
  v_total_amount numeric(12,2);
  v_invalid_count integer;
  v_missing_count integer;
  v_ambiguous_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_sale jsonb;
  v_cash_session_count integer;
begin
  if p_table_id is null then
    raise exception 'Falta table_id.';
  end if;

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La mesa no tiene productos para cobrar.';
  end if;

  if lower(trim(coalesce(p_payment_method, ''))) <> lower('Efectivo') then
    raise exception 'Metodo de pago no soportado.';
  end if;

  v_payment_method := 'Efectivo';

  select *
    into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada.';
  end if;

  if lower(trim(coalesce(v_table.status, ''))) <> lower('ocupada')
     or v_table.current_order_id is null then
    raise exception 'La mesa no tiene un pedido activo o la venta ya fue finalizada.';
  end if;

  select *
    into v_order
  from public.table_orders
  where id = v_table.current_order_id
    and table_id = v_table.id
  for update;

  if not found then
    raise exception 'Pedido abierto no encontrado para la mesa %.', v_table.id;
  end if;

  select count(*)
    into v_ambiguous_count
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_ambiguous_count = 0 then
    raise exception 'No se encontro el centro Bar Principal.';
  end if;

  if v_ambiguous_count > 1 then
    raise exception 'Se encontro mas de un centro Bar Principal.';
  end if;

  select id
    into v_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  create temporary table if not exists pg_temp.finalize_pos_sale_raw_items_v2 (
    order_id_text text,
    material_id_text text,
    quantity_text text,
    bundle_id_text text,
    bundle_type_text text
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_raw_items_v2;

  insert into pg_temp.finalize_pos_sale_raw_items_v2 (
    order_id_text,
    material_id_text,
    quantity_text,
    bundle_id_text,
    bundle_type_text
  )
  select trim(order_id),
         trim(material_id),
         trim(quantity),
         nullif(trim(bundle_id), ''),
         nullif(lower(trim(bundle_type)), '')
  from jsonb_to_recordset(p_items) as item(
    order_id text,
    material_id text,
    quantity text,
    bundle_id text,
    bundle_type text
  );

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2
  where coalesce(order_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(material_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(quantity_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or case
          when coalesce(quantity_text, '') ~ '^[0-9]+(\.[0-9]+)?$'
            then quantity_text::numeric <= 0
          else true
        end
     or (bundle_id_text is null) <> (bundle_type_text is null)
     or coalesce(bundle_type_text, '') not in ('', 'cubeta', 'cubeta_caguamita');

  if v_invalid_count > 0 then
    raise exception 'La lista de articulos contiene valores invalidos.';
  end if;

  select count(distinct order_id_text)
    into v_ambiguous_count
  from pg_temp.finalize_pos_sale_raw_items_v2;

  if v_ambiguous_count <> 1 then
    raise exception 'La lista de articulos no identifica un unico pedido.';
  end if;

  select min(order_id_text)::uuid
    into v_expected_order_id
  from pg_temp.finalize_pos_sale_raw_items_v2;

  if v_expected_order_id is distinct from v_order.id then
    raise exception 'El pedido activo de la mesa cambio antes de la finalizacion.';
  end if;

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2
  where bundle_type_text is not null
    and quantity_text::numeric <> trunc(quantity_text::numeric);

  if v_invalid_count > 0 then
    raise exception 'Los bundles solo admiten cantidades enteras.';
  end if;

  select count(*)
    into v_ambiguous_count
  from (
    select bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_id_text is not null
    group by bundle_id_text
    having count(distinct bundle_type_text) > 1
  ) mixed_bundle_types;

  if v_ambiguous_count > 0 then
    raise exception 'Un bundle no puede mezclar tipos distintos.';
  end if;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  left join public.materials material
    on material.id = item.material_id_text::uuid
  where material.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales inexistentes.';
  end if;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material
    on material.id = item.material_id_text::uuid
  left join public.categories category
    on category.id = material.cat_id
  where category.id is null
     or category.is_for_sale is not true;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin categoria vendible.';
  end if;

  perform inventory.id
  from public.inventory inventory
  join (
    select distinct material_id_text::uuid as material_id
    from pg_temp.finalize_pos_sale_raw_items_v2
  ) item
    on item.material_id = inventory.material_id
  where inventory.center_id = v_center_id
  order by inventory.material_id
  for update of inventory;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  left join public.inventory inventory
    on inventory.material_id = item.material_id_text::uuid
   and inventory.center_id = v_center_id
  where inventory.id is null
     or inventory.precio_venta is null
     or inventory.precio_venta <= 0;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin precio de venta valido.';
  end if;

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material
    on material.id = item.material_id_text::uuid
  join public.categories category
    on category.id = material.cat_id
  where item.bundle_type_text = 'cubeta'
    and (
      coalesce(material.sku, '') not in (
        '75004132',
        '7501064115400',
        '7501064101410',
        '750106696971',
        '7501064101465'
      )
      or lower(trim(category.name)) <> lower('Cerveza')
    );

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Mixta contiene un producto no permitido.';
  end if;

  select count(*)
    into v_invalid_count
  from (
    select bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_type_text = 'cubeta'
    group by bundle_id_text
    having sum(quantity_text::numeric) <> 10
  ) invalid_cubeta_quantities;

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Mixta debe contener exactamente 10 piezas.';
  end if;

  select count(*)
    into v_invalid_count
  from (
    select item.bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2 item
    join public.inventory inventory
      on inventory.material_id = item.material_id_text::uuid
     and inventory.center_id = v_center_id
    where item.bundle_type_text = 'cubeta'
    group by item.bundle_id_text
    having count(distinct inventory.precio_venta) <> 1
  ) invalid_cubeta_prices;

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Mixta requiere productos con el mismo precio base.';
  end if;

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items_v2 item
  join public.materials material
    on material.id = item.material_id_text::uuid
  join public.categories category
    on category.id = material.cat_id
  where item.bundle_type_text = 'cubeta_caguamita'
    and (
      coalesce(material.sku, '') <> '7503024416459'
      or lower(trim(category.name)) <> lower('Cerveza')
    );

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Caguamita contiene un producto no permitido.';
  end if;

  select count(*)
    into v_invalid_count
  from (
    select bundle_id_text
    from pg_temp.finalize_pos_sale_raw_items_v2
    where bundle_type_text = 'cubeta_caguamita'
    group by bundle_id_text
    having sum(quantity_text::numeric) <> 5
  ) invalid_caguamita_quantities;

  if v_invalid_count > 0 then
    raise exception 'La Cubeta Caguamita debe contener exactamente 5 piezas.';
  end if;

  create temporary table if not exists pg_temp.finalize_pos_sale_items_v2 (
    material_id uuid,
    quantity numeric(12,4),
    unit_price numeric(12,2)
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_items_v2;

  insert into pg_temp.finalize_pos_sale_items_v2 (material_id, quantity, unit_price)
  select priced.material_id,
         sum(priced.quantity)::numeric(12,4),
         priced.unit_price
  from (
    select item.material_id_text::uuid as material_id,
           item.quantity_text::numeric as quantity,
           case item.bundle_type_text
             when 'cubeta' then 32.00::numeric(12,2)
             when 'cubeta_caguamita' then 26.00::numeric(12,2)
             else inventory.precio_venta::numeric(12,2)
           end as unit_price
    from pg_temp.finalize_pos_sale_raw_items_v2 item
    join public.inventory inventory
      on inventory.material_id = item.material_id_text::uuid
     and inventory.center_id = v_center_id
  ) priced
  group by priced.material_id, priced.unit_price;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_raw_items_v2 raw_item
  where not exists (
    select 1
    from pg_temp.finalize_pos_sale_items_v2 canonical_item
    where canonical_item.material_id = raw_item.material_id_text::uuid
  );

  if v_missing_count > 0 then
    raise exception 'No se pudo construir la lista canonica completa de la venta.';
  end if;

  select coalesce(sum(quantity * unit_price), 0)::numeric(12,2)
    into v_total_amount
  from pg_temp.finalize_pos_sale_items_v2;

  if v_total_amount <= 0 then
    raise exception 'El total de la venta debe ser mayor que cero.';
  end if;

  select count(*)
    into v_cash_session_count
  from public.cash_sessions
  where status = 'open';

  if v_cash_session_count > 1 then
    raise exception 'Se encontro mas de una caja abierta.';
  end if;

  select id
    into v_cash_session_id
  from public.cash_sessions
  where status = 'open'
  for update;

  if v_cash_session_id is null then
    raise exception 'No hay una caja abierta. Debes abrir caja antes de finalizar ventas en efectivo.';
  end if;

  v_sale_created_at := now();
  v_day_start := date_trunc('day', v_sale_created_at at time zone 'UTC') at time zone 'UTC';
  v_day_end := v_day_start + interval '1 day';

  perform pg_advisory_xact_lock(
    hashtext('finalize_pos_sale_document:' || to_char(v_day_start at time zone 'UTC', 'YYYYMMDD'))
  );

  select count(*) + 1
    into v_sequence
  from public.sales
  where created_at >= v_day_start
    and created_at < v_day_end;

  v_document_number :=
    to_char(v_sale_created_at at time zone 'UTC', 'DDMMYYYYHH24MI') ||
    lpad(v_sequence::text, 2, '0');

  insert into public.sales (
    center_id,
    total_amount,
    payment_method,
    cash_session_id,
    created_at,
    document_number
  )
  values (
    v_center_id,
    v_total_amount,
    v_payment_method,
    v_cash_session_id,
    v_sale_created_at,
    v_document_number
  )
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, material_id, quantity, unit_price)
  select v_sale_id,
         material_id,
         quantity,
         unit_price
  from pg_temp.finalize_pos_sale_items_v2;

  insert into public.inventory_movements (
    center_id,
    material_id,
    movement_type,
    direction,
    quantity,
    before_stock,
    after_stock,
    unit_cost,
    unit_price,
    reference_table,
    reference_id,
    reference_number,
    reason_code,
    notes,
    performed_by
  )
  select v_center_id,
         item.material_id,
         'sale',
         'out',
         item.quantity,
         inventory.stock_actual + item.quantity,
         inventory.stock_actual,
         null,
         item.unit_price,
         'sales',
         v_sale_id,
         v_document_number,
         'sale_ticket',
         'Salida de inventario por venta',
         p_performed_by::text
  from (
    select material_id,
           sum(quantity)::numeric(12,4) as quantity,
           round(sum(quantity * unit_price) / sum(quantity), 2)::numeric(12,2) as unit_price
    from pg_temp.finalize_pos_sale_items_v2
    group by material_id
  ) item
  join public.materials material
    on material.id = item.material_id
  join public.categories category
    on category.id = material.cat_id
  join public.inventory inventory
    on inventory.material_id = item.material_id
   and inventory.center_id = v_center_id
  where category.is_inventoried is true;

  update public.tables
     set status = 'libre',
         current_order_id = null
   where id = v_table.id
     and lower(trim(coalesce(status, ''))) = lower('ocupada')
     and current_order_id = v_order.id;

  if not found then
    raise exception 'El pedido activo de la mesa cambio durante la finalizacion.';
  end if;

  delete from public.table_orders
  where id = v_order.id
    and table_id = v_table.id;

  if not found then
    raise exception 'No se pudo consumir el pedido activo de la mesa.';
  end if;

  select to_jsonb(sale_row) || jsonb_build_object(
           'items',
           coalesce(
             (
               select jsonb_agg(
                        jsonb_build_object(
                          'material_id', item.material_id_text::uuid,
                          'name', material.name,
                          'quantity', item.quantity_text::numeric,
                          'unit_price',
                            case item.bundle_type_text
                              when 'cubeta' then 32.00::numeric(12,2)
                              when 'cubeta_caguamita' then 26.00::numeric(12,2)
                              else inventory.precio_venta::numeric(12,2)
                            end,
                          'base_unit_price', inventory.precio_venta::numeric(12,2),
                          'bundle_id', item.bundle_id_text,
                          'bundle_type', item.bundle_type_text,
                          'bundle_label',
                            case item.bundle_type_text
                              when 'cubeta' then 'Cubeta Mixta'
                              when 'cubeta_caguamita' then 'Cubeta Caguamita'
                              else null
                            end
                        )
                        order by item.bundle_id_text nulls last, material.name, item.material_id_text
                      )
               from pg_temp.finalize_pos_sale_raw_items_v2 item
               join public.materials material
                 on material.id = item.material_id_text::uuid
               join public.inventory inventory
                 on inventory.material_id = material.id
                and inventory.center_id = v_center_id
             ),
             '[]'::jsonb
           )
         )
    into v_sale
  from public.sales sale_row
  where sale_row.id = v_sale_id;

  return v_sale;
end;
$$;

revoke all on function public.finalize_pos_sale(uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(uuid, jsonb, text, uuid)
  to service_role;
-- ============================================================
-- FIN SCRIPT B
-- ============================================================
```

**Validación posterior a Script B:**
```sql
-- Confirmar que la función antigua fue recreada
SELECT pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'finalize_pos_sale'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
-- Debe devolver: p_table_id uuid, p_items jsonb, p_payment_method text, p_performed_by uuid
```

**Riesgo:** Este script restaura la firma vieja. La EF `pos-operations` vieja (que PRD tenía antes) podría funcionar nuevamente, pero la EF nueva (DEV) también lo hace (tiene fallback legacy). El módulo Finanzas quedará incompleto hasta re-intentar las migraciones. Las tablas `financial_operations` y `financial_payments` pueden o no existir dependiendo del punto de falla.

**Criterio de éxito:** POS puede completar una venta de prueba sin error.

---

### Escenario C — Bug GROUP BY activo cuando ledger está activo

**Síntoma:**
```
ERROR: column "pay" must appear in the GROUP BY clause or be used in an aggregate function
```
Visible en logs de `pos-operations` durante una venta, solo cuando `ledger_settings.ledger_cutover_at IS NOT NULL`.

**Causa:** Migración `20260811140000` fue aplicada pero `20260815100000` no se aplicó. El INSERT de `journal_lines` tiene GROUP BY incompleto.

**Precondición para confirmar:**
- Diagnóstico Q2 confirma que `20260811140000` aparece como aplicada.
- Diagnóstico Q2 confirma que `20260815100000` NO aparece como aplicada.
- Error ocurre solo en ventas (no en otros flujos).

**Acción:**

Aplicar la migración corregida directamente desde el archivo fuente:

```bash
# Opción 1 — via supabase CLI (preferida):
npx supabase db push --linked
# Si la migración ya estaba parcialmente registrada, puede fallar.
# En ese caso, usar Opción 2.

# Opción 2 — via SQL Editor en Supabase dashboard PRD:
# Pegar el contenido completo de:
# supabase/migrations/20260815100000_fix_finalize_pos_sale_groupby.sql
```

El SQL completo está en:  
`supabase/migrations/20260815100000_fix_finalize_pos_sale_groupby.sql`

No se duplica aquí porque el archivo fuente es la referencia canónica. Leer el archivo completo antes de ejecutar.

**Validación posterior:**
```sql
-- Confirmar que la firma nueva existe con GROUP BY corregido
-- (no hay forma de inspeccionar el GROUP BY via SQL — confiar en el archivo)
-- Verificar ejecutando una venta de prueba con ledger activo.
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'finalize_pos_sale'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
-- Debe devolver: p_table_id uuid, p_items jsonb, p_payments jsonb, p_performed_by uuid, p_idempotency_key text
```

**Criterio de éxito:** Venta completa sin error de GROUP BY en logs de EF.

---

### Escenario D — Módulo Finanzas invisible para usuarios Manager/Admin

**Síntoma:** Usuario con rol Manager accede a PRD y no ve "Finanzas" en el menú de navegación.

**Causa:** Migración `20260817200000_seed_finance_permissions.sql` no fue aplicada (o no fue incluida en el batch de deploy).

**Precondición para confirmar:**
- Diagnóstico Q4 devuelve cero filas (sin permisos `finances` en `app_permissions`).

**Acción:**

```sql
-- SCRIPT D: SEED DE PERMISOS FINANZAS
-- Fuente: supabase/migrations/20260817200000_seed_finance_permissions.sql
-- Idempotente. Seguro re-ejecutar.

begin;

insert into public.app_permissions (screen_key, action_key, description)
values
  ('finances', 'view',   'Ver el modulo de finanzas, reportes contables, polizas y mayor.'),
  ('finances', 'manage', 'Ejecutar operaciones financieras: traspasos, aportaciones, retiros y reversas.')
on conflict (screen_key, action_key) do update
  set description = excluded.description;

insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'finances'
 and permissions.action_key = 'view'
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;

commit;
```

**Validación posterior:**
```sql
-- Confirmar permisos creados y asignados
SELECT r.name AS role, p.screen_key, p.action_key
FROM public.app_role_permissions rp
JOIN public.app_roles r ON r.id = rp.role_id
JOIN public.app_permissions p ON p.id = rp.permission_id
WHERE p.screen_key = 'finances'
ORDER BY r.name, p.action_key;
-- Debe devolver filas con finances:view para manager/administrador operativo/admin
```

**Riesgo:** Bajo. Script idempotente. No afecta POS ni caja.

**Criterio de éxito:** Usuario Manager ve "Finanzas" en navegación sin necesidad de cerrar sesión (los permisos se recargan en login o al refrescar el token).

---

### Escenario E — EF financial-operations no responde

**Síntoma:** Reportes de Finanzas (Saldos, Pólizas, Mayor, Sesiones) retornan error. Operaciones financieras fallan. POS NO se ve afectado.

**Causa probable:** EF `financial-operations` no fue desplegada en PRD, o el deploy falló.

**Impacto sin ledger activo:** Funcionalidad Finanzas no disponible. POS y Caja operan con normalidad — `pos-operations` y `cash-operations` son EFs independientes.

**Acción — SIN SQL:**
1. Verificar en Supabase dashboard PRD que la EF `financial-operations` está desplegada.
2. Revisar logs de la EF para el error específico.
3. Re-desplegar EF `financial-operations` desde `chore/code-cleanup`.
4. Verificar variables de entorno (SUPABASE_URL, SERVICE_ROLE_KEY).

**No requiere SQL.** La EF es stateless.

**Criterio de éxito:** `financialService.getAccountBalances()` desde frontend retorna 200 sin error.

---

## 5. Validaciones no destructivas (solo SELECT)

Ejecutar estos queries como diagnóstico antes de cualquier acción de rollback.

### Q1 — Firmas existentes de finalize_pos_sale

```sql
SELECT
  proname,
  pg_get_function_identity_arguments(oid) AS args,
  prosecdef AS security_definer
FROM pg_proc
WHERE proname = 'finalize_pos_sale'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY oid;
```

**Interpretación:**
- Firma `p_table_id uuid, p_items jsonb, p_payment_method text, p_performed_by uuid` → PRD en estado original (migraciones Finance no aplicadas, o Escenario B ejecutado)
- Firma `p_table_id uuid, p_items jsonb, p_payments jsonb, p_performed_by uuid, p_idempotency_key text` → Finance migrations aplicadas (estado correcto post-deploy)
- Cero filas → estado de emergencia (Escenario B)
- Ambas firmas → migración 20260815100000 aplicada sin 20260811140000 DROP (no debería ocurrir si se aplica el batch completo)

---

### Q2 — Migraciones Finance aplicadas

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN (
  '20260810200000',
  '20260811110000',
  '20260811130000',
  '20260811140000',
  '20260811150000',
  '20260811160000',
  '20260811170000',
  '20260812100000',
  '20260815100000',
  '20260817100000',
  '20260817200000'
)
ORDER BY version;
```

**Interpretación:** Las 11 migraciones Finance deben aparecer. Cualquier ausencia indica una migración pendiente.

---

### Q3 — Tablas Finance existentes

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'financial_accounts',
    'financial_operations',
    'financial_payments',
    'journal_entries',
    'journal_lines',
    'ledger_settings',
    'idempotency_requests',
    'cash_discrepancy_resolutions',
    'financial_authorizations',
    'audit_events'
  )
ORDER BY table_name;
```

**Interpretación:** Post-deploy completo, todas deben existir. Ausencias indican migraciones parciales.

---

### Q4 — Permisos Finanzas existentes

```sql
SELECT screen_key, action_key, description
FROM public.app_permissions
WHERE screen_key = 'finances'
ORDER BY action_key;
```

---

### Q5 — Roles con finances:view asignado

```sql
SELECT r.name AS role_name, p.screen_key, p.action_key
FROM public.app_role_permissions rp
JOIN public.app_roles r ON r.id = rp.role_id
JOIN public.app_permissions p ON p.id = rp.permission_id
WHERE p.screen_key = 'finances'
ORDER BY r.name, p.action_key;
```

---

### Q6 — Estado del ledger

```sql
SELECT
  id,
  ledger_cutover_at,
  initial_journal_entry_id,
  created_at
FROM public.ledger_settings
LIMIT 1;
```

**Interpretación:**
- `ledger_cutover_at IS NULL` → ledger no activado (estado correcto en deploy inicial)
- `ledger_cutover_at IS NOT NULL` → ledger activo (activa el bloque de asientos en `finalize_pos_sale`)

---

### Q7 — Columnas nuevas en cash_sessions (migración 20260811130000)

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'cash_sessions'
  AND column_name IN ('first_counted_cash', 'final_counted_cash', 'difference_amount')
ORDER BY column_name;
```

**Interpretación:** Las tres columnas deben existir post-deploy. Si no existen, migración `20260811130000` no fue aplicada.

---

## 6. Orden de uso durante incidente

| Síntoma | Diagnóstico | Acción recomendada | Requiere SQL |
|---|---|---|---|
| POS: `function finalize_pos_sale(uuid, jsonb, text, uuid) does not exist` | Q1 muestra solo firma nueva | Re-deploy EF `pos-operations` | No |
| POS: ninguna firma de finalize_pos_sale | Q1 = 0 filas; Q2 = 20260811140000 ausente | Script B (bajo autorización) | Sí — emergencia |
| POS: `column "pay" must appear in GROUP BY` durante venta | Q2 = 20260815100000 ausente; Q6 = ledger activo | Aplicar `20260815100000` | Sí — bajo autorización |
| Finanzas invisible para Manager | Q4 = 0 filas | Script D — seed permisos | Sí — seguro |
| Reportes Finanzas fallan; POS OK | Logs EF `financial-operations` | Re-deploy EF `financial-operations` | No |
| Todo funciona pero no hay asientos en ventas | Q6 = ledger_cutover_at NULL | Normal — ledger no activado todavía | No |
| Cash sessions: falla al cerrar con diferencia | Q7 = columnas ausentes | Migración `20260811130000` pendiente | No — re-push batch |

---

## 7. Restricciones

- ✅ Scripts redactados pero NO ejecutados.
- ✅ PRD no tocado.
- ✅ Sin commits ni push.
- ✅ Solo documentación.
- ✅ Script B marcado como "USAR SOLO BAJO AUTORIZACIÓN EXPLÍCITA".
- ✅ Queries de diagnóstico son solo SELECT — no modifican datos.
- ✅ Script D (permisos) es idempotente — seguro re-ejecutar.

---

## 8. Resultado final

**B2 Rollback Scripts Finanzas PRD listo para revisión**

Pendientes antes de usar cualquier script en PRD:
1. Segunda revisión técnica del SQL por persona distinta al autor.
2. Backup/snapshot PRD confirmado (B4).
3. Autorización explícita del responsable del deploy (B3).
4. Diagnóstico ejecutado con queries Q1–Q7 para confirmar el escenario exacto.
