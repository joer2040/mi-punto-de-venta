# Fase 3 - R2: Ejecucion `20260812100000_fix_account_5201_to_5102.sql`

**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`
**Rama:** `chore/code-cleanup`
**Ejecutor:** joer2040
**Fecha/hora UTC (verificacion post-push):** `2026-08-13T13:45:22Z`

---

## Estado ANTES

`migration list --linked` inmediatamente antes del push:

```
   ...
   20260811170000 | 20260811170000 | 2026-08-11 17:00:00
   20260812100000 |                | 2026-08-12 10:00:00
```

`20260812100000` Local-only. Unica migracion pendiente en Remote.

Estado DEV pre-R2 (confirmado por preflight `FASE3_R2_PRECHECK.md`):
- `financial_accounts.code '5201'` existe (`is_system=true`, `is_active=true`)
- `financial_accounts.code '5102'` no existe
- `create_purchase_with_ledger` referencia `'5201'`
- 0 `journal_lines` con cuenta 5201

---

## Comando ejecutado

```powershell
npx supabase db push --linked
```

### Salida del CLI

```
Connecting to remote database...
Do you want to push these migrations to the remote database?
 • 20260812100000_fix_account_5201_to_5102.sql

 [Y/n]
Applying migration 20260812100000_fix_account_5201_to_5102.sql...
NOTICE (00000): OK  financial_accounts.code 5201 -> 5102 aplicado correctamente.
Finished supabase db push.
```

Solo `20260812100000` fue incluida en el push — ninguna otra migracion.
Verificacion inline (DO block) ejecutada y PASS: `5102` existe, `5201` ausente.

---

## Estado DESPUES

### `migration list --linked` post-push

```
   Local          | Remote         | Time (UTC)
  ----------------|----------------|---------------------
   20260414045424 | 20260414045424 | 2026-04-14 04:54:24
   20260414060917 | 20260414060917 | 2026-04-14 06:09:17
   20260414123500 | 20260414123500 | 2026-04-14 12:35:00
   20260415093000 | 20260415093000 | 2026-04-15 09:30:00
   20260415100500 | 20260415100500 | 2026-04-15 10:05:00
   20260416093000 | 20260416093000 | 2026-04-16 09:30:00
   20260417113000 | 20260417113000 | 2026-04-17 11:30:00
   20260417114000 | 20260417114000 | 2026-04-17 11:40:00
   20260417122000 | 20260417122000 | 2026-04-17 12:20:00
   20260418103000 | 20260418103000 | 2026-04-18 10:30:00
   20260419170000 | 20260419170000 | 2026-04-19 17:00:00
   20260420143000 | 20260420143000 | 2026-04-20 14:30:00
   20260420144000 | 20260420144000 | 2026-04-20 14:40:00
   20260714132000 | 20260714132000 | 2026-07-14 13:20:00
   20260715221000 | 20260715221000 | 2026-07-15 22:10:00
   20260715223000 | 20260715223000 | 2026-07-15 22:30:00
   20260716123000 | 20260716123000 | 2026-07-16 12:30:00
   20260803183000 | 20260803183000 | 2026-08-03 18:30:00
   20260803232300 | 20260803232300 | 2026-08-03 23:23:00
   20260804010500 | 20260804010500 | 2026-08-04 01:05:00
   20260810200000 | 20260810200000 | 2026-08-10 20:00:00
   20260811110000 | 20260811110000 | 2026-08-11 11:00:00
   20260811130000 | 20260811130000 | 2026-08-11 13:00:00
   20260811140000 | 20260811140000 | 2026-08-11 14:00:00
   20260811150000 | 20260811150000 | 2026-08-11 15:00:00
   20260811160000 | 20260811160000 | 2026-08-11 16:00:00
   20260811170000 | 20260811170000 | 2026-08-11 17:00:00
   20260812100000 | 20260812100000 | 2026-08-12 10:00:00
```

28/28 Local = Remote. Sin migraciones pendientes.

### `financial_accounts` post-R2

```json
{
  "rows": [{
    "code": "5102",
    "name": "Gastos operativos generales",
    "account_type": "expense",
    "is_system": true,
    "is_active": true,
    "id": "5d31b2b4-486a-4b50-9327-84c5b796816a"
  }]
}
```

`5102` existe con el mismo UUID que tenia `5201`. `5201` no devuelve filas.

### `create_purchase_with_ledger` post-R2

```json
{
  "rows": [{
    "function_name": "create_purchase_with_ledger",
    "account_ref": "CONTIENE 5102",
    "service_role_exec": true,
    "anon_exec": false,
    "auth_exec": false
  }]
}
```

Funcion actualizada. Referencia ahora `'5102'`. Privilegios correctos.

---

## Validaciones post-push

| Validacion | Resultado |
|---|---|
| `20260812100000` aparece en Local Y Remote | PASS |
| 28/28 migraciones Local = Remote | PASS |
| `financial_accounts.code '5102'` existe | PASS |
| `financial_accounts.code '5201'` no existe | PASS |
| UUID de la cuenta sin cambio (`5d31b2b4...`) | PASS |
| `create_purchase_with_ledger` referencia `'5102'` | PASS |
| Privilegios funcion: service_role only | PASS |
| Verificacion inline CLI (NOTICE OK) | PASS |
| Solo `20260812100000` en el push | PASS |
| Sin DDL/DML adicional, repair, deploy, commits, pushes | CONFIRMADO |

**R2: APROBADO.** 10/10 validaciones PASS.

---

## Confirmacion de no-intervencion adicional

- Solo se ejecuto `npx supabase db push --linked`.
- No se ejecuto `migration repair`, `db reset`, `activate_ledger`, SQL manual, despliegues, commits ni pushes de git.
- No se modificaron migraciones, Edge Functions, frontend ni codigo productivo.
- El unico cambio en DEV: `financial_accounts.code 5201 -> 5102` y reemplazo de `create_purchase_with_ledger`.
