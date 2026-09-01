-- Fase 3: Extensión de sesiones de caja para doble conteo y diferencias.
-- Migración aditiva. No modifica columnas existentes.

begin;

-- ============================================================
-- 1. Nuevos campos en cash_sessions
-- ============================================================

alter table public.cash_sessions
  add column if not exists first_counted_cash  numeric(14,2),
  add column if not exists final_counted_cash  numeric(14,2),
  add column if not exists difference_amount   numeric(14,2);

comment on column public.cash_sessions.first_counted_cash is
  'Primer conteo físico del cajero al cerrar. Nulo hasta que se inicia el cierre.';
comment on column public.cash_sessions.final_counted_cash is
  'Segundo conteo si el primero difirió del esperado. Nulo si no hubo diferencia.';
comment on column public.cash_sessions.difference_amount is
  'Diferencia al cierre: final_counted_cash - expected_cash_total. Negativo = faltante. Positivo = sobrante.';

-- ============================================================
-- 2. Ampliar CHECK de status (aditivo)
-- ============================================================

alter table public.cash_sessions
  drop constraint if exists cash_sessions_status_check;

alter table public.cash_sessions
  add constraint cash_sessions_status_check
    check (status in ('open', 'closed', 'closed_with_pending_difference'));

commit;
