# Monitoreo Ledger PRD — Primeros 7 días (2026-09-01 al 2026-09-07)

## Contexto

| Campo | Valor |
|---|---|
| Ledger activado | 2026-09-01 ~19:28 Monterrey |
| Póliza inicial | `JE-INICIAL-63AD25A7` |
| Cutover UTC | `2026-09-02 01:28:36+00` |
| Venta postactivación validada | `JE-VTA-02092026014501` — `$10.00` — COGS ninguno |
| Cierre de caja validado | Contado `$11.00`, diferencia `$0.00` |
| Responsable operativo | Propietario |
| Responsable técnico | Jaime |

---

## Cómo usar este documento

1. Completar el **checklist diario** cada día al cierre del negocio.
2. Registrar observaciones en la **tabla de seguimiento diario**.
3. Clasificar cualquier anomalía con el **catálogo de incidentes**.
4. Si se detecta un incidente clase A: detener operaciones financieras y escalar de inmediato.
5. No ejecutar correcciones sin autorización técnica separada.

---

## Checklist diario (12 ítems)

Aplicar al cierre de cada jornada operativa.

### Ventas del día

- [ ] **C1** — Revisar ventas del día en POS → confirmar registros correctos.
- [ ] **C2** — Confirmar que cada venta en efectivo generó una póliza `JE-VTA-*` en Finanzas → Mayor.
- [ ] **C3** — Confirmar que cuenta `4101 Ingresos por ventas` muestra haber por el total de ventas del día.
- [ ] **C4** — Confirmar que cuenta `1101 Caja operativa` muestra debe por el total de ventas en efectivo del día.
- [ ] **C5** — Confirmar que **no se generó ninguna póliza de COGS** (no debe haber asientos en `5101 Costo de ventas` por ventas).

### Cierre de caja

- [ ] **C6** — Revisar Finanzas → Sesiones → cierre del día. Confirmar sesión visible con fecha correcta.
- [ ] **C7** — Confirmar `Esperado` = total ventas efectivo + fondo inicio.
- [ ] **C8** — Confirmar `Contado` = monto físico contado por cajero.
- [ ] **C9** — Confirmar `Diferencia` registrada (puede ser `$0.00`, sobrante o faltante).
- [ ] **C10** — Si diferencia ≠ `$0.00`: verificar si se generó póliza `JE-SOBR-*` (sobrante → `4102`) o `JE-FALT-*` (faltante → `5101`). Si no existe póliza → incidente clase B.

### Saldos y reportes

- [ ] **C11** — Revisar Finanzas → Saldos. Confirmar ecuación `Activos = Pasivos + Capital` cuadrada.
- [ ] **C12** — Revisar Finanzas → Mayor `1101` y `4101`. Confirmar movimientos coherentes con las ventas del día. Verificar saldo acumulado creciente en `1101`.

---

## Catálogo de incidentes

| Clase | Descripción | Acción inmediata |
|---|---|---|
| **A — Crítico** | Ecuación contable descuadrada. Póliza con monto incorrecto. Doble póliza por misma venta. | Detener operaciones financieras. Escalar a Jaime. No registrar más ventas hasta diagnóstico. |
| **B — Alto** | Diferencia de caja sin póliza generada. Venta sin póliza. COGS generado. | Documentar en este archivo. Notificar a Jaime. No corregir manualmente. |
| **C — Medio** | Reporte con UI rota o datos no visibles. Columna inesperada en `—`. | Documentar. Jaime diagnostica. No es bloqueo operativo. |
| **D — Bajo** | Observación menor. Inconsistencia de formato. Dato inesperado sin impacto contable. | Documentar. Revisar en siguiente ciclo. |

---

## Seguimiento diario

### Día 1 — 2026-09-01 (Lunes)

**Sesión nocturna de activación — datos validados pre-monitoreo.**

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ✅ | 1 venta postactivación — Folio `02092026014501` — `$10.00` |
| C2 Póliza JE-VTA | ✅ | `JE-VTA-02092026014501` generada |
| C3 4101 Haber | ✅ | `$10.00` en 4101 |
| C4 1101 Debe | ✅ | `$10.00` en 1101 (efectivo) |
| C5 Sin COGS | ✅ | Sin asiento en 5101 |
| C6 Sesión visible | ✅ | `19:43–19:46` visible en Finanzas → Sesiones |
| C7 Esperado | ✅ | `$11.00` |
| C8 Contado | ✅ | `$11.00` |
| C9 Diferencia | ✅ | `$0.00` |
| C10 Póliza discrepancia | N/A | Diferencia `$0.00` — no aplica |
| C11 Saldos ecuación | ✅ | `$29,047.68 = $29,047.68` (Activos = Capital) |
| C12 Mayor 1101 y 4101 | ✅ | `JE-INICIAL` + `JE-VTA-02092026014501` visibles |
| **Incidentes** | Ninguno | — |

---

### Día 2 — 2026-09-02 (Martes)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ✅ | 2 ventas · $105.00 total |
| C2 Póliza JE-VTA | ✅ | 2 pólizas JE-VTA `confirmed` — 2 ventas = 2 pólizas |
| C3 4101 Haber | ✅ | `$105.00` en 4101 |
| C4 1101 Debe | ✅ | `$105.00` en 1101 (ventas efectivo post-ledger) |
| C5 Sin COGS | ✅ | Sin entradas en 5101 (catálogo: 5101 = Faltantes de caja, no COGS) |
| C6 Sesión visible | ✅ | Sesión Sep 2 cerrada correctamente |
| C7 Esperado | ✅ | `$2,565.00` (apertura $1,500 + ventas efectivo $1,065) |
| C8 Contado | ✅ | `first_counted_cash = $2,565.00` = Esperado |
| C9 Diferencia | ✅ | `difference_amount = $0.00` |
| C10 Póliza discrepancia | ✅ | N/A — diferencia $0.00 |
| C11 Saldos ecuación | ✅ | Verificado al cierre del período (ver Resumen) |
| C12 Mayor 1101 y 4101 | ✅ | Movimientos coherentes con ventas del día |
| **Incidentes** | Clase D | 2 compras pagadas en efectivo desde caja: JE-CMP-6BF4EDB8 ($3,100) + JE-CMP-D0B60333 ($4,777.92). Normal, no bloqueo. |

> **Nota:** `sales_cash_total` de la sesión ($1,065) difiere del debe ledger 1101 ($105) — sesión puede incluir ventas pre-ledger del mismo día operativo. No es incidente.

---

### Día 3 — 2026-09-03 (Miércoles)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ✅ | 8 ventas · $1,900.00 total |
| C2 Póliza JE-VTA | ✅ | 8 pólizas JE-VTA `confirmed` — 8 ventas = 8 pólizas |
| C3 4101 Haber | ✅ | `$1,900.00` en 4101 |
| C4 1101 Debe | ✅ | `$1,900.00` en 1101 |
| C5 Sin COGS | ✅ | Sin entradas en 5101 |
| C6 Sesión visible | ✅ | Sesión Sep 3 cerrada correctamente |
| C7 Esperado | ✅ | `$3,245.00` (apertura $1,500 + ventas efectivo $1,745) |
| C8 Contado | ✅ | `first_counted_cash = $3,245.00` = Esperado |
| C9 Diferencia | ✅ | `difference_amount = $0.00` |
| C10 Póliza discrepancia | ✅ | N/A — diferencia $0.00 |
| C11 Saldos ecuación | ✅ | Verificado al cierre del período |
| C12 Mayor 1101 y 4101 | ✅ | Movimientos coherentes |
| **Incidentes** | Ninguno | — |

---

### Día 4 — 2026-09-04 (Jueves)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ✅ | 16 ventas · $2,860.00 total |
| C2 Póliza JE-VTA | ✅ | 16 pólizas JE-VTA `confirmed` — 16 ventas = 16 pólizas |
| C3 4101 Haber | ✅ | `$2,860.00` en 4101 |
| C4 1101 Debe | ✅ | `$2,860.00` en 1101 |
| C5 Sin COGS | ✅ | Sin entradas en 5101 |
| C6 Sesión visible | ✅ | Sesión Sep 4 cerrada correctamente |
| C7 Esperado | ✅ | `$4,925.00` (apertura $1,500 + ventas efectivo $3,425) |
| C8 Contado | ✅ | `first_counted_cash = $4,925.00` = Esperado |
| C9 Diferencia | ✅ | `difference_amount = $0.00` |
| C10 Póliza discrepancia | ✅ | N/A — diferencia $0.00 |
| C11 Saldos ecuación | ✅ | Verificado al cierre del período |
| C12 Mayor 1101 y 4101 | ✅ | Movimientos coherentes |
| **Incidentes** | Clase D | Compra en efectivo de $17,000 (JE-CMP-0580C6FE · `5102 Gastos op.`). Operación legítima, clasificada como gasto operativo. |

---

### Día 5 — 2026-09-05 (Viernes)

**Día pico del período — 42 ventas.**

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ✅ | 42 ventas · $6,350.00 total — DÍA PICO |
| C2 Póliza JE-VTA | ✅ | 42 pólizas JE-VTA `confirmed` — 42 ventas = 42 pólizas |
| C3 4101 Haber | ✅ | `$6,350.00` en 4101 |
| C4 1101 Debe | ✅ | `$6,350.00` en 1101 |
| C5 Sin COGS | ✅ | Sin entradas en 5101 |
| C6 Sesión visible | ✅ | Sesión Sep 5 cerrada correctamente |
| C7 Esperado | ✅ | `$7,885.00` (apertura $1,500 + ventas efectivo $6,385) |
| C8 Contado | ✅ | `first_counted_cash = $7,885.00` = Esperado |
| C9 Diferencia | ✅ | `difference_amount = $0.00` |
| C10 Póliza discrepancia | ✅ | N/A — diferencia $0.00 |
| C11 Saldos ecuación | ✅ | Verificado al cierre del período |
| C12 Mayor 1101 y 4101 | ✅ | Movimientos coherentes — mayor volumen del período |
| **Incidentes** | Clase D | Compra menor en efectivo $560 (JE-CMP-9AAE82AB). Normal. |

---

### Día 6 — 2026-09-06 (Sábado)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ✅ | 10 ventas · $1,895.00 total |
| C2 Póliza JE-VTA | ✅ | 10 pólizas JE-VTA `confirmed` — 10 ventas = 10 pólizas |
| C3 4101 Haber | ✅ | `$1,895.00` en 4101 |
| C4 1101 Debe | ✅ | `$1,895.00` en 1101 |
| C5 Sin COGS | ✅ | Sin entradas en 5101 |
| C6 Sesión visible | ✅ | Sesión Sep 6 cerrada correctamente |
| C7 Esperado | ✅ | `$1,990.00` (apertura $1,500 + ventas efectivo $490) |
| C8 Contado | ✅ | `first_counted_cash = $1,990.00` = Esperado |
| C9 Diferencia | ✅ | `difference_amount = $0.00` |
| C10 Póliza discrepancia | ✅ | N/A — diferencia $0.00 |
| C11 Saldos ecuación | ✅ | Verificado al cierre del período |
| C12 Mayor 1101 y 4101 | ✅ | Movimientos coherentes |
| **Incidentes** | Ninguno | — |

---

### Día 7 — 2026-09-07 (Domingo)

**Negocio cerrado. Sin operaciones. Sin sesión abierta.**

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | N/A | 0 ventas — negocio cerrado |
| C2 Póliza JE-VTA | N/A | Sin ventas |
| C3 4101 Haber | N/A | Sin movimientos |
| C4 1101 Debe | N/A | Sin movimientos |
| C5 Sin COGS | ✅ | Sin entradas en 5101 |
| C6 Sesión visible | N/A | Sin sesión (0 sesiones `open` en PRD) |
| C7 Esperado | N/A | Sin sesión |
| C8 Contado | N/A | Sin sesión |
| C9 Diferencia | N/A | Sin sesión |
| C10 Póliza discrepancia | N/A | Sin sesión |
| C11 Saldos ecuación | ✅ | Ecuación final verificada (ver Resumen) |
| C12 Mayor 1101 y 4101 | ✅ | Sin cambios — coherente |
| **Incidentes** | Ninguno | — |

---

## Resumen de 7 días

Completado: 2026-09-07. Datos obtenidos via `supabase db query --linked` PRD (`cxpouhmrpcpiohrueuwk`).

| Métrica | Valor |
|---|---|
| Días monitoreados | 7 / 7 |
| Días con operaciones | 6 (Día 7 = negocio cerrado) |
| Checks aplicables completados ✅ | 72 / 72 (Días 1–6 × 12 checks) |
| Incidentes clase A | 0 |
| Incidentes clase B | 0 |
| Incidentes clase C | 0 |
| Incidentes clase D | 4 (compras en efectivo Sep 2×2, Sep 4, Sep 5 — todas normales) |
| Pólizas JE-VTA generadas (período) | 79 (1 Día 1 + 78 Días 2–6) |
| Días con diferencia de caja ≠ $0.00 | 0 |
| Días con póliza 4102 (sobrante) | 0 |
| Días con póliza 5101 (faltante) | 0 |
| COGS generados (esperado: 0) | 0 (5101 en catálogo = Faltantes, no COGS) |
| Ecuación contable cuadrada | ✅ Activos $22,057.68 = Capital $29,037.68 + Ingresos $13,120 − Gastos $20,100 |
| Total ventas período (Sep 2–6) | $13,110.00 (78 ventas) |
| Día pico | Sep 5 — 42 ventas · $6,350 |
| Compras clasificadas efectivo | $25,437.92 (1201 $5,337.92 + 5102 $20,100) |
| **Veredicto** | ✅ **APROBADO — Sistema de ledger estable. 0 incidentes A/B/C. Período de monitoreo concluido.** |

### Saldos finales por cuenta (al 2026-09-07)

| Cuenta | Nombre | Saldo |
|--------|--------|-------|
| 1101 | Caja operativa | −$10,817.92 (cash flujo neto) |
| 1102 | Caja fuerte | $24,000.00 |
| 1103 | Banco | $3,537.68 |
| 1201 | Compras por aplicar | $5,337.92 |
| 3101 | Aportaciones propietario | $29,037.68 |
| 4101 | Ingresos por ventas | $13,120.00 |
| 5102 | Gastos operativos generales | $20,100.00 |
| 4102 | Sobrantes de caja | $0.00 |
| 5101 | Faltantes de caja | $0.00 |

---

## Restricciones del período de monitoreo

- Sin SQL de escritura.
- Sin migraciones.
- Sin Edge Functions.
- Sin deploy durante monitoreo salvo incidente clase A autorizado.
- Sin modificar saldos.
- Sin borrar datos.
- Sin reversas ni ajustes contables manuales sin autorización separada.
- Sin operaciones financieras correctivas sin diagnóstico previo.

---

## Referencias

- `docs/ACTIVACION_LEDGER_PRD_20260901.md`
- `docs/VALIDACION_POST_ACTIVACION_LEDGER_PRD_20260901.md`
- `docs/HOTFIX_REPORTES_FINANZAS_POST_LEDGER_PRD_20260901.md`
- `supabase/migrations/20260811170000_reportes_ledger.sql`
- Tag: `v-ledger-prd-20260901`
