SELECT
  (created_at AT TIME ZONE 'America/Mexico_City')::date AS fecha,
  COALESCE(SUM(total_amount), 0)   AS total_dia,
  COUNT(*)                          AS num_ventas
FROM public.sales
WHERE created_at >= '2026-08-01T00:00:00+00'
  AND created_at <  '2026-09-01T00:00:00+00'
GROUP BY fecha
ORDER BY total_dia DESC
LIMIT 1;
