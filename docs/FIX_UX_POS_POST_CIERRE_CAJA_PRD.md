# Fix UX POS post-cierre de caja - Validacion PRD

## 1. Objetivo

Validar en `https://lacarreta.mobi` que, despues del cierre de caja, el POS muestre el mensaje de negocio:

```text
No hay una sesión de caja abierta.
```

La validacion tambien debe confirmar que el backend bloquea la operacion, no se genera venta, pedido ni folio, y no aparece un error HTTP 500.

## 2. Ambiente

- Ambiente: PRD
- Fecha: 31/08/2026
- Usuario: Administrador General
- URL: `https://lacarreta.mobi`
- Bundle principal cargado: `assets/index-D94x_ZFF.js`
- Chunk POS observado: `assets/POS-AB-vt3Wz.js`

El bundle nuevo se cargo despues de recargar la aplicacion. La carga inicial todavia tenia `assets/index-D7pUPsoq.js`.

## 3. Estado de caja

En `Control y Corte de Caja` se confirmo:

- Estado: `Cerrado`.
- Ultima apertura: `31/08/2026 13:10`.
- Ultimo cierre: `31/08/2026 17:13`.
- Monto final: `$11.00`.
- No habia una sesion de caja abierta al ejecutar la prueba.

## 4. Prueba POS sin caja abierta

1. Se abrio el POS.
2. El mapa mostraba `4` barras libres y `12` mesas libres, sin mesas ocupadas.
3. Se selecciono `Mesa 12`, que estaba libre.
4. Se intento agregar `CIGARROS MARLBORO BLANCOS LARGOS.` por `$10.00`.
5. La interfaz mostro un aviso visible.

Resultado del aviso:

```text
Aviso
Error inesperado.
```

Resultado esperado:

```text
No hay una sesion de caja abierta.
```

El aviso ya es visible, pero el mensaje de negocio no se propaga. Por lo tanto, el criterio UX principal no queda aprobado.

## 5. Bloqueo y persistencia

La operacion fue rechazada al intentar guardar automaticamente la mesa. La consola registro:

```text
Error al guardar automaticamente la mesa: Error: Error inesperado.
```

Origen observado:

```text
assets/POS-AB-vt3Wz.js:2:684
```

Despues de recargar y volver al POS se confirmo:

- `Mesa 12` seguia libre.
- Las `12` mesas seguian libres y habia `0` ocupadas.
- No aparecio `Folio de venta` en el POS.
- No se persistio un pedido.

En `Reportes -> Reporte de Ventas`, la venta mas reciente continuo siendo la operacion previa de las `17:13`, folio `31082026231318`, por `$10.00`. No se genero una venta ni un folio nuevo por este intento.

## 6. Error HTTP 500

No se observo ningun mensaje de error 500 ni un fallo 500 visible en la aplicacion. La operacion fue rechazada y no persistio datos. Las herramientas de browser usadas en esta validacion no expusieron el codigo HTTP exacto de la respuesta, por lo que la evidencia se limita a confirmar que no hubo un 500 visible.

## 7. Resultado por criterio

| Criterio | Resultado | Evidencia |
|---|---|---|
| Bundle nuevo cargado | APROBADO | `index-D94x_ZFF.js` y `POS-AB-vt3Wz.js` |
| Sin caja abierta | APROBADO | Control de caja en estado `Cerrado` |
| Intento de agregar producto | APROBADO | Producto agregado a `Mesa 12` para disparar el guardado |
| Aviso visible | APROBADO PARCIAL | El aviso aparece, pero dice `Error inesperado.` |
| Mensaje de negocio exacto | NO APROBADO | No aparece `No hay una sesión de caja abierta.` |
| Backend bloquea operacion | APROBADO | Guardado rechazado y mesa libre despues de recargar |
| Sin venta, pedido o folio | APROBADO | Sin pedido persistido y sin nueva venta en el reporte |
| Sin error 500 | APROBADO CON LIMITACION | No hubo 500 visible; codigo HTTP no disponible en la evidencia |

## 8. Consola

Se observo un error de aplicacion asociado directamente a la prueba:

```text
Error al guardar automaticamente la mesa: Error: Error inesperado.
```

No se observaron errores adicionales relevantes durante la revalidacion.

## 9. Restricciones respetadas

- Sin SQL.
- Sin migraciones.
- Sin cambios o despliegues de Edge Functions.
- Sin activar o modificar ledger.
- Sin operaciones financieras.
- Sin commits.
- Sin push.
- Sin venta, pedido o folio generado por la prueba.

## 10. Resultado final

**Fix UX POS post-cierre en PRD: NO APROBADO.**

El control backend protege correctamente la integridad de la operacion, pero el frontend sigue mostrando `Error inesperado.` en lugar del mensaje de negocio requerido. El pendiente queda acotado a la propagacion o interpretacion del mensaje de error en el flujo de guardado automatico del POS.

## 11. Diagnostico del segundo fix

La respuesta que recibe el frontend desde `pos-operations` contiene:

```json
{"error":"Error inesperado."}
```

La causa original esta en el manejo del error de Supabase dentro de la Edge Function: algunos errores de PostgREST son objetos planos y no instancias de `Error`. El catch del backend sustituye esos objetos por `Error inesperado.`. La restriccion de este ajuste prohibe modificar Edge Functions, por lo que el frontend no puede recuperar de esa respuesta el mensaje SQL original.

El ajuste frontend usa una verificacion contextual y acotada: solo cuando `save_table_order` falla con `Error inesperado.`, consulta `cashControlService.getSessionOverview()`. Si no existe una sesion abierta, muestra exactamente:

```text
No hay una sesión de caja abierta.
```

Otros mensajes y errores conservan su contenido original.

## 12. Cambios locales

- `src/api/posService.js`: usa clones de la respuesta HTTP para poder interpretar JSON o texto sin consumir el body antes del fallback.
- `src/pages/POS.jsx`: enriquece exclusivamente el error generico de autoguardado mediante el estado de caja y muestra el mensaje de negocio requerido.
- `src/App.jsx`: estabiliza `handlePosEditingStateChange` con `useCallback`.

El ultimo cambio corrige un bug directo detectado durante la validacion: la dependencia inestable provocaba un ciclo de renders y multiples errores `Maximum update depth exceeded` al entrar al POS.

## 13. Validacion DEV posterior

- Ambiente: DEV local conectado al backend DEV.
- Usuario: `Admin Dev`.
- Caja: `Cerrado`, ultimo cierre `31/08/2026 21:42`.
- Mesa usada: `Mesa 12`.
- Producto usado para disparar el autoguardado: `CLAMATO PREPARADO.` por `$60.00`.
- Aviso visible observado: `No hay una sesión de caja abierta.`.
- Despues de recargar: Mesa 12 `LIBRE`, 12 mesas libres y 0 ocupadas.
- No se genero pedido persistente, ticket, venta ni folio.
- Consola final: aparece el rechazo esperado del autoguardado; no vuelve a aparecer `Maximum update depth exceeded`.

Validaciones tecnicas:

```text
npm run lint          OK
npm run build         OK
npm run test:finance  OK, 88/88
git diff --check       OK, solo warnings LF -> CRLF existentes
```

Bundle local final:

```text
assets/index-By9D3XIc.js
assets/POS-DiTtZIPa.js
```

## 14. Estado posterior al fix local

**Fix UX POS post-cierre en DEV: APROBADO.**

El codigo local esta listo para preparar un deploy exclusivamente frontend. La aprobacion PRD permanece pendiente hasta desplegar este build y repetir la validacion en `https://lacarreta.mobi`.

## 15. Deploy frontend PRD

Deploy ejecutado exclusivamente con Vercel:

```text
vercel --prod
```

Resultado:

- Deployment ID: `dpl_5XhbTskAdGga3emsqjpE5k9Xp6nE`.
- Estado: `Ready`.
- Target: `production`.
- Deployment: `https://mi-punto-de-venta-30n5zxqf5-joer2040s-projects.vercel.app`.
- Alias productivo: `https://lacarreta.mobi`.
- Bundle principal: `assets/index-CWbXX94K.js`.
- Chunk POS: `assets/POS-BPPzZfAz.js`.

No se desplegaron Edge Functions ni se modifico infraestructura Supabase.

## 16. Revalidacion PRD final

Condiciones:

- Usuario: `Administrador General`.
- Caja PRD: `Cerrado`.
- Ultimo cierre: `31/08/2026 17:13`.
- Monto final: `$11.00`.
- Mesa usada: `Mesa 12`, inicialmente libre.

Prueba:

1. Se abrio Mesa 12 sin caja abierta.
2. Se agregaron conceptos de cocteleria para disparar el autoguardado.
3. El backend rechazo cada intento.
4. La interfaz mostro exactamente:

```text
No hay una sesión de caja abierta.
```

El mensaje fue detectado en el DOM aproximadamente `1.3 s` despues del intento. El aviso conserva su cierre automatico configurado.

Integridad posterior:

- Despues de recargar, Mesa 12 continuo `LIBRE`.
- Mapa POS: 12 mesas libres y 0 ocupadas.
- No se genero pedido persistente.
- No se mostro ticket ni folio en POS.
- Reporte de Ventas mantuvo como ultimo registro la venta previa del `31/08/2026 17:13`, folio `31082026231318`, por `$10.00`.
- No se genero una venta ni un folio nuevo.

Consola:

- Rechazos esperados de autoguardado: 3.
- Errores `Maximum update depth exceeded`: 0.
- Otros errores de aplicacion: 0.

## 17. Resultado final PRD

**Fix UX POS post-cierre en PRD: APROBADO.**

El frontend muestra el mensaje de negocio requerido, el backend mantiene el bloqueo y no se persisten pedidos, ventas, tickets ni folios cuando la caja esta cerrada.
