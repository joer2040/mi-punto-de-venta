# FASE3 R9 - UI Finanzas Fase 3E: Retiro del propietario DEV

**Fecha:** 2026-08-17  
**Entorno:** DEV (`http://localhost:5173`)  
**Usuario UI:** Admin Dev / superadmin DEV  
**Validacion:** Manual en Chrome

---

## Resultado final

**APROBADA CON PENDIENTE OPERATIVO.**

La UI de `Retiro del propietario` fue implementada e integrada en `Finanzas`. El panel abre, valida errores frontend, usa confirmacion inline, usa idempotency key y llama `financialService.recordOwnerWithdrawal`.

La operacion real pequena fue intentada con confirmacion explicita del usuario, pero el backend la rechazo porque el retiro debe estar autorizado por un usuario distinto al solicitante.

No se genero asiento ni cambio en saldos.

---

## Cambios implementados

Archivos:

- `src/components/FinancesOwnerWithdrawalPanel.jsx`
- `src/pages/FinancesHome.jsx`

Panel creado con:

- Fondo origen: `1101`, `1102`, `1103`.
- Importe requerido.
- Descripcion opcional con default `Retiro del propietario`.
- Autorizado por (UUID) requerido por contrato backend.
- Confirmacion inline con `FinanceConfirm`.
- Alertas con `FinanceAlert`.
- Idempotencia con `generateIdempotencyKey()`.
- Envio via `financialService.recordOwnerWithdrawal`.

`FinancesHome`:

- Card `Retiro del propietario` activa.
- Reversa continua como `Proximamente`.

---

## Validaciones frontend

Validado en browser desde `Finanzas -> Retiro del propietario`.

| Caso | Resultado |
|---|---|
| Importe vacio | `El importe debe ser mayor que 0.` |
| Importe `0` | `El importe debe ser mayor que 0.` |
| Importe negativo | `El importe debe ser mayor que 0.` |
| Importe con 3 decimales | `El importe admite maximo 2 decimales.` |
| Autorizador vacio | `El UUID autorizador es obligatorio.` |
| Autorizador invalido | `El UUID autorizador debe ser valido.` |

En todos los casos:

- No se mostro confirmacion si habia errores.
- No se envio operacion financiera.
- Los campos invalidos mostraron borde rojo con `border` shorthand.
- No se uso `window.alert`.

Evidencia de estilo computado:

`border: 0.666667px solid rgb(220, 38, 38)`  
`outline: rgb(220, 38, 38) solid 0.666667px`

---

## Operacion real intentada

Operacion preparada:

| Campo | Valor |
|---|---|
| Origen | `1101 - Caja operativa` |
| Importe | `$1.00` |
| Descripcion | `Prueba UI retiro Fase 3E` |
| Autorizador inicial | Usuario actual (`Admin Dev`) |

El usuario confirmo ejecutar el retiro DEV.

Resultado backend:

`El retiro debe ser autorizado por un usuario distinto al solicitante.`

Interpretacion:

- `record_owner_withdrawal` requiere `authorized_by`.
- El backend no acepta que `authorized_by` sea el mismo usuario que ejecuta.
- La UI fue ajustada para capturar y validar explicitamente un UUID de autorizador distinto.
- La UI de `Usuarios` no expone UUIDs de usuario, por lo que no se pudo obtener un autorizador distinto por una via visible sin consultar DB.

---

## Impacto en saldos

Validado en `Finanzas -> Saldos de cuentas`.

Antes del intento:

| Cuenta | Debitos | Creditos | Saldo |
|---|---:|---:|---:|
| `1101 Caja operativa` | `$1,001.00` | `$1.00` | `$1,000.00` |
| `3102 Retiros del propietario` | `$0.00` | `$0.00` | `$0.00` |

Despues del rechazo:

| Cuenta | Debitos | Creditos | Saldo |
|---|---:|---:|---:|
| `1101 Caja operativa` | `$1,001.00` | `$1.00` | `$1,000.00` |
| `3102 Retiros del propietario` | `$0.00` | `$0.00` | `$0.00` |

No hubo impacto contable.

---

## Polizas y mayor

No se genero poliza/asiento porque el backend rechazo la operacion antes del registro contable.

No se valido mayor de retiro porque no hubo asiento nuevo.

---

## Consola

No se observaron errores funcionales nuevos de la app asociados a `financial-operations`, fuera del error de negocio mostrado por la UI.

Ruido externo observado:

- `chrome-extension://egjidjbpglichdcondbcbdnbeeppgdph/inpage.js`
- `IN_PAGE_CHANNEL_NODE_ID in-page-channel-node-id not found`

---

## Validacion tecnica

| Comando | Resultado |
|---|---|
| `npm run lint` | OK |
| `npm run build` | OK |
| `npm run test:finance` | OK, 88/88 |

---

## Restricciones respetadas

- No se implemento reversa.
- No se modificaron Edge Functions.
- No se modifico SQL.
- No se modificaron migraciones.
- No se cambiaron Supabase secrets.
- No se toco PRD.
- No se ejecutaron SQL manuales.
- No se llamaron RPCs financieras directas.
- No se consultaron tablas financieras directas desde navegador.
- No se cerro caja DEV.
- No se hicieron commits.
- No se hizo push.

---

## Pendiente

Para aprobar la operacion real completa se necesita obtener por UI una autorizacion con UUID de un usuario distinto al solicitante, o implementar una mejora UX autorizada que exponga/seleccione usuarios autorizadores sin consultar tablas financieras directas ni modificar backend.
