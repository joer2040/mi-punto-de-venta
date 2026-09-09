# Checklist Aprobación Deploy Finanzas PRD

**Fecha de preparación:** 2026-08-18  
**Última actualización:** 2026-08-31  
**Fecha de deploy:** 2026-08-31  
**Rama:** `chore/code-cleanup`  
**Responsable técnico:** Jaime  
**Estado:** ✅ Deploy ejecutado — Smoke tests pendientes (manual)

---

## 1. Estado actual

El módulo de Finanzas está listo en DEV (`chore/code-cleanup`).  
Las validaciones técnicas han concluido. Los scripts de rollback están documentados.  
El deploy a PRD NO puede ejecutarse hasta que B3, B4 y B5 estén resueltos y firmados.

| Componente | Estado en DEV | Estado en PRD |
|---|---|---|
| Migraciones Finance (11 total) | ✅ Aplicadas | ✅ Aplicadas 2026-08-31 |
| EF `pos-operations` (nueva firma) | ✅ Desplegada | ✅ Desplegada 2026-08-31 |
| EF `financial-operations` | ✅ Desplegada | ✅ Desplegada 2026-08-31 |
| EF `erp-operations` v13 (Compras/Finanzas) | ✅ Desplegada DEV | ✅ Desplegada 2026-08-31 |
| EF `cash-operations` | ✅ DEV | ✅ Desplegada 2026-08-31 (post-Finance batch) |
| `purchase_type` — fuente de verdad Compras | ✅ Validado DEV | ✅ Incluido en migraciones |
| Permisos `finances:view` (B1) | ✅ Script listo | ✅ Aplicado — `manager` asignado |
| Scripts rollback (B2) | ✅ Documentados | — |
| Autorización deploy PRD (B3) | — | ✅ Jaime, 2026-08-31 |
| Backup/snapshot PRD (B4) | — | ✅ WAL-G activo confirmado |
| Ventana mantenimiento (B5) | — | ✅ 2026-08-31, operadores notificados |
| Ledger DEV | ✅ Activo | — |
| Ledger PRD | — | ✅ No activo — `ledger_settings` vacío confirmado |
| Smoke tests | — | ⏳ POS/caja ✅ aprobados · Reportes Finanzas: revalidar post-CORS fix |

---

## 2. Bloqueadores resueltos

### Cierre DEV — Compras / Finanzas (2026-08-31)

Tema post-Predeploy sobre Compras/Finanzas cerrado en DEV. Cambios aplicados y validados:

- **Separación explícita** entre compra de inventario y gasto operativo.
- **`purchase_type`** queda como fuente de verdad para clasificar el tipo de compra.
- **EF `erp-operations` v13** desplegada a DEV con la nueva lógica.
- **Gasto operativo** (proveedor MEGACABLE) validado correctamente en DEV.

**Estado:** ✅ Cerrado en DEV. PRD no ha sido tocado.

---

### B1 — Seed de permisos Finanzas

**Archivo:** `supabase/migrations/20260817200000_seed_finance_permissions.sql`

Crea `finances:view` y `finances:manage` en `app_permissions`.  
Asigna `finances:view` a roles: `manager`, `administrador operativo`, `admin`.  
`finances:manage` queda registrada sin asignar — pendiente decisión de negocio.

Patrón idempotente con `on conflict do nothing`. Seguro re-ejecutar.

**Estado:** ✅ Resuelto. Script listo. Pendiente aplicar a PRD en ventana de deploy.

---

### B2 — Scripts de rollback documentados

**Archivo:** `docs/B2_ROLLBACK_SCRIPTS_FINANZAS_PRD.md`

Cubre 5 escenarios de falla:

| Escenario | Síntoma | Requiere SQL |
|---|---|---|
| A — EF pos-operations desfasada | `function finalize_pos_sale(uuid, jsonb, text, uuid) does not exist` | No |
| B — Función desaparecida (contingencia extrema) | Cero firmas en DB | Sí — bajo autorización |
| C — Bug GROUP BY activo | `column "pay" must appear in GROUP BY` | Sí — re-aplicar fix |
| D — Finanzas invisible para Manager/Admin | Módulo no aparece en menú | Sí — seed idempotente |
| E — EF financial-operations no responde | Reportes Finanzas fallan, POS OK | No |

Incluye queries de diagnóstico Q1–Q7 (solo SELECT) y tabla de decisión de incidente.

**Estado:** ✅ Resuelto. Documento listo.

---

### B3 — Autorización explícita para deploy PRD

**Autorización recibida el 2026-08-31.**

| Campo | Valor |
|---|---|
| Fecha | 2026-08-31 |
| Autorizado por | Jaime (joer2040 / jaimeomar2040@hotmail.com) — propietario del proyecto |
| Responsable técnico | Jaime (mismo) |
| Alcance autorizado | Migraciones Finance · EF `pos-operations` · EF `erp-operations` · EF `financial-operations` · EF `cash-operations` (post-Finance schema sync) · Smoke tests autorizados |
| Excluido explícitamente | Ledger PRD · Operaciones financieras reales · Traspasos · Aportaciones · Retiros · Reversas · Ajustes fuera de alcance |

**Estado:** ✅ Resuelto. Autorización escrita con fecha, firmante y alcance definido.

---

### B4 — Backup o snapshot PRD confirmado

**Confirmación recopilada el 2026-08-31 vía Supabase CLI.**

| Campo | Valor |
|---|---|
| Proyecto PRD | `cxpouhmrpcpiohrueuwk` — La Carreta PRD |
| Estado del proyecto | `ACTIVE_HEALTHY` |
| Tipo de backup | WAL-G automated daily backup |
| WALG activo | `true` — backups diarios automáticos confirmados |
| PITR | `false` — no requerido para este deploy |
| Región | East US (North Virginia) |
| Timestamp específico | No disponible vía CLI v2.92.1 (limitation conocida — timestamps reportados como 0) |
| Método de verificación | `npx supabase backups list --project-ref cxpouhmrpcpiohrueuwk` |
| Responsable | Jaime — 2026-08-31 |
| Confirmación | WAL-G activo = backups diarios automáticos corriendo. Proyecto healthy. |

> **Nota:** WALG=`true` es la confirmación autoritativa de que Supabase está ejecutando backups diarios. Los timestamps en `0` son una limitación de CLI v2.92.1, no ausencia de backups. Para evidencia complementaria con timestamp exacto, verificar en Supabase Dashboard → Settings → Backups.

**Estado:** ✅ Resuelto. Backup WAL-G confirmado activo en PRD.

---

### B5 — Ventana de mantenimiento coordinada

**Ventana acordada el 2026-08-31.**

| Campo | Valor |
|---|---|
| Fecha | 2026-08-31 |
| Hora inicio | A definir — ejecución inicia cuando responsable técnico dé señal explícita |
| Hora fin | A definir — estimado 15–30 min desde inicio |
| Duración estimada | 15–30 minutos |
| Responsable técnico | Jaime |
| Operadores notificados | ✅ Sí — notificados el 2026-08-31 |
| Condición de entrada | Sin mesas activas · Sin pedidos abiertos · Sin ventas en proceso · Sin caja en operación crítica · Operadores fuera del POS |
| Señal de inicio | Mensaje explícito del responsable técnico: `"inicia proceso para prd"` |
| Alcance permitido | Deploy inicial Finanzas PRD · Smoke tests autorizados |
| No autorizado | Ledger PRD · Operaciones financieras reales · Traspasos · Aportaciones · Retiros · Reversas · Ajustes |

**Estado:** ✅ Resuelto. Ventana coordinada, operadores notificados. Ejecución esperando señal de inicio.

---

## 3. Bloqueadores pendientes

> ✅ **Sin bloqueadores pendientes.** B1–B5 resueltos. Deploy puede ejecutarse cuando el responsable técnico dé la señal de inicio.

---

## 4. Confirmaciones requeridas

| Confirmación | Responsable | Evidencia requerida | Estado |
|---|---|---|---|
| Autorización explícita deploy PRD | Propietario / responsable negocio | Mensaje escrito con fecha, nombre y alcance autorizado | ✅ Confirmado — Jaime, 2026-08-31 |
| Snapshot / backup PRD con timestamp | Responsable técnico | Captura de pantalla de backup en Supabase dashboard o export de tablas con fecha | ✅ Confirmado — WAL-G activo, CLI 2026-08-31 |
| Horario de ventana de mantenimiento | Coordinador operaciones | Fecha, hora inicio y hora fin acordados y confirmados | ✅ Confirmado — 2026-08-31, inicio a señal del responsable |
| Operadores La Carreta notificados | Coordinador operaciones | Confirmación de aviso (mensaje, correo o anotación) | ✅ Confirmado — notificados 2026-08-31 |
| Responsable técnico presente durante deploy | Responsable técnico | Disponibilidad confirmada para la ventana completa | ✅ Confirmado — Jaime presente |
| Rollback documentado revisado | Responsable técnico | Lectura de `docs/B2_ROLLBACK_SCRIPTS_FINANZAS_PRD.md` confirmada | ⚠️ Pendiente confirmación explícita de lectura |
| Ledger NO activar en este deploy | Responsable técnico | Entendido y confirmado explícitamente | ✅ Confirmado — excluido en autorización |
| Smoke tests sin operaciones financieras reales | Responsable técnico | Entendido: smoke no crea traspasos, retiros, aportaciones ni reversas reales | ✅ Confirmado — excluido en autorización |

---

## 5. Go / No-Go

| Criterio | Estado | Comentario |
|---|---|---|
| B1 — Migración seed permisos lista | ✅ Go | `20260817200000_seed_finance_permissions.sql` creado |
| B2 — Rollback scripts documentados | ✅ Go | `docs/B2_ROLLBACK_SCRIPTS_FINANZAS_PRD.md` creado |
| B3 — Autorización deploy PRD | ✅ Go | Jaime — 2026-08-31 — alcance definido y firmado |
| B4 — Backup/snapshot PRD | ✅ Go | WAL-G activo confirmado vía CLI — 2026-08-31 |
| B5 — Ventana mantenimiento coordinada | ✅ Go | 2026-08-31 · Operadores notificados · Señal de inicio pendiente |
| POS DEV funciona (venta Efectivo) | ✅ Go | Confirmado en rama `chore/code-cleanup` |
| Caja DEV funciona (apertura/cierre) | ✅ Go | Confirmado en DEV |
| `pos-operations` EF llama nueva firma | ✅ Go | Documentado en `docs/ANALISIS_POS_OPERATIONS_COMPATIBILIDAD_NUEVA_FIRMA.md` |
| Ledger NO activo en deploy | ✅ Go | Confirmado explícitamente en autorización 2026-08-31 |
| Responsable técnico disponible | ✅ Go | Jaime — confirmado |

**Resultado actual: ✅ Deploy ejecutado 2026-08-31 — Smoke tests pendientes (manual)**

---

## 6. Smoke tests autorizados

Ejecutar en PRD solo después de aplicar todas las migraciones y EF. Duración estimada: 5–10 minutos.

### 6.1 POS — Venta en Efectivo

1. Abrir caja desde panel Caja.
2. Asignar mesa, agregar producto, finalizar venta con Efectivo.
3. Verificar que la mesa quede libre.
4. Verificar que la venta aparece en historial.

**Criterio de éxito:** Venta completada sin error. Mesa liberada.

---

### 6.2 Apertura y cierre de caja

1. Abrir caja con monto inicial.
2. Verificar que el panel muestra caja abierta.
3. Cerrar caja sin mesa activa.
4. Verificar que el cierre se registra en historial.

**Criterio de éxito:** Apertura y cierre sin error.

---

### 6.3 Bloqueo POS sin caja abierta

1. Con caja cerrada, intentar finalizar una venta en Efectivo desde POS.
2. Verificar que la venta no se procesa.
3. Verificar que el error es claro para el usuario.

**Criterio de éxito:** Sistema rechaza la venta. No se registra venta sin caja.

---

### 6.4 Bloqueo cierre de caja con mesa activa

1. Con al menos una mesa en estado "ocupada", intentar cerrar caja.
2. Verificar que el cierre es bloqueado.

**Criterio de éxito:** Sistema rechaza el cierre de caja. Mesa activa protegida.

---

### 6.5 Carga de reportes Finanzas

1. Acceder al módulo Finanzas como usuario Manager o Admin.
2. Verificar carga de: Saldos, Pólizas, Mayor, Sesiones.
3. Sin cifras esperadas reales — solo confirmar que las vistas cargan sin error 500.

**Criterio de éxito:** Las 4 vistas cargan. Sin errores de red ni permisos denegados.

---

### 6.6 Visibilidad de Finanzas para Manager / Admin autorizado

1. Iniciar sesión con usuario de rol `manager` o `admin` en PRD.
2. Verificar que "Finanzas" aparece en el menú de navegación.
3. Verificar que el acceso a rutas Finance no devuelve pantalla de acceso denegado.

**Criterio de éxito:** Módulo visible y accesible para los roles autorizados.

---

> ⛔ **NO ejecutar durante smoke tests:**
> - Traspasos entre cuentas
> - Aportaciones de capital
> - Retiros
> - Reversas
> - Activación de ledger
> - Cierre de caja con diferencia real

---

## 7. Activación del ledger

> **NO autorizada en este deploy.**

> ⚠️ **Ledger DEV activo ≠ Ledger PRD activo.**  
> El ledger está activo en DEV como parte del ciclo de validación local. Esto **no implica ni autoriza** activar el ledger en PRD. Son instancias independientes. El ledger PRD sigue fuera del alcance del deploy inicial.

La activación del ledger PRD (`ledger_cutover_at`) es una fase separada, posterior y con requerimientos propios:

- Saldos iniciales de cuentas definidos y validados en PRD.
- Todas las migraciones Finance aplicadas y verificadas en PRD.
- Al menos un ciclo de operación PRD confirmado sin incidentes.
- Autorización explícita adicional para activar ledger PRD.

Si `ledger_settings.ledger_cutover_at` permanece `NULL` en PRD, los asientos contables no se generan. El módulo Finanzas opera sin contabilidad doble. Este es el estado correcto para el deploy inicial.

---

## 8. Resultado final

> ✅ **Deploy ejecutado el 2026-08-31 por Jaime.**

**Resumen de lo ejecutado:**

| Paso | Acción | Resultado |
|---|---|---|
| Condiciones entrada | Mesas activas: 0 · Cajas abiertas: 0 | ✅ Verificado |
| Paso 1 | Deploy EF `pos-operations` | ✅ Desplegada |
| Paso 2 | `db push` — 11 migraciones Finance | ✅ Aplicadas |
| Paso 3 | Deploy EF `financial-operations` | ✅ Desplegada |
| Paso 4 | Deploy EF `erp-operations` v13 | ✅ Desplegada |
| Paso 5 | Deploy EF `cash-operations` (post-Finance, schema sync) | ✅ Desplegada 2026-08-31 |

**Verificaciones post-deploy:**

| Check | Resultado |
|---|---|
| 31/31 migraciones Local = Remote | ✅ |
| `finalize_pos_sale` nueva firma `(uuid, jsonb, jsonb, uuid, text)` | ✅ |
| 7 tablas Finance creadas en PRD | ✅ |
| `ledger_settings` vacío (ledger NO activo) | ✅ |
| `finances:view` → rol `manager` | ✅ |
| Smoke tests | ⏳ POS/caja ✅ · CORS fix ✅ · Reportes Finanzas browser: revalidar |

Smoke tests a ejecutar según Sección 6 de este documento y Sección 5 de `docs/PLAN_DEPLOY_COORDINADO_FINANZAS_PRD.md`.

---

*Documentos relacionados:*  
- [`docs/PLAN_DEPLOY_COORDINADO_FINANZAS_PRD.md`](PLAN_DEPLOY_COORDINADO_FINANZAS_PRD.md) — secuencia de deploy y smoke tests detallados  
- [`docs/B2_ROLLBACK_SCRIPTS_FINANZAS_PRD.md`](B2_ROLLBACK_SCRIPTS_FINANZAS_PRD.md) — scripts de rollback y diagnóstico  
- [`docs/ANALISIS_POS_OPERATIONS_COMPATIBILIDAD_NUEVA_FIRMA.md`](ANALISIS_POS_OPERATIONS_COMPATIBILIDAD_NUEVA_FIRMA.md) — compatibilidad EF POS  
- [`supabase/migrations/20260817200000_seed_finance_permissions.sql`](../supabase/migrations/20260817200000_seed_finance_permissions.sql) — migración B1  
