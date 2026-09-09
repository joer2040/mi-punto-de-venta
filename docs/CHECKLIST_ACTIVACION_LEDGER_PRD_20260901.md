# Checklist Activación Ledger PRD — 2026-09-01

## 1. Objetivo

Preparar la activación controlada del ledger contable en PRD. Este documento define los requisitos, saldos iniciales, política contable, plan de ejecución y validaciones requeridas. La activación no debe ejecutarse hasta que todos los requisitos estén cumplidos y exista autorización explícita final.

## 2. Alcance

Fase de activación inicial:

- Activar ledger PRD con saldos de efectivo y capital.
- Cuentas incluidas: 1101 Caja operativa, 1102 Caja fuerte, 1103 Banco, 3101 Capital inicial.
- Cuentas excluidas en esta fase: inventario inicial, costo de ventas, activos fijos.
- Objetivo contable: establecer punto de partida operativo para registrar pólizas desde la activación en adelante.

Fuera de alcance en esta fase:

- Inventario inicial contable.
- Costo de ventas (COGS).
- Activos fijos.
- Cuentas por pagar/cobrar.
- Contabilidad completa o histórica.

## 3. Estado actual PRD

| Componente | Estado |
|---|---|
| URL PRD | `https://lacarreta.mobi` |
| Frontend | Operativo — bundle `index-CWbXX94K.js` |
| POS | Operativo |
| Control y corte de caja | Operativo |
| Finanzas UI (Saldos, Polizas, Mayor, Sesiones) | Operativo |
| Ledger PRD | **Inactivo** |
| Caja PRD | Cerrada |
| CORS `financial-operations` | Remediado — `ALLOWED_ORIGINS=https://lacarreta.mobi` |

## 4. Saldos iniciales

Saldos a registrar como póliza de apertura contable:

| Código | Cuenta | Saldo inicial |
|---|---|---:|
| 1101 | Caja operativa | $1,500.00 |
| 1102 | Caja fuerte | $24,000.00 |
| 1103 | Banco | $3,537.68 |
| **Total activos** | | **$29,037.68** |

Contrapartida:

| Código | Cuenta | Saldo inicial |
|---|---|---:|
| 3101 | Aportaciones / Capital inicial | $29,037.68 |

Cuadre: Activos $29,037.68 = Capital $29,037.68 ✓

## 5. Política contable inicial

- Activación mínima: solo efectivo disponible y capital inicial.
- Sin inventario inicial contable — los productos en almacén no se capitalizan en esta fase.
- Sin costo de ventas (COGS) — las ventas posteriores a la activación no generarán asientos de costo hasta que se defina la política y se active esta función en una fase separada.
- Sin activos fijos ni deudas registradas.
- Las ventas y compras posteriores a la activación sí generarán pólizas contables normales (excepto COGS).
- Esta política puede ampliarse en fases posteriores con autorización explícita.

## 6. Requisitos antes de activar

Todos deben estar cumplidos antes de ejecutar la activación:

### Operativos
- [ ] Caja PRD cerrada.
- [ ] 0 mesas ocupadas en el POS.
- [ ] 0 pedidos en proceso.
- [ ] 0 ventas en proceso o pendientes de confirmación.
- [ ] Hora de corte definida y acordada con el responsable operativo.

### Organizacionales
- [ ] Responsable operativo definido y presente durante la activación.
- [ ] Saldos iniciales revisados y aprobados por el responsable.
- [ ] Política contable inicial aprobada (sin COGS, sin inventario).

### Técnicos
- [ ] Backup / snapshot de la base de datos PRD confirmado.
- [ ] Validación DEV completada (ver sección 7).
- [ ] `get_ledger_status` en PRD confirma ledger inactivo antes de comenzar.
- [ ] Reportes de Saldos y Sesiones baseline documentados antes de activar.

## 7. Validación DEV requerida

Antes de ejecutar en PRD, validar en ambiente DEV que el flujo completo funciona correctamente:

- [ ] Simular activación con saldos iniciales (aportación de capital $29,037.68).
- [ ] Confirmar `get_ledger_status` reporta ledger activo después de la activación.
- [ ] Confirmar póliza de apertura generada en Mayor de 1101, 1102, 1103 y 3101.
- [ ] Reporte de Saldos muestra balance: Activos = Pasivo + Capital.
- [ ] Realizar venta en efectivo posterior a la activación y confirmar que genera póliza.
- [ ] Apertura y cierre de caja posterior a la activación y confirmar pólizas de caja.
- [ ] Registrar una compra de inventario y confirmar póliza de compra.
- [ ] Registrar un gasto operativo (retiro) y confirmar póliza.
- [ ] Confirmar que COGS no se genera en ventas (política sin costo de ventas).
- [ ] Reportes Finanzas (Polizas, Mayor, Sesiones) muestran datos correctos.
- [ ] Sin errores 500 ni crashes de UI durante el flujo completo.

## 8. Plan de activación PRD

**No ejecutar hasta que todos los requisitos de la sección 6 estén cumplidos y se emita autorización explícita final.**

Pasos de ejecución (referencia para cuando sea autorizado):

1. Confirmar `get_ledger_status` → ledger inactivo.
2. Documentar estado baseline: Saldos, Sesiones activas, caja cerrada.
3. Ejecutar aportación de capital inicial desde el módulo Finanzas:
   - Concepto: "Apertura contable inicial".
   - Monto: $29,037.68.
   - Distribución manual o automática según la implementación del módulo.
4. Confirmar `get_ledger_status` → ledger activo.
5. Confirmar póliza de apertura generada.
6. Ejecutar validaciones postactivación (sección 9).
7. Documentar resultado en informe de activación.

## 9. Validaciones postactivación PRD

Inmediatamente después de activar:

- [ ] `get_ledger_status` → `active`.
- [ ] Reporte de Saldos: 1101 muestra $1,500.00, 1102 muestra $24,000.00, 1103 muestra $3,537.68, 3101 muestra $29,037.68.
- [ ] Balance contable cuadrado: Activos $29,037.68 = Pasivo + Capital $29,037.68.
- [ ] Póliza de apertura visible en reporte de Pólizas.
- [ ] Mayor de 1101 muestra saldo inicial $1,500.00.
- [ ] Mayor de 1102 muestra saldo inicial $24,000.00.
- [ ] Mayor de 1103 muestra saldo inicial $3,537.68.
- [ ] Mayor de 3101 muestra saldo inicial $29,037.68.
- [ ] Venta nueva (posterior a activación) genera póliza esperada.
- [ ] Sin error 500 ni crash de UI.
- [ ] Sin generación involuntaria de pólizas históricas.

## 10. Riesgos y contención

| Riesgo | Contención |
|---|---|
| Descuadre contable post-apertura | Detener operaciones, no realizar más entradas, documentar y escalar |
| Activación duplicada | Verificar `get_ledger_status` antes de cada intento |
| Pólizas históricas no deseadas | No ejecutar migraciones adicionales durante la activación |
| Datos incorrectos en saldos iniciales | Revisar y aprobar saldos con responsable antes de ejecutar |
| Fallo de Edge Function durante activación | Verificar logs, no reintentar sin análisis, no hacer rollback destructivo |
| Necesidad de rollback | Documentar incidente, no borrar datos, escalar para decisión |

Ante cualquier comportamiento inesperado durante la activación:

1. Detener la activación.
2. No realizar más operaciones hasta evaluar el estado.
3. Documentar el incidente con evidencia (capturas, logs, folios).
4. No hacer rollback destructivo sin análisis previo.

## 11. Restricciones

- No activar ledger PRD sin autorización explícita final del responsable operativo.
- No ejecutar operaciones financieras reales (traspasos, aportaciones, retiros, reversas, resolución de diferencias) fuera del flujo de activación controlada.
- No modificar inventario inicial ni activar costo de ventas en esta fase.
- No hacer SQL directo en PRD fuera del proceso autorizado.
- No deploy de Edge Functions durante la activación a menos que sea un hotfix autorizado.
- No commits ni push durante la ejecución de la activación sin documentar el motivo.

## 12. Resultado esperado

Al completar esta fase:

- Ledger PRD activo con saldos iniciales de efectivo y capital.
- Balance contable cuadrado desde el primer día.
- Pólizas generadas por ventas y caja a partir de la activación.
- PRD listo para operación contable básica.
- Inventario y costo de ventas pendientes para fase posterior con autorización separada.

**Este checklist debe ser revisado y aprobado antes de autorizar la activación.**
