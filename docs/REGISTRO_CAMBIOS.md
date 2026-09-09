# Registro de Cambios

Este archivo concentra el registro historico de cambios funcionales, tecnicos y operativos liberados en el proyecto.

## 2026-08-11

### Ledger financiero — Fase 7: Reportes (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD`

Resumen:
- 4 RPCs de consulta para reportes del ledger (solo lectura, `security definer`)
- índices de rendimiento en `journal_entries` y `journal_lines`

RPCs de reporte (solo `service_role`):
- `get_account_balances(p_as_of timestamptz)` → saldo por cuenta a fecha dada; balance según tipo (activo/gasto: D-C; pasivo/capital/ingreso: C-D)
- `get_journal_report(p_from_date date, p_to_date date)` → todas las líneas de asientos confirmed en rango; para conciliación
- `get_account_ledger(p_account_code text, p_from_date date, p_to_date date)` → mayor de cuenta con `running_balance` acumulado por ventana
- `get_cash_sessions_report(p_from_date date, p_to_date date)` → sesiones con diferencias, resoluciones y número de asiento de ajuste

Criterio de salida: reportes concilian contra partidas.
- `get_account_balances` suma todas las líneas de asientos confirmed → total_debit = total_credit (el ledger está balanceado)
- `get_account_ledger` permite verificar movimientos de cuenta contra transacciones de origen

Edge Function `financial-operations` — acciones agregadas:
- `get_account_balances` (parámetro `as_of` opcional)
- `get_journal_report` (requiere `from_date` y `to_date`)
- `get_account_ledger` (requiere `account_code`; `from_date`/`to_date` opcionales)
- `get_cash_sessions_report` (`from_date`/`to_date` opcionales)

Migraciones:
- `supabase/migrations/20260811170000_reportes_ledger.sql`

Edge Functions actualizadas:
- `supabase/functions/financial-operations/index.ts`

---

### Ledger financiero — Fase 6: Fondos y reversas (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD`

Resumen:
- traspasos entre Caja operativa / Caja fuerte / Banco
- aportaciones y retiros del propietario (retiros desde Caja operativa prohibidos)
- reversas autorizadas de asientos (sin edición destructiva)
- resolución de diferencias pendientes de sesiones de caja

Tablas nuevas:
- `financial_authorizations` — autorizaciones para retiros y reversas; autorizador ≠ solicitante
- `cash_discrepancy_resolutions` — una resolución por sesión cerrada con diferencia pendiente

RPCs nuevas (todas `security definer`, solo `service_role`):
- `record_transfer(from_code, to_code, amount, description, performed_by, idempotency_key)` → JE tipo `transfer`; cuentas válidas: 1101/1102/1103; 1101 requiere sesión abierta
- `record_owner_contribution(destination_code, amount, description, performed_by, idempotency_key)` → débito destino, crédito 3101; 1101 requiere sesión abierta
- `record_owner_withdrawal(source_code, amount, description, performed_by, authorized_by, idempotency_key)` → prohibido desde 1101; débito 3102, crédito fuente; requiere autorizador distinto
- `reverse_journal_entry(journal_entry_id, authorized_by, justification, performed_by, idempotency_key)` → solo asientos confirmed; espejo con débito↔crédito invertidos; original → `reversed`; autorizador ≠ creador original
- `resolve_cash_discrepancy(cash_session_id, resolution_type, amount, motive, performed_by, idempotency_key)` → shortage=5101↔1101; surplus=1101↔4102; una resolución por sesión

Mapa contable Fase 6:
| Operación | Débito | Crédito |
|---|---|---|
| Traspaso | Cuenta destino | Cuenta origen |
| Aportación propietario | Cuenta destino | 3101 Aportaciones |
| Retiro propietario | 3102 Retiros | Cuenta fuente |
| Reversa | Espejo invertido | Espejo invertido |
| Faltante de caja | 5101 Faltantes | 1101 Caja operativa |
| Sobrante de caja | 1101 Caja operativa | 4102 Sobrantes |

Trazabilidad garantizada:
- ningún asiento confirmado se modifica (solo status → `reversed`)
- `financial_authorizations` registra quién autorizó, cuándo y por qué
- `cash_discrepancy_resolutions` vincula la sesión con el asiento de ajuste
- idempotencia por scope: `transfer`, `contribution`, `withdrawal`, `reversal`, `discrepancy`

Edge Function `financial-operations` — acciones agregadas:
- `record_transfer`, `record_owner_contribution`, `record_owner_withdrawal`
- `reverse_journal_entry` (solo Superadministrador)
- `resolve_cash_discrepancy`

Migraciones:
- `supabase/migrations/20260811160000_fondos_reversas.sql`

Edge Functions actualizadas:
- `supabase/functions/financial-operations/index.ts`

---

### Ledger financiero — Fase 5: Compras y gastos (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD`

Resumen:
- compras y gastos crean asientos del ledger cuando está activo
- RPC atómica: compra + inventario + asiento en una sola transacción
- fix auth `erp-operations`: reemplaza `/auth/v1/user` por `requestClient.auth.getUser()`

Cuenta nueva:
- `5201 Gastos operativos generales` (tipo `expense`, sistema)

Cambios en `purchases`:
- `purchases.financial_operation_id uuid` → FK a `financial_operations`
- `purchases.journal_entry_id uuid` → FK a `journal_entries`

Nueva RPC `create_purchase_with_ledger`:
- reemplaza inserción multi-paso de `erp-operations` (purchases + purchase_items + inventory loop)
- el trigger `tr_update_inventory_on_purchase` actualiza inventario automáticamente
- si ledger activo y pago proporcionado:
  - débito 1201 para ítems con material (mercancía)
  - débito 5201 para ítems sin material (gasto libre / Proveedor General)
  - crédito 1101 (Efectivo) o 1103 (Tarjeta/Transferencia)
  - `journal_entries` confirmed, `financial_operations`, `financial_payments`
  - vincula `purchases.financial_operation_id` y `purchases.journal_entry_id`
- si ledger inactivo o sin pago → solo compra + inventario (backwards compatible)
- idempotencia opcional por `p_idempotency_key`
- pago en Efectivo requiere sesión de caja abierta

Fix `erp-operations`:
- eliminada función `resolveAuthenticatedUser` (usaba `/auth/v1/user` legacy)
- ahora usa `requestClient = createClient(url, anonKey, {Authorization: ...})`
- `requestClient.auth.getUser()` para verificar sesión (patrón estándar)
- `adminClient` sigue usando `serviceRoleKey` solo para ops de DB
- acepta `payment: {method, amount}` opcional en body de `record_purchase`
- acepta `idempotency_key` opcional en body de `record_purchase`

Criterio de salida:
- compra mercancía (proveedor real) + asiento 1201/pago conciliable
- gasto libre (Proveedor General) + asiento 5201/pago conciliable
- compra mixta (ítems con y sin material_id) → débitos divididos entre 1201 y 5201

Migraciones:
- `supabase/migrations/20260811150000_purchase_financial_entries.sql`

Edge Functions actualizadas:
- `supabase/functions/erp-operations/index.ts`

Deploy requerido:
- `erp-operations` debe redesplegarse con `--no-verify-jwt` en DEV antes de pruebas

---

### Ledger financiero — Fase 4: Ventas (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD`

Resumen:
- ventas multi-pago (Efectivo / Tarjeta / Transferencia / mezcla) atómicas
- ledger: asiento de ingreso creado junto con la venta cuando el ledger está activo
- idempotencia opcional por clave en `finalize_pos_sale`
- backwards-compatible: llamadas con `payment_method` (formato anterior) siguen funcionando

Tablas nuevas:
- `financial_operations` — documento de negocio genérico (venta, compra, gasto...)
- `financial_payments` — desglose de cobros por operación y método

Cambios en `sales`:
- `sales.financial_operation_id uuid` → FK a `financial_operations`
- `sales.journal_entry_id uuid` → FK a `journal_entries`

Cambios en RPC `finalize_pos_sale`:
- firma anterior `(uuid, jsonb, text, uuid)` eliminada
- nueva firma `(uuid, jsonb, jsonb, uuid, text)`:
  - `p_payments jsonb` — array `[{method, amount}]` con uno o más métodos
  - `p_idempotency_key text` — opcional; misma clave + mismo payload → resultado original
- si hay componente `Efectivo` → requiere caja abierta (misma regla anterior)
- si solo Tarjeta/Transferencia → sin requisito de caja; `cash_session_id = NULL`
- si ledger activo y venta post-cutover:
  - crea `journal_entry` (tipo `sale`, confirmed)
  - débito: 1101 Caja operativa (Efectivo) o 1103 Banco (Tarjeta/Transferencia)
  - crédito: 4101 Ingresos por ventas (total)
  - crea `financial_operation` y `financial_payments`
  - vincula `sales.financial_operation_id` y `sales.journal_entry_id`
  - registra `audit_events` con snapshot
- si ledger inactivo → solo venta + inventario (comportamiento anterior)

Cambios en Edge Function `pos-operations`:
- acepta `payments: [{method, amount}]` en body (nuevo formato)
- acepta `idempotency_key: string` en body (opcional)
- fallback legacy: si no viene `payments`, construye `[{method: payment_method, amount: total}]`
- valida métodos (efectivo/tarjeta/transferencia) y totales antes de llamar al RPC

Restricciones:
- `financial_payments.payment_method` CHECK en `('Efectivo', 'Tarjeta', 'Transferencia')`
- `financial_operations.operation_type` CHECK enum cerrado
- `financial_operations.total_amount > 0`
- `financial_payments.amount > 0`

Migraciones:
- `supabase/migrations/20260811140000_sale_financial_entries.sql`

Edge Functions actualizadas:
- `supabase/functions/pos-operations/index.ts`

Criterio de salida verificado:
- venta efectivo / solo tarjeta / mixta son atómicas (venta + inventario + asiento en una transacción)

---

### Ledger financiero — Fase 3: Caja (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD`

Resumen:
- `cash_sessions` extendida con doble conteo y diferencias
- `cash-operations` implementa flujo de primer conteo → diferencia → segundo conteo

Cambios de esquema:
- `cash_sessions.first_counted_cash numeric(14,2)` nullable — primer conteo del cajero
- `cash_sessions.final_counted_cash numeric(14,2)` nullable — segundo conteo si hubo diferencia
- `cash_sessions.difference_amount numeric(14,2)` nullable — `counted - expected` (negativo=faltante)
- status CHECK extendido: agrega `'closed_with_pending_difference'`

Cambios en Edge Function `cash-operations`:
- `close_cash_session` ahora requiere `counted_cash` en body
  - Si `counted == expected` → cierre normal (status=`closed`)
  - Si difieren → guarda `first_counted_cash`, mantiene sesión abierta, devuelve `close_result: 'difference_detected'`
- Nueva acción `submit_recount` con `second_counted_cash`
  - Si coincide → cierre normal
  - Si persiste diferencia → cierre con `closed_with_pending_difference`
- `serializeSession` expone los 3 nuevos campos numéricos

Restricciones verificadas:
- Columnas `numeric(14,2)` nullable confirmadas
- `closed_with_pending_difference` aceptado por constraint
- Status inválido rechazado
- `difference_amount` negativo aceptado (faltante)

Migraciones:
- `supabase/migrations/20260811130000_extend_cash_sessions_ledger.sql`

Edge Functions actualizadas:
- `supabase/functions/cash-operations/index.ts`

Nota:
- El cálculo de `expected_cash` sigue siendo `opening_amount + salesCashTotal` (sin ledger aún).
  Fase 4 actualizará el cálculo a usar `journal_lines` cuando el ledger esté activo.
- La resolución de diferencias pendientes (`cash_discrepancy_resolutions`) es Fase 6.
- La apertura de caja no crea asiento (mismo comportamiento).

---

### Ledger financiero — Fase 2: Activación (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD`

Resumen:
- RPC `activate_ledger` — atómica, idempotente, solo Superadministrador
- tabla `bank_reconciliation_items` — partidas bancarias pendientes al corte
- Edge Function `financial-operations` — acciones `activate_ledger` y `get_ledger_status`

Restricciones verificadas:
- saldo total = 0 rechazado
- sin Superadministrador rechazado
- sin sesión de caja abierta (precondición)
- sin mesas ocupadas (precondición)
- asiento inicial balanceado (débitos = créditos = $17,500 en test)
- idempotencia: misma clave + mismo payload → resultado original
- idempotencia: misma clave + payload distinto → conflicto
- segunda activación rechazada

Migraciones:
- `supabase/migrations/20260811110000_activate_ledger_rpc.sql`

Edge Functions:
- `supabase/functions/financial-operations/index.ts` (nueva)

Deploy requerido:
- `financial-operations` deploy con `--no-verify-jwt` antes de activar en PRD

---

### Ledger financiero — Fase 1: Base financiera (DEV)

Estado:
- liberado en `DEV`
- pendiente de release a `PRD` (requiere aprobación explícita)

Resumen:
- se creó el esquema base del ledger de doble partida en DEV
- 6 tablas nuevas, 2 triggers, seed de 10 cuentas del sistema
- no modifica tablas ni migraciones existentes

Tablas nuevas:
- `financial_accounts` — catálogo de cuentas con protección de cuentas sistema
- `ledger_settings` — singleton de configuración del ledger (`id = true`)
- `journal_entries` — cabecera inmutable de asientos contables
- `journal_lines` — partidas con restricciones de doble partida
- `idempotency_requests` — claves de idempotencia por scope
- `audit_events` — bitácora de eventos financieros (separada de `audit_log`)

Cuentas sistema seeded:
- 1101 Caja operativa, 1102 Caja fuerte, 1103 Banco (activo)
- 1201 Compras de mercancía por aplicar, 1202 Adquisiciones por clasificar (activo transitorio)
- 4101 Ingresos por ventas, 4102 Sobrantes de caja (ingreso)
- 5101 Faltantes de caja (gasto)
- 3101 Aportaciones del propietario, 3102 Retiros del propietario (capital)

Restricciones verificadas:
- trigger `trg_assert_journal_entry_balanced`: rechaza confirmación de asiento desbalanceado
- trigger `trg_protect_system_accounts`: impide eliminar cuentas sistema
- CHECK `ledger_settings_singleton`: solo permite una fila (`id = true`)
- CHECK `journal_lines_one_side_required`: cada línea tiene cargo O abono, no ambos ni cero
- UNIQUE `(scope, idempotency_key)` en `idempotency_requests`

Migraciones:
- `supabase/migrations/20260810200000_base_financial_schema.sql`

Documentos:
- `docs/FASE0_IMPACTO_LEDGER.md` — inventario de impacto aprobado

Próxima fase:
- Fase 2: Activación del ledger (RPC `activate_ledger`)

## 2026-05-04

### POS: Cubeta virtual

Estado:
- liberado en `DEV`
- liberado en `PRD`
- validado tecnicamente en frontend y backend

Resumen:
- se agrego `Cubeta` como bundle virtual en el POS, sin crear material nuevo en maestro
- la cubeta solo se puede armar con 10 piezas exactas de una lista cerrada de SKU de categoria `Cerveza`
- el precio de venta de la cubeta se fijo en `$320.00`
- el ticket muestra solo el concepto `Cubeta`
- el consumo de inventario se mantiene sobre las 10 piezas reales

Frontend:
- se agrego una tarjeta especial `Cubeta` en el catalogo del POS
- la tarjeta abre un modal de armado con seleccion exacta de 10 piezas
- el modal valida stock disponible por SKU en tiempo real
- la cuenta activa muestra resumen de cubeta para operar el carrito
- el ticket local, PDF e impresion muestran solo el concepto `Cubeta`

Backend:
- `pos-operations` ahora preserva metadatos opcionales de bundle en `table_orders.items`
- `finalize_sale` valida:
  - solo SKU permitidos
  - misma base de precio en todos los SKU del bundle
  - 10 piezas exactas por cubeta
  - total fijo de `$320.00`
- la venta se persiste con `sale_items` reales y `inventory_movements` reales

Archivos/versionado:
- commit principal: `899b65d` `feat: add Cubeta bundle flow to POS`
- `src/pages/POS.jsx`
- `supabase/functions/pos-operations/index.ts`

Despliegue:
- frontend liberado por flujo `local -> GitHub -> Vercel`
- `pos-operations` desplegada en `PRD`
- `pos-operations` en `PRD`: version `11`, actualizado `2026-05-05 05:01:57 UTC`

Validacion:
- `npx eslint src/pages/POS.jsx`: OK
- `npm run build`: OK
- verificacion de Supabase Functions en `PRD`: `pos-operations` activa

Notas:
- `npm run lint` sigue fallando por errores previos no relacionados en `src/api/cashControlService.js`

### POS: Barra 4

Estado:
- liberado en `DEV`
- liberado en `PRD`
- validado funcionalmente en `DEV`

Resumen:
- se agrego una estacion adicional `Barra 4` en el layout operativo del POS
- la nueva barra reutiliza la misma funcionalidad que las demas estaciones porque el POS consume dinamicamente el catalogo de `public.tables`

Base de datos:
- se versiono un script idempotente para insertar `Barra 4` con estado `libre`

Archivos/versionado:
- scripts SQL:
  - `sql/dev/2026-05-04_add_barra_4.sql`
  - `sql/prod/2026-05-04_add_barra_4.sql`

Despliegue:
- SQL aplicado en `DEV`
- SQL aplicado en `PRD`

Validacion:
- `DEV` muestra `Barra 1`, `Barra 2`, `Barra 3`, `Barra 4`
- `PRD` muestra `Barra 1`, `Barra 2`, `Barra 3`, `Barra 4`

## 2026-04-20

### Compras: Proveedor General

Estado:
- liberado en `DEV`
- liberado en `PRD`
- validado funcionalmente en ambos ambientes

Resumen:
- se agrego `Proveedor General` como proveedor fijo y real en compras
- cuando se selecciona `Proveedor General`, el modulo permite capturar conceptos libres sin `material_id`
- estas compras se registran contablemente en `purchases` y `purchase_items`
- los renglones libres no generan movimientos de inventario ni alteran `inventory`

Frontend:
- `PurchaseEntry` ahora soporta dos modos:
  - proveedor normal con selector de material
  - `Proveedor General` con descripcion libre, cantidad y costo
- se agrego el boton `Check` antes de `Procesar Factura Completa`
- el `Check` usa un modal nativo de la app para revisar proveedor, folio, total y renglones
- se elimino la confirmacion nativa del navegador al cambiar proveedor con items capturados y se reemplazo por modal nativo
- se bloqueo el doble click durante el guardado con estado `Procesando...`

Backend:
- `erp-operations` soporta compras estandar y compras de `Proveedor General`
- para `Proveedor General`, `material_id` puede ir `null` y `item_description` es obligatorio
- se agrego defensa anti-duplicado en backend con ventana corta de 120 segundos usando:
  - proveedor
  - centro
  - folio
  - total
  - fingerprint de renglones

Base de datos:
- `purchase_items.item_description` agregado como `text not null default ''`
- script idempotente para asegurar existencia de `Proveedor General` en `providers`

Reportes y lectura:
- el detalle de compras ya soporta renglones sin material asociado
- `MaterialMovements` ignora renglones libres al cargar ajustes basados en factura

Archivos/versionado:
- commit principal: `71896d5` `feat: support general provider purchases`
- migracion:
  - `supabase/migrations/20260419170000_support_general_provider_purchases.sql`
- scripts SQL:
  - `sql/dev/2026-04-19_support_general_provider_purchases.sql`
  - `sql/prod/2026-04-19_support_general_provider_purchases.sql`

Despliegue:
- frontend liberado por flujo `local -> GitHub -> Vercel`
- `erp-operations` desplegada en `DEV` y `PRD`
- SQL aplicado en `DEV` y `PRD`

Validacion:
- `npm run lint`: OK
- `npm run build`: OK
- pruebas funcionales en `PRD`: OK

Notas:
- el cambio local visual de `src/index.css` para marcar `Development` no forma parte de esta liberacion
- futuros registros deben agregarse en este mismo archivo
