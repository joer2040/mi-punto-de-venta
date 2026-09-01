SELECT
  DATE_TRUNC('week', created_at AT TIME ZONE 'America/Mexico_City') AS semana,
  COALESCE(SUM(total_amount), 0)   AS total_semana,
  COUNT(*)                          AS num_ventas
FROM public.sales
WHERE created_at >= '2026-08-01T00:00:00+00'
  AND created_at <  '2026-09-01T00:00:00+00'
GROUP BY semana
ORDER BY semana;
