# Validación DEV — Activación Ledger PRD — 2026-09-01

## 1. Objetivo

Validar en ambiente DEV que el flujo completo de activación del ledger contable funciona correctamente, como requisito previo a la activación en PRD. Este documento registra el estado observado del ledger DEV, las operaciones ejecutadas históricamente, los hallazgos de riesgo y la recomendación final para PRD.

Referencia: `docs/CHECKLIST_ACTIVACION_LEDGER_PRD_20260901.md`, sección 6 y 7.

## 2. Contexto

- Ambiente validado: DEV (proyecto `rtkdrnfqihulqdhixxzf`).
- Fecha de validación: 2026-09-01.
- Método: consultas directas a la base DEV vía Supabase CLI (`supabase db query --linked`).
- CLI temporalmente re-enlazado a DEV para la validación; re-enlazado a PRD al finalizar.
- El ledger DEV ya se encontraba activo desde 2026-08-15 con operaciones de Fase 3 ejecutadas previamente.
- No se ejecutaron nuevas operaciones financieras durante esta sesión de validación — se auditó el estado existente.

### Actualización 2026-09-01 — Schema PRD = DEV (riesgo H1 mitigado)

Inspección directa del schema PRD durante la pre-activación confirmó que el schema contable es **idéntico** al de DEV en los componentes críticos:

| Componente | DEV | PRD | Igual |
|---|---|---|---|
| Tabla de cuentas | `financial_accounts` | `financial_accounts` | ✅ |
| Catálogo de cuentas | 11 cuentas (1101–5102) | 11 cuentas (1101–5102) | ✅ |
| Columna cuenta en líneas | `financial_account_id` | `financial_account_id` | ✅ |
| Columnas de importe | `debit` / `credit` | `debit` / `credit` | ✅ |
| Diseño `ledger_settings` | columna `is_active` | `id` boolean PK (singleton) | ⚠️ |

La única diferencia es el mecanismo de activación en `ledger_settings` (no afecta la contabilidad). La validación DEV es una réplica efectiva del flujo PRD, no solo conceptual. El riesgo H1 se reduce de **crítico** a **bajo**.

## 3. Saldos base PRD a simular

Saldos autorizados para la activación PRD (referencia del checklist):

| Código | Cuenta | Saldo PRD autorizado | Equivalente DEV simulado |
|---|---|---:|---:|
| 1101 | Caja operativa | $1,500.00 | $1,000.00 |
| 1102 | Caja fuerte | $24,000.00 | $1,000.00 |
| 1103 | Banco | $3,537.68 | $1,000.00 |
| **Total activos** | | **$29,037.68** | **$3,000.00** |
| 3101 | Capital inicial / Aportaciones | $29,037.68 | $3,000.00 |

Los montos DEV son simbólicos (pruebas de Fase 3). El mecanismo de activación es idéntico: tipo `initial_balance`, entradas débito en las 3 cuentas de activo y crédito en 3101.

## 4. Estado ledger DEV

| Campo | Valor |
|---|---|
| Estado | **Activo** |
| Activado desde | `2026-08-15 22:20:18 UTC` |
| Póliza de apertura | `JE-INICIAL-3ACE643A` |
| Tipo póliza apertura | `initial_balance` |
| Estado póliza apertura | `confirmed` |
| Total pólizas | 8 (1 inicial + 7 operativas) |

## 5. Validación de cuentas

Cuentas confirmadas en DEV (tabla `financial_accounts`):

| Código | Nombre | Tipo | Requerida para PRD |
|---|---|---|---|
| 1101 | Caja operativa | asset | ✅ |
| 1102 | Caja fuerte | asset | ✅ |
| 1103 | Banco | asset | ✅ |
| 1201 | Compras de mercancía por aplicar | asset | — |
| 1202 | Adquisiciones por clasificar | asset | — |
| 3101 | Aportaciones del propietario | equity | ✅ |
| 3102 | Retiros del propietario | equity | — |
| 4101 | Ingresos por ventas | income | — |
| 4102 | Sobrantes de caja | income | — |
| 5101 | Faltantes de caja | expense | — |
| 5102 | Gastos operativos generales | expense | — |

Las 4 cuentas requeridas para la activación PRD están presentes en DEV. En PRD, el catálogo equivalente se almacena en la tabla `accounts`.

## 6. Operaciones ejecutadas DEV

Todas las operaciones fueron ejecutadas en sesiones anteriores (Fase 3, 2026-08-15 a 2026-08-18). No se ejecutaron nuevas operaciones en esta sesión de validación.

| N° | Tipo | Póliza | Estado | Fecha |
|---|---|---|---|---|
| 1 | `initial_balance` — Apertura contable | JE-INICIAL-3ACE643A | confirmed | 2026-08-15 |
| 2 | `transfer` — Traspaso entre fondos | JE-TRP-52A48939 | confirmed | 2026-08-17 |
| 3 | `owner_contribution` — Aportación del propietario | JE-APT-8A68F8F0 | confirmed | 2026-08-17 |
| 4 | `owner_withdrawal` — Retiro del propietario | JE-RET-1C881241 | **reversed** | 2026-08-18 |
| 5 | `reversal` — Reversa del retiro | JE-REV-B31F1EE0 | confirmed | 2026-08-18 |
| 6 | `purchase` — Compra inventario (transferencia) | JE-CMP-A04E11FA | confirmed | 2026-08-18 |
| 7 | `purchase` — Gasto operativo (transferencia) | JE-CMP-C33ACFD0 | confirmed | 2026-08-18 |
| 8 | `purchase` — Gasto operativo Megacable (transferencia) | JE-CMP-AE74DF2A | confirmed | 2026-08-18 |

## 7. Pólizas generadas

### JE-INICIAL-3ACE643A — Apertura contable

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 1101 Caja operativa | $1,000.00 | — | Saldo inicial Caja operativa |
| 1102 Caja fuerte | $1,000.00 | — | Saldo inicial Caja fuerte |
| 1103 Banco | $1,000.00 | — | Saldo inicial Banco |
| 3101 Aportaciones | — | $3,000.00 | Capital inicial al corte del ledger |
| **Total** | **$3,000.00** | **$3,000.00** | ✅ Cuadrado |

### JE-TRP-52A48939 — Traspaso entre fondos

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 1101 Caja operativa | — | $1.00 | Traspaso entre fondos — salida |
| 1102 Caja fuerte | $1.00 | — | Traspaso entre fondos — entrada |
| **Total** | **$1.00** | **$1.00** | ✅ Cuadrado |

### JE-APT-8A68F8F0 — Aportación del propietario

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 1101 Caja operativa | $1.00 | — | Prueba UI aportación Fase 3C |
| 3101 Aportaciones | — | $1.00 | Prueba UI aportación Fase 3C |
| **Total** | **$1.00** | **$1.00** | ✅ Cuadrado |

### JE-RET-1C881241 + JE-REV-B31F1EE0 — Retiro revertido

Retiro original (reversed): 3102 D $1.00 / 1102 C $1.00.

Reversa confirmada (JE-REV-B31F1EE0):

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 1102 Caja fuerte | $1.00 | — | REVERSA: Prueba UI retiro Fase 3E |
| 3102 Retiros del propietario | — | $1.00 | REVERSA: Prueba UI retiro Fase 3E |
| **Total** | **$1.00** | **$1.00** | ✅ Cuadrado |

Efecto neto en libros: $0 (retiro cancelado por reversa).

### JE-CMP-A04E11FA — Compra de inventario

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 1201 Compras por aplicar | $1.00 | — | Compra mercancía — DEV-INV-PRELEDGER-20260818 |
| 1103 Banco | — | $1.00 | Pago Transferencia — DEV-INV-PRELEDGER-20260818 |
| **Total** | **$1.00** | **$1.00** | ✅ Cuadrado |

### JE-CMP-C33ACFD0 — Gasto operativo

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 5102 Gastos operativos | $1.00 | — | Gasto operativo — DEV-GASTO-PRELEDGER-20260818 |
| 1103 Banco | — | $1.00 | Pago Transferencia — DEV-GASTO-PRELEDGER-20260818 |
| **Total** | **$1.00** | **$1.00** | ✅ Cuadrado |

### JE-CMP-AE74DF2A — Gasto operativo (Megacable)

| Cuenta | Debe | Haber | Descripción |
|---|---:|---:|---|
| 5102 Gastos operativos | $1.00 | — | Gasto operativo — DEV-GASTO-MEGACABLE-20260818 |
| 1103 Banco | — | $1.00 | Pago Transferencia — DEV-GASTO-MEGACABLE-20260818 |
| **Total** | **$1.00** | **$1.00** | ✅ Cuadrado |

## 8. Saldos finales DEV

Saldos observados tras todas las operaciones (debit − credit):

| Código | Cuenta | Saldo | Tipo | Derivación |
|---|---|---:|---|---|
| 1101 | Caja operativa | $1,000.00 | activo | $1,000 inicial − $1 traspaso salida + $1 aportación |
| 1102 | Caja fuerte | $1,001.00 | activo | $1,000 inicial + $1 traspaso entrada − $1 retiro + $1 reversa |
| 1103 | Banco | $997.00 | activo | $1,000 inicial − $3 compras/gastos |
| 1201 | Compras por aplicar | $1.00 | activo | $1 compra inventario |
| 1202 | Adquisiciones | $0.00 | activo | — |
| 3101 | Aportaciones | ($3,001.00) crédito | capital | $3,000 apertura + $1 aportación |
| 3102 | Retiros | $0.00 | capital | $1 retiro − $1 reversa |
| 4101 | Ingresos ventas | $0.00 | ingreso | — |
| 4102 | Sobrantes caja | $0.00 | ingreso | — |
| 5101 | Faltantes caja | $0.00 | gasto | — |
| 5102 | Gastos operativos | $2.00 | gasto | $2 gastos pagados |

### Verificación ecuación contable

```
Activos = Capital + Ingresos − Gastos
$2,999  = $3,001  + $0       − $2
$2,999  = $2,999  ✅
```

Activos: 1101($1,000) + 1102($1,001) + 1103($997) + 1201($1) = $2,999
Capital: 3101(crédito $3,001)
Gastos: 5102($2)

Balance cuadrado.

## 9. Reportes validados

La validación fue exclusivamente por consulta SQL directa a la base DEV (no mediante UI de reportes). Los datos confirmados son:

| Reporte | Método de validación | Resultado |
|---|---|---|
| Saldos de cuentas | SQL — debit − credit por cuenta | ✅ 11 cuentas, balance cuadrado |
| Pólizas / Mayor | SQL — journal_entries + journal_lines | ✅ 8 pólizas, todas cuadradas |
| Derivación de saldos | Trazabilidad póliza a póliza | ✅ Cada saldo derivado manualmente |

La validación de UI del módulo Finanzas (Saldos, Pólizas, Mayor, Sesiones) en DEV no se ejecutó en esta sesión; los reportes UI fueron validados previamente en el smoke test PRD del release Finanzas (2026-08-31).

## 10. Hallazgos

### H1 — Schema DEV vs PRD (mitigado — 2026-09-01)

~~DEV y PRD usan esquemas distintos.~~ **Actualizado:** inspección directa de PRD confirmó schema idéntico en componentes críticos: `financial_accounts`, `journal_lines.financial_account_id`, `debit`/`credit`. Solo `ledger_settings` difiere en diseño de activación (no afecta contabilidad).

**Impacto revisado:** la validación DEV es réplica efectiva del flujo PRD. Riesgo original sobreestimado. Severidad reducida a **Bajo**.

### H2 — Ingresos de ventas no validados en DEV (observación)

La cuenta `4101 Ingresos por ventas` tiene saldo $0 en DEV. Ninguna póliza de tipo `sale` fue generada. La sesión de caja más reciente (2026-08-17 a 2026-09-01) cerró con `sales_cash_total = $0.00`.

**Impacto:** no se confirmó en DEV que las ventas generan pólizas en `4101` después de activar el ledger.

### H3 — Pólizas de cierre de caja no validadas (observación)

Ninguna póliza de tipo `cash_close_difference` (sobrante: 4102 / faltante: 5101) fue generada en DEV durante el periodo activo del ledger. La sesión cerrada más reciente registró diferencia $0 y estado `closed_with_pending_difference`.

**Impacto:** el comportamiento de generación de pólizas por diferencia de caja no fue confirmado en DEV.

### H4 — COGS no validado (observación)

No hubo pólizas de tipo `cost_of_goods_sold` en DEV. Esto es consistente con la política de no activar COGS, pero no se confirmó activamente que las ventas futuras en PRD no generarán COGS involuntario.

### H5 — Flujo completo de retiro validado vía reversa (positivo)

El retiro `JE-RET-1C881241` fue revertido correctamente por `JE-REV-B31F1EE0`. El mecanismo de reversa funciona correctamente en DEV: la póliza original queda con estado `reversed` y la reversa queda `confirmed`. Saldo neto = $0.

### H6 — Tres tipos de compra validados (positivo)

Se confirmaron 3 pólizas de compra:
- Compra de inventario: 1201 D / 1103 C.
- Gasto operativo genérico: 5102 D / 1103 C.
- Gasto operativo externo (Megacable): 5102 D / 1103 C.

Los 3 patrones de póliza cuadran correctamente.

## 11. Riesgos para PRD

| ID | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| R1 | ~~Schema DEV ≠ schema PRD.~~ **Mitigado (2026-09-01):** schema contable idéntico en PRD (`financial_accounts`, `journal_lines` mismas columnas). Solo difiere diseño de activación en `ledger_settings`. | **Bajo** | Verificado por inspección directa de PRD. Ver `PREACTIVACION_LEDGER_PRD_20260901.md`. |
| R2 | Pólizas de venta no validadas. No se confirmó que `4101` recibe entradas tras activar ledger en PRD. | Medio | Incluir venta de prueba en las validaciones postactivación PRD (criterio 9 del checklist). |
| R3 | Pólizas de cierre de caja no validadas. Diferencia sobrante/faltante puede no generar póliza correctamente. | Medio | Ejecutar apertura + cierre de caja en PRD dentro del primer día de operación y verificar pólizas. |
| R4 | COGS involuntario. Si alguna migración PRD activa COGS, las ventas generarán asientos de costo no esperados. | Bajo | Confirmar que `cost_of_goods_sold` no aparece en pólizas tras primera venta postactivación. |
| R5 | Saldos iniciales de gran magnitud. PRD usará $29,037.68 vs $3,000 DEV. Un error en la distribución de montos genera descuadre contable difícil de corregir. | Alto | Revisar y aprobar los 4 montos (1101, 1102, 1103, 3101) con el responsable operativo antes de ejecutar. |
| R6 | No hay snapshot de base de datos PRD confirmado. Un fallo durante la activación no tiene rollback garantizado. | Alto | Confirmar backup PRD antes de iniciar. No iniciar sin snapshot. |

## 12. Resultado final

### Cobertura del checklist DEV (sección 7 del checklist)

| Ítem | Estado | Observación |
|---|---|---|
| Simular activación con saldos iniciales | ✅ | JE-INICIAL-3ACE643A — $3,000 (montos simbólicos) |
| `get_ledger_status` activo tras activación | ✅ | Ledger activo desde 2026-08-15 |
| Póliza apertura en Mayor de 1101, 1102, 1103, 3101 | ✅ | JE-INICIAL confirmado en las 4 cuentas |
| Reporte Saldos: Activos = Pasivo + Capital | ✅ | $2,999 = $3,001 − $2 gastos ✓ |
| Venta posterior genera póliza | ⚠️ | No validado — cuenta 4101 en $0 |
| Apertura y cierre de caja tras activación con pólizas | ⚠️ | No validado — no hubo cierre con diferencia durante periodo activo |
| Compra de inventario con póliza | ✅ | JE-CMP-A04E11FA confirmado |
| Gasto operativo con póliza | ✅ | JE-CMP-C33ACFD0 y AE74DF2A confirmados |
| COGS no generado en ventas | ⚠️ | No validado — sin ventas con ledger activo |
| Reportes Finanzas muestran datos correctos | ✅ | Validado vía SQL; UI PRD validada en smoke 08-31 |
| Sin errores 500 ni crashes de UI | ✅ | Sin errores durante validación; PRD smoke aprobado |

**8 de 11 ítems validados. 3 con observaciones (venta, cierre de caja, COGS).**

Los 3 ítems no validados en DEV **deben confirmarse como validaciones postactivación en PRD el primer día de operación**.

## 13. Recomendación para activar PRD o bloquear activación

### Recomendación: **AUTORIZAR con condiciones**

La validación DEV confirma que el mecanismo de ledger funciona correctamente para:
- Apertura contable con póliza inicial.
- Traspasos entre cuentas.
- Aportaciones del propietario.
- Retiros y su reversa.
- Compras de inventario y gastos operativos.
- Ecuación contable cuadrada en todo momento.

### Condiciones para autorizar activación PRD

Todas deben estar resueltas **antes** de ejecutar:

1. **Snapshot / backup PRD confirmado.** Sin snapshot, no hay rollback ante fallo. Bloquea activación.
2. **Saldos iniciales revisados y aprobados por el responsable operativo.** Los montos $1,500 / $24,000 / $3,537.68 son irreversibles una vez registrados.
3. **Caja PRD cerrada y 0 pedidos en proceso.** Requisito operativo del checklist.
4. **Responsable presente durante la activación.** No activar desatendido.

### Validaciones postactivación obligatorias (primer día de operación)

Los 3 ítems no cubiertos en DEV **no bloquean la activación** pero **deben ejecutarse el día de activación** inmediatamente después:

1. Hacer una venta real → confirmar póliza en cuenta 4101.
2. Cerrar la caja del día → confirmar pólizas de sobrante/faltante (4102/5101).
3. Confirmar que ninguna póliza de COGS fue generada en la venta.

Si alguna de estas validaciones falla, detener operaciones, no ejecutar más entradas, y escalar para análisis.

### Bloqueo adicional requerido si:

- Snapshot PRD no confirmado → **no activar**.
- Saldos no aprobados por responsable → **no activar**.
- Cualquier criterio de la sección 6 del checklist no cumplido → **no activar**.

---

*Documento generado: 2026-09-01. Revisión requerida antes de autorizar activación PRD.*
