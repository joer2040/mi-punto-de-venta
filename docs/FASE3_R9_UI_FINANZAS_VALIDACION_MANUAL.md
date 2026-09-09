# FASE3 R9 — Validación manual UI Finanzas read-only (DEV)

**Fecha:** 2026-08-16  
**URL:** http://localhost:5173  
**Servidor:** PID 26388 — `npm run dev` — Vite v7.3.2 — HTTP 200 confirmado  
**Usuario de prueba:** superadmin DEV  
**Supabase:** DEV (`rtkdrnfqihulqdhixxzf`)

---

## Protocolo de prueba

### Cómo abrir DevTools Network

1. Abre http://localhost:5173 en Chrome/Edge
2. F12 → pestaña **Network**
3. Filtro: escribe `financial-operations` en la caja de búsqueda
4. Mantén abierto durante toda la sesión de pruebas

---

## M-01 — Autenticación

| Paso | Acción | Resultado esperado | Resultado real |
|---|---|---|---|
| M-01-A | Abrir http://localhost:5173 | Pantalla de login | |
| M-01-B | Iniciar sesión con usuario superadmin DEV | Redirige a Home | |
| M-01-C | Verificar badge "Development" visible (esquina inferior derecha) | Badge visible | |

---

## M-02 — Navegación al módulo Finanzas

| Paso | Acción | Resultado esperado | Resultado real |
|---|---|---|---|
| M-02-A | Buscar botón "Finanzas" en nav | Botón visible | |
| M-02-B | Click en "Finanzas" | Carga `FinancesHome` hub | |
| M-02-C | Verificar sección "Reportes" con 4 cards | 4 cards: Saldos, Pólizas, Mayor, Sesiones | |
| M-02-D | Verificar sección "Operaciones financieras" | Sección visible (superadmin) | |
| M-02-E | Verificar cards de operaciones deshabilitadas | Badge "Próximamente" en cada card | |

---

## M-03 — Saldos de cuentas (`finances-balances`)

**Antes:** Network → limpiar log con ⊘

| Paso | Acción | Resultado esperado | Resultado real |
|---|---|---|---|
| M-03-A | Click card "Saldos de cuentas" | Carga `FinancesBalances` | |
| M-03-B | Verificar carga automática inicial sin error | Tabla con cuentas ó empty state | |
| M-03-C | Network: verificar POST a `financial-operations` | Status 200, body `{action: "get_account_balances"}` | |
| M-03-D | Verificar `Access-Control-Allow-Origin: http://localhost:5173` en response headers | Header presente, sin `*` | |
| M-03-E | Verificar columnas: Código, Cuenta, Tipo, Débitos, Créditos, Saldo | Todas visibles | |
| M-03-F | Saldo positivo en color teal | Texto verde-azul | |
| M-03-G | Ingresar fecha de corte → click "Consultar" | Recarga datos | |
| M-03-H | Click "Limpiar fecha" → recarga sin fecha | Network: nueva llamada sin `as_of` | |
| M-03-I | Click "Exportar Excel" | Descarga `saldos-cuentas.xlsx` | |

---

## M-04 — Pólizas / Asientos (`finances-journal`)

**Antes:** Network → limpiar log con ⊘

| Paso | Acción | Resultado esperado | Resultado real |
|---|---|---|---|
| M-04-A | Desde hub, click "Pólizas / Asientos" | Carga `FinancesJournal` | |
| M-04-B | Verificar fechas precargadas: primer día del mes → hoy | Inputs rellenos | |
| M-04-C | Verificar carga automática inicial | Tabla con pólizas ó empty state | |
| M-04-D | Network: POST a `financial-operations` con `action: "get_journal_report"` | Status 200 | |
| M-04-E | Verificar columnas: Fecha, Póliza, Tipo, Cuenta, Descripción, Debe, Haber | Todas visibles | |
| M-04-F | Líneas de la misma póliza agrupadas visualmente (fondo alternado) | Visible si hay pólizas multi-línea | |
| M-04-G | Debe/Haber: celda vacía cuando valor es 0 | No muestra "$0.00" | |
| M-04-H | Badge gris con código de cuenta (ej: `1101`) | Badge visible | |
| M-04-I | Summary: "Total Debe: $X · Total Haber: $Y" | Visible en footer tabla | |
| M-04-J | Cambiar fechas inválidas (from > to) → click Consultar | Error amber inline, sin llamada Network | |
| M-04-K | Dejar fecha inicial vacía → click Consultar | Error: "Ingresa fecha inicial y final" | |
| M-04-L | Click "Exportar Excel" | Descarga `polizas-contables.xlsx` | |

---

## M-05 — Mayor contable (`finances-ledger`)

**Antes:** Network → limpiar log con ⊘

| Paso | Acción | Resultado esperado | Resultado real |
|---|---|---|---|
| M-05-A | Desde hub, click "Mayor contable" | Carga `FinancesLedger` | |
| M-05-B | Selector de cuenta: default "1101 — Caja operativa" | Opción seleccionada | |
| M-05-C | Fechas precargadas: primer día del mes → hoy | Inputs rellenos | |
| M-05-D | Carga automática inicial | Tabla con movimientos ó empty state | |
| M-05-E | Network: POST con `action: "get_account_ledger"`, `account_code: "1101"` | Status 200 | |
| M-05-F | Columnas: Fecha, Póliza, Tipo, Descripción, Debe, Haber, Saldo | Todas visibles | |
| M-05-G | Columna Saldo: running balance, color teal/rojo por signo | Visible | |
| M-05-H | Summary: "Caja operativa · Saldo: $X" (último saldo) | Visible en footer | |
| M-05-I | Cambiar cuenta a "1102 — Caja fuerte" → click Consultar | Network: nueva llamada con `account_code: "1102"` | |
| M-05-J | Click "Limpiar filtros" | Resetea a 1101 + mes actual + auto-carga | |
| M-05-K | Click "Exportar Excel" | Descarga `mayor-1101.xlsx` (o el código activo) | |

---

## M-06 — Sesiones de caja (`finances-sessions`)

**Antes:** Network → limpiar log con ⊘

| Paso | Acción | Resultado esperado | Resultado real |
|---|---|---|---|
| M-06-A | Desde hub, click "Sesiones de caja" | Carga `FinancesCashSessions` | |
| M-06-B | Fechas precargadas: primer día del mes → hoy | Inputs rellenos | |
| M-06-C | Carga automática inicial | Tabla con sesiones ó empty state | |
| M-06-D | Network: POST con `action: "get_cash_sessions_report"` | Status 200 | |
| M-06-E | Columnas: Apertura, Cierre, Estado, Fondo inicio, Esperado, Contado, Diferencia, Resolución, Póliza | Todas visibles | |
| M-06-F | Badge "Abierta" verde / "Cerrada" gris | Según estado de sesión | |
| M-06-G | Campos null (Cierre, Contado, Diferencia, Resolución, Póliza) muestran "—" | Sin texto vacío ni undefined | |
| M-06-H | Summary: "N sesión(es) encontrada(s)" | Visible en footer | |
| M-06-I | Fechas inválidas → error amber inline | Sin llamada Network | |
| M-06-J | Click "Exportar Excel" | Descarga `sesiones-caja.xlsx` | |

---

## M-07 — CORS (verificación en Network)

Para cualquier llamada a `financial-operations`:

| Check | Valor esperado | Valor real |
|---|---|---|
| Request header `Origin` | `http://localhost:5173` | |
| Response header `Access-Control-Allow-Origin` | `http://localhost:5173` (exacto) | |
| ¿Contiene `*`? | NO | |
| Status de preflight OPTIONS (si aplica) | 200 | |

---

## M-08 — Permisos visuales

| Check | Resultado esperado | Resultado real |
|---|---|---|
| Nav muestra "Finanzas" para superadmin | Visible | |
| Hub sección "Operaciones" visible para superadmin | Visible | |
| Cards de operaciones deshabilitadas / Próximamente | Sin funcionalidad activa | |

> **Nota M-08-extra:** Validación con usuario `manager` pendiente hasta asignar usuario en `app_user_roles` DEV. Documentar como pendiente si `app_user_roles` sigue vacío.

---

## M-09 — Resumen de estado Network

Completa esta tabla con los resultados observados en DevTools:

| EF action | HTTP Status | Content-Type response | CORS header | Datos retornados |
|---|---|---|---|---|
| `get_account_balances` | | | | |
| `get_journal_report` | | | | |
| `get_account_ledger` | | | | |
| `get_cash_sessions_report` | | | | |

---

## Resultado global

| Categoría | Estado |
|---|---|
| Navegación hub Finanzas | ⬜ Pendiente |
| Saldos de cuentas | ⬜ Pendiente |
| Pólizas / Asientos | ⬜ Pendiente |
| Mayor contable | ⬜ Pendiente |
| Sesiones de caja | ⬜ Pendiente |
| CORS desde localhost:5173 | ⬜ Pendiente |
| Export Excel (4 pantallas) | ⬜ Pendiente |
| Permisos visuales superadmin | ⬜ Pendiente |
| Permisos manager (sin `app_user_roles`) | ⬜ PENDIENTE — requiere seed `app_user_roles` |

---

## Próximo paso post-validación

Si todos los ✅, el módulo read-only está listo.  
Siguiente fase: **Fase 3 — Operaciones financieras de escritura** (requiere autorización explícita).
