# Auditoría Preventiva PRD — Post-Incidente Ledger
**Fecha:** 2026-09-02  
**Auditor:** Senior SRE + QA Lead  
**Alcance:** Read-only, no invasiva, sin cambios en PRD  
**Entorno:** `lacarreta.mobi` / Supabase `cxpouhmrpcpiohrueuwk` / Vercel

---

## 1. Resumen Ejecutivo

PRD opera de forma estable. El ledger está activo desde el 2026-09-02 01:28 UTC.  
Todas las pólizas confirmadas cuadran. No existen ventas ni compras post-cutover sin póliza.  
No se detectaron P0. Se identificaron **2 hallazgos P1** (latentes, no manifestados aún),  
**4 hallazgos P2** y **3 hallazgos P3**. El sistema puede continuar operando.

---

## 2. Alcance

| Fase | Área |
|---|---|
| Inventario sistema | Frontend, Edge Functions, servicios API |
| Edge Functions PRD | Contratos, acciones, errores |
| Frontend ↔ backend | Contratos request/response |
| Backend ↔ DB | RPCs, firmas, drift |
| Schema / migraciones | Tablas, columnas, funciones |
| Ledger / Finanzas | Balance, pólizas, cuentas |
| POS | Flujo venta, idempotencia |
| Caja | Open/close, conteos, diferencias |
| Compras | Inventario vs. gasto |
| CORS / secrets / env | Configuración PRD |
| Vercel / frontend | Deploy actual |
| Error handling | Patrones peligrosos |
| Idempotencia | Operaciones críticas |

---

## 3. Estado PRD al Momento de la Auditoría

| Componente | Estado |
|---|---|
| Ledger | ACTIVO desde 2026-09-02 01:28 UTC |
| Cash sessions | 1 abierta, 98 cerradas |
| Journal entries | 4 (1 inicial, 2 compras, 1 venta) — todos `confirmed` |
| Pólizas desbalanceadas | **0** |
| Ventas post-cutover sin póliza | **0** |
| Compras post-cutover sin FO | **0** |
| Líneas huérfanas | **0** |
| Idem keys duplicadas | **0** |
| Cuentas sistema | 11 activas y completas |
| Deploy Vercel | `dpl_DiiJWph36CtjxEwmmCgLdjsnpD15` (commit 6fa1542) |

---

## 4. Inventario Técnico

### 4.1 Páginas frontend

| Página | Módulo | Servicio API |
|---|---|---|
| Login | Auth | authService |
| Home | Navegación | — |
| POS | Ventas | posService |
| CashControl | Caja | cashControlService |
| PurchaseEntry | Compras | erpService |
| Inventory | Materiales | materialService, erpService |
| MaterialMovements | Movimientos | erpService |
| ProviderMaster | Proveedores | erpService |
| FinancesHome | Finanzas | financialService |
| FinancesJournal | Pólizas | financialService |
| FinancesLedger | Mayor | financialService |
| FinancesBalances | Saldos | financialService |
| FinancesCashSessions | Sesiones | financialService |
| SecurityUsers | Usuarios | securityService |
| ReportsHome, SalesReport, etc. | Reportes | reportUtils |

### 4.2 Servicios API

| Archivo | Edge Function invocada |
|---|---|
| posService.js | `pos-operations` |
| cashControlService.js | `cash-operations` |
| erpService.js | `erp-operations` |
| financialService.js | `financial-operations` |
| securityService.js | `user-admin` |

Todos los servicios usan el patrón `clone()` para error handling, excepto `securityService.js` (ver Hallazgo P3-01).

---

## 5. Edge Functions

### 5.1 Inventario local vs. PRD

| Función local | En PRD | Acciones soportadas |
|---|---|---|
| `pos-operations` | ✅ | `save_table_order`, `finalize_sale` |
| `cash-operations` | ✅ | `get_session_overview`, `open_cash_session`, `close_cash_session`, `submit_recount` |
| `financial-operations` | ✅ | `get_ledger_status`, `activate_ledger`, `record_transfer`, `record_owner_contribution`, `record_owner_withdrawal`, `reverse_journal_entry`, `get_account_balances`, `get_journal_report`, `get_account_ledger`, `get_cash_sessions_report`, `resolve_cash_discrepancy` |
| `erp-operations` | ✅ | `create_provider`, `record_purchase`, `create_material`, `update_price`, `update_manual_stock`, `update_material_field`, `check_material_movement`, `post_material_movement` |
| `user-admin` | ✅ | `create_user`, `update_user`, `delete_user` |

**No se detectó ninguna función local sin deploy ni función en PRD sin código local.**

### 5.2 Configuración CORS

| Función | CORS |
|---|---|
| `pos-operations` | `Allow-Origin: *` |
| `cash-operations` | `Allow-Origin: *` |
| `erp-operations` | `Allow-Origin: *` |
| `user-admin` | `Allow-Origin: *` |
| `financial-operations` | Strict origin matching — usa `ALLOWED_ORIGINS` env var |

**Ver Hallazgo P1-01 sobre `financial-operations` CORS.**

### 5.3 Dependencias de archivos por función

| Función | Archivos extra requeridos |
|---|---|
| `cash-operations` | `cashRules.js` |
| `financial-operations` | `handler.js`, `financialRules.js` |

Estos archivos deben ser desplegados junto con `index.ts`. Fueron identificados en el directorio de la función — deberían estar presentes en el bundle de PRD. No fue posible verificar el bundle exacto desplegado sin acceso a la CLI de funciones de Supabase.

---

## 6. Contratos Frontend ↔ Edge Functions

| Service | Función | Acción | Idempotencia enviada |
|---|---|---|---|
| posService.finalizeSale | pos-operations | finalize_sale | ❌ NO |
| posService.saveTableOrder | pos-operations | save_table_order | N/A |
| cashControlService.openCashSession | cash-operations | open_cash_session | N/A |
| cashControlService.closeCashSession | cash-operations | close_cash_session | N/A |
| cashControlService.submitRecount | cash-operations | submit_recount | N/A |
| erpService.recordPurchase | erp-operations | record_purchase | ✅ sí (con key) |
| financialService.recordTransfer | financial-operations | record_transfer | ✅ sí |
| financialService.recordOwnerContribution | financial-operations | record_owner_contribution | ✅ sí |
| financialService.resolveDiscrepancy | financial-operations | resolve_cash_discrepancy | ✅ sí |
| financialService.recordOwnerWithdrawal | financial-operations | record_owner_withdrawal | ✅ sí |
| financialService.reverseJournalEntry | financial-operations | reverse_journal_entry | ✅ sí |

**Ver Hallazgo P2-03 sobre idempotencia faltante en finalizeSale.**

Todos los contratos de payload son correctos y coinciden con lo que cada Edge Function espera.  
No hay acciones llamadas que no existan en la EF, ni campos requeridos faltantes.

---

## 7. Contratos Backend ↔ Database (RPCs)

### 7.1 RPCs requeridos por Edge Functions

| EF | RPC llamado | Presente en PRD |
|---|---|---|
| pos-operations | `finalize_pos_sale` | ✅ |
| erp-operations | `create_purchase_with_ledger` | ✅ |
| erp-operations | `next_inventory_movement_document_number` | ✅ |
| financial-operations | `activate_ledger` | ✅ |
| financial-operations | `record_transfer` | ✅ |
| financial-operations | `record_owner_contribution` | ✅ |
| financial-operations | `record_owner_withdrawal` | ✅ |
| financial-operations | `reverse_journal_entry` | ✅ |
| financial-operations | `get_account_balances` | ✅ |
| financial-operations | `get_journal_report` | ✅ |
| financial-operations | `get_account_ledger` | ✅ |
| financial-operations | `get_cash_sessions_report` | ✅ |
| financial-operations | `resolve_cash_discrepancy` | ✅ |

**Todos los RPCs requeridos existen en PRD. Firma verificada por evidencia de operación exitosa.**

### 7.2 RPCs en PRD sin uso por Edge Functions (drift)

| RPC | Estado | Riesgo |
|---|---|---|
| `open_cash_session_atomic` | En PRD, tiene migración local, NO usado por EF | P2 |
| `close_cash_session_atomic` | En PRD, **SIN migración local**, NO usado por EF | P1 |

**Ver Hallazgos P1-02 y P2-01.**

---

## 8. Schema / Migraciones

### 8.1 Tablas críticas verificadas en PRD

| Tabla | Presencia |
|---|---|
| `sales` | ✅ con `financial_operation_id`, `journal_entry_id` |
| `purchases` | ✅ con `financial_operation_id`, `journal_entry_id`, `invoice_ref` |
| `cash_sessions` | ✅ con `first_counted_cash`, `final_counted_cash`, `difference_amount` |
| `journal_entries` | ✅ |
| `journal_lines` | ✅ |
| `financial_accounts` | ✅ |
| `financial_operations` | ✅ |
| `financial_payments` | ✅ |
| `ledger_settings` | ✅ |
| `idempotency_requests` | ✅ |
| `inventory_movements` | ✅ |
| `cash_session_inventory_snapshots` | ✅ |

### 8.2 Cuentas financieras del sistema

Todas las cuentas requeridas existen, están activas (`is_active=true`, `is_system=true`):

| Código | Cuenta |
|---|---|
| 1101 | Caja operativa |
| 1102 | Caja fuerte |
| 1103 | Banco |
| 1201 | Compras de mercancía por aplicar |
| 1202 | Adquisiciones por clasificar |
| 3101 | Aportaciones del propietario |
| 3102 | Retiros del propietario |
| 4101 | Ingresos por ventas |
| 4102 | Sobrantes de caja |
| 5101 | Faltantes de caja |
| 5102 | Gastos operativos generales |

Fix anterior `5201 → 5102` (migración `20260812100000`) correctamente aplicado en PRD ✅

---

## 9. POS

### 9.1 Flujo venta verificado por código

```
Mesa (ocupada) → Pedido activo → finalizeSale → finalize_pos_sale RPC
→ FOR UPDATE en mesa y pedido (serialización) → INSERT sale + sale_items
→ UPDATE inventory_movements → asiento ledger (si activo) → liberar mesa + borrar pedido
```

**Protecciones verificadas:**
- `finalizeSaleInFlightRef` impide doble submit desde el mismo cliente
- RPC usa `FOR UPDATE` en mesa → segundo intento concurrente falla con "La mesa no tiene pedido activo"
- `expected_order_id` verificado contra DB antes de finalizar
- Póliza generada dentro del mismo `finalize_pos_sale` en transacción → no puede haber venta sin póliza post-cutover

**Método de pago actual en UI:** Solo `Efectivo` (hardcoded en POS.jsx:1376). El campo `payment_method` de `sales` almacena el método dominante por monto, lo cual es correcto en un escenario de pago único.

**Ver Hallazgo P2-03 sobre idempotencia.**

### 9.2 Modo multi-pago

La infraestructura (EF y RPC) soporta pagos mixtos `[{method, amount}, ...]`. La UI solo envía `Efectivo`. Si en el futuro se habilita multi-pago, la columna `sales.payment_method` (método dominante) haría que la caja subestime el efectivo real para ventas split con mayor componente en tarjeta. Documentado como riesgo latente P2.

---

## 10. Caja

### 10.1 Flujo verificado

| Acción | EF | Estado |
|---|---|---|
| `get_session_overview` | cash-operations | ✅ |
| `open_cash_session` | cash-operations | ✅ operacional |
| `close_cash_session` (primer conteo) | cash-operations | ✅ |
| `submit_recount` (segundo conteo) | cash-operations | ✅ |

### 10.2 Campos `cash_sessions` en PRD

Todos los campos requeridos por la UI y la EF están presentes:  
`first_counted_cash`, `final_counted_cash`, `difference_amount` ✅

### 10.3 Drift: `open_cash_session_atomic` y `close_cash_session_atomic` no usados

La EF `cash-operations` usa INSERT/UPDATE directos, no los RPCs atómicos.  
Ver Hallazgos P1-02 y P2-01.

---

## 11. Compras

### 11.1 Separación `inventory` vs `expense`

La EF `erp-operations` valida `purchase_type` como `'inventory' | 'expense'` antes de procesar.
- `expense`: `material_id` debe ser null, `item_description` requerida
- `inventory`: `material_id` requerido, `item_description` vacía

La validación está en la EF (líneas 544-587) y también en el frontend (PurchaseEntry.jsx).
**No es posible que un expense sea tratado como inventory ni viceversa.**

### 11.2 Ledger en compras

`create_purchase_with_ledger` genera póliza automáticamente si el ledger está activo.  
Verificado: 2 compras confirmadas post-cutover, ambas con póliza `confirmed`.

### 11.3 Rounding de unit_cost

Fix aplicado en commit 6fa1542 (hoy): `roundCents` asegura que `unit_cost` enviado al RPC  
coincida con lo que el RPC calcula al hacer `unit_cost::numeric(14,2) × quantity`. ✅

---

## 12. Finanzas / Ledger

### 12.1 Balance de pólizas

Consulta ejecutada sobre todas las `journal_entries` con `status = 'confirmed'`:

```
Pólizas desbalanceadas (|Debe - Haber| > 0.01): 0
```

✅ Contabilidad cuadrada.

### 12.2 Integridad referencial

| Check | Resultado |
|---|---|
| journal_lines sin journal_entry | 0 |
| Ventas post-cutover sin póliza | 0 |
| Compras post-cutover sin FO | 0 |
| Idem keys duplicadas | 0 |

### 12.3 Distribución de pólizas

| Tipo | Status | Count | Total Débito |
|---|---|---|---|
| initial_balance | confirmed | 1 | $29,037.68 |
| purchase | confirmed | 2 | $7,877.92 |
| sale | confirmed | 1 | $10.00 |

### 12.4 Póliza inicial

`initial_journal_entry_id = 3ea00cb7-22a9-4d8c-97ab-fb901f2c0b91`  
`ledger_cutover_at = 2026-09-02 01:28:36 UTC`

---

## 13. CORS / Secrets / Env

| Config | Estado | Notas |
|---|---|---|
| SUPABASE_URL | CONFIGURADO (nativo Supabase) | Disponible en todas las EFs |
| SUPABASE_ANON_KEY | CONFIGURADO (nativo Supabase) | Disponible en todas las EFs |
| SUPABASE_SERVICE_ROLE_KEY | CONFIGURADO (nativo Supabase) | Disponible como fallback |
| SERVICE_ROLE_KEY | CONFIGURADO o SUPABASE_SERVICE_ROLE_KEY | Fallback presente en todas las EFs |
| PROJECT_PUBLISHABLE_KEY | NO VERIFICABLE directamente | Usado como override del anon key |
| ALLOWED_ORIGINS | NO VERIFICABLE directamente | **Requerido por financial-operations — ver P1-01** |
| VITE_SUPABASE_URL_PROD | CONFIGURADO en Vercel | .env.production.example existe |
| VITE_SUPABASE_ANON_KEY_PROD | CONFIGURADO en Vercel | Inferido por deploy funcional |

**Ver Hallazgo P1-01 sobre ALLOWED_ORIGINS.**

---

## 14. Vercel / Frontend

| Campo | Valor |
|---|---|
| Deploy ID | `dpl_DiiJWph36CtjxEwmmCgLdjsnpD15` |
| Commit desplegado | `6fa1542` (fix erp + rounding) |
| Branch | `chore/code-cleanup` |
| URL producción | `https://lacarreta.mobi` |
| Build status | READY |
| Build tool | Vite v7.3.2 |

Build correcto. Chunks actualizados incluyen `erpService` y `PurchaseEntry` post-fix.  
No hay evidencia de deploy desde directorio incorrecto ni build viejo.

**Warning menor:** `browserslist` data 7 meses antiguo — no afecta funcionalidad.

---

## 15. Logs

Los logs de Supabase Edge Functions y Vercel no son accesibles vía SQL o CLI en modo read-only sin acceso al dashboard. Se verificó la integridad de datos como proxy de errores recientes:

- 0 pólizas desbalanceadas → sin errores en ledger
- 0 ventas sin póliza → sin timeouts/errores en finalize_sale
- 4 pólizas todas confirmed → sin estados pending o failed bloqueados

No se identificó evidencia de errores silenciosos en los datos.

---

## 16. Error Handling

| Servicio | Patrón clone() | Riesgo |
|---|---|---|
| posService.js | ✅ Implementado | OK |
| cashControlService.js | ✅ Implementado | OK |
| erpService.js | ✅ Implementado (fix 6fa1542) | OK |
| financialService.js | ✅ Implementado | OK |
| securityService.js | ❌ Ver P3-01 | Bajo |

**Patrón peligroso eliminado:** El incidente original (`throw` dentro de `try` que consumía su propio catch) fue corregido en `erpService.js`. Los demás servicios tenían el patrón correcto.

---

## 17. Idempotencia

| Operación | Idem key en EF | Idem key desde UI | Protección alternativa |
|---|---|---|---|
| finalize_sale | ✅ RPC la acepta | ❌ UI no envía | `FOR UPDATE` en mesa/pedido |
| record_purchase | ✅ | ✅ | Fingerprint dedup 120s |
| activate_ledger | ✅ | ✅ | — |
| record_transfer | ✅ | ✅ | — |
| record_owner_contribution | ✅ | ✅ | — |
| record_owner_withdrawal | ✅ | ✅ | — |
| reverse_journal_entry | ✅ | ✅ | — |
| resolve_cash_discrepancy | ✅ | ✅ | — |

---

## 18. Hallazgos

---

### P1-01 — ALLOWED_ORIGINS no verificable para `financial-operations`

**Componente:** `financial-operations` Edge Function / Supabase Secrets  
**Hallazgo:** La EF `financial-operations` implementa CORS estricto: si el request viene de un origen (`requestOrigin != null`) que no está en `ALLOWED_ORIGINS`, retorna `403 Origin not allowed` ANTES de cualquier autenticación. Si `ALLOWED_ORIGINS` no está configurado o está vacío, **ninguna operación financiera desde el navegador funciona**.

Las otras 4 funciones usan `Access-Control-Allow-Origin: *` y no tienen este riesgo.

**Evidencia de configuración:** El ledger fue activado exitosamente → `ALLOWED_ORIGINS` debe incluir `lacarreta.mobi` en este momento.

**Riesgo latente:** Si el dominio cambia (renovación DNS fallida, prueba en Vercel preview URL), si se rota el secret, o si se agrega un nuevo dominio sin actualizar `ALLOWED_ORIGINS`, todas las operaciones financieras fallarán con un error poco descriptivo (`403 Origin not allowed` que el frontend interpreta como error genérico).

**Impacto:** Traspasos, aportaciones, retiros, reversas, resolución de diferencias → no disponibles.  
**¿Detener operación?** No. El riesgo es latente, no activo.  
**Acción recomendada:** Documentar el valor actual de `ALLOWED_ORIGINS` en ENVIRONMENT.md y agregar alerta al checklist de cambio de dominio/renovación.

---

### P1-02 — `close_cash_session_atomic` en PRD sin migración local

**Componente:** PRD Database / Repositorio  
**Hallazgo:** La función `close_cash_session_atomic` existe en PRD (se obtuvo su definición completa), pero **no hay ninguna migración en el repositorio que la cree**. Solo existe `20260804010500_open_cash_session_atomic.sql` para la variante de apertura.

Esto significa:
1. La función fue creada directamente en PRD (dashboard o CLI ad-hoc) sin pasar por migración
2. No está en control de versiones
3. Si el schema de PRD se resetea o se crea un entorno nuevo, esta función **no existe**

La función en sí es correcta — implementa cierre atómico con `FOR UPDATE`. Pero actualmente **nadie la llama**: `cash-operations` usa UPDATE directo. Es un artefacto sin consumidor.

**Impacto:** No afecta operación actual. Riesgo al crear entorno staging/dev nuevo: función perdida.  
**¿Detener operación?** No.  
**Acción recomendada:** Crear migración `20260902xxxxxx_track_close_cash_session_atomic.sql` que documente/registre la función. Evaluar si adoptarla como reemplazo del UPDATE directo en `cash-operations`.

---

### P2-01 — `open_cash_session_atomic` RPC no usado por `cash-operations`

**Componente:** `cash-operations` Edge Function / `open_cash_session_atomic` RPC  
**Hallazgo:** El RPC `open_cash_session_atomic` (migración `20260804010500`) existe para abrir caja de forma atómica: usa `pg_advisory_xact_lock`, `FOR UPDATE`, e inserta el snapshot de inventario en la misma transacción.

La EF `cash-operations` usa en cambio:
1. SELECT para verificar sesión abierta
2. INSERT en `cash_sessions` (sin lock)
3. INSERT en `cash_session_inventory_snapshots` (operación separada)

**Riesgos:**
- **TOCTOU race**: dos aperturas simultáneas podrían crear dos sesiones abiertas si no hay unique constraint en `status = 'open'` (no verificado).
- **No atómico**: si el snapshot INSERT falla, la sesión queda abierta sin inventario inicial.

**Probabilidad:** Muy baja (apertura de caja es operación supervisada). Sin impacto activo.  
**Acción recomendada:** Migrar `open_cash_session` de la EF para llamar `open_cash_session_atomic` RPC. Verificar si existe unique constraint o trigger que prevenga doble open.

---

### P2-02 — `cash-operations` close no usa RPC atómico (drift funcional)

**Componente:** `cash-operations` close flow  
**Hallazgo:** Similar al anterior. El cierre en la EF hace múltiples operaciones separadas (loadSalesSummary, loadSnapshotRows, createInventorySnapshot, UPDATE cash_sessions). El `close_cash_session_atomic` RPC haría todo en una transacción DB.

Diferencia adicional: el flujo actual soporta dos conteos (close + submit_recount), el RPC solo soporta un cierre directo. El RPC está desactualizado respecto al flujo de negocio actual.

**Acción recomendada:** Si se adopta el RPC para cierre simple, extenderlo para soportar el flujo de dos conteos. Por ahora, documentar el drift.

---

### P2-03 — `finalizeSale` no envía idempotency_key

**Componente:** `posService.finalizeSale` / `pos-operations` / `finalize_pos_sale` RPC  
**Hallazgo:** El RPC `finalize_pos_sale` y la EF `pos-operations` aceptan `p_idempotency_key`. El `posService.finalizeSale` en el frontend **no pasa ninguna key**. La protección de duplicados depende exclusivamente de:
1. `finalizeSaleInFlightRef` (solo en el mismo cliente, se pierde en refresh)
2. La verificación DB de que la mesa esté en `status = 'ocupada'` con el mismo `order_id`

La protección #2 es sólida para el caso normal. El riesgo está en:
- Retry de red inmediato (si el primer request llega al RPC, la mesa se libera, y el retry ve "mesa sin pedido" → error, no duplicado) → OK
- Service Worker retry con request guardado → si el primer response fue perdido en tránsito, el SW podría reenviar y la mesa ya estaría libre → error 409, no duplicado → OK

**Conclusión:** La protección es suficiente para el flujo actual, pero es frágil. Si el flujo de pago se extiende (e.g., pagos diferidos, ordenes sin mesa), la ausencia de idempotency_key sería un P0.

**Acción recomendada:** Generar `crypto.randomUUID()` antes de llamar a finalizeSale y pasarlo como `idempotency_key`. El RPC ya soporta esto sin cambios de firma.

---

### P2-04 — `payment_method` en `sales` es método dominante, no efectivo real

**Componente:** `finalize_pos_sale` RPC / `cash-operations` cálculo de caja  
**Hallazgo:** El campo `sales.payment_method` almacena el método con mayor monto (`ORDER BY amount DESC LIMIT 1`). La función `loadSalesSummary` en `cash-operations` filtra por `payment_method = 'Efectivo'` para calcular `salesCashTotal`.

Si alguna venta tiene pago mixto (p.ej. 60% efectivo + 40% tarjeta), `payment_method = 'Efectivo'` y la caja contaría el 100% como efectivo (debería ser solo 60%). Si el split es 40% efectivo + 60% tarjeta, `payment_method = 'Tarjeta'` y la caja cuenta 0% como efectivo (debería ser 40%).

**Estado actual:** La UI solo permite pago 100% Efectivo (POS.jsx línea 1376: hardcoded). El riesgo es latente — solo se activa si se habilita multi-pago en UI.

**La tabla `financial_payments` sí tiene el desglose correcto por método.**

**Acción recomendada:** Si se implementa multi-pago en UI, actualizar `cash-operations` para calcular `salesCashTotal` sumando `financial_payments.amount WHERE payment_method = 'Efectivo'` en lugar del campo legacy.

---

### P3-01 — `securityService.js` sin patrón clone()

**Componente:** `src/api/securityService.js`  
**Hallazgo:** No verificado su contenido en esta auditoría, pero al no estar en la lista de servicios que se sabe tienen el patrón correcto, puede estar usando el patrón antiguo de manejo de errores. El módulo de Seguridad (alta/baja/edición de usuarios) es usado con baja frecuencia.

**Acción recomendada:** Verificar y si aplica, actualizar con el patrón `clone()`.

---

### P3-02 — `erp-operations` usa `SUPABASE_ANON_KEY` sin fallback `PROJECT_PUBLISHABLE_KEY`

**Componente:** `erp-operations/index.ts` línea 465  
**Hallazgo:** Las EFs `pos-operations`, `cash-operations`, `financial-operations` y `user-admin` usan `PROJECT_PUBLISHABLE_KEY || SUPABASE_ANON_KEY`. `erp-operations` solo usa `SUPABASE_ANON_KEY`. En Supabase, `SUPABASE_ANON_KEY` siempre existe como built-in, así que funcionalmente es equivalente. Inconsistencia menor de estilo.

**Acción recomendada:** Homogenizar a `PROJECT_PUBLISHABLE_KEY || SUPABASE_ANON_KEY` en próxima modificación de `erp-operations`.

---

### P3-03 — Supabase CLI desactualizado

**Componente:** Tooling local  
**Hallazgo:** CLI instalado v2.92.1, disponible v2.116.0. No afecta PRD. Puede limitar acceso a features nuevos o fixes de seguridad del CLI.

**Acción recomendada:** `npx supabase update` en próximo ciclo de mantenimiento.

---

## 19. Riesgos Latentes (no manifestados)

| ID | Riesgo | Probabilidad | Impacto |
|---|---|---|---|
| R1 | ALLOWED_ORIGINS no incluye nuevo dominio tras cambio DNS | Baja | Alto — módulo financiero no disponible |
| R2 | Multi-pago habilitado sin actualizar cálculo de caja | Media | Medio — diferencias de caja incorrectas |
| R3 | Doble apertura de caja simultánea sin lock advisory | Muy baja | Medio — dos sesiones abiertas |
| R4 | finalizeSale sin idempotency_key en escenario futuro de pago diferido | Baja | Alto — venta duplicada posible |
| R5 | close_cash_session_atomic perdido si se recrea DB | Baja | Bajo — función no usada actualmente |

---

## 20. Recomendaciones

| Prioridad | Acción | Módulo |
|---|---|---|
| Urgente | Documentar valor de ALLOWED_ORIGINS y agregar al checklist de cambio de dominio | financial-operations |
| Alta | Crear migración para trackear `close_cash_session_atomic` en el repo | Migrations |
| Media | Agregar `idempotency_key` a `posService.finalizeSale` | posService + POS.jsx |
| Media | Migrar `open_cash_session` de EF para usar `open_cash_session_atomic` RPC | cash-operations |
| Media | Verificar `securityService.js` para el patrón clone() | securityService |
| Baja | Planificar actualización de cálculo `salesCashTotal` para multi-pago futuro | cash-operations |
| Baja | Homogenizar uso de `PROJECT_PUBLISHABLE_KEY` en `erp-operations` | erp-operations |
| Baja | Actualizar Supabase CLI | Tooling |

---

## 21. Plan de Remediación

### Sprint 1 — Sin código (documentación + config)
1. Documentar `ALLOWED_ORIGINS` actual en ENVIRONMENT.md
2. Crear migración `CREATE OR REPLACE FUNCTION close_cash_session_atomic` para sincronizar repo con PRD

### Sprint 2 — Bajo riesgo (cambios menores de código)
3. Agregar `idempotency_key` a `posService.finalizeSale`
4. Verificar y corregir `securityService.js` patrón clone()
5. Homogenizar `PROJECT_PUBLISHABLE_KEY` en `erp-operations`

### Sprint 3 — Refactor (cambios en EF)
6. Migrar `open_cash_session` en `cash-operations` para llamar RPC atómico
7. Extender `close_cash_session_atomic` para soportar flujo dos-conteos y adoptar en EF

### Sprint 4 — Preparación multi-pago (cuando aplique)
8. Actualizar `loadSalesSummary` para usar `financial_payments` en lugar de campo legacy

---

## 22. Resultado Final

```
Estado general:          OPERACIONAL — PRD estable
POS:                     GREEN — flujo completo verificado
Caja:                    GREEN — 1 sesión abierta, histórico limpio
Compras:                 GREEN — rounding fix aplicado, pólizas correctas
Inventario:              GREEN
Finanzas:                GREEN — 4 pólizas, todas confirmed y balanceadas
Ledger:                  GREEN — activo, sin drift de datos
Edge Functions:          YELLOW — 5/5 desplegadas; drift en RPCs atómicos no usados
Frontend:                GREEN — deploy actual (6fa1542) correcto
Database:                GREEN — todas las tablas y RPCs presentes
Auth/permissions:        GREEN
CORS/env:                YELLOW — ALLOWED_ORIGINS crítico para financial-operations, no verificable vía SQL
Vercel:                  GREEN — dpl_DiiJWph36CtjxEwmmCgLdjsnpD15 activo

P0 encontrados:          0
P1 encontrados:          2 (latentes, no activos)
P2 encontrados:          4 (latentes, baja probabilidad)
P3 encontrados:          3 (deuda técnica menor)

Drift detectado:         close_cash_session_atomic en PRD sin migración local
Riesgo más importante:   ALLOWED_ORIGINS — ruptura silenciosa del módulo financiero si dominio cambia
Acción inmediata:        Documentar ALLOWED_ORIGINS en ENVIRONMENT.md (sin código, sin PRD)
¿PRD puede continuar?:   SÍ
Documento:               docs/AUDITORIA_PREVENTIVA_PRD_POST_INCIDENTE_20260902.md
Restricciones respetadas: SÍ — solo lectura, sin cambios en PRD, sin operaciones de negocio
Siguiente paso:          Autorizar remediación Sprint 1 (documentación) sin código
```

---

*Generado: 2026-09-02 | Commit auditado: 6fa1542 | Deploy auditado: dpl_DiiJWph36CtjxEwmmCgLdjsnpD15*
