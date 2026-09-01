# Remediación — Ledger activo en DEV

**Fecha:** 2026-08-18  
**Rama:** `chore/code-cleanup`  
**Contexto:** Tras confirmar que el ledger DEV estaba activo (ver [`DIAGNOSTICO_LEDGER_ACTIVO_COMPRAS_DEV.md`](DIAGNOSTICO_LEDGER_ACTIVO_COMPRAS_DEV.md)), se ejecutaron 3 pasos de remediación.

---

## Paso 1 — Indicador visual de estado del ledger ✅

### Cambio implementado

Archivo: `src/pages/FinancesHome.jsx`

- Import `useEffect` + `financialService`.
- `useEffect` en mount llama `financialService.getLedgerStatus()`.
- Badge pill renderizado en el hero cuando la respuesta llega.

### Comportamiento esperado

| Estado | Badge |
|---|---|
| Ledger activo | Pill verde: `● Ledger activo — corte: DD/MM/AAAA HH:MM` |
| Ledger inactivo | Pill gris: `● Ledger inactivo` |
| Cargando | Sin badge (null inicial) |

### Validación técnica

| Check | Resultado |
|---|---|
| `npm run lint` | ✅ Sin errores |
| `npm run build` | ✅ `FinancesHome-C-PQBWc6.js` 40.52 kB |

### Validación manual pendiente (usuario)

Abrir DEV → Módulo Finanzas → verificar que el badge aparece con:
```
● Ledger activo — corte: 15/08/2026 17:20
```
(hora en zona `America/Mexico_City` correspondiente a `2026-08-15 22:20:18+00`).

---

## Paso 2 — Validación gasto operativo DEV

### Premisa corregida

El ledger DEV **está activo** desde `2026-08-15`. Cualquier compra con `payment != null` generará asientos contables. Esto es correcto y esperado — el RPC funciona por diseño.

**Para gasto operativo:** el RPC clasifica items sin `material_id` como cuenta **5102 (Gastos operativos generales)**. El crédito depende del método de pago:
- `Transferencia` / `Tarjeta` → 1103 Banco
- `Efectivo` → 1101 Caja operativa (requiere caja abierta)

### Pasos manuales — ejecutar en DEV

1. Ir a **Módulo Compras → Nueva compra**.
2. Seleccionar tipo: **Gasto operativo**.
3. Seleccionar cualquier proveedor (ej. uno existente).
4. Agregar renglón: `item_description` libre, sin `material_id` (campo descripción, no selector de materiales).
5. Seleccionar método de pago: **Transferencia** (no requiere caja abierta).
6. Asignar folio, total pequeño (ej. $1.00).
7. Revisar en modal de confirmación que muestra: Tipo = "Gasto operativo", Método = "Transferencia".
8. Confirmar → registrar.

### Resultado esperado

| Campo | Valor esperado |
|---|---|
| HTTP status EF | 200 |
| `journal_entry_id` | UUID (no null) |
| Cuenta débito | **5102 Gastos operativos generales** |
| Cuenta crédito | **1103 Banco** |
| Tipo póliza | `purchase` |
| `purchase_type` en `purchase_items` | items con `material_id = null` |

Diferencia clave con compra de inventario `JE-CMP-A04E11FA`:
- Inventario → débito 1201 (Compras de mercancía)
- Gasto → débito **5102** (Gastos operativos generales)

### Verificación en Supabase Dashboard DEV

Tras registrar el gasto, ejecutar en SQL Editor:

```sql
SELECT
  je.journal_entry_number,
  jl.account_code,
  jl.debit_amount,
  jl.credit_amount,
  jl.description
FROM journal_entries je
JOIN journal_entry_lines jl ON jl.journal_entry_id = je.id
WHERE je.journal_entry_number LIKE 'JE-CMP-%'
ORDER BY je.created_at DESC
LIMIT 10;
```

El gasto operativo debe mostrar una línea con `account_code = '5102'` en débito.

### Resultado — pendiente de ejecución manual

```
journal_entry_number : [PENDIENTE]
account_code débito  : [PENDIENTE]  ← debe ser 5102
account_code crédito : [PENDIENTE]  ← debe ser 1103
```

---

## Paso 3 — Documentación de resultados

### Resumen del estado actual (post-remediación)

| Aspecto | Estado |
|---|---|
| Indicador ledger en UI | ✅ Implementado — badge en `FinancesHome.jsx` |
| Ledger DEV | Activo desde `2026-08-15 22:20:18+00` |
| Compra de inventario DEV (`JE-CMP-A04E11FA`) | ✅ Asiento correcto — 1201 / 1103 |
| Compra de gasto operativo DEV | ⏳ Pendiente validación manual |
| Build | ✅ Limpio |
| Lint | ✅ Limpio |

### Premisas actualizadas

| Entorno | Ledger | Compras con payment |
|---|---|---|
| DEV | **Activo** | Generan asientos — débito según tipo (1201 o 5102), crédito según método (1103 o 1101) |
| PRD | **Inactivo** | Registran compra/inventario/pagos, NO generan asientos hasta activación explícita en fase posterior |

### Restricciones cumplidas

- ✅ No se tocó PRD.
- ✅ No se activó ni desactivó ledger.
- ✅ No se ejecutó SQL manual.
- ✅ No se modificó `financialService` (solo se consumió `getLedgerStatus`).
- ✅ No se crearon módulos nuevos.
- ✅ No se hicieron commits ni push.
- ✅ No se revirtió compra DEV `a04e11fa` ni póliza `JE-CMP-A04E11FA`.

---

## Relacionados

- [`DIAGNOSTICO_LEDGER_ACTIVO_COMPRAS_DEV.md`](DIAGNOSTICO_LEDGER_ACTIVO_COMPRAS_DEV.md) — causa raíz y evidencia de ledger activo
- [`EVIDENCIA_PURCHASE_TYPE_PAYMENT.md`](EVIDENCIA_PURCHASE_TYPE_PAYMENT.md) — cambios de separación inventario/gasto
- [`CHECKLIST_APROBACION_DEPLOY_FINANZAS_PRD.md`](CHECKLIST_APROBACION_DEPLOY_FINANZAS_PRD.md) — estado deploy PRD (No-Go)

---

# Validacion manual ejecutada - gasto operativo DEV

**Fecha:** 2026-08-18  
**Usuario UI:** `Admin Dev`  
**Ambiente:** DEV local `http://localhost:5173` contra proyecto `rtkdrnfqihulqdhixxzf`

## Resultado final

**Validacion aprobada con pendiente no bloqueante.**

El gasto operativo real DEV genero poliza contable correcta con debito `5102` y credito `1103`.

Pendiente no bloqueante: al usar proveedor distinto de `Proveedor General`, backend devuelve `El item 1 debe incluir un material valido`, por lo que la EF desplegada conserva una restriccion legacy de proveedor para conceptos libres aunque la UI ya expone `purchase_type = expense`.

## Evidencia browser

Badge observado en `Finanzas`:

```text
Ledger activo - corte: 15/08/2026, 04:20 p.m.
```

Intento rechazado con proveedor `MEGACABLE`:

```text
HTTP 400
El item 1 debe incluir un material valido.
```

Gasto aceptado con `Proveedor General`:

| Campo | Valor |
|---|---|
| Tipo | `Gasto operativo` |
| Proveedor | `Proveedor General` |
| Folio | `DEV-GASTO-PRELEDGER-20260818` |
| Concepto | `Validacion gasto operativo ledger activo DEV` |
| Metodo de pago | `Transferencia` |
| Importe | `$1.00` |
| HTTP EF | `200` |
| purchase.id | `c33acfd0-f0ce-4aa1-a57d-658593d36c77` |
| journal_entry_id | `5ef8dce6-a475-43c1-b8c0-a1f765d4b56d` |
| financial_operation_id | `9c42f0fc-fe3c-4cfd-ad28-ce0019bd7146` |

Poliza validada en `Polizas / Asientos`:

| Campo | Valor |
|---|---|
| Poliza | `JE-CMP-C33ACFD0` |
| Tipo | `Compra` |
| Fecha UI | `18/08/2026, 13:08` |
| Linea credito | `1103 Banco` - `Pago Transferencia - DEV-GASTO-PRELEDGER-20260818` - `$1.00` |
| Linea debito | `5102 Gastos operativos generales` - `Gasto operativo - DEV-GASTO-PRELEDGER-20260818` - `$1.00` |

Totales del reporte de polizas tras la operacion:

```text
Total Debe:  $3,006.00
Total Haber: $3,006.00
```

`Reporte de Compras` muestra:

| Campo | Valor |
|---|---|
| Tipo | `Gasto operativo` |
| Proveedor | `Proveedor General` |
| Factura | `DEV-GASTO-PRELEDGER-20260818` |
| Fecha UI | `18/08/2026, 13:08` |
| Monto | `$1.00` |

```text
7 registros
Total comprado: $1,332.00
```

Consola browser:

- Sin errores de app posteriores a la operacion aceptada.
- Mensajes normales de Vite/React/Supabase.
- Aviso menor de accesibilidad/autocomplete.
- Error esperado del intento rechazado con `MEGACABLE`: `Edge Function returned a non-2xx status code`.
