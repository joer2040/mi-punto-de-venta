SELECT
  COUNT(*)                                  AS num_sesiones,
  COALESCE(AVG(opening_amount), 0)          AS promedio_apertura,
  COALESCE(MIN(opening_amount), 0)          AS min_apertura,
  COALESCE(MAX(opening_amount), 0)          AS max_apertura,
  COALESCE(SUM(sales_cash_total), 0)        AS total_ventas_efectivo
FROM public.cash_sessions
WHERE opened_at >= '2026-08-01T00:00:00+00'
  AND opened_at <  '2026-09-01T00:00:00+00';
