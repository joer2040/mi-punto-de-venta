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
| C1 Ventas del día | ⬜ | |
| C2 Póliza JE-VTA | ⬜ | |
| C3 4101 Haber | ⬜ | |
| C4 1101 Debe | ⬜ | |
| C5 Sin COGS | ⬜ | |
| C6 Sesión visible | ⬜ | |
| C7 Esperado | ⬜ | |
| C8 Contado | ⬜ | |
| C9 Diferencia | ⬜ | |
| C10 Póliza discrepancia | ⬜ | |
| C11 Saldos ecuación | ⬜ | |
| C12 Mayor 1101 y 4101 | ⬜ | |
| **Incidentes** | | |

---

### Día 3 — 2026-09-03 (Miércoles)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ⬜ | |
| C2 Póliza JE-VTA | ⬜ | |
| C3 4101 Haber | ⬜ | |
| C4 1101 Debe | ⬜ | |
| C5 Sin COGS | ⬜ | |
| C6 Sesión visible | ⬜ | |
| C7 Esperado | ⬜ | |
| C8 Contado | ⬜ | |
| C9 Diferencia | ⬜ | |
| C10 Póliza discrepancia | ⬜ | |
| C11 Saldos ecuación | ⬜ | |
| C12 Mayor 1101 y 4101 | ⬜ | |
| **Incidentes** | | |

---

### Día 4 — 2026-09-04 (Jueves)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ⬜ | |
| C2 Póliza JE-VTA | ⬜ | |
| C3 4101 Haber | ⬜ | |
| C4 1101 Debe | ⬜ | |
| C5 Sin COGS | ⬜ | |
| C6 Sesión visible | ⬜ | |
| C7 Esperado | ⬜ | |
| C8 Contado | ⬜ | |
| C9 Diferencia | ⬜ | |
| C10 Póliza discrepancia | ⬜ | |
| C11 Saldos ecuación | ⬜ | |
| C12 Mayor 1101 y 4101 | ⬜ | |
| **Incidentes** | | |

---

### Día 5 — 2026-09-05 (Viernes)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ⬜ | |
| C2 Póliza JE-VTA | ⬜ | |
| C3 4101 Haber | ⬜ | |
| C4 1101 Debe | ⬜ | |
| C5 Sin COGS | ⬜ | |
| C6 Sesión visible | ⬜ | |
| C7 Esperado | ⬜ | |
| C8 Contado | ⬜ | |
| C9 Diferencia | ⬜ | |
| C10 Póliza discrepancia | ⬜ | |
| C11 Saldos ecuación | ⬜ | |
| C12 Mayor 1101 y 4101 | ⬜ | |
| **Incidentes** | | |

---

### Día 6 — 2026-09-06 (Sábado)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ⬜ | |
| C2 Póliza JE-VTA | ⬜ | |
| C3 4101 Haber | ⬜ | |
| C4 1101 Debe | ⬜ | |
| C5 Sin COGS | ⬜ | |
| C6 Sesión visible | ⬜ | |
| C7 Esperado | ⬜ | |
| C8 Contado | ⬜ | |
| C9 Diferencia | ⬜ | |
| C10 Póliza discrepancia | ⬜ | |
| C11 Saldos ecuación | ⬜ | |
| C12 Mayor 1101 y 4101 | ⬜ | |
| **Incidentes** | | |

---

### Día 7 — 2026-09-07 (Domingo)

| Check | Estado | Observación |
|---|---|---|
| C1 Ventas del día | ⬜ | |
| C2 Póliza JE-VTA | ⬜ | |
| C3 4101 Haber | ⬜ | |
| C4 1101 Debe | ⬜ | |
| C5 Sin COGS | ⬜ | |
| C6 Sesión visible | ⬜ | |
| C7 Esperado | ⬜ | |
| C8 Contado | ⬜ | |
| C9 Diferencia | ⬜ | |
| C10 Póliza discrepancia | ⬜ | |
| C11 Saldos ecuación | ⬜ | |
| C12 Mayor 1101 y 4101 | ⬜ | |
| **Incidentes** | | |

---

## Resumen de 7 días

Completar al cierre del día 7 (2026-09-07).

| Métrica | Valor |
|---|---|
| Días monitoreados | / 7 |
| Checks completados | / 84 |
| Incidentes clase A | |
| Incidentes clase B | |
| Incidentes clase C | |
| Incidentes clase D | |
| Pólizas JE-VTA generadas | |
| Días con diferencia de caja ≠ $0.00 | |
| Días con póliza 4102/5101 generada | |
| COGS generados (esperado: 0) | |
| Ecuación contable cuadrada todos los días | |
| **Veredicto** | |

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
