# Análisis: Reglas de Negocio DEV vs PRD

**Fecha:** 2026-08-17  
**Objetivo:** Identificar diferencias funcionales relevantes entre DEV (con módulo Finanzas) y PRD (actual) para evitar regresiones en un eventual deploy.  
**Alcance:** Solo análisis. Sin cambios de código, DB, ni configuración.

---

## Metodología

Revisión exhaustiva de:
- `supabase/migrations/` — constraints, triggers, RPCs
- `supabase/functions/` — Edge Functions (cash-operations, pos-operations, financial-operations)
- `src/pages/` + `src/contexts/` — guardas frontend
- `docs/` — evidencias de validación DEV

---

## 1. Reglas compartidas — presentes en DEV y PRD

Estas reglas no fueron modificadas por el módulo de Finanzas. Deben existir igual en PRD.

### 1.1 Caja (Cash Session)

| Regla | Dónde se aplica | Mensaje de error |
|---|---|---|
| Solo una sesión abierta globalmente | DB unique index + `open_cash_session_atomic` | "Ya existe una caja abierta." |
| Monto inicial > 0 | RPC + frontend `CashControl.jsx` | "Debes ingresar un monto inicial mayor a 0." |
| No se puede abrir caja si hay mesas/barras activas | DB trigger `prevent_cash_close_with_active_pos_operations` | "No puedes abrir la caja mientras haya mesas, barras o pedidos activos." |
| No se puede cerrar caja si hay mesas/barras activas | DB trigger + `close_cash_session_atomic` | "No puedes cerrar la caja mientras haya ventas activas." |
| Advisory lock en apertura (`pg_advisory_xact_lock`) | RPC `open_cash_session_atomic` | Serializa concurrencia — solo una apertura simultánea |
| Inventario snapshot en apertura y cierre | RPC atómica | No user-facing; corre internamente |
| Profit calculado en cierre (no en tiempo real) | `close_cash_session_atomic` | Calculado como sum of sale margins |

### 1.2 Punto de Venta (POS)

| Regla | Dónde se aplica | Mensaje de error |
|---|---|---|
| No se puede operar POS sin caja abierta | DB trigger `require_open_cash_session_for_pos_operation` | "No hay una caja abierta. Debes abrir caja antes de abrir mesas, barras o modificar pedidos." |
| Mesero: solo puede agregar o aumentar, no eliminar | Edge Function `pos-operations` | "Como mesero solo puedes agregar productos o aumentar cantidades en una mesa ya guardada." |
| Pago solo en Efectivo | RPC `finalize_pos_sale` (hard-coded) | "Metodo de pago no soportado." |
| Precios vienen del inventario, no del cliente | RPC `finalize_pos_sale` | Frontend-provided prices ignored |
| Centro de inventario fijo: "Bar Principal" | RPC `finalize_pos_sale` | "No se encontro el centro Bar Principal." |
| Número de documento serializado por día | Advisory lock por fecha + secuencia 00–99 | Orden garantizado, sin duplicados |
| Tabla liberada atómicamente al finalizar venta | `finalize_pos_sale` (transacción única) | "El pedido activo de la mesa cambio antes de la finalizacion." |

### 1.3 Bundles / Cubetas

| Regla | Backend | Frontend |
|---|---|---|
| Cubeta Mixta: exactamente 10 piezas | `finalize_pos_sale` RPC | `POS.jsx` |
| Cubeta Mixta: $32.00 fijo ($3.20/pieza) | RPC re-calcula | Display only |
| Cubeta Mixta: 5 SKUs permitidos (Cerveza) | RPC whitelist | `POS.jsx` |
| Cubeta Caguamita: exactamente 5 piezas | RPC | `POS.jsx` |
| Cubeta Caguamita: $26.00 fijo ($5.20/pieza) | RPC | Display only |
| Cubeta Caguamita: SKU único (Cerveza) | RPC whitelist | `POS.jsx` |
| Backend no confía en precios de bundles del cliente | RPC ignora `unit_price` del body | Sí |

### 1.4 Permisos y Autenticación

| Regla | Dónde se aplica |
|---|---|
| `cash_control:view` para ver pantalla de caja | `AuthContext.can()` + guard en `CashControl.jsx` |
| `cash_control:manage` para operar caja | Handler `cash-operations` + guard frontend |
| Rol Mesero solo puede modificar pedido (no administrar) | `pos-operations` handler |
| Superadmin bypass todos los permisos | `AuthContext` + todos los handlers |
| `user.status = 'active'` requerido | Todos los Edge Functions (loadCallerContext) |

---

## 2. Reglas nuevas en DEV — NO existen en PRD todavía

Estas reglas son parte del módulo de Finanzas. PRD no tiene estas tablas ni RPCs.

### 2.1 Módulo Financiero (DEV únicamente)

| Regla | Detalle |
|---|---|
| Ledger debe estar activo para operaciones | `get_ledger_status` → `is_active` check en todos los RPCs de escritura |
| Caja operativa (1101) requiere sesión abierta | `record_transfer`, `record_owner_contribution` guardan si from/to = 1101 |
| Retiros prohibidos desde 1101 | `record_owner_withdrawal`: solo 1102, 1103 permitidos |
| Retiro requiere autorizador distinto al solicitante | RPC CHECK + Edge Function |
| Autorizador de retiro debe ser Manager o Superadmin | RPC valida rol del authorized_by |
| Reversa solo para asientos `confirmed` | RPC guard `status = 'confirmed'` |
| Autorizador de reversa ≠ creador del asiento original | RPC CHECK |
| Resolución de discrepancia solo para sesiones `closed_with_pending_difference` | RPC guard |
| Una sola resolución por sesión de caja | DB UNIQUE constraint en `cash_discrepancy_resolutions.cash_session_id` |
| Idempotency keys por operación (scope + key) | DB unique index + RPC logic |
| Double-entry balance requerido en journal_lines | DB trigger valida suma(debit) = suma(credit) por asiento |
| `report reversed entries` en Pólizas y Mayor | Migración `20260817100000` — filtro `status in ('confirmed','reversed')` |

### 2.2 Migraciones DEV pendientes de aplicar en PRD

| Migración | Descripción | Tipo |
|---|---|---|
| `20260810200000_base_financial_schema.sql` | Esquema base (tablas, cuentas, journal) | Aditiva ✅ |
| `20260811110000_activate_ledger_rpc.sql` | RPC `activate_ledger` | Aditiva ✅ |
| `20260811130000_extend_cash_sessions_ledger.sql` | Cash sessions → ledger linkage | Potencialmente modifica tabla existente ⚠️ |
| `20260811140000_sale_financial_entries.sql` | Ventas generan asientos contables | Potencialmente modifica trigger de ventas ⚠️ |
| `20260811150000_purchase_financial_entries.sql` | Compras generan asientos | Potencialmente modifica trigger de compras ⚠️ |
| `20260811160000_fondos_reversas.sql` | RPCs de escritura financiera | Aditiva ✅ |
| `20260811170000_reportes_ledger.sql` | RPCs de reportes | Aditiva ✅ |
| `20260812100000_fix_account_5201_to_5102.sql` | Corrección de código de cuenta | Corrección de datos ⚠️ |
| `20260815100000_fix_finalize_pos_sale_groupby.sql` | Fix en `finalize_pos_sale` | Modifica RPC existente ⚠️ |
| `20260817100000_fix_report_rpcs_include_reversed.sql` | RPCs incluyen `reversed` | Modifica RPCs existentes ⚠️ |

---

## 3. Riesgos identificados para deploy DEV → PRD

### 🔴 RIESGO ALTO

#### R1: `20260815100000_fix_finalize_pos_sale_groupby.sql`
- **Qué modifica:** RPC `finalize_pos_sale` — la función crítica de cierre de ventas en POS.
- **Riesgo:** Si el fix introduce un cambio de comportamiento (no solo groupBy), podría romper flujo de ventas en PRD.
- **Recomendación:** Revisar diff del RPC. Confirmar que el fix en DEV reproduce el comportamiento PRD + corrige el bug. Probar flujo completo de venta en staging antes de PRD.

#### R2: `20260811140000_sale_financial_entries.sql`
- **Qué modifica:** Posiblemente modifica trigger o hook en `sales` para generar asientos contables.
- **Riesgo:** Si modifica el trigger de `finalize_pos_sale` o agrega un trigger en `sales`, una falla en el nuevo trigger podría bloquear ventas en PRD.
- **Recomendación:** Leer migración completa. Confirmar que es aditiva (nuevo trigger) y no modifica comportamiento existente. Verificar que si el asiento falla, la venta no se revierta (o que sí se revierta de forma controlada).

#### R3: `20260811130000_extend_cash_sessions_ledger.sql`
- **Qué modifica:** Extiende tabla `cash_sessions` para linkedger.
- **Riesgo:** Si agrega columnas NOT NULL sin default, falla en PRD si hay sesiones existentes sin esa columna.
- **Recomendación:** Confirmar que todas las columnas nuevas tienen `DEFAULT` o son nullable.

### 🟡 RIESGO MEDIO

#### R4: `20260812100000_fix_account_5201_to_5102.sql`
- **Qué hace:** Renombra/corrige código de cuenta contable.
- **Riesgo:** Si PRD ya tiene datos con el código viejo (5201), puede haber inconsistencias.
- **Recomendación:** Confirmar si PRD tiene el ledger activado. Si no, esta migración corre en schema limpio y es segura.

#### R5: Interacción Caja operativa (1101) y sesión abierta
- **Regla DEV:** `record_transfer` y `record_owner_contribution` con cuenta 1101 requieren sesión abierta.
- **Riesgo en PRD:** Operadores podrían intentar traspasos fuera de horario de caja. El backend rechaza correctamente, pero el operador podría no entender el mensaje.
- **Recomendación:** Documentar flujo operativo: abrir caja antes de hacer operaciones con 1101.

#### R6: `20260811150000_purchase_financial_entries.sql`
- **Qué hace:** Compras generan asientos contables.
- **Riesgo:** Si modifica el proceso de compras existente, podría introducir falla en flujo de compras de PRD.
- **Recomendación:** Leer migración. Verificar que es aditiva y que la falla del asiento no bloquea la compra.

### 🟢 SIN RIESGO (aditivas)

| Migración | Por qué es segura |
|---|---|
| `20260810200000_base_financial_schema.sql` | Solo crea tablas nuevas |
| `20260811110000_activate_ledger_rpc.sql` | Solo crea RPCs nuevas |
| `20260811160000_fondos_reversas.sql` | Solo crea RPCs + tablas nuevas |
| `20260811170000_reportes_ledger.sql` | Solo crea RPCs nuevas |
| `20260817100000_fix_report_rpcs_include_reversed.sql` | DROP + CREATE de RPCs de reporte (no POS, no caja) |

---

## 4. Reglas en PRD confirmadas que DEV debe respetar

Estas reglas fueron validadas como funcionando correctamente en PRD. El módulo de Finanzas no las toca directamente, pero un deploy descuidado podría romperlas.

| Regla PRD | Estado en DEV | Riesgo deploy |
|---|---|---|
| POS bloqueado sin caja abierta | ✅ Misma regla, mismo trigger | Nulo si migración aditiva |
| Cierre de caja bloqueado con mesas activas | ✅ Misma regla, mismo trigger | Nulo |
| Cubeta Mixta: 10 piezas, $32, 5 SKUs | ✅ Sin cambios | Nulo |
| Cubeta Caguamita: 5 piezas, $26, 1 SKU | ✅ Sin cambios | Nulo |
| Mesero: solo agregar/aumentar | ✅ Sin cambios | Nulo |
| Pago solo Efectivo | ✅ Sin cambios | Nulo |
| Número documento serializado por día | ✅ Sin cambios | Nulo |
| finalize_pos_sale atómica | ⚠️ Posiblemente modificada por `20260815100000` | Revisar R1 |
| sales → asientos contables (si existía en PRD) | ⚠️ Agregado en DEV por `20260811140000` | Revisar R2 |

---

## 5. Diferencias observadas DEV vs PRD (funcionales)

| Funcionalidad | DEV | PRD | Impacto |
|---|---|---|---|
| Módulo Finanzas (hub, operaciones, reportes) | ✅ Disponible | ❌ No existe | Nuevo — requiere deploy |
| Asientos contables en ventas | ✅ Genera JE por venta | ❓ Sin confirmar si está activo | Revisar R2 |
| Asientos contables en compras | ✅ Genera JE por compra | ❓ Sin confirmar si está activo | Revisar R6 |
| `finalize_pos_sale` groupby fix | ✅ Aplicado en DEV | ❓ Sin confirmar en PRD | Revisar R1 |
| Reportes de Pólizas incluyen `reversed` | ✅ Desde 20260817 | ❌ No existe RPC | Nulo hasta deploy |
| Permisos de Finanzas en `app_role_permissions` | ✅ Seeded en DEV | ❌ Sin confirmar | Requiere seeding en PRD |

---

## 6. Acciones recomendadas antes de deploy PRD

1. **Leer completamente** las 3 migraciones marcadas ⚠️ de riesgo alto:
   - `20260815100000_fix_finalize_pos_sale_groupby.sql`
   - `20260811140000_sale_financial_entries.sql`
   - `20260811130000_extend_cash_sessions_ledger.sql`

2. **Confirmar** si PRD ya tiene ledger activado o no. Si no, `activate_ledger` debe correrse manualmente con saldos iniciales reales.

3. **Seed `app_role_permissions`** para el módulo Finanzas en PRD (igual que se hizo en DEV).

4. **Probar flujo completo de POS** (apertura caja → venta → cierre) en un ambiente staging (o en DEV con datos de prueba) después de aplicar todas las migraciones pendientes.

5. **Confirmar que `app_user_roles` en PRD** tiene usuarios asignados correctamente. En DEV estaba vacío; los roles de Manager/Admin Operativo no fueron validados.

6. **Documento de rollback:** Para cada migración ⚠️, tener listo el SQL de reversa antes de ejecutar en PRD.

---

## 7. Conclusión

El módulo de Finanzas es **mayoritariamente aditivo** y **no toca** las reglas operativas críticas de POS, caja y mesas. Los riesgos reales están concentrados en 3 migraciones que sí modifican comportamiento existente (finalize_pos_sale, sale financial entries, cash sessions extension). Esas tres deben revisarse a fondo antes de cualquier deploy a PRD.

Las reglas validadas en PRD (caja bloqueada sin sesión, cierre bloqueado con mesas activas, bundles) están codificadas en DB triggers que **el módulo de Finanzas no modifica**. Son estables.
