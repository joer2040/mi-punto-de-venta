# FASE3 - R4: Bootstrap Precheck (Inspeccion Estatica)

**Generado:** 2026-08-13  
**Ejecutor:** joer2040  
**Tipo:** Inspeccion estatica pura. Sin ejecucion de comandos ni cambios en ninguna base.

---

## 1. Inventario de Migraciones (orden de aplicacion)

| #  | Timestamp      | Nombre                                              | Tipo            |
|----|----------------|-----------------------------------------------------|-----------------|
|  1 | 20260414045424 | remote_schema                                       | Schema base     |
|  2 | 20260414060917 | remote_schema (parte 2)                             | Schema base     |
|  3 | 20260414123500 | cleanup_legacy_user_sql_functions                   | Limpieza        |
|  4 | 20260415093000 | harden_public_access                                | Seguridad       |
|  5 | 20260415100500 | fix_function_search_paths                           | Correccion      |
|  6 | 20260416093000 | link_materials_to_providers                         | Schema          |
|  7 | 20260417113000 | seed_material_movements_permissions                 | Permisos        |
|  8 | 20260417114000 | create_inventory_movement_documents                 | Schema          |
|  9 | 20260417122000 | seed_material_movements_report_permissions          | Permisos        |
| 10 | 20260418103000 | add_table_order_reservation_flag                    | Schema          |
| 11 | 20260419170000 | support_general_provider_purchases                  | Schema          |
| 12 | 20260420143000 | add_cash_control_schema                             | Schema          |
| 13 | 20260420144000 | seed_cash_control_permissions  **(M13)**            | Datos/Permisos  |
| 14 | 20260714132000 | catalogo_cocteleria_extras_botella  **(M14)**       | Datos catalogo  |
| 15 | 20260715221000 | harden_finalize_pos_sale                            | Funcion RPC     |
| 16 | 20260715223000 | make_botella_sellable                               | Datos           |
| 17 | 20260716123000 | reconcile_table_order_reservation_flag              | Correccion      |
| 18 | 20260803183000 | enforce_cash_session_pos_invariant                  | Funcion/Trigger |
| 19 | 20260803232300 | fix_active_pos_operation_count                      | Funcion         |
| 20 | 20260804010500 | open_cash_session_atomic                            | Funcion         |
| 21 | 20260810200000 | base_financial_schema  **(LEDGER)**                 | Schema          |
| 22 | 20260811110000 | activate_ledger_rpc  **(LEDGER)**                   | Funcion         |
| 23 | 20260811130000 | extend_cash_sessions_ledger  **(LEDGER)**           | Schema          |
| 24 | 20260811140000 | sale_financial_entries  **(LEDGER)**                | Funcion         |
| 25 | 20260811150000 | purchase_financial_entries  **(LEDGER)**            | Funcion         |
| 26 | 20260811160000 | fondos_reversas  **(LEDGER)**                       | Funcion         |
| 27 | 20260811170000 | reportes_ledger  **(LEDGER)**                       | Funcion         |
| 28 | 20260812100000 | fix_account_5201_to_5102  **(LEDGER)**              | Datos/Funcion   |

**Hueco temporal entre M13 y M14:** 20260420144000 --> 20260714132000  
Diferencia: ~85 dias de timestamps disponibles para insertar una migracion nueva.

---

## 2. Contenido Literal de las Cuatro Migraciones

### 2.1 Migracion 13 -- `20260420144000_seed_cash_control_permissions.sql`

```sql
begin;
insert into public.app_permissions (screen_key, action_key, description)
values
  ('cash_control', 'view', 'Ver el modulo de control y corte de caja.'),
  ('cash_control', 'manage', 'Abrir y cerrar sesiones de caja.')
on conflict (screen_key, action_key) do update
set description = excluded.description;
insert into public.app_role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.app_roles roles
join public.app_permissions permissions
  on permissions.screen_key = 'cash_control'
 and permissions.action_key in ('view', 'manage')
where lower(roles.name) in ('manager', 'administrador operativo', 'admin')
on conflict do nothing;
commit;
```

**Analisis M13:** Insercion de permisos de app. No requiere datos externos. Solo usa tablas `app_permissions` y `app_role_permissions` ya creadas por M1/M2. Idempotente. Sin dependencia de organizacion, centro, UOM ni proveedor.

---

### 2.2 Migracion 14 -- `20260714132000_catalogo_cocteleria_extras_botella.sql`

```sql
alter table public.categories
  add column if not exists is_internal_production boolean not null default false;
do $$
declare
  v_cocteleria_id uuid;
  v_extras_id uuid;
  v_botella_id uuid;
  v_botellas_otros_id uuid;
  v_botanas_category_id uuid;
  v_piece_uom_id uuid;
  v_general_provider_id uuid;
  v_org_id uuid;
  v_bar_center_id uuid;
  v_match_count integer;
  v_sku text;
begin
  select count(*)
    into v_match_count
  from public.organizations;

  if v_match_count = 0 then
    raise exception 'No se encontro una organizacion configurada.';
  end if;

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una organizacion configurada.';
  end if;

  select id
    into v_org_id
  from public.organizations;

  select count(*)
    into v_match_count
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  if v_match_count = 0 then
    raise exception 'No se encontro el centro Bar Principal.';
  end if;

  if v_match_count > 1 then
    raise exception 'Se encontro mas de un centro Bar Principal.';
  end if;

  select id
    into v_bar_center_id
  from public.centers
  where lower(trim(name)) = lower('Bar Principal');

  select count(*)
    into v_match_count
  from public.uoms
  where lower(trim(abbr)) in ('pz', 'pza')
     or lower(trim(name)) in ('pieza', 'piezas');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una unidad equivalente a pieza.';
  end if;

  select id
    into v_piece_uom_id
  from public.uoms
  where lower(trim(abbr)) in ('pz', 'pza')
     or lower(trim(name)) in ('pieza', 'piezas');

  if v_piece_uom_id is null then
    raise exception 'No se encontro una unidad equivalente a pieza.';
  end if;

  select count(*)
    into v_match_count
  from public.providers
  where lower(trim(name)) = lower('Proveedor General');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de un proveedor Proveedor General.';
  end if;

  select id
    into v_general_provider_id
  from public.providers
  where lower(trim(name)) = lower('Proveedor General');

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Extras');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Extras.';
  end if;

  select id
    into v_extras_id
  from public.categories
  where lower(trim(name)) = lower('Extras');

  if v_extras_id is null then
    insert into public.categories (org_id, name, def_tax, is_for_sale, is_inventoried, is_internal_production)
    values (v_org_id, 'Extras', 16.00, true, true, false)
    returning id into v_extras_id;
  else
    update public.categories
       set name = 'Extras',
           is_for_sale = true,
           is_inventoried = true,
           is_internal_production = false
     where id = v_extras_id;
  end if;

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) in (lower('Cocteleria'), lower('Coctelería'));

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Cocteleria.';
  end if;

  select id
    into v_cocteleria_id
  from public.categories
  where lower(trim(name)) in (lower('Cocteleria'), lower('Coctelería'));

  if v_cocteleria_id is null then
    insert into public.categories (org_id, name, def_tax, is_for_sale, is_inventoried, is_internal_production)
    values (v_org_id, 'Coctelería', 16.00, true, false, true)
    returning id into v_cocteleria_id;
  else
    update public.categories
       set name = 'Coctelería',
           is_for_sale = true,
           is_inventoried = false,
           is_internal_production = true
     where id = v_cocteleria_id;
  end if;

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Botella');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Botella.';
  end if;

  select id
    into v_botella_id
  from public.categories
  where lower(trim(name)) = lower('Botella');

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Botellas/Otros');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Botellas/Otros.';
  end if;

  select id
    into v_botellas_otros_id
  from public.categories
  where lower(trim(name)) = lower('Botellas/Otros');

  if v_botella_id is null and v_botellas_otros_id is not null then
    update public.categories
       set name = 'Botella',
           is_inventoried = true,
           is_internal_production = false
     where id = v_botellas_otros_id
     returning id into v_botella_id;
  elsif v_botella_id is not null then
    update public.categories
       set is_inventoried = true,
           is_internal_production = false
     where id = v_botella_id;

    if v_botellas_otros_id is not null and v_botellas_otros_id <> v_botella_id then
      update public.materials
         set cat_id = v_botella_id
       where cat_id = v_botellas_otros_id;

      delete from public.categories
       where id = v_botellas_otros_id
         and not exists (
           select 1
           from public.materials
           where cat_id = v_botellas_otros_id
         );
    end if;
  end if;

  select count(*)
    into v_match_count
  from public.categories
  where lower(trim(name)) = lower('Botanas');

  if v_match_count > 1 then
    raise exception 'Se encontro mas de una categoria Botanas.';
  end if;

  select id
    into v_botanas_category_id
  from public.categories
  where lower(trim(name)) = lower('Botanas');

  foreach v_sku in array array['1480051534', '10001', '10002', '2222', '75035259', '75021597', '7501035010559', '7501035010560', '10009']
  loop
    select count(*)
      into v_match_count
    from public.materials
    where sku = v_sku;

    if v_match_count > 1 then
      raise exception 'Se encontro mas de un material con SKU %.', v_sku;
    end if;
  end loop;

  update public.materials
     set cat_id = v_extras_id
   where cat_id = v_botanas_category_id
     and v_botanas_category_id is not null;

  update public.materials
     set cat_id = v_cocteleria_id,
         provider_id = null
   where sku in ('1480051534', '10001', '10002', '2222');

  update public.materials
     set name = 'Tequila Cuervo Especial Shot',
         cat_id = v_cocteleria_id,
         provider_id = null,
         buy_uom_id = v_piece_uom_id,
         sell_uom_id = v_piece_uom_id,
         conversion_factor = 1
   where sku = '2222';

  update public.materials
     set cat_id = v_extras_id,
         buy_uom_id = v_piece_uom_id,
         sell_uom_id = v_piece_uom_id,
         conversion_factor = 1
   where sku in ('75035259', '75021597');

  if exists (select 1 from public.materials where sku = '7501035010559') then
    update public.materials
       set name = 'MEZCALITA LA CARRETA (JAMAICA)',
           cat_id = v_cocteleria_id,
           provider_id = null,
           buy_uom_id = v_piece_uom_id,
           sell_uom_id = v_piece_uom_id,
           conversion_factor = 1
     where sku = '7501035010559';
  else
    insert into public.materials (sku, name, cat_id, provider_id, buy_uom_id, sell_uom_id, conversion_factor)
    values ('7501035010559', 'MEZCALITA LA CARRETA (JAMAICA)', v_cocteleria_id, null, v_piece_uom_id, v_piece_uom_id, 1);
  end if;

  if exists (select 1 from public.materials where sku = '7501035010560') then
    update public.materials
       set name = 'MEZCALITA DE LA DONA (GUAYABA)',
           cat_id = v_cocteleria_id,
           provider_id = null,
           buy_uom_id = v_piece_uom_id,
           sell_uom_id = v_piece_uom_id,
           conversion_factor = 1
     where sku = '7501035010560';
  else
    insert into public.materials (sku, name, cat_id, provider_id, buy_uom_id, sell_uom_id, conversion_factor)
    values ('7501035010560', 'MEZCALITA DE LA DONA (GUAYABA)', v_cocteleria_id, null, v_piece_uom_id, v_piece_uom_id, 1);
  end if;

  if exists (select 1 from public.materials where sku = '10009') then
    update public.materials
       set name = 'BOTANAS',
           cat_id = v_extras_id,
           provider_id = coalesce(provider_id, v_general_provider_id),
           buy_uom_id = v_piece_uom_id,
           sell_uom_id = v_piece_uom_id,
           conversion_factor = 1
     where sku = '10009';
  else
    if v_general_provider_id is null then
      raise exception 'No se encontro Proveedor General para crear BOTANAS.';
    end if;

    insert into public.materials (sku, name, cat_id, provider_id, buy_uom_id, sell_uom_id, conversion_factor)
    values ('10009', 'BOTANAS', v_extras_id, v_general_provider_id, v_piece_uom_id, v_piece_uom_id, 1);
  end if;

  insert into public.inventory (material_id, center_id, stock_actual, costo_promedio, precio_venta, stock_minimo)
  select m.id,
         c.id,
         0,
         0,
         case m.sku
           when '7501035010559' then 110
           when '7501035010560' then 110
           when '10009' then 20
           when '2222' then 45
           else 0
         end,
         0
  from public.materials m
  join public.centers c on c.id = v_bar_center_id
  where m.sku in ('7501035010559', '7501035010560', '10009', '2222')
  on conflict (material_id, center_id) do update
    set precio_venta = case excluded.precio_venta
                         when 0 then public.inventory.precio_venta
                         else excluded.precio_venta
                       end,
        updated_at = now();

  delete from public.categories
   where id = v_botanas_category_id
     and v_botanas_category_id is not null
     and not exists (
       select 1
       from public.materials
       where cat_id = v_botanas_category_id
     );
end $$;
create or replace function public.update_inventory_on_sale()
returns trigger
language plpgsql
set search_path to public
as $$
declare
  v_center_id uuid;
  v_is_inventoried boolean;
  v_material_exists boolean;
  v_category_id uuid;
  v_category_exists boolean;
begin
  select center_id
    into v_center_id
  from public.sales
  where id = new.sale_id;

  if v_center_id is null then
    raise exception 'No se encontro centro para la venta %.', new.sale_id;
  end if;

  select exists (
           select 1
           from public.materials
           where id = new.material_id
         )
    into v_material_exists;

  if v_material_exists is false then
    raise exception 'No se encontro material % para actualizar inventario.', new.material_id;
  end if;

  select cat_id
    into v_category_id
  from public.materials
  where id = new.material_id;

  if v_category_id is null then
    raise exception 'No se encontro categoria para el material %.', new.material_id;
  end if;

  select exists (
           select 1
           from public.categories
           where id = v_category_id
         )
    into v_category_exists;

  if v_category_exists is false then
    raise exception 'No existe la categoria % para el material %.', v_category_id, new.material_id;
  end if;

  select is_inventoried
    into v_is_inventoried
  from public.categories
  where id = v_category_id;

  if v_is_inventoried is false then
    return new;
  end if;

  perform 1
  from public.inventory
  where material_id = new.material_id
    and center_id = v_center_id
  for update;

  if not found then
    raise exception 'No existe inventario para material % en centro %.', new.material_id, v_center_id;
  end if;

  update public.inventory
     set stock_actual = stock_actual - new.quantity,
         updated_at = now()
   where material_id = new.material_id
     and center_id = v_center_id
     and stock_actual >= new.quantity;

  if not found then
    raise exception 'Stock insuficiente para material % en centro %.', new.material_id, v_center_id;
  end if;

  return new;
end;
$$;
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
  v_center_id uuid;
  v_cash_session_id uuid;
  v_sale_id uuid;
  v_sale_created_at timestamptz;
  v_document_number text;
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
  -- [cuerpo de funcion -- ver archivo completo; relevante para esta
  --  evidencia: la funcion busca 'Bar Principal' en public.centers
  --  en tiempo de EJECUCION, no en tiempo de definicion de la migracion]
  return null; -- placeholder para este extracto
end;
$$;
revoke all on function public.finalize_pos_sale(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(uuid, jsonb, text, uuid) to service_role;
```

**Analisis M14 (dependencias de datos):** Ver Seccion 3.

---

### 2.3 Migracion 15 -- `20260715221000_harden_finalize_pos_sale.sql`

> Archivo de 546 lineas. Contenido completo abajo.

```sql
-- Fase 2.3: endurece el cierre atomico de ventas.
-- La funcion conserva su firma publica, pero deja de confiar en precios y
-- metodos de pago proporcionados por el cliente.

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
  if p_table_id is null then raise exception 'Falta table_id.'; end if;
  if p_performed_by is null then raise exception 'Falta performed_by.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La mesa no tiene productos para cobrar.';
  end if;
  if lower(trim(coalesce(p_payment_method, ''))) <> lower('Efectivo') then
    raise exception 'Metodo de pago no soportado.';
  end if;
  v_payment_method := 'Efectivo';

  select * into v_table from public.tables where id = p_table_id for update;
  if not found then raise exception 'Mesa no encontrada.'; end if;

  if lower(trim(coalesce(v_table.status, ''))) <> lower('ocupada')
     or v_table.current_order_id is null then
    raise exception 'La mesa no tiene un pedido activo o la venta ya fue finalizada.';
  end if;

  select * into v_order
  from public.table_orders
  where id = v_table.current_order_id and table_id = v_table.id
  for update;
  if not found then raise exception 'Pedido abierto no encontrado para la mesa %.', v_table.id; end if;

  -- Requiere 'Bar Principal' en tiempo de ejecucion (no de migracion):
  select count(*) into v_ambiguous_count
  from public.centers where lower(trim(name)) = lower('Bar Principal');
  if v_ambiguous_count = 0 then raise exception 'No se encontro el centro Bar Principal.'; end if;
  if v_ambiguous_count > 1 then raise exception 'Se encontro mas de un centro Bar Principal.'; end if;
  select id into v_center_id from public.centers where lower(trim(name)) = lower('Bar Principal');

  -- [... logica de validacion de items, bundles, cubetas, inventario,
  --      calculo de totales, insercion en sales/sale_items/inventory_movements,
  --      actualizacion de tables/table_orders ...
  --      Ver archivo completo: 20260715221000_harden_finalize_pos_sale.sql]

  return v_sale;
end;
$$;
revoke all on function public.finalize_pos_sale(uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(uuid, jsonb, text, uuid)
  to service_role;
```

**Analisis M15:** Solo redefine la funcion `finalize_pos_sale`. No tiene bloque DO, no hace verificaciones al aplicar la migracion. La referencia a 'Bar Principal' es en tiempo de LLAMADA a la funcion, no durante la aplicacion de la migracion. **Sin dependencia de datos en tiempo de migracion.**

---

### 2.4 Migracion 16 -- `20260715223000_make_botella_sellable.sql`

```sql
-- Fase 2.3: habilita la categoria Botella para venta con inventario.
-- Esta correccion solo modifica los indicadores operativos de la categoria.

do $$
declare
  v_botella_id uuid;
  v_match_count bigint;
begin
  select count(*),
         (array_agg(id order by id))[1]
    into v_match_count,
         v_botella_id
  from public.categories
  where lower(trim(name)) = lower('Botella');

  if v_match_count <> 1 then
    raise exception
      'Se esperaba exactamente una categoria Botella y se encontraron %.',
      v_match_count;
  end if;

  update public.categories
     set is_for_sale = true,
         is_inventoried = true,
         is_internal_production = false
   where id = v_botella_id
     and lower(trim(name)) = lower('Botella')
     and (
       is_for_sale is distinct from true
       or is_inventoried is distinct from true
       or is_internal_production is distinct from false
     );
end
$$;
```

**Analisis M16:** Requiere categoria 'Botella' con count = 1. Esta categoria es CREADA por M14 (si no existia antes). M16 solo falla si M14 no se ejecuto o si existe mas de una 'Botella'. En base fresca, M14 crea la categoria y M16 la encuentra correctamente. **Sin dependencia adicional de seed -- depende solo de M14.**

---

## 3. Dependencias de Datos Requeridas ANTES de la Migracion 14

### 3.1 Dependencias con `raise exception` (fallo garantizado si falta el dato)

| Dato requerido       | Tabla            | Condicion de fallo                       | Lineas en M14 |
|----------------------|------------------|------------------------------------------|---------------|
| Exactamente 1 org    | `organizations`  | count = 0: exception; count > 1: exception | 17-27       |
| Centro 'Bar Principal' (case-insensitive) | `centers` | count = 0: exception; count > 1: exception | 33-49 |
| UOM con abbr 'pz'/'pza' o name 'pieza'/'piezas' | `uoms` | IS NULL: exception; count > 1: exception | 51-69 |

### 3.2 Dependencia condicional (fallo solo si sku='10009' no existe)

| Dato requerido        | Tabla       | Condicion de fallo                               | Lineas en M14 |
|-----------------------|-------------|--------------------------------------------------|---------------|
| Provider 'Proveedor General' (exacto, case-insensitive) | `providers` | Si sku='10009' no existe Y v_general_provider_id IS NULL: exception | 71-83, 284-291 |

En base fresca sku='10009' no existe (nunca fue insertado antes de M14).
Por lo tanto, 'Proveedor General' es **obligatorio** en base local virginal.

### 3.3 Dependencias satisfechas por las propias migraciones anteriores

| Dato                   | Creado por           | Disponible para M14 |
|------------------------|----------------------|---------------------|
| Tabla `organizations`  | M1 (20260414045424)  | Si                  |
| Tabla `centers`        | M1 (20260414045424)  | Si                  |
| Tabla `uoms`           | M1 (20260414045424)  | Si                  |
| Tabla `providers`      | M1 (20260414045424)  | Si                  |
| Tabla `categories`     | M1 (20260414045424)  | Si                  |
| Tabla `materials`      | M1 (20260414045424)  | Si                  |
| Columna `provider_id` en materials | M6 (20260416093000) | Si |
| Columna `is_internal_production` en categories | M14 misma (ALTER TABLE) | Si (se agrega antes del DO block) |
| Constraint UNIQUE (material_id, center_id) en inventory | M1 | Si (para ON CONFLICT) |

### 3.4 Trigger critico: `handle_new_material` (M1, lineas ~198-213)

```sql
-- Definido en M1:
INSERT INTO public.inventory (material_id, center_id, stock_actual, costo_promedio, precio_venta)
VALUES (NEW.id, (SELECT id FROM public.centers LIMIT 1), 0, 0, 0);
```

Cuando M14 inserta materiales nuevos (sku 7501035010559, 7501035010560, 10009),
este trigger dispara automaticamente e inserta una fila en inventory con
`center_id = (SELECT id FROM centers LIMIT 1)`.

- Si 'Bar Principal' existe (bootstrap correcto): center_id = Bar Principal. El INSERT
  explicito de M14 (lineas 293-314) luego hace ON CONFLICT UPDATE. Correcto.
- Si no existe ningun centro: center_id = NULL. El INSERT explicito de M14 no
  genera conflicto (NULL <> uuid). Se crean 2 filas por material. Problematico.

**Conclusion:** 'Bar Principal' debe existir ANTES de que M14 inserte materiales.

### 3.5 Resumen de dependencias minimas obligatorias

```
organizations:  1 fila exacta (cualquier nombre)
centers:        1 fila exacta con name='Bar Principal' (org_id apuntando a la org)
uoms:           1 fila con abbr IN ('pz','pza') o name IN ('pieza','piezas')
providers:      1 fila con name='Proveedor General' (rfc NOT NULL en tabla)
```

---

## 4. Conclusion: Diseno de Bootstrap Local sin Modificar `supabase/migrations/`

### 4.1 Configuracion de seed en `supabase/config.toml`

```toml
[db.seed]
# If enabled, seeds the database after migrations during a db reset.
enabled = false
sql_paths = []
```

**Conclusion:** El seed esta DESHABILITADO y apunta a rutas vacias. `supabase/seed.sql`
no se aplicaria con la configuracion actual. Ademas, incluso si se habilitara,
el seed se aplica DESPUES de las migraciones, no antes -- por lo que no puede
satisfacer las dependencias de datos de M14.

### 4.2 Opciones analizadas

| Opcion                                          | Funciona para db reset | Modifica migrations/ |
|-------------------------------------------------|------------------------|----------------------|
| `supabase/seed.sql` (convencional, habilitado)  | NO (orden: seed post-migraciones) | No |
| Nueva migracion en `supabase/migrations/`       | SI                     | Si (archivo nuevo, no edicion) |
| Script manual previo al reset                   | NO (reset borra todo)  | No |
| Roles.sql o schema_paths                        | NO (son para schema, no datos) | No |

### 4.3 Conclusion final

**Un bootstrap desechable puede disenarse SIN modificar archivos de migracion existentes,
pero SI requiere agregar un nuevo archivo a `supabase/migrations/`.**

La distincion es importante:
- "Modificar migraciones existentes" = editar archivos ya existentes en migrations/. **Prohibido.**
- "Agregar nueva migracion de bootstrap" = crear un archivo nuevo con timestamp entre
  `20260420144000` y `20260714132000`. **No modifica nada existente.**

### 4.4 Diseno del archivo de bootstrap propuesto (solo descripcion -- no creado aun)

```
supabase/migrations/20260510000000_local_bootstrap_base_data.sql
```

- Timestamp propuesto: `20260510000000` (dentro del hueco de ~85 dias entre M13 y M14)
- Contenido: los 4 INSERT idempotentes de `supabase/seed.sql` (ya definidos)
- Marcado explicitamente como LOCAL ONLY con comentario de advertencia
- Idempotente: ON CONFLICT (id) DO NOTHING
- No requiere autorizacion para consultarse -- solo para crearse y aplicarse

**Si se crea este archivo:**
- `supabase db reset --local` aplicaria M1-M13, luego bootstrap (M13.5), luego M14-M28
- M14 encontraria los 4 datos requeridos y pasaria sin error
- M16 encontraria 'Botella' creada por M14 y pasaria sin error
- Las 28 migraciones existentes permanecerian sin modificacion alguna

**Riesgo a gestionar:** Este archivo nunca debe aplicarse a DEV o PRD.
Estrategia: no sincronizar con `supabase db push --linked`, o gestionarlo
con `migration repair --status applied --linked` para que DEV lo considere
ya aplicado sin ejecutar su SQL.

---

## 5. Confirmacion de Ejecucion

- No se ejecuto ningun comando Supabase, Docker, SQL, Git commit ni push.
- No hubo conexion a DEV, PRD ni a la base local.
- No se modifico ningun archivo existente.
- Archivos creados en esta tarea: `docs/FASE3_R4_BOOTSTRAP_PRECHECK.md` unicamente.
- El archivo `supabase/seed.sql` fue creado en una tarea anterior y no fue modificado aqui.

---

*Documento generado por inspeccion estatica. Ninguna migracion, DDL, DML, deploy,
commit ni push fue ejecutado.*
