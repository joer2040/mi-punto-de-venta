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
  if p_table_id is null then
    raise exception 'Falta table_id.';
  end if;

  if p_performed_by is null then
    raise exception 'Falta performed_by.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La mesa no tiene productos para cobrar.';
  end if;

  select *
    into v_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Mesa no encontrada.';
  end if;

  if v_table.current_order_id is not null then
    select *
      into v_order
    from public.table_orders
    where id = v_table.current_order_id
      and table_id = v_table.id
    for update;

    if not found then
      raise exception 'Pedido abierto no encontrado para la mesa %.', v_table.id;
    end if;
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

  create temporary table if not exists pg_temp.finalize_pos_sale_raw_items (
    material_id_text text,
    quantity_text text,
    unit_price_text text
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_raw_items;

  insert into pg_temp.finalize_pos_sale_raw_items (material_id_text, quantity_text, unit_price_text)
  select trim(material_id),
         trim(quantity),
         trim(unit_price)
  from jsonb_to_recordset(p_items) as item(material_id text, quantity text, unit_price text);

  select count(*)
    into v_invalid_count
  from pg_temp.finalize_pos_sale_raw_items
  where coalesce(material_id_text, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(quantity_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or coalesce(unit_price_text, '') !~ '^[0-9]+(\.[0-9]+)?$'
     or case when coalesce(quantity_text, '') ~ '^[0-9]+(\.[0-9]+)?$' then quantity_text::numeric <= 0 else true end
     or case when coalesce(unit_price_text, '') ~ '^[0-9]+(\.[0-9]+)?$' then unit_price_text::numeric < 0 else true end;

  if v_invalid_count > 0 then
    raise exception 'La lista de articulos contiene valores invalidos.';
  end if;

  create temporary table if not exists pg_temp.finalize_pos_sale_items (
    material_id uuid,
    quantity numeric(12,4),
    unit_price numeric(12,2)
  ) on commit drop;

  truncate table pg_temp.finalize_pos_sale_items;

  select count(*)
    into v_ambiguous_count
  from (
    select material_id_text
    from pg_temp.finalize_pos_sale_raw_items
    group by material_id_text
    having count(distinct unit_price_text::numeric) > 1
  ) duplicated_prices;

  if v_ambiguous_count > 0 then
    raise exception 'Un material no puede finalizarse con precios distintos en la misma venta.';
  end if;

  insert into pg_temp.finalize_pos_sale_items (material_id, quantity, unit_price)
  select material_id_text::uuid,
         sum(quantity_text::numeric)::numeric(12,4),
         min(unit_price_text::numeric)::numeric(12,2)
  from pg_temp.finalize_pos_sale_raw_items
  group by material_id_text;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_items item
  left join public.materials material on material.id = item.material_id
  where material.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales inexistentes.';
  end if;

  select count(*)
    into v_missing_count
  from pg_temp.finalize_pos_sale_items item
  join public.materials material on material.id = item.material_id
  left join public.categories category on category.id = material.cat_id
  where material.cat_id is null
     or category.id is null;

  if v_missing_count > 0 then
    raise exception 'La venta contiene materiales sin categoria valida.';
  end if;

  select coalesce(sum(quantity * unit_price), 0)::numeric(12,2)
    into v_total_amount
  from pg_temp.finalize_pos_sale_items;

  if lower(trim(coalesce(p_payment_method, 'Efectivo'))) = lower('Efectivo') then
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
    where status = 'open';

    if v_cash_session_id is null then
      raise exception 'No hay una caja abierta. Debes abrir caja antes de finalizar ventas en efectivo.';
    end if;
  end if;

  v_sale_created_at := now();
  v_day_start := date_trunc('day', v_sale_created_at at time zone 'UTC') at time zone 'UTC';
  v_day_end := v_day_start + interval '1 day';

  perform pg_advisory_xact_lock(hashtext('finalize_pos_sale_document:' || to_char(v_day_start at time zone 'UTC', 'YYYYMMDD')));

  select count(*) + 1
    into v_sequence
  from public.sales
  where created_at >= v_day_start
    and created_at < v_day_end;

  v_document_number :=
    to_char(v_sale_created_at at time zone 'UTC', 'DDMMYYYYHH24MI') ||
    lpad(v_sequence::text, 2, '0');

  insert into public.sales (center_id, total_amount, payment_method, cash_session_id, created_at, document_number)
  values (v_center_id, v_total_amount, coalesce(nullif(trim(p_payment_method), ''), 'Efectivo'), v_cash_session_id, v_sale_created_at, v_document_number)
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, material_id, quantity, unit_price)
  select v_sale_id,
         material_id,
         quantity,
         unit_price
  from pg_temp.finalize_pos_sale_items;

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
  from pg_temp.finalize_pos_sale_items item
  join public.materials material on material.id = item.material_id
  join public.categories category on category.id = material.cat_id
  join public.inventory inventory on inventory.material_id = item.material_id
                             and inventory.center_id = v_center_id
  where category.is_inventoried is true;

  update public.tables
     set status = 'libre',
         current_order_id = null
   where id = v_table.id;

  if v_table.current_order_id is not null then
    delete from public.table_orders
     where id = v_table.current_order_id;
  end if;

  select to_jsonb(sale_row)
    into v_sale
  from public.sales sale_row
  where sale_row.id = v_sale_id;

  return v_sale;
end;
$$;
revoke all on function public.finalize_pos_sale(uuid, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.finalize_pos_sale(uuid, jsonb, text, uuid) to service_role;
