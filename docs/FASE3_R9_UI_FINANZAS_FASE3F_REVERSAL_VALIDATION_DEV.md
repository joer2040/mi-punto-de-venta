# Fase 3F - Reversa de poliza - Validacion DEV

Fecha de validacion: 2026-08-17

Ambiente: DEV local `http://localhost:5173`

Usuario UI: `Admin Dev` / superadmin DEV

Autorizador seleccionado: `Codex Debug (codexdebug)`

## Alcance

Se valido en browser DEV el flujo `Finanzas -> Reversa de poliza` para reversar la poliza candidata:

```text
JE-RET-1C881241
```

Motivo usado:

```text
Prueba UI reversa Fase 3F
```

Restricciones respetadas:

- No SQL manual.
- No PRD.
- No Edge Functions.
- No migraciones.
- No secrets.
- No cierre de caja DEV.
- No commits.
- No push.
- No DB directa desde frontend.

## Correccion aplicada por bug directo de operacion

Se encontro un bug directo en `src/components/FinancesJournalReversalPanel.jsx`.

El formulario pedia `Numero de poliza` y la operacion candidata era `JE-RET-1C881241`, pero el componente enviaba ese folio como `journalEntryId` a `financialService.reverseJournalEntry`.

El backend espera un UUID de asiento, por lo que enviar `JE-RET-1C881241` habria provocado rechazo por formato UUID.

Correccion frontend aplicada:

- Si el usuario escribe un UUID, se envia directamente.
- Si el usuario escribe un folio visible `JE-*`, el panel consulta `financialService.getJournalReport` para resolver `entry_number -> entry_id`.
- No se consulta DB directa.
- No se llama RPC financiera directa desde navegador.
- No se inventa UUID.
- El success alert ahora muestra el folio de reversa devuelto por backend.

## Validaciones frontend

Se abrio `Finanzas -> Reversa de poliza`.

Errores frontend validados con formulario vacio:

```text
El numero de poliza es obligatorio.
Selecciona el autorizador.
El motivo es obligatorio.
```

Validacion visual:

```text
border: 1px solid rojo usando shorthand border
outline: 1px solid rojo
```

No se observo warning React relacionado con:

```text
Removing borderColor border
```

Select de autorizador:

- Cargo usuarios activos.
- Excluyo al usuario actual.
- Mostro `Codex Debug (codexdebug)`.
- El value interno fue UUID valido.
- La confirmacion mostro nombre + username, no UUID crudo.

Confirmacion mostrada antes de enviar:

```text
Confirmar reversa de poliza
Poliza: JE-RET-1C881241
Autorizado por: Codex Debug (codexdebug)
Motivo: Prueba UI reversa Fase 3F
```

## Operacion ejecutada

El usuario confirmo explicitamente ejecutar la reversa DEV.

Operacion real enviada:

- Poliza a reversar: `JE-RET-1C881241`
- Motivo: `Prueba UI reversa Fase 3F`
- Autorizador: `Codex Debug (codexdebug)`

Backend acepto la operacion.

Success alert observado:

```text
Reversa registrada
Poliza JE-RET-1C881241 reversada exitosamente. Reversa: JE-REV-B31F1EE0.
```

Asiento de reversa generado:

```text
JE-REV-B31F1EE0
```

## Validacion posterior de reportes

Se recupero acceso browser DEV con superadmin `Admin Dev` y se valido visualmente desde la UI.

No se ejecutaron nuevas operaciones financieras reales.

### Saldos de cuentas

Resultado observado:

```text
1102 Caja fuerte
Debitos:  $1,002.00
Creditos: $1.00
Saldo:    $1,001.00

3102 Retiros del propietario
Debitos:  $1.00
Creditos: $1.00
Saldo:    $0.00

Activos: $3,001.00 · Pasivo + Capital: $3,001.00
```

Saldos refleja correctamente el efecto neto de la reversa:

- `1102 Caja fuerte` recupera el `$1.00` del retiro.
- `3102 Retiros del propietario` queda neto en `$0.00`.
- La ecuacion contable cuadra.

### Polizas / Asientos

Rango observado:

```text
Fecha inicial: 2026-08-01
Fecha final:   2026-08-18
```

La poliza de reversa aparece:

```text
17/08/2026, 20:16  JE-REV-B31F1EE0  Reversa  1102 Caja fuerte              REVERSA: Prueba UI retiro Fase 3E  Debe  $1.00
17/08/2026, 20:16  JE-REV-B31F1EE0  Reversa  3102 Retiros del propietario  REVERSA: Prueba UI retiro Fase 3E  Haber $1.00
```

Totales del reporte:

```text
Total Debe: $3,003.00 · Total Haber: $3,003.00
```

La poliza original `JE-RET-1C881241` no aparece en el reporte despues de la reversa.

Clasificacion: pendiente de reporte backend/RPC. La reversa marca la poliza original como `reversed`, mientras `get_journal_report` filtra solo `je.status = 'confirmed'`.

### Mayor 1102

Rango observado:

```text
Fecha inicial: 2026-08-01
Fecha final:   2026-08-18
```

Movimiento de reversa visible:

```text
17/08/2026, 20:16  JE-REV-B31F1EE0  Reversa  REVERSA: Prueba UI retiro Fase 3E  Debe $1.00  Saldo $1,002.00
```

Resumen observado:

```text
Caja fuerte · Saldo: $1,002.00
```

El movimiento original `JE-RET-1C881241` no aparece en Mayor 1102 despues de la reversa.

Esto deja el saldo de Mayor `1102` en `$1,002.00`, distinto del saldo del reporte de Saldos (`$1,001.00`).

Clasificacion: pendiente de reporte backend/RPC. `get_account_ledger` filtra solo `je.status = 'confirmed'`, por lo que excluye la poliza original marcada `reversed`.

### Mayor 3102

Rango observado:

```text
Fecha inicial: 2026-08-01
Fecha final:   2026-08-18
```

Movimiento de reversa visible:

```text
17/08/2026, 20:16  JE-REV-B31F1EE0  Reversa  REVERSA: Prueba UI retiro Fase 3E  Haber $1.00  Saldo $1.00
```

Resumen observado:

```text
Retiros del propietario · Saldo: $1.00
```

El movimiento original `JE-RET-1C881241` no aparece en Mayor 3102 despues de la reversa.

Esto deja el saldo de Mayor `3102` en `$1.00`, distinto del saldo del reporte de Saldos (`$0.00`).

Clasificacion: pendiente de reporte backend/RPC. `get_account_ledger` filtra solo `je.status = 'confirmed'`, por lo que excluye la poliza original marcada `reversed`.

## Consola browser

Durante la ejecucion de la reversa solo se observaron errores de extension de Chrome, no atribuibles a la app:

```text
chrome-extension://egjidjbpglichdcondbcbdnbeeppgdph/inpage.js
Error: IN_PAGE_CHANNEL_NODE_ID in-page-channel-node-id not found
```

No se observo error React relacionado con `Removing borderColor border`.

## Validaciones tecnicas

Antes y despues de corregir el bug directo de resolucion de folio se ejecutaron:

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
- `git diff --check`: exit code 0; mostro solo advertencias LF -> CRLF en archivos ya modificados del worktree.

## Resultado final

**Fase 3F Reversa de poliza DEV aprobada con pendiente de reporte backend/RPC.**

La operacion real fue aceptada por backend y genero:

```text
JE-REV-B31F1EE0
```

Pendiente:

- Ajustar el criterio de reportes para que `Polizas / Asientos` y `Mayor contable` muestren tambien la poliza original marcada `reversed`, o expongan el estado de la poliza original de forma auditable.
- Resolver la inconsistencia entre `Saldos` y `Mayor`: Saldos si refleja el efecto neto del retiro + reversa, pero Mayor solo muestra la reversa porque excluye el asiento original revertido.

## Validacion del fix backend/RPC

Fecha de validacion: 2026-08-18

Se valido en browser DEV con `Admin Dev`, sin ejecutar operaciones financieras reales.

### Polizas / Asientos

Rango consultado: `2026-08-01` a `2026-08-18`.

Resultado observado:

- `JE-RET-1C881241` aparece nuevamente con badge `REVERSADA`.
- `JE-REV-B31F1EE0` aparece como `Reversa`.
- El reporte muestra 12 registros y conserva el cuadre visual: Debe `$3,004.00` y Haber `$3,004.00`.

### Mayor 1102 Caja fuerte

Se observaron ambos movimientos:

- `JE-RET-1C881241`, estado `REVERSADA`: Haber `$1.00`, saldo `$1,000.00`.
- `JE-REV-B31F1EE0`: Debe `$1.00`, saldo final `$1,001.00`.

### Mayor 3102 Retiros del propietario

Se observaron ambos movimientos:

- `JE-RET-1C881241`, estado `REVERSADA`: Debe `$1.00`, saldo `-$1.00`.
- `JE-REV-B31F1EE0`: Haber `$1.00`, saldo final `$0.00`.

La inconsistencia anterior entre Pólizas/Mayor y Saldos quedó corregida visualmente.

### Consola

No hubo errores de la aplicación. Solo apareció ruido de extensión Chrome:

```text
IN_PAGE_CHANNEL_NODE_ID in-page-channel-node-id not found
```

### Resultado

**Fix backend/RPC de reportes validado positivamente en DEV.**

## Revalidacion no destructiva

Fecha de revalidacion: 2026-08-18

Se revalido en browser DEV sin ejecutar nuevas operaciones financieras reales.

Resultado:

- El panel `Reversa de poliza` abre correctamente.
- Validaciones frontend de campos requeridos siguen funcionando:
  - `El numero de poliza es obligatorio.`
  - `Selecciona el autorizador.`
  - `El motivo es obligatorio.`
- Los campos con error muestran borde rojo usando `border` shorthand.
- `Polizas / Asientos` sigue mostrando `JE-REV-B31F1EE0`.
- `Polizas / Asientos` sigue sin mostrar `JE-RET-1C881241`, consistente con el pendiente backend/RPC documentado.
- No se observaron errores de app en consola; solo ruido de extension Chrome `IN_PAGE_CHANNEL_NODE_ID in-page-channel-node-id not found`.

Validaciones ejecutadas:

```text
npm run lint: OK
npm run build: OK
npm run test:finance: OK, 88/88
git diff --check: exit code 0, solo warnings LF -> CRLF
```

## Investigacion del pendiente de reportes

Fecha de investigacion: 2026-08-17

Se reviso el flujo completo sin ejecutar nuevas operaciones financieras reales:

- `src/pages/FinancesJournal.jsx` no filtra por estado. Usa directamente `result?.entries ?? []` y renderiza cada fila recibida.
- `src/api/financialService.js` envia unicamente `from_date` y `to_date` a `get_journal_report`; no elimina entradas `reversed`.
- `supabase/functions/financial-operations/handler.js` reenvia la respuesta del RPC como `{ entries: data }`; tampoco aplica un filtro por estado.
- `supabase/migrations/20260811170000_reportes_ledger.sql` define `get_journal_report` con `where je.status = 'confirmed'`.
- `supabase/migrations/20260811160000_fondos_reversas.sql` marca la poliza original como `reversed` despues de confirmar la reversa.

Conclusion:

La respuesta del backend no incluye `JE-RET-1C881241` despues de la reversa. El ocultamiento no se corrige en frontend porque la UI no recibe esa fila. No se modifico `FinancesJournal.jsx`, `financialService.js` ni el handler, y no se simularon datos.

Pendiente backend/RPC:

```text
get_journal_report debe permitir incluir pólizas reversed para trazabilidad de reversas
```

El mismo criterio afecta `get_account_ledger`, que tambien filtra solo `confirmed` y provoca la diferencia observada entre Mayor y Saldos. La correccion requiere una decision y cambio backend/RPC/migracion fuera del alcance autorizado en esta validacion.
