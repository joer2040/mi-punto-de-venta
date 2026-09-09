# FASE3 R9 — UI Finanzas Fase 2D: Sesiones de caja (DEV)

**Fecha:** 2026-08-16  
**Archivo creado:** `src/pages/FinancesCashSessions.jsx`  
**App.jsx:** `case 'finances-sessions'` conectado (eliminado placeholder "En construcción")

---

## Fuente de datos

- EF action: `get_cash_sessions_report`
- `financialService.getCashSessionsReport(fromDate, toDate)` — ambas fechas opcionales (`default null`)
- Response: `{ sessions: data }`
- Una fila por sesión de caja (`session_id` como row key)
- Ordenado por `cs.created_at desc`

## Campos RPC

```sql
session_id          uuid
status              text            -- 'open' | 'closed'
opened_at           timestamptz
closed_at           timestamptz     -- null si abierta
opening_amount      numeric(14,2)
expected_cash       numeric(14,2)
first_counted_cash  numeric(14,2)
final_counted_cash  numeric(14,2)   -- null si abierta
difference_amount   numeric(14,2)   -- null si abierta
resolution_type     text            -- null | 'sobrante' | 'faltante'
resolution_amount   numeric(14,2)   -- null si no hay resolución
resolution_motive   text            -- null si no hay resolución
resolution_entry    text            -- null | entry_number de póliza de resolución
```

## Comportamiento

- Fechas por defecto: primer día del mes → hoy
- Validación: solo si AMBAS fechas presentes y `from > to` → error inline amber (igual que Ledger)
- Estado badge: `open` → verde, `closed` → gris
- `difference_amount` color: `resolution_type === 'sobrante'` → teal700, `faltante` → red600, sin resolución → gray600
- Campos nullable (`closed_at`, `final_counted_cash`, `difference_amount`, `resolution_type`, `resolution_entry`) → `'—'` cuando null
- Summary: cuenta de sesiones
- Export: `sesiones-caja.xlsx`

## Columnas (9)

Apertura, Cierre, Estado, Fondo inicio, Esperado, Contado, Diferencia, Resolución, Póliza

## Estado

✅ Implementado — lint 0 errores, build incluye chunk `FinancesCashSessions-BaQGOnri.js` (5.69 kB)
