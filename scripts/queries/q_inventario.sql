SELECT
  COUNT(i.id)                                         AS num_items,
  COALESCE(SUM(i.stock_actual * i.costo_promedio), 0) AS capital_inventario
FROM public.inventory i
WHERE i.stock_actual > 0;
