# Smoke Tests PRD — Finanzas

## 1. Resumen ejecutivo

Resultado final: **DEPLOY PRD FINANZAS APROBADO POR SMOKE TESTS**.

La revalidacion posterior a la remediacion CORS confirmo que el usuario manager ve y abre Finanzas, el ledger PRD permanece inactivo y los cuatro reportes cargan sin error 500 ni crash de UI.

El smoke previo de POS/caja tambien quedo aprobado: venta minima en efectivo, mesa liberada y cierre de caja sin diferencia.

## 2. Ambiente

- Fecha: 2026-08-31.
- URL: `https://lacarreta.mobi/`.
- Browser: Chrome.
- Bundle PRD validado: `/assets/index-D7pUPsoq.js`.
- Usuario operativo del smoke POS: `Administrador General` (`admin`).
- Usuario de revalidacion Finanzas: `manager` — Juan Sosa.
- Ledger PRD: inactivo.

## 3. Estado deploy

Estado confirmado para la revalidacion:

- Migraciones Finance aplicadas en PRD.
- `pos-operations` desplegada.
- `erp-operations` v13 desplegada.
- `cash-operations` desplegada.
- `financial-operations` redesplegada con CORS remediado.
- `ALLOWED_ORIGINS=https://lacarreta.mobi`.
- Preflight autorizado: HTTP 200 con `Access-Control-Allow-Origin: https://lacarreta.mobi`.
- Origen no autorizado: HTTP 403.
- Ledger PRD no activado.

Browser confirmo que las solicitudes autenticadas de reportes ya alcanzan `financial-operations` y retornan datos.

## 4. Smoke POS con caja abierta

### Apertura de caja

- Monto inicial: `$1.00`.
- Apertura: `31/08/2026 13:10`.
- Resultado: `Caja abierta correctamente.`
- Estado observado: `Abierto`.

### Venta minima

- Mesa: `Mesa 12`.
- Producto: `CIGARROS MARLBORO BLANCOS LARGOS.`
- Cantidad: `1`.
- Precio y pago en efectivo: `$10.00`.
- Folio: `31082026231318`.
- Fecha/hora del ticket: `31/08/2026 17:13`.
- Stock visible: de `3` a `2`.
- Resultado: venta exitosa, sin error de `finalize_pos_sale` y sin error 500.
- Mesa 12 despues de la venta: `LIBRE`.
- Mapa posterior: 12 mesas libres y 0 ocupadas.

## 5. POS sin caja abierta

Resultado backend: **APROBADO CON PENDIENTE UX NO BLOQUEANTE**.

Despues del cierre, un intento de agregar producto en Mesa 12 fue rechazado por la Edge Function. No se genero segundo folio, no se registro otra venta y Mesa 12 permanecio libre despues de recargar.

Pendiente UX: el acceso visual al POS no se actualizo inmediatamente y la consola mostro un error generico en lugar del mensaje de negocio:

```text
Error al guardar automaticamente la mesa: Error: Edge Function returned a non-2xx status code
```

La regla backend de no operar sin caja se mantuvo.

## 6. Cierre caja con mesa activa

Este escenario no formo parte de la revalidacion final posterior a CORS. El contexto de entrada declaro POS/caja PRD previamente aprobados.

### Cierre normal validado

- Apertura: `$1.00`.
- Ventas en efectivo: `$10.00`.
- Efectivo esperado: `$11.00`.
- Efectivo contado: `$11.00`.
- Estado final: `Cerrado`.
- Ultimo cierre: `31/08/2026 17:13`.
- Monto final: `$11.00`.
- Mensaje: `Caja cerrada y reporte PDF generado.`
- Diferencia pendiente: ninguna.

## 7. Finanzas visible manager

Resultado: **APROBADO**.

- Login: `manager`.
- Nombre mostrado: Juan Sosa.
- Card `Finanzas`: visible en Inicio.
- Opcion `Finanzas`: visible en navegacion.
- Hub `Modulo Financiero`: abre sin acceso denegado ni crash.
- Operaciones financieras de escritura: no ejecutadas.

## 8. Reportes Finanzas

### Saldos de cuentas

- Resultado: aprobado.
- Registros: 11 cuentas.
- Cuentas visibles con debitos, creditos y saldo en `$0.00`.
- Activos: `$0.00`.
- Pasivo + Capital: `$0.00`.
- Balance contable: cumple igualdad.

### Polizas / Asientos

- Resultado: aprobado.
- Rango: `2026-08-01` a `2026-08-31`.
- Registros: 0.
- Mensaje: `Sin polizas para el rango de fechas seleccionado.`
- Total Debe: `$0.00`.
- Total Haber: `$0.00`.
- Resultado coherente con ledger inactivo.

### Mayor contable

- Resultado: aprobado.
- Cuenta inicial: `1101 — Caja operativa`.
- Rango: `2026-08-01` a `2026-08-31`.
- Registros: 0.
- Mensaje: `Sin movimientos para la cuenta y filtros seleccionados.`
- Resultado coherente con ledger inactivo.

### Sesiones de caja

- Resultado: aprobado.
- Registros: 22 sesiones.
- Paginacion: 3 paginas, 10 registros por pagina.
- La sesion smoke aparece en primer lugar:
  - Session ID: `f693452e-4283-41cf-80d3-efabaf948bfe`.
  - Apertura: `31/08/2026 13:10`.
  - Cierre: `31/08/2026 17:13`.
  - Estado: `Cerrada`.
  - Fondo inicial: `$1.00`.
  - Esperado: `$11.00`.
  - Diferencia: `$0.00`.
  - Resolucion: ninguna.
  - Poliza: ninguna, coherente con ledger inactivo.

## 9. Incidentes

### CORS de `financial-operations` — resuelto

Antes de la remediacion, los reportes mostraban `Failed to send a request to the Edge Function`. Despues de configurar el origin PRD y redesplegar solamente `financial-operations`, los cuatro reportes cargaron correctamente.

### Refresco POS despues del cierre — pendiente no bloqueante

El acceso visual a POS permanecio disponible inmediatamente despues de cerrar caja. El backend rechazo el guardado y no persistio el pedido. Se recomienda actualizar el estado de acceso y mostrar el mensaje backend legible.

### Consola

Sin errores de aplicacion durante la revalidacion financiera. Solo se observo ruido de la extension Chrome sobre un canal asincrono cerrado.

## 10. Restricciones respetadas

- Ledger PRD no activado.
- Sin SQL.
- Sin migraciones.
- Sin nuevos deploys durante esta revalidacion.
- Sin traspasos.
- Sin aportaciones.
- Sin retiros.
- Sin reversas.
- Sin resolucion de diferencias.
- Sin operaciones financieras reales del modulo Finanzas.
- Sin limpieza manual de datos.
- Sin commits.
- Sin push.

## 11. Resultado final

**Deploy PRD Finanzas aprobado por smoke tests.**

Criterios de salida cumplidos:

1. Manager ve y abre Finanzas.
2. Saldos carga 11 cuentas y muestra balance en cero.
3. Polizas carga sin error y muestra 0 registros.
4. Mayor carga sin error y muestra 0 movimientos.
5. Sesiones carga 22 registros e incluye la sesion smoke cerrada.
6. Ledger PRD permanece inactivo y no genero polizas por la venta/caja smoke.
7. Sin error 500 ni crash de UI.

Pendiente no bloqueante: mejorar el refresco y mensaje de POS al cerrar caja.

