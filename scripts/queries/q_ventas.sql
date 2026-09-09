SELECT
  COUNT(*)                                AS num_ventas,
  COALESCE(SUM(total_amount),  0)        AS total_ventas,
  COALESCE(AVG(total_amount),  0)        AS ticket_promedio
FROM public.sales
WHERE created_at >= '2026-08-01T00:00:00+00'
  AND created_at <  '2026-09-01T00:00:00+00';
