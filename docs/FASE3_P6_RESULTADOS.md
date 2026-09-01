# Fase 3 — Resultados P6: Verificación de Cuerpos y Privilegios

**Fecha de ejecución:** 2026-08-12  
**Rama:** `chore/code-cleanup`  
**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`  
**Tipo:** Lectura de catálogo únicamente. Sin DML, DDL, deployments ni migration repair.

---

## Alcance

Seis funciones no inspeccionadas en Fase 3.2:

| Función | Tipo | Migración origen |
|---|---|---|
| `record_transfer` | plpgsql | `20260811160000_fondos_reversas.sql` |
| `record_owner_contribution` | plpgsql | `20260811160000_fondos_reversas.sql` |
| `resolve_cash_discrepancy` | plpgsql | `20260811160000_fondos_reversas.sql` |
| `get_journal_report` | sql | `20260811170000_reportes_ledger.sql` |
| `get_account_ledger` | sql | `20260811170000_reportes_ledger.sql` |
| `get_cash_sessions_report` | sql | `20260811170000_reportes_ledger.sql` |

---

## 1. Comparación de Cuerpos: DEV vs Local

### Metodología

Para cada función:

1. **DEV:** cuerpo obtenido directamente de `pg_proc.prosrc` mediante `SELECT prosrc FROM pg_proc` (SELECT únicamente). El hash SHA-256 se calcula en PostgreSQL: `encode(sha256(replace(replace(trim(prosrc), E'\r\n', E'\n'), E'\r', E'\n')::bytea), 'hex')`. `trim(prosrc)` no modifica nada: `prosrc` empieza y termina con `\n`, no con espacios.

2. **Local:** cuerpo extraído de los archivos de migración con extracción **inclusiva**: captura `\n<cuerpo>\n` entre los delimitadores `$$…$$`, replicando exactamente lo que PostgreSQL almacena en `prosrc`. Archivos leídos con `[System.IO.File]::ReadAllText(path, UTF8)`. Normalización aplicada: solo CRLF→LF.

3. **Normalización:** únicamente CRLF→LF. Sin lowercase, sin eliminación de comentarios, sin colapso de espacios, sin ninguna otra transformación.

4. **Hash:** SHA-256 en UTF-8. DEV calculado por PostgreSQL. Local calculado en PowerShell con `[System.Security.Cryptography.SHA256]`.

### Nota sobre atributos de encabezado (formato PostgreSQL vs fuente local)

`pg_get_functiondef` reformatea el encabezado. Las diferencias de encabezado son de formato, no funcionales:

| Atributo | Local | DEV (pg_get_functiondef) | Funcional |
|---|---|---|---|
| Typmod en parámetros | `p_amount numeric(14,2)` | `p_amount numeric` | No — PostgreSQL almacena typmod separado |
| Typmod en RETURNS TABLE | `debit numeric(14,2)` | `debit numeric` | No |
| DEFAULT | `default null` | `DEFAULT NULL::text` | No — equivalente |
| Casing keywords | `language plpgsql` | `LANGUAGE plpgsql` | No — SQL case-insensitive |
| SET search_path | `set search_path to public, pg_temp` | `SET search_path TO 'public', 'pg_temp'` | No — equivalente |

Estos atributos NO forman parte del `prosrc` comparado. La comparación opera exclusivamente sobre el cuerpo almacenado en `pg_proc.prosrc`.

### Matriz de comparación

| Función | Firma DEV | Lenguaje | Volatilidad | SECURITY DEFINER | search_path | Hash DEV estricto | Hash local estricto | Estado | Diferencia |
|---|---|---|---|---|---|---|---|---|---|
| `record_transfer` | `p_from_code text, p_to_code text, p_amount numeric, p_description text, p_performed_by uuid, p_idempotency_key text` | plpgsql | VOLATILE | ✅ true | `public, pg_temp` | `3b6dafbc…9d7d76af` | `3b6dafbc…9d7d76af` | ✅ **Coincide** | Ninguna |
| `record_owner_contribution` | `p_destination_code text, p_amount numeric, p_description text, p_performed_by uuid, p_idempotency_key text` | plpgsql | VOLATILE | ✅ true | `public, pg_temp` | `50dbd8ef…6f7c9fe` | `50dbd8ef…6f7c9fe` | ✅ **Coincide** | Ninguna |
| `resolve_cash_discrepancy` | `p_cash_session_id uuid, p_resolution_type text, p_amount numeric, p_motive text, p_performed_by uuid, p_idempotency_key text` | plpgsql | VOLATILE | ✅ true | `public, pg_temp` | `c81876bc…c1d9bbec` | `c81876bc…c1d9bbec` | ✅ **Coincide** | Ninguna |
| `get_journal_report` | `p_from_date date, p_to_date date` | sql | STABLE | ✅ true | `public` | `501c858b…c8730d36` | `501c858b…c8730d36` | ✅ **Coincide** | Ninguna |
| `get_account_ledger` | `p_account_code text, p_from_date date, p_to_date date` | sql | STABLE | ✅ true | `public` | `38316a09…0edfac93` | `38316a09…0edfac93` | ✅ **Coincide** | Ninguna |
| `get_cash_sessions_report` | `p_from_date date, p_to_date date` | sql | STABLE | ✅ true | `public` | `1649523a…58e61b4d` | `1649523a…58e61b4d` | ✅ **Coincide** | Ninguna |

### Hashes completos (DEV calculado por PostgreSQL — Local calculado en PowerShell)

| Función | Len (chars) | Hash DEV estricto (SHA-256) | Hash local estricto (SHA-256) |
|---|---|---|---|
| `record_transfer` | 4717 | `3b6dafbc99a9cd9cd2d9a7da1a0a018dc53075844c7ebff8245208ea9d7d76af` | `3b6dafbc99a9cd9cd2d9a7da1a0a018dc53075844c7ebff8245208ea9d7d76af` |
| `record_owner_contribution` | 4188 | `50dbd8efb72ed7882ba36c8a7d49fdfcc36e2d36243f6f02e6de0e19c6f7c9fe` | `50dbd8efb72ed7882ba36c8a7d49fdfcc36e2d36243f6f02e6de0e19c6f7c9fe` |
| `resolve_cash_discrepancy` | 5241 | `c81876bc1f7c84e15fac2d6cc4e6679ab85be16697ecb072c1ee0185c1d9bbec` | `c81876bc1f7c84e15fac2d6cc4e6679ab85be16697ecb072c1ee0185c1d9bbec` |
| `get_journal_report` | 729 | `501c858be6b6eb10dd5c7a4d9a798a29b84dd44b4ddcc09510a38ba1c8730d36` | `501c858be6b6eb10dd5c7a4d9a798a29b84dd44b4ddcc09510a38ba1c8730d36` |
| `get_account_ledger` | 1297 | `38316a094c91d0fca8ae580d2853b5b8814ab18b8c66b61368237d8a0edfac93` | `38316a094c91d0fca8ae580d2853b5b8814ab18b8c66b61368237d8a0edfac93` |
| `get_cash_sessions_report` | 928 | `1649523a932dbed2cc8fc0dcfbbc49ee167a7e8f10eb71b73d633e0b58e61b4d` | `1649523a932dbed2cc8fc0dcfbbc49ee167a7e8f10eb71b73d633e0b58e61b4d` |

**6/6 Coincide. Longitudes DEV = longitudes locales. Sin divergencias de ningún tipo.**

---

## 2. Privilegios Efectivos

Query ejecutada: `has_function_privilege('anon'|'authenticated'|'service_role', p.oid, 'EXECUTE')` vía `pg_proc`.

| Función | Firma | anon | authenticated | service_role |
|---|---|---|---|---|
| `get_account_ledger` | `p_account_code text, p_from_date date, p_to_date date` | ❌ false | ❌ false | ✅ true |
| `get_cash_sessions_report` | `p_from_date date, p_to_date date` | ❌ false | ❌ false | ✅ true |
| `get_journal_report` | `p_from_date date, p_to_date date` | ❌ false | ❌ false | ✅ true |
| `record_owner_contribution` | `p_destination_code text, p_amount numeric, p_description text, p_performed_by uuid, p_idempotency_key text` | ❌ false | ❌ false | ✅ true |
| `record_transfer` | `p_from_code text, p_to_code text, p_amount numeric, p_description text, p_performed_by uuid, p_idempotency_key text` | ❌ false | ❌ false | ✅ true |
| `resolve_cash_discrepancy` | `p_cash_session_id uuid, p_resolution_type text, p_amount numeric, p_motive text, p_performed_by uuid, p_idempotency_key text` | ❌ false | ❌ false | ✅ true |

**Filas devueltas:** 6 — exactamente una por función. Sin sobrecargas adicionales. Sin funciones faltantes.

**6/6 funciones con privilegios correctos.**

---

## 3. Veredicto P6

| Criterio P6 | Estado |
|---|---|
| Las 6 funciones existen en DEV | ✅ PASS |
| Cuerpos DEV = local (hash SHA-256) | ✅ PASS — 6/6 Coincide |
| Lenguaje correcto (plpgsql / sql) | ✅ PASS |
| SECURITY DEFINER en todas | ✅ PASS |
| search_path configurado correctamente | ✅ PASS |
| Sin DML en funciones de reporte | ✅ PASS |
| Prefijos JE correctos en DEV | ✅ PASS — `JE-TRP-`, `JE-APT-`, `JE-DIF-` verificados en cuerpos |
| Cuentas correctas en lógica contable | ✅ PASS — 1101/1102/1103/3101/4102/5101 presentes |
| Privilegios: 6/6 con patrón correcto | ✅ PASS |
| Filas de privilege check: exactamente 6 | ✅ PASS |
| Divergencias funcionales | ✅ NINGUNA |

**P6: APROBADO.** Cuerpos DEV idénticos a fuentes locales. Privilegios correctos en las 6 funciones.

---

## 4. Estado Acumulado de Prerrequisitos R1

| Prerrequisito | Estado |
|---|---|
| P1 — Historial Remote vacío para las 7 (confirmado Fase 3.2) | ✅ |
| P2 — Proyecto DEV enlazado y accesible | ✅ **APROBADO** (ver `FASE3_P2_P5_EVIDENCIA.md`) |
| P3 — Ledger inactivo en DEV (T-12 PASS en preflight) | ✅ |
| P4 — `20260812100000` excluida de repair | ✅ (diseño confirma exclusión) |
| P5 — Captura de estado previo y auditoría | ✅ **APROBADO** (ver `FASE3_P2_P5_EVIDENCIA.md`) |
| P6 — Cuerpos completos y privilegios verificados | ✅ **APROBADO (este documento)** |

---

## 5. Evidencia de No Intervención

- Solo se ejecutaron `SELECT` contra catálogos del sistema (`pg_proc`, `pg_namespace`, `pg_get_functiondef`, `pg_get_function_identity_arguments`, `has_function_privilege`).
- Hashes computados localmente en PowerShell sobre texto extraído de los resultados.
- Sin `INSERT`, `UPDATE`, `DELETE`, DDL, `migration repair`, `db push` ni `activate_ledger`.
- Sin modificaciones a migraciones, código productivo ni frontend.
- Estado de DEV sin cambios respecto al cierre de Fase 3.2.
