# FASE3 R9 — UI Finanzas Fase 3A: Infraestructura para operaciones (DEV)

**Fecha:** 2026-08-16  
**Rama:** `chore/code-cleanup`

---

## Objetivo

Preparar la infraestructura mínima reutilizable que los formularios de operaciones financieras necesitarán. No se ejecutan operaciones reales. Las cards de operaciones siguen deshabilitadas.

---

## Archivos creados

### `src/components/FinanceAlert.jsx`

Componente de alerta reutilizable para el módulo de Finanzas.

**Props:**
| Prop | Tipo | Requerido | Default | Descripción |
|---|---|---|---|---|
| `type` | `'success' \| 'error' \| 'warning' \| 'info'` | No | `'info'` | Variante visual |
| `title` | `string` | No | — | Título en negrita (opcional) |
| `message` | `string` | No | — | Cuerpo del mensaje |
| `onDismiss` | `function` | No | — | Muestra botón × si se pasa |

**Variantes visuales:**

| Tipo | Fondo | Borde | Texto | Ícono |
|---|---|---|---|---|
| `success` | `green50` | `green100` | `green700` | ✓ |
| `error` | `red50` | `red100` | `red700` | ✕ |
| `warning` | `amber50` | `#fde68a` | `amber700` | ⚠ |
| `info` | `blue50` | `blue100` | `blue700` | ℹ |

Tiene atributo `role="alert"` para accesibilidad. Usa `type as typography` (alias) para evitar colisión con la prop `type`.

---

### `src/lib/financeIdempotency.js`

Helper para generar claves de idempotencia.

```javascript
export const generateIdempotencyKey = () => crypto.randomUUID()
```

**Patrón de uso en formularios:**
```javascript
// Inicializar UNA VEZ al montar el form — no en cada render
const idempotencyKeyRef = useRef(generateIdempotencyKey())

// Regenerar solo tras éxito o retry explícito
const handleRetry = () => {
  idempotencyKeyRef.current = generateIdempotencyKey()
}

// Pasar al servicio al ejecutar
await financialService.recordTransfer({
  ...campos,
  idempotencyKey: idempotencyKeyRef.current,
})
```

UUID v4 cumple el patrón `/^[A-Za-z0-9\-_.]{1,128}$/` requerido por la Edge Function.

---

### `src/components/FinanceConfirm.jsx`

Componente de confirmación inline para operaciones delicadas. No es modal — reemplaza el formulario durante el paso de confirmación.

**Props:**
| Prop | Tipo | Requerido | Default |
|---|---|---|---|
| `title` | `string` | Sí | — |
| `lines` | `string[]` | No | `[]` |
| `onConfirm` | `function` | Sí | — |
| `onCancel` | `function` | Sí | — |
| `loading` | `bool` | No | `false` |
| `confirmLabel` | `string` | No | `'Confirmar operación'` |

**Visual:** Fondo `amber50`, borde `#fde68a`, botón Confirmar en `amber700`.

**Patrón de uso en formularios:**
```jsx
{confirmPending ? (
  <FinanceConfirm
    title="Confirmar traspaso"
    lines={[
      `De: ${fromName}`,
      `A: ${toName}`,
      `Monto: ${formatCurrency(amount)}`,
    ]}
    onConfirm={handleExecute}
    onCancel={() => setConfirmPending(false)}
    loading={submitting}
  />
) : (
  <form>...</form>
)}
```

---

## Archivos modificados

### `src/pages/FinancesHome.jsx`

- Agrega import `FinanceAlert`.
- Agrega banner `type="info"` encima de las cards de Operaciones (solo para superadmin).
- Cards de operaciones siguen `disabled` con badge "Próximamente".

---

## Validación

### Lint
```
npx eslint src/components/FinanceAlert.jsx src/components/FinanceConfirm.jsx \
           src/lib/financeIdempotency.js src/pages/FinancesHome.jsx
→ 0 errores, 0 advertencias ✅
```

### Tests
```
npm run test:finance
→ 88/88 pass, 0 fail ✅
```

### Build
| Chunk | Tamaño |
|---|---|
| `FinancesHome-CsU74Rub.js` | 5.56 kB (era 4.16 kB — +1.4 kB por FinanceAlert inline) |

`FinanceConfirm` y `financeIdempotency` no aparecen en build aún — ningún módulo los importa todavía. Aparecerán como chunks cuando los formularios de operaciones los consuman.

---

## Estado de la Fase 3

| Componente | Estado |
|---|---|
| `FinanceAlert` | ✅ Listo |
| `FinanceConfirm` | ✅ Listo |
| `generateIdempotencyKey` | ✅ Listo |
| `FinancesHome` info banner | ✅ Integrado |
| Formularios de operaciones (Traspaso, Aportación, Retiro, Discrepancia, Reversa) | ⬜ Fase 3B+ — pendiente autorización |
