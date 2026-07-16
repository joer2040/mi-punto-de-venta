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
