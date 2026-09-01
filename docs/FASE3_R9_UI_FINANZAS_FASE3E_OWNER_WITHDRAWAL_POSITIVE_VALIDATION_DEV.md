# Fase 3E - Retiro del propietario - Validacion positiva DEV

Fecha de validacion: 2026-08-17

Ambiente: DEV local `http://localhost:5173`

Usuario solicitante: `Admin Dev`

Autorizador: `Codex Debug (codexdebug)`

## Alcance

Se valido en browser DEV la operacion `Finanzas -> Retiro del propietario` usando un fondo permitido por backend y se corrigio el pendiente no bloqueante de visibilidad en reportes.

Restricciones respetadas:

- No SQL manual.
- No PRD.
- No Edge Functions.
- No migraciones.
- No secrets.
- No cierre de caja.
- No nuevas operaciones financieras reales durante la correccion.
- No commits.
- No push.

## Operacion validada

Operacion real ejecutada previamente en DEV:

- Fondo origen: `1102 - Caja fuerte`
- Importe: `$1.00`
- Descripcion: `Prueba UI retiro Fase 3E`
- Autorizado por: `Codex Debug (codexdebug)`

Backend acepto la operacion.

Success alert original observado:

```text
Retiro registrado
$1.00 desde Caja fuerte.
```

Asiento identificado despues del fix:

```text
JE-RET-1C881241
```

## Causa raiz

El retiro se registro con `occurred_at` en `timestamptz`. Los RPC versionados de reportes comparan fechas contra limites UTC:

```text
je.occurred_at >= (p_from_date at time zone 'UTC')
je.occurred_at <  (p_to_date at time zone 'UTC' + interval '1 day')
```

La UI calculaba la fecha final por fecha local. La operacion realizada el `2026-08-17` por la tarde en Mexico quedaba almacenada en fecha UTC `2026-08-18`, por lo que los reportes con `to_date = 2026-08-17` no la incluian.

Adicionalmente, el success alert de Retiro ignoraba la respuesta `withdrawal.entry_number` que el backend ya devuelve.

## Correccion frontend aplicada

Archivos modificados:

- `src/components/FinancesOwnerWithdrawalPanel.jsx`
- `src/pages/FinancesJournal.jsx`
- `src/pages/FinancesLedger.jsx`

Cambios:

- `FinancesOwnerWithdrawalPanel.jsx` ahora lee `response.withdrawal.entry_number` y lo muestra en success alert si viene en la respuesta.
- `FinancesJournal.jsx` usa fecha final UTC por defecto para alinearse con los RPC de reportes.
- `FinancesLedger.jsx` usa fecha final UTC por defecto para alinearse con los RPC de reportes.
- `owner_withdrawal` se etiqueta como `Retiro del propietario`.
- `FinancesLedger.jsx` agrega `3102 - Retiros del propietario` como cuenta seleccionable para validar el impacto patrimonial desde UI.

No se inventa folio: si el backend no devuelve `entry_number`, el success alert solo muestra el mensaje de monto/fondo.

## Validacion browser posterior

No se ejecuto una nueva operacion financiera real.

### Polizas / Asientos

Filtro observado:

```text
Fecha inicial: 2026-08-01
Fecha final:   2026-08-18
```

Resultado:

```text
10 registros filtrados
```

Asiento de retiro visible:

```text
17/08/2026, 18:59  JE-RET-1C881241  Retiro del propietario  1102 Caja fuerte              Prueba UI retiro Fase 3E           Haber $1.00
17/08/2026, 18:59  JE-RET-1C881241  Retiro del propietario  3102 Retiros del propietario  Prueba UI retiro Fase 3E  Debe $1.00
```

Totales del reporte:

```text
Total Debe: $3,003.00 · Total Haber: $3,003.00
```

### Mayor 1102

Movimiento visible:

```text
17/08/2026, 18:59  JE-RET-1C881241  Retiro del propietario  Prueba UI retiro Fase 3E  Haber $1.00  Saldo $1,000.00
```

Resumen:

```text
Caja fuerte · Saldo: $1,000.00
```

### Mayor 3102

Movimiento visible:

```text
17/08/2026, 18:59  JE-RET-1C881241  Retiro del propietario  Prueba UI retiro Fase 3E  Debe $1.00  Saldo -$1.00
```

Resumen:

```text
Retiros del propietario · Saldo: -$1.00
```

## Impacto en saldos

Saldos validados en la corrida positiva:

```text
1102 Caja fuerte
Debitos:  $1,001.00
Creditos: $1.00
Saldo:    $1,000.00

3102 Retiros del propietario
Debitos:  $1.00
Creditos: $0.00
Saldo:    -$1.00

Activos: $3,000.00 · Pasivo + Capital: $3,000.00
```

## Consola browser

Se observaron errores de extension de Chrome, no atribuibles a la app:

```text
chrome-extension://egjidjbpglichdcondbcbdnbeeppgdph/inpage.js
Error: IN_PAGE_CHANNEL_NODE_ID in-page-channel-node-id not found
```

No se observo error de React relacionado con `Removing borderColor border`.

## Validaciones tecnicas

Comandos ejecutados:

```bash
npm run lint
npm run build
npm run test:finance
git diff --check
```

Resultado:

- `npm run lint`: OK.
- `npm run build`: OK.
- `npm run test:finance`: OK, 88/88 pruebas pasaron.
- `git diff --check`: exit code 0; solo mostro advertencias LF -> CRLF en archivos ya modificados del worktree.

## Resultado final

**Fase 3E Retiro del propietario DEV aprobada.**

El retiro real aceptado por backend ahora es visible en:

- `Polizas / Asientos`
- `Mayor 1102`
- `Mayor 3102`
- `Saldos de cuentas`

El folio confirmado es:

```text
JE-RET-1C881241
```
