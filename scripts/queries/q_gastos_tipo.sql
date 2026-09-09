SELECT
  CASE
    WHEN LOWER(COALESCE(p.name, '')) = 'proveedor general'
      THEN 'Proveedor General'
    ELSE 'Proveedores Formales'
  END                                      AS tipo,
  COUNT(pu.id)                             AS num_compras,
  COALESCE(SUM(pu.total_amount), 0)        AS total
FROM public.purchases pu
LEFT JOIN public.providers p ON pu.provider_id = p.id
WHERE pu.created_at >= '2026-08-01T00:00:00+00'
  AND pu.created_at <  '2026-09-01T00:00:00+00'
GROUP BY tipo
ORDER BY total DESC;
