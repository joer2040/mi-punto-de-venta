# FASE3 R9 — UI Finanzas Fase 3F: Reversa de póliza (DEV)

**Fecha:** 2026-08-17  
**Rama:** `chore/code-cleanup`

---

## Archivos creados / modificados

| Archivo | Acción |
|---|---|
| `src/components/FinancesJournalReversalPanel.jsx` | Nuevo — formulario de reversa |
| `src/pages/FinancesHome.jsx` | Modificado — activa card Reversa, agrega elif branch, actualiza alert |

---

## `FinancesJournalReversalPanel.jsx`

### Campos

| Campo | Tipo | Reglas |
|---|---|---|
| Número de póliza | text input | Requerido — el folio `JE-XXX-XXXXXXXX` visible en reporte |
| Autorizado por | select (usuarios activos ≠ solicitante) | Requerido; value = UUID del usuario |
| Motivo | textarea | Requerido |

### Llamada al servicio

```javascript
await financialService.reverseJournalEntry({
  journalEntryId: form.entryNumber.trim(),   // folio ingresado
  authorizedBy: form.authorizedBy.trim(),    // UUID del autorizador
  justification: form.justification.trim(),
  idempotencyKey: idempotencyKeyRef.current,
})
```

Service envía: `journal_entry_id`, `authorized_by`, `justification`, `idempotency_key` vía `financial-operations` → `reverse_journal_entry`.

### Usuarios

Carga `securityService.getUsers()` al montar. Filtra `status === 'active' && id !== user?.id`. Mismo patrón que `FinancesOwnerWithdrawalPanel`.

### Confirm lines

```
Póliza: JE-RET-1C881241
Autorizado por: Nombre Completo (username)
Motivo: Prueba UI reversa Fase 3F
```

---

## `FinancesHome.jsx` (cambios)

- Agrega import `FinancesJournalReversalPanel`
- elif `activeOperation === 'reversal'` → muestra panel
- Card 'reversal' activa (ya era última card disabled)
- Todas las 5 operaciones activas
- Alert: `"Todas las operaciones disponibles"` / describe las 5

---

## Validación automática

```
npx eslint src/components/FinancesJournalReversalPanel.jsx src/pages/FinancesHome.jsx
→ 0 errores ✅

npm run test:finance
→ 88/88 pass, 0 fail ✅

npm run build
→ FinancesHome-CaUu39eI.js  39.05 kB  (era 32.86 kB — +6.19 kB panel reversa)
→ ✓ built in 4.64s, sin errores ✅
```

---

## Checklist revalidación manual browser

Candidato para reversa: `JE-RET-1C881241` (retiro $1.00 desde 1102 Caja fuerte)

| Caso | Check |
|---|---|
| Hub Finanzas: todas 5 cards activas con "Ejecutar" | ⬜ |
| Alert: "Todas las operaciones disponibles" | ⬜ |
| Click "Ejecutar" en Reversa → panel aparece | ⬜ |
| Select autorizador carga usuarios activos (excluyendo usuario actual) | ⬜ |
| Validación: póliza vacía → error inline | ⬜ |
| Validación: sin autorizador → "Selecciona el autorizador" | ⬜ |
| Validación: motivo vacío → error inline | ⬜ |
| Form válido → "Continuar →" → FinanceConfirm amber con Póliza, Autorizador, Motivo | ⬜ |
| "Cancelar" → vuelve al formulario (datos conservados) | ⬜ |
| "Confirmar reversa" → Network: POST financial-operations, action=reverse_journal_entry | ⬜ |
| Éxito → FinanceAlert green | ⬜ |
| "Ver pólizas" → navega a Pólizas con nueva póliza de reversa | ⬜ |

### Verificación post-reversa (si éxito)

| Verificación | Esperado | Check |
|---|---|---|
| Saldos → 1102 Caja fuerte | $1,001.00 (reversa del retiro $1.00) | ⬜ |
| Saldos → 3102 Retiros del propietario | $0.00 | ⬜ |
| Pólizas → folio nuevo REV-... | aparece balanceado | ⬜ |
| Mayor 1102 | muestra línea de reversa | ⬜ |
| Mayor 3102 | muestra línea de reversa | ⬜ |

---

## Estado de operaciones

| Operación | Estado |
|---|---|
| Traspaso entre fondos | ✅ Implementado y validado |
| Aportación del propietario | ✅ Implementado y validado |
| Resolución de diferencia | ✅ Implementado y validado |
| Retiro del propietario | ✅ Implementado y validado |
| Reversa de póliza | ✅ Implementado — pendiente validación manual |
