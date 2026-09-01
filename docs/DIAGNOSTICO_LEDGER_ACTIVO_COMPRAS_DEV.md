# Diagnóstico — Ledger activo en compras DEV

**Fecha:** 2026-08-18  
**Rama:** `chore/code-cleanup`  
**Estado:** Solo diagnóstico — sin revertir datos, sin modificar código, sin commits.

---

## 1. Resumen ejecutivo

El ledger en DEV **ya estaba activo** antes de la compra de prueba. No era visible porque, hasta hoy, la UI enviaba `payment = null` a la EF, lo que impedía que el RPC `create_purchase_with_ledger` generara asientos — independientemente del estado del ledger.

El cambio de hoy (`chore/code-cleanup`) cableó `payment` explícitamente desde la UI. La primera compra con `payment != null` reveló que el ledger DEV estaba activo. El RPC hizo exactamente lo que fue diseñado para hacer.

**El comportamiento observado es correcto. El código es correcto. La premisa documentada estaba equivocada.**

---

## 2. Compra ejecutada

| Campo | Valor |
|---|---|
| Tipo | Compra de inventario |
| Proveedor | Cervecería Modelo |
| Material | `CERVEZA CORONA (CAGUAMA) 955 MIL.` |
| Folio | `DEV-INV-PRELEDGER-20260818` |
| Método de pago | Transferencia |
| Total | $1.00 |
| `purchase_id` | `a04e11fa-5802-44d2-90a8-23450d7ee91f` |

---

## 3. Resultado observado

| Campo | Valor |
|---|---|
| EF `record_purchase` | HTTP 200 |
| `journal_entry_id` | `f89959fc-fcfc-4b5b-9a9a-e26575cd0f67` |
| `financial_operation_id` | `ccd6fef2-d3a4-48f3-9594-f1ba16a91ae9` |
| Póliza | `JE-CMP-A04E11FA` |
| Debe | `1201 Compras de mercancía por aplicar` $1.00 |
| Haber | `1103 Banco` $1.00 |

Asiento perfectamente balanceado. Tipo de póliza `purchase`. Cuenta de gasto correcta para compra de inventario.

---

## 4. Estado real del ledger DEV

### 4.1 Evidencia indirecta (concluyente)

El RPC `create_purchase_with_ledger` genera asientos **solo si se cumplen las 3 condiciones simultáneas:**

```sql
if v_ledger_cutover_at is not null          -- ledger activado
   and now() >= v_ledger_cutover_at         -- compra posterior al corte
   and p_payment is not null                -- pago proporcionado
then
  -- genera journal_entry, financial_operation, financial_payment
end if;
```

El hecho de que se generó un `journal_entry_id` prueba que:
- **`ledger_cutover_at IS NOT NULL`** — el ledger DEV estaba activo.
- **`now() >= ledger_cutover_at`** — la compra ocurrió después del corte.
- **`p_payment IS NOT NULL`** — se envió pago (efecto del cambio de hoy).

### 4.2 Query diagnóstico (ejecutado manualmente — Supabase Dashboard DEV)

```sql
SELECT
  id,
  ledger_cutover_at,
  activated_at,
  activated_by,
  initial_journal_entry_id
FROM public.ledger_settings
WHERE id = true
LIMIT 1;
```

**Resultado:**

| campo | valor |
|---|---|
| `id` | `true` |
| `ledger_cutover_at` | `2026-08-15 22:20:18.621423+00` |
| `activated_at` | `2026-08-15 22:20:18.621423+00` |
| `activated_by` | `7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7` |
| `initial_journal_entry_id` | `e9e32878-710c-4c73-9211-ce268b8d1652` |

### 4.3 Verificación alternativa vía EF (sin SQL)

`financialService.getLedgerStatus()` existe en `src/api/financialService.js:60` y llama `get_ledger_status` en `financial-operations`. Devuelve:

```json
{
  "is_active": true,
  "ledger_cutover_at": "<timestamp>",
  "activated_at": "<timestamp>"
}
```

Se puede invocar desde browser console en DEV:
```js
await financialService.getLedgerStatus()
```

O desde la EF directamente vía Supabase Dashboard (Functions → financial-operations → Test).

### 4.4 Por qué no era visible en la UI

`getLedgerStatus()` **no está llamado en ningún componente de la UI**. No existe indicador visual de estado del ledger en ninguna página del módulo Finanzas. La activación es silenciosa para el usuario final. Esto explica por qué la premisa "ledger inactivo" nunca fue contradicha por la UI.

---

## 5. Lógica confirmada en compras

### 5.1 Antes del cambio de hoy

```
UI → erpService.recordPurchase(header, items)
          ↓
EF body: { purchase_header, items }
  rawPayment = body.payment  → undefined → null
  rpcPayment = null
          ↓
RPC create_purchase_with_ledger(... p_payment: null ...)
  -- condición: p_payment is null → NO genera asientos
  -- ledger_cutover_at podía ser not null → no importaba
          ↓
Resultado: compra registrada, SIN journal_entry
```

### 5.2 Después del cambio de hoy

```
UI → erpService.recordPurchase(header, items, payment, idempotencyKey, purchaseType)
          ↓
EF body: { purchase_header, items, purchase_type, payment: { method: 'Transferencia', amount: 1.00 }, idempotency_key }
  rawPayment = { method: 'Transferencia', amount: 1.00 }
  rpcPayment = { method: 'Transferencia', amount: 1.00 }
          ↓
RPC create_purchase_with_ledger(... p_payment: { method, amount } ...)
  ledger_cutover_at IS NOT NULL  ← DEV ledger activo
  p_payment IS NOT NULL          ← nuevo
  → genera journal_entry, financial_operation, financial_payment
          ↓
Resultado: compra registrada, CON journal_entry ✓ (correcto dado el estado del ledger)
```

### 5.3 Efecto del método de pago en esta compra

- Método: `Transferencia` → cuenta de crédito: `1103 Banco`
- Método `Efectivo` habría requerido caja abierta (check en RPC) → hubiera fallado si no hay caja abierta
- Con `Transferencia`: sin restricción de caja abierta → compra procesada correctamente

---

## 6. Causa raíz

**Causa raíz: El ledger DEV fue activado previamente** (probablemente durante el desarrollo y prueba del módulo Finanzas). La activación requiere `Superadmin` y es intencional (`activate_ledger` en `financial-operations`). No fue accidental.

**Causa instrumental: La premisa estaba equivocada.** Los documentos previos asumían:
> "No activar ledger" / "ledger inactivo en deploy inicial"

Esto era correcto para PRD, pero para DEV el ledger ya estaba activo sin que se documentara.

**Causa habilitante: `payment = null` enmascaraba el estado.** Antes del cambio de hoy, la UI nunca enviaba `payment`, lo que hacía que el RPC nunca llegara al bloque de asientos, independientemente del estado del ledger. Esto creó la falsa impresión de que el ledger no tenía efecto.

---

## 7. Impacto contable

| Aspecto | Estado |
|---|---|
| Asiento `JE-CMP-A04E11FA` | Correcto — balanceado, tipo `purchase`, cuentas correctas |
| Cuenta débito | `1201 Compras de mercancía por aplicar` ← correcto para inventario |
| Cuenta crédito | `1103 Banco` ← correcto para Transferencia |
| `financial_operation` | Creada con `operation_type = 'purchase'` |
| `financial_payment` | `method = 'Transferencia'`, `amount = 1.00` |
| Stock de inventario | Actualizado por trigger (independiente del ledger) |
| `costo_promedio` | Actualizado por trigger |
| `inventory_movements` | Registrado |

El asiento es válido y no debe revertirse. La compra DEV queda como evidencia de integración del flujo completo.

---

## 8. Recomendación

### 8.1 Inmediato

1. **Confirmar estado del ledger DEV** con el query diagnóstico Q de la Sección 4.2 o via `getLedgerStatus()`. Registrar `ledger_cutover_at` exacto.

2. **Actualizar premisas del deploy PRD:** El estado actual es:
   - DEV: ledger **activo** — compras con `payment` generan asientos.
   - PRD: ledger **inactivo** — compras con `payment` NO generarán asientos hasta que se active explícitamente en fase separada.
   - El deploy PRD puede proceder con `payment` conectado: sin ledger activo, el RPC simplemente valida pago y caja (si Efectivo) pero no genera asientos.

3. **Documentar** que en DEV todas las compras futuras generarán asientos contables mientras el ledger esté activo.

### 8.2 PRD — sin cambios

El plan de deploy PRD sigue siendo válido:
- PRD no tiene ledger activo → `CHECKLIST_APROBACION_DEPLOY_FINANZAS_PRD.md` Sección 7 aplica.
- La activación del ledger en PRD es una fase separada posterior, con sus propios requerimientos.
- El cambio de hoy (`payment` conectado) es correcto para PRD: sin ledger activo, el RPC no genera asientos.

### 8.3 Compras en efectivo en DEV

Con ledger activo, las compras con `Efectivo` requieren **caja abierta**. Si se intenta una compra con `Efectivo` y sin caja abierta, el RPC lanzará:
```
No hay una caja abierta. Debes abrir caja para pagar compras en efectivo.
```

Esto es comportamiento correcto y esperado.

### 8.4 Agregar indicador de estado del ledger en UI (no urgente)

`financialService.getLedgerStatus()` existe pero no se usa. Sería útil mostrar un badge `Ledger activo / inactivo` en `FinancesHome.jsx`. No es bloqueante para el deploy PRD.

---

## 9. Pendiente manual — Confirmación exacta de ledger_cutover_at

El estado activo del ledger DEV está confirmado indirectamente por la generación del asiento `JE-CMP-A04E11FA` (ver Sección 4.1), pero falta registrar el timestamp exacto de activación.

El sandbox de Claude Code bloqueó la ejecución directa del SELECT via `psql` por materialización de credenciales en la transcripción. La consulta debe ejecutarse manualmente.

### Consulta a ejecutar

**Dónde:** Supabase Dashboard → Proyecto DEV (`rtkdrnfqihulqdhixxzf`) → SQL Editor

```sql
SELECT
  id,
  ledger_cutover_at,
  activated_at,
  activated_by,
  initial_journal_entry_id
FROM public.ledger_settings
WHERE id = true
LIMIT 1;
```

### Campos esperados

| Campo | Descripción |
|---|---|
| `ledger_cutover_at` | Timestamp desde el cual las operaciones con `payment` generan asientos. Debe ser anterior a `2026-08-18T15:XX` (momento de la compra DEV). |
| `activated_at` | Timestamp en que se llamó `activate_ledger`. Puede diferir de `ledger_cutover_at`. |
| `activated_by` | UUID del superadmin que ejecutó la activación. |
| `initial_journal_entry_id` | UUID de la póliza de apertura generada en la activación. |

### Registro del resultado

```
ledger_cutover_at         : 2026-08-15 22:20:18.621423+00
activated_at              : 2026-08-15 22:20:18.621423+00
activated_by              : 7bf6bf2e-e5e7-47bf-8708-eb06281d7ca7
initial_journal_entry_id  : e9e32878-710c-4c73-9211-ce268b8d1652
```

**Observaciones:**

- `ledger_cutover_at == activated_at` — la activación y el corte son el mismo instante (comportamiento estándar).
- Activado el **2026-08-15** — mismo día que la migración `20260815100000_fix_finalize_pos_sale_groupby.sql`. Probable: el ledger fue activado durante la prueba de integración del módulo Finanzas en DEV.
- La compra de prueba `DEV-INV-PRELEDGER-20260818` se ejecutó el **2026-08-18**, 3 días después del corte. Confirma que `now() >= ledger_cutover_at` se cumplió.
- La póliza de apertura `e9e32878-710c-4c73-9211-ce268b8d1652` contiene los saldos iniciales registrados al activar el ledger.

---

## 10. Restricciones respetadas

- ✅ No se tocó PRD.
- ✅ No se ejecutó SQL destructivo.
- ✅ No se activó ni desactivó ledger.
- ✅ No se ejecutaron más operaciones reales.
- ✅ No se revertió la compra ni el asiento.
- ✅ No se modificó código.
- ✅ No se hicieron commits ni push.
- ✅ Solo análisis de código + evidencia observada.
- ✅ No se intentó rodear la restricción de materialización de credenciales.

---

## 11. Resultado final

> **Premisa de validación corregida: ledger DEV activo.**

El código es correcto. El RPC hizo lo que fue diseñado para hacer. La premisa documentada ("ledger inactivo en DEV") estaba equivocada — el ledger DEV fue activado previamente durante el desarrollo del módulo Finanzas.

El cambio de hoy (conectar `payment` desde la UI) es correcto y necesario. En PRD, con ledger inactivo, el mismo código enviará `payment` pero no generará asientos contables hasta que el ledger sea activado en una fase separada y autorizada.
