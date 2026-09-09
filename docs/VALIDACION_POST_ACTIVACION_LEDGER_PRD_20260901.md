# Validacion postactivacion Ledger PRD - 2026-09-01

## 1. Resumen ejecutivo

Se completo la validacion operativa del primer dia posterior a la activacion del ledger PRD. Se abrio una caja con fondo controlado de `$1.00`, se registro una venta real minima en efectivo por `$10.00` y se cerro la caja con `$11.00` contado, sin diferencia.

La venta genero la poliza balanceada `JE-VTA-02092026014501`, con cargo a `1101 Caja operativa` y abono a `4101 Ingresos por ventas`. No se genero poliza de costo de ventas ni poliza de diferencia de caja.

**Resultado: APROBADA CON PENDIENTES DE REPORTE NO BLOQUEANTES.**

## 2. Ambiente y estado inicial

| Campo | Evidencia |
|---|---|
| Ambiente | PRD - `https://lacarreta.mobi` |
| Usuario | `Administrador General` |
| Ledger | Activo |
| Corte mostrado por UI | `01/09/2026, 19:28` America/Monterrey |
| Corte UTC documentado | `2026-09-02 01:28:36+00` |
| Poliza inicial | `JE-INICIAL-63AD25A7` |
| Estado inicial de caja | Cerrada |
| Estado inicial de mesas | 12 libres, 0 ocupadas |

Antes de operar, la poliza inicial aparecio en Polizas / Asientos con cuatro lineas y totales Debe/Haber de `$29,037.68`.

## 3. Apertura de caja

| Campo | Valor |
|---|---:|
| Fecha | `01/09/2026` |
| Hora de apertura | `19:43` |
| Fondo inicial | `$1.00` |
| Ventas antes de la prueba | `$0.00` |
| Efectivo esperado antes de la prueba | `$1.00` |

## 4. Venta real minima

| Campo | Valor |
|---|---|
| Cuenta | Mesa 12 |
| Producto | `CIGARROS MARLBORO BLANCOS LARGOS.` |
| Cantidad | 1 |
| Importe | `$10.00` |
| Metodo de pago | Efectivo |
| Folio | `02092026014501` |
| Fecha/hora de ticket | `01/09/2026 19:45` |

La venta fue exitosa, se mostro el Ticket Virtual y Mesa 12 regreso a estado libre. El mapa quedo con 12 mesas libres y 0 ocupadas.

## 5. Poliza de venta

Poliza generada: `JE-VTA-02092026014501`, tipo visual `Venta`.

| Cuenta | Descripcion | Debe | Haber |
|---|---|---:|---:|
| 1101 Caja operativa | Cobro Efectivo - venta `02092026014501` | `$10.00` | - |
| 4101 Ingresos por ventas | Ingreso venta `02092026014501` | - | `$10.00` |
| **Total** | | **$10.00** | **$10.00** |

El reporte final mostro seis lineas contables en el rango `2026-09-01` a `2026-09-02`: cuatro de la poliza inicial y dos de la venta. Sus totales globales quedaron en `$29,047.68` Debe y `$29,047.68` Haber.

## 6. Ausencia de COGS

No aparecio ninguna poliza `cost_of_goods_sold` ni movimientos adicionales de costo en Polizas / Asientos. La unica poliza nueva fue `JE-VTA-02092026014501`, con las dos lineas descritas arriba.

## 7. Cierre de caja

| Campo | Valor |
|---|---:|
| Fondo inicial | `$1.00` |
| Ventas registradas | `$10.00` |
| Efectivo esperado | `$11.00` |
| Efectivo contado | `$11.00` |
| Diferencia | `$0.00` |
| Hora de cierre | `01/09/2026 19:46` |
| Estado final | Cerrado |
| PDF | UI confirmo `Caja cerrada y reporte PDF generado.` |

No se genero poliza de sobrante `4102` ni de faltante `5101`, consistente con una diferencia de cero.

## 8. Reportes financieros

### Saldos

- `1101 Caja operativa`: `$1,510.00`.
- `1102 Caja fuerte`: `$24,000.00`.
- `1103 Banco`: `$3,537.68`.
- `4101 Ingresos por ventas`: `$10.00` credito.
- `4102 Sobrantes de caja`: `$0.00`.
- `5101 Faltantes de caja`: `$0.00`.
- Activos mostrados: `$29,047.68`.
- `Pasivo + Capital` mostrado: `$29,037.68`.

Los asientos estan balanceados. Sin embargo, el resumen visual `Pasivo + Capital` no incorpora el resultado del ingreso `4101`; al incluir el ingreso de `$10.00`, la igualdad contable es `$29,047.68 = $29,047.68`.

### Polizas / Asientos

- Poliza inicial visible: `JE-INICIAL-63AD25A7`.
- Poliza de venta visible: `JE-VTA-02092026014501`.
- Debe/Haber global: `$29,047.68 / $29,047.68`.
- Sin poliza COGS.
- Sin poliza de diferencia de caja.

### Mayor 1101

- Saldo inicial: `$1,500.00`.
- Debito de venta: `$10.00`.
- Saldo final: `$1,510.00`.

### Mayor 4101

No fue posible seleccionarlo: el selector del Mayor solo expone `1101`, `1102`, `1103`, `3101` y `3102`. La poliza y Saldos si muestran el credito de `$10.00` en `4101`.

### Sesiones de caja

La sesion cerrada no aparecio con el rango permitido por la UI. La pantalla usa fecha local maxima `2026-09-01`, mientras la apertura ocurrio despues de las `00:00 UTC` del `2026-09-02`. El intento de usar `2026-09-02` fue rechazado por el control de fecha, por lo que el reporte mantuvo cero registros.

## 9. Incidentes y pendientes

1. El resumen de Saldos rotulado `Pasivo + Capital` no incluye ingresos/gastos del periodo, aunque los asientos Debe/Haber si cuadran.
2. Mayor contable no ofrece la cuenta `4101`, por lo que no permite validar su movimiento desde ese reporte.
3. Sesiones de caja tiene un desfase de filtro local/UTC que oculta sesiones nocturnas del dia local actual.

No se observaron errores de aplicacion en consola. Solo se registro el mensaje informativo de inicializacion del cliente Supabase para production.

## 10. Restricciones respetadas

- No se ejecutaron migraciones ni SQL.
- No se modificaron ni desplegaron Edge Functions.
- No se activo ni desactivo el ledger.
- No se ejecutaron traspasos, aportaciones, retiros, reversas ni resoluciones de diferencia.
- No se modificaron saldos iniciales ni se borraron datos.
- No se hicieron commits ni push.

## 11. Resultado final

Resultado validacion postactivacion ledger PRD:

- Documento creado: `docs/VALIDACION_POST_ACTIVACION_LEDGER_PRD_20260901.md`
- Ledger PRD: activo
- Poliza inicial: `JE-INICIAL-63AD25A7`
- Caja: abierta con `$1.00` y cerrada con `$11.00`
- Venta real: 1 unidad por `$10.00` en efectivo, Mesa 12
- Folio: `02092026014501`
- Poliza venta: `JE-VTA-02092026014501`
- Cuenta 4101: credito `$10.00`
- Debe/Haber venta: `$10.00 / $10.00`
- COGS: no generado
- Cierre caja: exitoso, PDF generado
- Diferencia: `$0.00`
- Poliza diferencia: no generada
- Reportes: Saldos, Polizas y Mayor 1101 validados; Mayor 4101 y Sesiones con pendientes de UI
- Saldos finales: 1101 `$1,510.00`, 1102 `$24,000.00`, 1103 `$3,537.68`, 4101 `$10.00`
- Restricciones respetadas: si
- Resultado final: **APROBADA CON PENDIENTES DE REPORTE NO BLOQUEANTES**
