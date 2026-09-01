# FASE3 — R6: Activación del Ledger en DEV

**Entorno:** DEV (`rtkdrnfqihulqdhixxzf` — La carreta Dev)  
**UTC pre-activación:** 2026-08-15 22:19:25  
**UTC activación:** 2026-08-15 22:20:18.621423+00  
**Resultado:** `ACTIVADO`

---

## Veredicto

> ### **ACTIVADO**
>
> Ledger activo en DEV desde `2026-08-15T22:20:18.621423+00:00`.  
> Asiento inicial: `JE-INICIAL-3ACE643A` (confirmed, débitos=créditos=3000.00).  
> Saldos: 1101=1000.00, 1102=1000.00, 1103=1000.00. Contrapartida 3101=3000.00.

---

## 1. Precondiciones inmediatas (confirmadas antes de ejecutar)

| Check | Valor observado | Estado |
|-------|----------------|--------|
| M29 Local=Remote | `20260815100000` ambos lados | **PASS** |
| `ledger_cutover_at` | `NULL` | **PASS** |
| Sesiones de caja abiertas | 0 | **PASS** |
| Mesas ocupadas | 0 | **PASS** |
| Cuenta 1101 (Caja operativa) | `is_system=true`, `is_active=true` | **PASS** |
| Cuenta 1102 (Caja fuerte) | `is_system=true`, `is_active=true` | **PASS** |
| Cuenta 1103 (Banco) | `is_system=true`, `is_active=true` | **PASS** |
| Cuenta 3101 (Aportaciones del propietario) | `is_system=true`, `is_active=true` | **PASS** |
| Cuenta 4101 (Ingresos por ventas) | `is_system=true`, `is_active=true` | **PASS** |

---

## 2. Llamada RPC ejecutada

**Método:** `npx supabase db query --linked` (Management API — `service_role`)  
**Una sola ejecución.**

```sql
SELECT public.activate_ledger(
  '7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7'::uuid,   -- admindev
  1000.00::numeric,                                  -- p_opening_cash_operativa
  1000.00::numeric,                                  -- p_opening_cash_fuerte
  1000.00::numeric,                                  -- p_opening_banco
  '[]'::jsonb,                                       -- sin partidas bancarias pendientes
  'ACTIVATE-LEDGER-DEV-20260815'::text               -- idempotency key
);
```

### Respuesta de la RPC

```json
{
  "activated_at":              "2026-08-15T22:20:18.621423+00:00",
  "initial_journal_entry_id":  "e9e32878-710c-4c73-9211-ce268b8d1652",
  "ledger_cutover_at":         "2026-08-15T22:20:18.621423+00:00",
  "total_initial_balance":     3000
}
```

---

## 3. Validaciones post-activación

### 3.1 `ledger_settings`

```
id   │ ledger_cutover_at              │ activated_at                   │ initial_journal_entry_id             │ activated_by
─────┼────────────────────────────────┼────────────────────────────────┼──────────────────────────────────────┼─────────────────────────────────────
true │ 2026-08-15 22:20:18.621423+00  │ 2026-08-15 22:20:18.621423+00  │ e9e32878-710c-4c73-9211-ce268b8d1652 │ 7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7
```

- `ledger_cutover_at` **NOT NULL** ✓
- `activated_by` = UUID de `admindev` ✓
- `initial_journal_entry_id` = `e9e32878-710c-4c73-9211-ce268b8d1652` ✓

### 3.2 Asiento inicial

```
entry_number         │ entry_type      │ status    │ occurred_at                    │ total_debit │ total_credit
─────────────────────┼─────────────────┼───────────┼────────────────────────────────┼─────────────┼─────────────
JE-INICIAL-3ACE643A  │ initial_balance │ confirmed │ 2026-08-15 22:20:18.621423+00  │ 3000.00     │ 3000.00
```

- Status: `confirmed` ✓
- `total_debit = total_credit = 3000.00` ✓ (balanceado)
- 1 único asiento con `entry_type='initial_balance'` ✓

### 3.3 Líneas del asiento inicial

```
code │ name                         │ debit   │ credit  │ description
─────┼──────────────────────────────┼─────────┼─────────┼─────────────────────────────────────
1101 │ Caja operativa               │ 1000.00 │ 0.00    │ Saldo inicial Caja operativa
1102 │ Caja fuerte                  │ 1000.00 │ 0.00    │ Saldo inicial Caja fuerte
1103 │ Banco                        │ 1000.00 │ 0.00    │ Saldo inicial Banco
3101 │ Aportaciones del propietario │ 0.00    │ 3000.00 │ Capital inicial al corte del ledger
```

- `1101` débito 1000.00 ✓
- `1102` débito 1000.00 ✓
- `1103` débito 1000.00 ✓
- `3101` crédito 3000.00 (contrapartida patrimonial total) ✓

### 3.4 Balances contables (`get_account_balances`)

```
code │ name                         │ balance
─────┼──────────────────────────────┼─────────
1101 │ Caja operativa               │ 1000.00
1102 │ Caja fuerte                  │ 1000.00
1103 │ Banco                        │ 1000.00
3101 │ Aportaciones del propietario │ 3000.00
```

- Caja operativa: 1000.00 ✓ (autorizado: 1000.00)
- Caja fuerte: 1000.00 ✓ (autorizado: 1000.00)
- Banco: 1000.00 ✓ (autorizado: 1000.00)
- Contrapartida patrimonial: 3000.00 ✓ (suma exacta)

### 3.5 Estado operativo (sin alteraciones)

```
open_sessions │ occupied_tables │ new_sales_since_activation
──────────────┼─────────────────┼───────────────────────────
0             │ 0               │ 0
```

Ninguna venta, mesa ni sesión de caja afectada. ✓

---

## 4. Resumen de identificadores clave

| Artefacto | Valor |
|-----------|-------|
| UUID asiento inicial | `e9e32878-710c-4c73-9211-ce268b8d1652` |
| Número de asiento | `JE-INICIAL-3ACE643A` |
| `ledger_cutover_at` | `2026-08-15T22:20:18.621423+00:00` |
| `idempotency_key` usada | `ACTIVATE-LEDGER-DEV-20260815` |
| Usuario ejecutor | `admindev` (`7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7`) |

---

## 5. Estado final

| Item | Estado |
|------|--------|
| Ledger activo en DEV | **SÍ** |
| `ledger_cutover_at` establecido | **SÍ** |
| Asiento inicial creado y confirmado | **SÍ** |
| Asiento balanceado (débitos = créditos) | **SÍ** |
| Saldos: 1101=1000, 1102=1000, 1103=1000 | **SÍ** |
| Contrapartida 3101=3000 | **SÍ** |
| Ventas/mesas/sesiones alteradas | **NO** |
| PRD tocado | **NO** |
| `migration up` / `db push` ejecutados | **NO** |
| SQL manual de escritura (DDL/DML directo) | **NO** |
| Commits o push realizados | **NO** |

---

## 6. Reversibilidad

La activación es **irreversible** mediante RPC normal. Una nueva llamada a `activate_ledger` lanza:
```
El ledger ya fue activado el 2026-08-15 22:20:18.621423+00.
```

Rollback técnico solo vía intervención manual directa en DB (documentado en V8 del precheck, requiere autorización explícita).

---

*Documento generado: 2026-08-15 22:21 UTC. Sin acciones adicionales ejecutadas tras la validación.*  
*Veredicto: `ACTIVADO`*
