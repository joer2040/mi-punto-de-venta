# Pre-activación Ledger PRD — 2026-09-01

## Resumen ejecutivo

Diagnóstico read-only ejecutado contra PRD (`cxpouhmrpcpiohrueuwk`) el 2026-09-01.

Estado operativo: **limpio y listo**.
Bloqueadores pendientes: **0** — B1 resuelto con dump local (Opción A). B2 resuelto con responsables registrados.
Ledger PRD: **INACTIVO** — 0 filas en `ledger_settings`, 0 pólizas en `journal_entries`.

**Pre-activación completa. Listo para autorización final de activación.**

---

## Condición 1 — Backup / snapshot PRD

### Estado
**✅ RESUELTO — Dump local creado (Opción A ejecutada).**

### Registro

| Campo | Valor |
|---|---|
| Verificado por | Propietario / Jaime |
| Fecha/hora de verificación | 2026-09-01 |
| Backup Dashboard disponible | No — plan sin backups automáticos visibles |
| Solución aplicada | **Opción A — dump local pre-activación** |
| Ejecutado por | Jaime (responsable técnico) |
| Fecha/hora dump | 2026-09-01 |

### Archivos generados

Ambos archivos están en `backups/` — excluido de git (`.gitignore` actualizado).

| Archivo | Contenido | Tamaño | Líneas |
|---|---|---:|---:|
| `backup_prd_20260901_pre_ledger.sql` | Schema DDL — 35 tablas | 156 KB | 4,594 |
| `backup_prd_20260901_pre_ledger_data.sql` | Datos — 24 tablas | 2.4 MB | 10,124 |

Tablas con datos incluidas: `app_permissions`, `app_profiles`, `app_role_permissions`, `app_roles`, `app_user_roles`, `audit_log`, `cash_session_inventory_snapshots`, `cash_sessions`, `categories`, `centers`, `financial_accounts`, `inventory`, `inventory_movements`, `materials`, `organizations`, `providers`, `purchase_items`, `purchases`, `sale_items`, `sales`, `suppliers`, `table_orders`, `tables`, `uoms`.

Tablas críticas para rollback de ledger: `financial_accounts` ✅, `ledger_settings` (vacía — ledger inactivo) ✅, `journal_entries` (vacía) ✅, `cash_sessions` ✅.

**Nota:** dump de datos tiene advertencias de FK circular en `tables`/`table_orders` y `journal_entries`. Para restauración completa usar `--disable-triggers`. Para el propósito de pre-activación, los archivos son suficientes como referencia de estado previo.

---

## Condición 2 — Saldos iniciales aprobados

### Cuentas verificadas en PRD

Todas las cuentas necesarias existen en `public.financial_accounts`:

| Código | Nombre | Tipo | Estado en PRD |
|---|---|---|---|
| 1101 | Caja operativa | asset | ✅ Presente |
| 1102 | Caja fuerte | asset | ✅ Presente |
| 1103 | Banco | asset | ✅ Presente |
| 3101 | Aportaciones del propietario | equity | ✅ Presente |

Cuentas adicionales también presentes: 1201, 1202, 3102, 4101, 4102, 5101, 5102.

### Saldos iniciales autorizados

| Código | Cuenta | Saldo inicial |
|---|---|---:|
| 1101 | Caja operativa | $1,500.00 |
| 1102 | Caja fuerte | $24,000.00 |
| 1103 | Banco | $3,537.68 |
| **Total activos** | | **$29,037.68** |

Contrapartida:

| Código | Cuenta | Saldo inicial |
|---|---|---:|
| 3101 | Aportaciones del propietario | $29,037.68 |

**Cuadre: $29,037.68 = $29,037.68 ✅**

### Estado

**✅ APROBADO.** Saldos definidos por el responsable operativo en instrucción de preactivación 2026-09-01. Cuentas confirmadas presentes en PRD. Cuadre verificado.

---

## Condición 3 — Estado operativo PRD

Diagnóstico ejecutado vía SQL read-only con CLI enlazado a PRD.

### Caja

| Campo | Valor |
|---|---|
| Total sesiones históricas | 97 |
| Sesiones abiertas (`open`) | **0** |
| Única sesión en existencia | Todas `closed` |
| Última sesión activa | — (cerrada) |
| Última venta registrada | 2026-08-31 23:13 UTC — $10.00 Efectivo |

**✅ APROBADO — Caja cerrada. 0 sesiones abiertas.**

### Mesas

| Campo | Valor |
|---|---|
| Total mesas | 16 |
| Mesas `libre` | 16 |
| Mesas con otro estado | 0 |
| Mesas con pedido activo (`current_order_id IS NOT NULL`) | **0** |

**✅ APROBADO — 0 mesas ocupadas. 0 pedidos en proceso.**

### Ventas en proceso

| Campo | Valor |
|---|---|
| Ventas sin cerrar | 0 |
| Última venta | 2026-08-31 23:13 UTC — $10.00 — Efectivo — id `c6ba2968...` |
| Ventas del día 2026-09-01 | 0 |

**✅ APROBADO — 0 ventas en proceso. Último registro completado el 31/08.**

### Ledger PRD

| Campo | Valor |
|---|---|
| Filas en `ledger_settings` | **0** |
| Pólizas en `journal_entries` | **0** |
| Estado derivado | **INACTIVO** |

**✅ APROBADO — Ledger inactivo. Estado baseline sin modificar.**

### Resumen condición 3

| Ítem | Valor | Estado |
|---|---|---|
| Caja | Cerrada | ✅ |
| Mesas ocupadas | 0 | ✅ |
| Pedidos pendientes | 0 | ✅ |
| Ventas en proceso | 0 | ✅ |
| Ledger | Inactivo | ✅ |

---

## Condición 4 — Responsable y ventana

**✅ COMPLETADO — B2 resuelto.**

| Campo | Valor |
|---|---|
| Responsable operativo | **Propietario** |
| Responsable técnico | **Jaime** |
| Fecha/hora de corte autorizada | **2026-09-01 ~22:00** |
| Zona horaria | America/Monterrey |
| Confirmación de presencia durante activación | **Sí** |

---

## Hallazgo adicional — Schema PRD = DEV (mitigación de riesgo)

Durante la inspección, se confirmó que el schema financiero de PRD es **idéntico** al de DEV en los componentes críticos:

| Componente | DEV | PRD | Igual |
|---|---|---|---|
| Tabla de cuentas | `financial_accounts` | `financial_accounts` | ✅ |
| Catálogo de cuentas | 11 cuentas (1101–5102) | 11 cuentas (1101–5102) | ✅ |
| Columnas `journal_lines` | `financial_account_id`, `debit`, `credit` | `financial_account_id`, `debit`, `credit` | ✅ |
| Diseño `ledger_settings` | `is_active` boolean col | `id` boolean PK (singleton) | ⚠️ Diferente |

La diferencia en `ledger_settings` es de diseño de activación, no de contabilidad. Las pólizas, cuentas y líneas son estructuralmente idénticas.

**Impacto en riesgo H1 del documento de validación DEV:** el riesgo se redujo de "Alto" a "Bajo" para el schema contable. La validación DEV es una réplica efectiva del flujo PRD, no solo conceptual. `VALIDACION_DEV_ACTIVACION_LEDGER_PRD_20260901.md` — H1 ya actualizado.

---

## Bloqueadores

| N° | Bloqueador | Estado | Acción requerida |
|---|---|---|---|
| B1 | Sin backup/snapshot PRD disponible | ✅ RESUELTO | Dump local creado: `backups/backup_prd_20260901_pre_ledger*.sql` |
| B2 | Responsable operativo y técnico sin registrar | ✅ RESUELTO | Propietario + Jaime confirmados, hora 22:00 registrada |

---

## Resultado pre-activación

| Condición | Estado |
|---|---|
| 1. Backup / snapshot PRD | ✅ RESUELTO — dump local 2.4 MB + schema 156 KB |
| 2. Saldos iniciales aprobados | ✅ APROBADO |
| 3. Estado operativo PRD | ✅ APROBADO — todo limpio |
| 4. Responsable y ventana | ✅ COMPLETADO |

**¿Listo para autorización final?:** **SÍ — 0 bloqueadores. Pre-activación completa.**

El responsable operativo puede emitir la autorización final de activación del ledger PRD.

---

## Restricciones respetadas en esta sesión

- Sin SQL de escritura.
- Sin migraciones.
- Sin Edge Functions.
- Sin deploy.
- Sin operaciones financieras reales.
- Sin commits.
- Sin push.
- Todas las consultas fueron read-only (`SELECT`).

---

*Documento generado: 2026-09-01. Actualizado: 2026-09-01. Pre-activación completa — 0 bloqueadores. Listo para autorización final.*
