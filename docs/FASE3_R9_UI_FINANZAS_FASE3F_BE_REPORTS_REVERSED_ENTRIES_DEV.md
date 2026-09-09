# FASE3 R9 — Fase 3F-BE: Reports Reversed Entries (DEV)

**Estado:** ✅ APROBADA  
**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`

---

## Problema corregido

`get_journal_report` y `get_account_ledger` filtraban `je.status = 'confirmed'`.  
Pólizas con status `reversed` (las originales reversadas) no aparecían en Pólizas ni en Mayor, aunque sí afectaban saldos hasta ser reversadas. Ausencia de trazabilidad/auditoría.

`get_account_balances` no se modificó — correcto como está: la póliza de reversa (nueva `confirmed`) ya compensa la original.

---

## Archivos modificados

| Archivo | Acción |
|---|---|
| `supabase/migrations/20260817100000_fix_report_rpcs_include_reversed.sql` | Nuevo — actualiza las dos RPCs |
| `src/pages/FinancesJournal.jsx` | Badge REVERSADA en celda de póliza |
| `src/pages/FinancesLedger.jsx` | Badge REVERSADA en celda de póliza |

---

## Migración

`DROP FUNCTION` + `CREATE FUNCTION` (no `create or replace` — PostgreSQL prohíbe cambiar `returns table` con `or replace`).

### `get_journal_report`

```sql
-- Antes:
where je.status = 'confirmed'

-- Después:
where je.status in ('confirmed', 'reversed')

-- Nueva columna al final del returns table:
entry_status  text
-- Seleccionada como:
je.status as entry_status
```

### `get_account_ledger`

```sql
-- Antes:
and je.status = 'confirmed'

-- Después:
and je.status in ('confirmed', 'reversed')

-- Nueva columna al final del returns table:
entry_status  text
-- Seleccionada como:
je.status as entry_status
```

Migración aplicada en DEV: `npx supabase db push --linked` → `Finished supabase db push`.

---

## Frontend

Badge inline en celda `Póliza` cuando `row.entry_status === 'reversed'`:

```jsx
{row.entry_status === 'reversed' && (
  <span style={reversedTagStyle}>REVERSADA</span>
)}
```

`reversedTagStyle`: `red50` background, `red600` text, `type.xs`, border-radius pill — mismo token que los badges existentes.

Aplicado en:
- `FinancesJournal.jsx` — columna Póliza en `renderRow`
- `FinancesLedger.jsx` — columna Póliza en `renderRow`

---

## Validación automática

```
npx eslint src/pages/FinancesJournal.jsx src/pages/FinancesLedger.jsx
→ 0 errores ✅

npm run test:finance
→ 88/88 pass, 0 fail ✅

npm run build
→ FinancesJournal-EMhOGb8Y.js  5.89 kB
→ FinancesLedger-CMl9psmo.js   6.22 kB
→ ✓ built in 4.25s ✅

git diff --check
→ exit 0 (solo warnings LF→CRLF existentes, no introducidos por este cambio) ✅
```

---

## Validación manual DEV — resultados

| Check | Resultado |
|---|---|
| `JE-RET-1C881241` aparece en Pólizas | ✅ Con badge REVERSADA |
| `JE-REV-B31F1EE0` aparece en Pólizas | ✅ Como tipo Reversa, sin badge |
| Mayor 1102 — muestra ambas líneas | ✅ |
| Mayor 1102 — saldo final | ✅ `$1,001.00` |
| Mayor 3102 — muestra ambas líneas | ✅ |
| Mayor 3102 — saldo final | ✅ `$0.00` |
| Consola browser sin errores | ✅ |

---

## Resultado final

**Fase 3F-BE Reports Reversed Entries DEV aprobada**
