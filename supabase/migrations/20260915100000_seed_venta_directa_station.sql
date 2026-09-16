-- Agrega la estacion "Venta Directa" si no existe.
-- Permite cobrar sin abrir mesa usando el flujo normal de POS.
-- Aplicar en PRD: supabase db push --db-url <SUPABASE_DB_URL_PRD>
INSERT INTO public.tables (number, status)
SELECT 'Venta Directa', 'libre'
WHERE NOT EXISTS (
  SELECT 1 FROM public.tables
  WHERE lower(number) = lower('Venta Directa')
);
