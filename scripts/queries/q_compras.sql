SELECT
  COUNT(*)                                AS num_compras,
  COALESCE(SUM(total_amount),  0)        AS total_compras
FROM public.purchases
WHERE created_at >= '2026-08-01T00:00:00+00'
  AND created_at <  '2026-09-01T00:00:00+00';
