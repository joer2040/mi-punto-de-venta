# Fase 3 - R2 Preflight: `20260812100000_fix_account_5201_to_5102.sql`

**Fecha/hora UTC:** `2026-08-13T01:45:56Z`
**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`
**Rama:** `chore/code-cleanup`
**Ejecutor preflight:** joer2040
**Tipo:** Solo SELECT contra DEV. Sin escritura, DDL, DML, repair ni deploy.

---

## 1. Contenido de la migracion

La migracion ejecuta tres operaciones dentro de `begin/commit`:

| Paso | Operacion | Detalle |
|---|---|---|
| 1 | `UPDATE financial_accounts` | `code = '5102'` donde `code = '5201' AND is_system = true` |
| 2 | `CREATE OR REPLACE FUNCTION create_purchase_with_ledger` | Reemplaza funcion completa; unico cambio funcional: `code = '5102'` (antes `'5201'`) en lookup de cuenta gastos |
| 3 | `REVOKE / GRANT` | `service_role` EXECUTE; revocar de `public`, `anon`, `authenticated` |
| 4 | DO inline | Verifica: `5102` existe y `5201` no existe — falla con EXCEPTION si no |

`financial_accounts.id` **NO cambia** — journal_lines existentes no se afectan.

---

## 2. Estado actual en DEV (evidencia SELECT)

### Q1 — `financial_accounts` codigos 5201 / 5102

```json
{
  "rows": [
    {
      "code": "5201",
      "name": "Gastos operativos generales",
      "account_type": "expense",
      "is_system": true,
      "is_active": true,
      "id": "5d31b2b4-486a-4b50-9327-84c5b796816a"
    }
  ]
}
```

| Hallazgo | Valor |
|---|---|
| `5201` existe en DEV | Si (`is_system=true`, `is_active=true`) |
| `5102` existe en DEV | **No** — unica fila devuelta es 5201 |
| Conflicto de codigo | Ninguno — 5102 libre |

### Q2 — `ledger_settings` (activacion del ledger)

```json
{ "rows": [] }
```

`ledger_settings` sin filas donde `id = true` — ledger **inactivo**. La rama de contabilidad en `create_purchase_with_ledger` (que hace lookup de cuentas) no se ejecuta hasta activacion.

### Q3 — Funcion `create_purchase_with_ledger` en DEV

```json
{
  "rows": [{
    "function_name": "create_purchase_with_ledger",
    "account_ref": "CONTIENE 5201",
    "service_role_exec": true,
    "anon_exec": false,
    "auth_exec": false
  }]
}
```

| Hallazgo | Valor |
|---|---|
| Funcion existe en DEV | Si |
| Referencia actual | `5201` (sera reemplazada por R2) |
| Privilegios actuales | service_role=true, anon=false, authenticated=false |
| Privilegios despues de R2 | Identicos (REVOKE/GRANT en la migracion los confirma) |

### Q4 — `journal_lines` que referencian cuenta 5201

```json
{ "rows": [{ "journal_lines_with_5201": 0 }] }
```

**0 journal_lines** referencian la cuenta 5201. Sin datos financieros comprometidos por el rename.

---

## 3. Validaciones preflight

| # | Condicion | Resultado |
|---|---|---|
| 1 | R1 completo (7 versiones ledger en Remote) | PASS — R1.1–R1.7 APROBADOS |
| 2 | `financial_accounts` codigo `5201` existe en DEV | PASS — `is_system=true`, `is_active=true` |
| 3 | `financial_accounts` codigo `5102` NO existe en DEV | PASS — sin conflicto |
| 4 | `financial_accounts.id` no cambia | PASS — migracion solo actualiza `code` |
| 5 | Ledger inactivo en DEV | PASS — `ledger_settings` sin filas |
| 6 | `journal_lines` con cuenta 5201 | PASS — 0 filas afectadas |
| 7 | Funcion `create_purchase_with_ledger` referencia `5201` (pre-R2) | PASS — correcto estado inicial |
| 8 | Privilegios funcion: `service_role` only | PASS — consistente con el resto del ledger |
| 9 | Migracion atomica (`begin/commit`) | PASS — falla total o exito total |
| 10 | Verificacion inline (DO block) | PASS — bloquea si 5102 ausente o 5201 persiste |
| 11 | `20260812100000` sigue Local-only (no aplicada) | PASS — confirmado en R1.7 migration list |

**11/11 PASS.**

---

## 4. Analisis de riesgo

| Factor | Evaluacion |
|---|---|
| Impacto en datos existentes | Nulo — 0 journal_lines con codigo 5201 |
| Rollback disponible | Si — UPDATE manual `code = '5201'` donde `code = '5102'` (requiere autorizacion separada) |
| Rollback via `migration repair --status reverted` | Solo elimina fila de historial — no revierte el schema; rollback de datos es manual |
| Riesgo de conflicto de codigo | Nulo — 5102 libre en DEV |
| Impacto en operaciones activas | Nulo — ledger inactivo, funcion solo la llama el Edge Function de compras |
| Verificacion automatica | Si — DO block lanza EXCEPTION si el rename no se aplico correctamente |

---

## 5. Veredicto

**R2 LISTO PARA AUTORIZACION.**

Todas las condiciones previas cumplidas. La migracion puede aplicarse en DEV cuando el usuario otorgue aprobacion explicita.

**Efectos esperados post-aplicacion:**
- `financial_accounts` code `5201` → `5102` (mismo UUID, mismo nombre)
- `create_purchase_with_ledger` actualizada para buscar code `'5102'`
- `20260812100000` pasara de Local-only a Local + Remote en `migration list --linked`
- Inline verification OK: `5102` existe, `5201` ausente

---

## 6. Evidencia de no intervencion

- Solo se ejecutaron SELECT contra DEV.
- Sin `migration repair`, `db push`, DDL, DML, `activate_ledger`, deploys, commits ni pushes.
- Estado de DEV sin cambios.
