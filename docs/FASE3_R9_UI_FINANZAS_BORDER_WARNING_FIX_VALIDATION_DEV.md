# FASE3 R9 - UI Finanzas: Validacion fix warning borderColor DEV

**Fecha:** 2026-08-17  
**Entorno:** DEV local (`http://localhost:5173`)  
**Usuario UI:** Admin Dev / superadmin DEV

---

## Objetivo

Revalidar en browser el fix del warning React:

`Removing borderColor border`

Archivos corregidos previamente:

- `src/components/FinancesTransferPanel.jsx`
- `src/components/FinancesOwnerContributionPanel.jsx`

Cambio esperado:

- `errorBorderStyle` usa `border: 1px solid ...`
- Ya no mezcla `borderColor` con `border` durante rerenders
- El borde rojo de validacion se conserva visualmente

---

## Alcance ejecutado

- App local disponible en `http://localhost:5173`.
- Browser autenticado con superadmin DEV.
- No se confirmaron operaciones financieras.
- No se ejecuto SQL.
- No se toco PRD.
- No se modificaron Edge Functions.
- No se hicieron commits ni push.

---

## Evidencia estatica

Ambos componentes tienen `errorBorderStyle` con shorthand `border`:

```js
const errorBorderStyle = {
  border: `1px solid ${colors.red600}`,
  outline: `1px solid ${colors.red600}`,
}
```

No se encontro `borderColor` en `errorBorderStyle`.

---

## Validacion browser - Traspaso

Flujo:

1. Ir a Finanzas.
2. Abrir `Traspaso entre fondos`.
3. Forzar errores frontend:
   - origen `1101`
   - destino `1101`
   - importe vacio
4. Presionar `Continuar`.

Resultado UI:

- Error inline visible: `El fondo destino debe ser diferente al origen.`
- Error inline visible: `El importe debe ser mayor que 0.`
- No aparecio confirmacion de traspaso.
- Campo `Fondo destino` mostro borde rojo.
- Campo `Importe` mostro borde rojo.

Estilos computados observados:

| Campo | Border | Outline |
|---|---|---|
| Fondo destino | `solid rgb(220, 38, 38)` | `solid rgb(220, 38, 38)` |
| Importe | `solid rgb(220, 38, 38)` | `solid rgb(220, 38, 38)` |

Consola:

- `Removing borderColor border`: **0 ocurrencias nuevas**
- Logs nuevos de `localhost:5173`: **0**

---

## Validacion browser - Aportacion

Flujo:

1. Cerrar panel de traspaso.
2. Abrir `Aportacion del propietario`.
3. Forzar error frontend:
   - importe `1.123`
4. Presionar `Continuar`.

Resultado UI:

- Error inline visible: `El importe admite máximo 2 decimales.`
- No aparecio confirmacion de aportacion.
- Campo `Importe` mostro borde rojo.

Estilos computados observados:

| Campo | Border | Outline |
|---|---|---|
| Importe | `solid rgb(220, 38, 38)` | `solid rgb(220, 38, 38)` |

Consola:

- `Removing borderColor border`: **0 ocurrencias nuevas**
- Logs nuevos de `localhost:5173`: **0**

---

## Resultado final

**APROBADO.**

El fix queda validado manualmente en browser:

- Traspaso mantiene borde rojo de validacion.
- Aportacion mantiene borde rojo de validacion.
- No se reprodujo el warning React `Removing borderColor border`.
- No se ejecutaron operaciones financieras reales.
