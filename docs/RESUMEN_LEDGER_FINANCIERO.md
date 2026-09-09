# Ledger Financiero — Estado de Implementación

> Última actualización: 2026-08-11

---

## Fases completadas

### Fases 0–3 — Base del ledger *(sesión anterior)*

**Migración:** `20260811100000_ledger_base.sql` *(aprox.)*

- Tablas core: `financial_accounts`, `ledger_settings`, `journal_entries`, `journal_lines`, `idempotency_requests`, `audit_events`
- 11 cuentas del sistema:

| Código | Nombre | Tipo |
|--------|--------|------|
| 1101 | Caja operativa | asset |
| 1102 | Caja fuerte | asset |
| 1103 | Banco | asset |
| 1201 | Inventario de mercancía | asset |
| 1202 | Deterioro de inventario | asset |
| 3101 | Capital del propietario | capital |
| 3102 | Retiros del propietario | capital |
| 4101 | Ingresos por ventas | income |
| 4102 | Sobrantes de caja | income |
| 5101 | Faltantes de caja | expense |
| 5201 | Gastos operativos generales | expense |

- RPC `activate_ledger`: asiento de apertura con saldos iniciales, idempotencia
- Trigger `trg_assert_journal_entry_balanced`: valida `SUM(debit) = SUM(credit)` antes de confirmar cualquier asiento

---

### Fase 4 — Ventas con ledger

**Migración:** `20260811140000_sale_financial_entries.sql`
**Edge Function:** `pos-operations/index.ts`

- Tablas `financial_operations` y `financial_payments` (soporte multi-método de pago)
- Columnas `financial_operation_id` y `journal_entry_id` en `sales`
- `finalize_pos_sale` refactorizada:
  - Acepta `p_payments jsonb` (array de `{method, amount}`)
  - Métodos válidos: `Efectivo`, `Tarjeta`, `Transferencia`
  - Asiento generado: `1101/1103 → 4101` (agrupado por método)
  - Idempotencia con scope `sale`
  - Backward-compatible: si llega `payment_method` (legacy), se convierte a array automáticamente

---

### Fase 5 — Compras con ledger

**Migración:** `20260811150000_purchase_financial_entries.sql`
**Edge Function:** `erp-operations/index.ts`

- RPC `create_purchase_with_ledger`: operación completamente atómica en una transacción:
  1. INSERT `purchases`
  2. INSERT `purchase_items` → trigger `tr_update_inventory_on_purchase` actualiza stock y costo promedio
  3. INSERT `inventory_movements`
  4. INSERT `audit_events`
  5. Si ledger activo: asiento `1201 (mercancía) + 5201 (gasto) → 1101/1103` según método de pago
- `erp-operations`: reemplazó inserts multi-paso por llamada única al RPC; corrigió auth legacy `/auth/v1/user`

---

### Fase 6 — Fondos, retiros y reversas

**Migración:** `20260811160000_fondos_reversas.sql`
**Edge Function:** `financial-operations/index.ts`

- Tabla `financial_authorizations`: constraint `requested_by ≠ authorized_by`
- Tabla `cash_discrepancy_resolutions`: UNIQUE por `cash_session_id` (solo una resolución por sesión)
- RPCs:
  - `record_transfer`: mueve fondos entre cuentas 1101/1102/1103
  - `record_owner_contribution`: aportes del propietario, `debit dest / credit 3101`
  - `record_owner_withdrawal`: **solo desde 1102 o 1103** (1101 prohibido explícitamente), requiere `authorized_by ≠ performed_by`, verifica rol superadmin/manager
  - `reverse_journal_entry`: espejo del asiento original (débitos↔créditos), marca original como `reversed`, crea registro de autorización
  - `resolve_cash_discrepancy`: sesión debe estar en `closed_with_pending_difference`:
    - Faltante/omitido → `debit 5101 / credit 1101`
    - Sobrante → `debit 1101 / credit 4102`

---

### Fase 7 — Reportes

**Migración:** `20260811170000_reportes_ledger.sql`
**Edge Function:** `financial-operations/index.ts` (acciones de reporte agregadas)

- Índices de rendimiento:
  - `journal_entries_occurred_confirmed_idx` (partial WHERE status='confirmed')
  - `journal_entries_status_occurred_idx`
  - `journal_lines_account_entry_idx`
- RPCs (todas `security definer`, solo `service_role`):
  - `get_account_balances(as_of?)`: saldos por cuenta; signo según tipo (asset/expense = D-C; demás = C-D)
  - `get_journal_report(from, to)`: diario con líneas y cuentas
  - `get_account_ledger(code, from?, to?)`: mayor por cuenta con saldo acumulado (window function `SUM() OVER`)
  - `get_cash_sessions_report(from?, to?)`: sesiones + discrepancias + resoluciones + asiento vinculado

---

### Fase 8 — Release DEV *(parcial)*

**Archivo preflight:** `sql/dev/2026-08-11_preflight_ledger_dev.sql`

- Preflight ejecutado en DEV: **13/13 checks OK**
- 4 Edge Functions desplegadas a DEV (`rtkdrnfqihulqdhixxzf`) con `--no-verify-jwt`:
  - `financial-operations`
  - `pos-operations`
  - `cash-operations`
  - `erp-operations`

---

## Estado actual

| Entorno | Schema | Edge Functions | Frontend |
|---------|--------|---------------|----------|
| DEV (`rtkdrnfqihulqdhixxzf`) | ✅ Migrado | ✅ Desplegado | ✅ Preview activo |
| PRD | ⏳ Pendiente | ⏳ Pendiente | — |

---

## Pendiente

| Paso | Descripción | Requisito |
|------|-------------|-----------|
| 8.2 | Análisis de impacto PRD + orden de migraciones | — |
| 8.3 | Aplicar migraciones a PRD | **Autorización explícita** |
| 8.4 | Desplegar Edge Functions a PRD (`--no-verify-jwt`) | **Autorización explícita** |
| 8.5 | Smoke test en PRD | Tras 8.3 + 8.4 |

---

## Constraints de seguridad activos

- Nunca aplicar SQL ni desplegar Edge Functions a PRD sin autorización explícita
- Todos los montos financieros en columnas nuevas: `numeric(14,2)` o superior
- Edge Functions: `requestClient` (publishableKey) para auth; `adminClient` (serviceRoleKey) para operaciones DB
- Desplegar todas las Edge Functions protegidas con `--no-verify-jwt`
- No modificar migraciones ya aplicadas
- DEV y PRD deben estar homologados (mismo schema, misma lógica, mismas Edge Functions)
