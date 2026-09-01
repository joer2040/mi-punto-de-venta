# FASE3 R9 — UI Finanzas Fase 2B: Pólizas / Asientos contables (DEV)

**Fecha:** 2026-08-16  
**Archivo creado:** `src/pages/FinancesJournal.jsx`

---

## Fuente de datos

- EF action: `get_journal_report`
- `financialService.getJournalReport(fromDate, toDate)` — ambas fechas requeridas
- Response: `{ entries: data }`
- Una fila por línea de asiento (`line_id` como row key)

## Campos RPC

```
entry_id, entry_number, entry_type, occurred_at, source_type, source_id,
line_id, account_code, account_name, debit, credit, line_desc
```

## Comportamiento

- Fechas por defecto: primer día del mes → hoy (calculadas en `useEffect`, no hardcodeadas)
- Validación: ambas fechas requeridas; `from > to` → error inline amber
- `processedEntries`: `useMemo` agrega `_rowEven` alternando por `entry_id` para agrupar visualmente líneas de la misma póliza
- Debe/Haber: celda vacía cuando el valor es 0
- `account_code` renderizado como badge gris
- `entry_type` traducido con `ENTRY_TYPE_LABELS`
- Summary: Total Debe · Total Haber
- Export: `polizas-contables.xlsx`

## Columnas

fecha, póliza, tipo, cuenta, descripción, debe, haber

## Estado

✅ Implementado — lint 0 errores, build incluye chunk `FinancesJournal-NzgpNKwj.js` (5.58 kB)
