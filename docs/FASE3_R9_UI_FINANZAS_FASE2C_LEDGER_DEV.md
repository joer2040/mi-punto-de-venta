# FASE3 R9 — UI Finanzas Fase 2C: Mayor contable (DEV)

**Fecha:** 2026-08-16  
**Archivo creado:** `src/pages/FinancesLedger.jsx`

---

## Fuente de datos

- EF action: `get_account_ledger`
- `financialService.getAccountLedger(accountCode, fromDate, toDate)` — fechas opcionales (`default null`)
- Response: `{ ledger: data }`
- Una fila por movimiento de cuenta (`line_id` como row key)

## Campos RPC

```
line_id, entry_id, entry_number, entry_type, occurred_at,
description, debit, credit, running_balance
```

Nota: campo es `description` (no `line_desc` como en journal).

## Cuentas disponibles

| Código | Nombre |
|---|---|
| 1101 | Caja operativa (default) |
| 1102 | Caja fuerte |
| 1103 | Banco |
| 3101 | Contrapartida patrimonial |

## Comportamiento

- Fechas por defecto: primer día del mes → hoy
- Validación: solo si AMBAS fechas presentes y `from > to` → error inline amber
- `running_balance` en color teal (positivo) / rojo (negativo) en cada fila
- Summary: nombre de cuenta + saldo final (último `running_balance`)
- "Limpiar filtros" resetea cuenta a 1101 + mes actual + auto-carga
- Export: `mayor-{accountCode}.xlsx`

## Columnas

fecha, póliza, tipo, descripción, debe, haber, saldo

## Estado

✅ Implementado — lint 0 errores, build incluye chunk `FinancesLedger-DmKHtwQU.js` (5.86 kB)
