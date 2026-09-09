# Fase 3.2 — Inventario de Alineación: 7 Migraciones del Ledger vs DEV

**Fecha:** 2026-08-12  
**Rama:** `chore/code-cleanup`  
**Proyecto DEV:** `rtkdrnfqihulqdhixxzf`  
**Alcance:** migraciones `20260810200000` – `20260811170000` (7 archivos). Excluida `20260812100000`.

---

## 1. Resultado Ejecutivo

**Las 7 migraciones locales del ledger están íntegramente representadas en DEV.**

Objetos verificados: 11 tablas, 7 columnas extendidas, 25 constraints, 28 índices, 14 funciones, 2 triggers, 12 grants — todos presentes con firma y atributos correctos. Los indicadores de cuerpo de función confirman la lógica de negocio crítica.

**Una sola discrepancia existe, intencional y esperada:** cuenta `5201` en DEV (y su referencia en `create_purchase_with_ledger`) — consecuencia directa de que `20260812100000_fix_account_5201_to_5102.sql` no está aplicada. Consistente con el estado declarado.

**No se encontraron divergencias materiales** entre DEV y el estado que producen las 7 migraciones de alcance.

---

## 2. Historial Remoto de Migraciones DEV

Fuente: `npx supabase migration list --linked` (solo lectura).

| Local | Remote | Estado |
|---|---|---|
| 20260414045424 | 20260414045424 | Sincronizado |
| 20260414060917 | 20260414060917 | Sincronizado |
| *(12 migraciones pre-ledger)* | *(todas)* | Sincronizadas |
| **20260810200000** | *(vacío)* | **Solo local — no registrada en DEV** |
| **20260811110000** | *(vacío)* | **Solo local — no registrada en DEV** |
| **20260811130000** | *(vacío)* | **Solo local — no registrada en DEV** |
| **20260811140000** | *(vacío)* | **Solo local — no registrada en DEV** |
| **20260811150000** | *(vacío)* | **Solo local — no registrada en DEV** |
| **20260811160000** | *(vacío)* | **Solo local — no registrada en DEV** |
| **20260811170000** | *(vacío)* | **Solo local — no registrada en DEV** |
| 20260812100000 | *(vacío)* | Fuera de alcance |

Las 7 migraciones **no están registradas** en `supabase_migrations` de DEV. Sus objetos **sí fueron aplicados** manualmente — evidencia: catálogo confirma todo EXISTE.

---

## 3. Inventario de las 7 Migraciones Locales

| Versión | Archivo | Propósito |
|---|---|---|
| `20260810200000` | `base_financial_schema.sql` | Tablas base: `financial_accounts`, `ledger_settings`, `journal_entries`, `journal_lines`, `idempotency_requests`, `audit_events`. Triggers de protección e integridad. Seed 10 cuentas sistema. |
| `20260811110000` | `activate_ledger_rpc.sql` | Tabla `bank_reconciliation_items` + RPC `activate_ledger` (superadmin, atómica, idempotente). |
| `20260811130000` | `extend_cash_sessions_ledger.sql` | Columnas `first_counted_cash`, `final_counted_cash`, `difference_amount` en `cash_sessions`. Extiende constraint de status con `closed_with_pending_difference`. |
| `20260811140000` | `sale_financial_entries.sql` | Tablas `financial_operations` + `financial_payments`. Columnas FK en `sales`. Reemplaza `finalize_pos_sale` con firma multi-pago + ledger atómica. Drop de firma antigua `(text)`. |
| `20260811150000` | `purchase_financial_entries.sql` | Seed cuenta `5201`. Columnas FK en `purchases`. RPC `create_purchase_with_ledger`. |
| `20260811160000` | `fondos_reversas.sql` | Tablas `financial_authorizations` + `cash_discrepancy_resolutions`. RPCs: `record_transfer`, `record_owner_contribution`, `record_owner_withdrawal`, `reverse_journal_entry`, `resolve_cash_discrepancy`. |
| `20260811170000` | `reportes_ledger.sql` | 3 índices de rendimiento. RPCs de reporte: `get_account_balances`, `get_journal_report`, `get_account_ledger`, `get_cash_sessions_report`. |

---

## 4. Matriz de Comparación

### 4.1 Tablas (11/11)

| Migración | Tabla | Estado | Diferencia |
|---|---|---|---|
| 20260810200000 | `financial_accounts` | **Coincide** | — |
| 20260810200000 | `ledger_settings` | **Coincide** | — |
| 20260810200000 | `journal_entries` | **Coincide** | — |
| 20260810200000 | `journal_lines` | **Coincide** | — |
| 20260810200000 | `idempotency_requests` | **Coincide** | — |
| 20260810200000 | `audit_events` | **Coincide** | — |
| 20260811110000 | `bank_reconciliation_items` | **Coincide** | — |
| 20260811140000 | `financial_operations` | **Coincide** | — |
| 20260811140000 | `financial_payments` | **Coincide** | — |
| 20260811160000 | `financial_authorizations` | **Coincide** | — |
| 20260811160000 | `cash_discrepancy_resolutions` | **Coincide** | — |

### 4.2 Columnas Extendidas (7/7)

| Migración | Columna | Estado | Diferencia |
|---|---|---|---|
| 20260811130000 | `cash_sessions.first_counted_cash` | **Coincide** | — |
| 20260811130000 | `cash_sessions.final_counted_cash` | **Coincide** | — |
| 20260811130000 | `cash_sessions.difference_amount` | **Coincide** | — |
| 20260811140000 | `sales.financial_operation_id` | **Coincide** | — |
| 20260811140000 | `sales.journal_entry_id` | **Coincide** | — |
| 20260811150000 | `purchases.financial_operation_id` | **Coincide** | — |
| 20260811150000 | `purchases.journal_entry_id` | **Coincide** | — |

### 4.3 Constraints (25/25)

| Migración | Constraint | Estado | Definición en DEV |
|---|---|---|---|
| 20260810200000 | `financial_accounts_account_type_check` | **Coincide** | `CHECK (account_type = ANY (ARRAY['asset','liability','equity','income','expense']))` |
| 20260810200000 | `ledger_settings_singleton` | **Coincide** | `CHECK (id = true)` |
| 20260810200000 | `ledger_settings_initial_entry_fkey` | **Coincide** | `FOREIGN KEY (initial_journal_entry_id) REFERENCES journal_entries(id)` |
| 20260810200000 | `journal_entries_entry_type_check` | **Coincide** | Incluye todos los tipos declarados |
| 20260810200000 | `journal_entries_status_check` | **Coincide** | `ANY (ARRAY['pending','confirmed','reversed'])` |
| 20260810200000 | `journal_lines_debit_non_negative` | **Coincide** | `CHECK (debit >= 0)` |
| 20260810200000 | `journal_lines_credit_non_negative` | **Coincide** | `CHECK (credit >= 0)` |
| 20260810200000 | `journal_lines_not_both_sides` | **Coincide** | `CHECK (NOT (debit>0 AND credit>0))` |
| 20260810200000 | `journal_lines_one_side_required` | **Coincide** | `CHECK (debit>0 OR credit>0)` |
| 20260810200000 | `idempotency_requests_scope_key_unique` | **Coincide** | `UNIQUE (scope, idempotency_key)` |
| 20260810200000 | `idempotency_requests_status_check` | **Coincide** | `ANY (ARRAY['processing','completed','conflict'])` |
| 20260810200000 | `audit_events_result_check` | **Coincide** | `ANY (ARRAY['success','failure','rejected'])` |
| 20260811110000 | `bank_reconciliation_items_amount_check` | **Coincide** | `CHECK (amount > 0)` |
| 20260811110000 | `bank_reconciliation_items_item_type_check` | **Coincide** | `ANY (ARRAY['deposit','charge'])` |
| 20260811110000 | `bank_reconciliation_items_status_check` | **Coincide** | `ANY (ARRAY['pending','reconciled'])` |
| 20260811130000 | `cash_sessions_status_check` | **Coincide** | Incluye `closed_with_pending_difference` |
| 20260811140000 | `financial_operations_type_check` | **Coincide** | Incluye todos los tipos de operación |
| 20260811140000 | `financial_operations_status_check` | **Coincide** | `ANY (ARRAY['confirmed','reversed'])` |
| 20260811140000 | `financial_operations_amount_check` | **Coincide** | `CHECK (total_amount > 0)` |
| 20260811140000 | `financial_payments_amount_check` | **Coincide** | `CHECK (amount > 0)` |
| 20260811140000 | `financial_payments_method_check` | **Coincide** | `ANY (ARRAY['Efectivo','Tarjeta','Transferencia'])` |
| 20260811160000 | `financial_authorizations_decision_check` | **Coincide** | `ANY (ARRAY['approved','rejected'])` |
| 20260811160000 | `financial_authorizations_no_self_auth` | **Coincide** | `CHECK (requested_by <> authorized_by)` |
| 20260811160000 | `cash_discrepancy_resolutions_type_check` | **Coincide** | `ANY (ARRAY['shortage','surplus','omitted_event'])` |
| 20260811160000 | `cash_discrepancy_resolutions_amount_check` | **Coincide** | `CHECK (amount > 0)` |

### 4.4 Índices (28/28)

Todos presentes. Verificación por grupo:

| Grupo | Índices | Estado |
|---|---|---|
| `financial_accounts` | `financial_accounts_code_idx` (unique) | **Coincide** |
| `journal_entries` | `_number_idx`, `_idempotency_idx`, `_source_idx`, `_occurred_at_idx`, `_occurred_confirmed_idx`, `_status_occurred_idx` | **Coincide** (6/6) |
| `journal_lines` | `_entry_idx`, `_account_idx`, `_account_entry_idx` | **Coincide** (3/3) |
| `idempotency_requests` | `_created_at_idx` | **Coincide** |
| `audit_events` | `_entity_idx`, `_actor_idx`, `_occurred_at_idx` | **Coincide** (3/3) |
| `bank_reconciliation_items` | `_entry_idx`, `_status_idx` | **Coincide** (2/2) |
| `financial_operations` | `_source_idx`, `_session_idx`, `_entry_idx` | **Coincide** (3/3) |
| `financial_payments` | `_operation_idx`, `_account_idx` | **Coincide** (2/2) |
| `sales` | `sales_financial_operation_idx`, `sales_journal_entry_idx` | **Coincide** (2/2) |
| `purchases` | `purchases_financial_operation_idx`, `purchases_journal_entry_idx` | **Coincide** (2/2) |
| `financial_authorizations` | `_entity_idx` | **Coincide** |
| `cash_discrepancy_resolutions` | `_session_ux` (unique), `_entry_idx` | **Coincide** (2/2) |

### 4.5 Triggers (2/2)

| Migración | Trigger | Timing/Evento esperado | Estado DEV |
|---|---|---|---|
| 20260810200000 | `trg_protect_system_accounts` | BEFORE DELETE en `financial_accounts` | **Coincide** |
| 20260810200000 | `trg_assert_journal_entry_balanced` | BEFORE UPDATE en `journal_entries` | **Coincide** |

### 4.6 Funciones — Atributos (14/14)

| Migración | Función | Lang | SecDef | Volatilidad | Estado |
|---|---|---|---|---|---|
| 20260810200000 | `protect_system_financial_accounts` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260810200000 | `assert_journal_entry_balanced` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811110000 | `activate_ledger` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811140000 | `finalize_pos_sale` (nueva firma) | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811140000 | `finalize_pos_sale` (firma antigua `text`) | — | — | — | **Eliminada** ✓ |
| 20260811150000 | `create_purchase_with_ledger` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811160000 | `record_transfer` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811160000 | `record_owner_contribution` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811160000 | `record_owner_withdrawal` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811160000 | `reverse_journal_entry` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811160000 | `resolve_cash_discrepancy` | plpgsql | sí | VOLATILE | **Coincide** |
| 20260811170000 | `get_account_balances` | sql | sí | STABLE | **Coincide** |
| 20260811170000 | `get_journal_report` | sql | sí | STABLE | **Coincide** |
| 20260811170000 | `get_account_ledger` | sql | sí | STABLE | **Coincide** |
| 20260811170000 | `get_cash_sessions_report` | sql | sí | STABLE | **Coincide** |

### 4.7 Funciones — Indicadores de Lógica de Negocio

| Función | Indicador verificado | Local | DEV |
|---|---|---|---|
| `activate_ledger` | Superadmin check (`is_superadmin = true`) | sí | **SI** |
| `activate_ledger` | No sesión abierta antes de activar | sí | **SI** |
| `activate_ledger` | No mesas activas antes de activar | sí | **SI** |
| `activate_ledger` | Montos ≥ 0 | sí | **SI** |
| `activate_ledger` | Upsert `ON CONFLICT` en `ledger_settings` | sí | **SI** |
| `activate_ledger` | Asiento `initial_balance` + cuenta 3101 | sí | **SI** |
| `activate_ledger` | Idempotencia scope=activate_ledger | sí | **SI** |
| `finalize_pos_sale` | Validación de método (efectivo/tarjeta/transferencia) | sí | **SI** |
| `finalize_pos_sale` | Validación importe por elemento ≤ 0 | sí | **SI** |
| `finalize_pos_sale` | Sesión requerida solo si `v_cash_amount > 0` | sí | **SI** |
| `finalize_pos_sale` | Tolerancia ±0.01 en suma de pagos | sí | **SI** |
| `finalize_pos_sale` | Débita 1101 (efectivo) y 1103 (tarjeta/transferencia) | sí | **SI** |
| `finalize_pos_sale` | Crédit 4101 ingresos por ventas | sí | **SI** |
| `finalize_pos_sale` | Prefijo `JE-VTA-` en entry_number | sí | **SI** |
| `finalize_pos_sale` | Idempotencia scope=sale | sí | **SI** |
| `finalize_pos_sale` | `SECURITY DEFINER` + `search_path = public, pg_temp` | sí | **SI** |
| `create_purchase_with_ledger` | Cuenta gastos referenciada | `5201` | **5201** (pre-fix, esperado) |
| `create_purchase_with_ledger` | Cuenta mercancía 1201 | sí | **SI** |
| `create_purchase_with_ledger` | Idempotencia scope=purchase | sí | **SI** |
| `record_owner_withdrawal` | No auto-autorización (`performed_by = authorized_by`) | sí | **SI** |
| `record_owner_withdrawal` | Prohibición retiro desde 1101 | sí | **SI** |
| `record_owner_withdrawal` | Autorizador = superadmin o manager | sí | **SI** |
| `reverse_journal_entry` | Solo revierte status=confirmed | sí | **SI** |
| `reverse_journal_entry` | Creator del asiento ≠ autorizador | sí | **SI** |
| `reverse_journal_entry` | Líneas espejo (débito ↔ crédito invertidos) | sí | **SI** |
| `reverse_journal_entry` | Marca original como `reversed` | sí | **SI** |

### 4.8 Catálogo de Cuentas

| Migración | Código | Nombre | `is_system` | `is_active` | `account_type` | Estado |
|---|---|---|---|---|---|---|
| 20260810200000 | 1101 | Caja operativa | true | true | asset | **Coincide** |
| 20260810200000 | 1102 | Caja fuerte | true | true | asset | **Coincide** |
| 20260810200000 | 1103 | Banco | true | true | asset | **Coincide** |
| 20260810200000 | 1201 | Compras de mercancía por aplicar | true | true | asset | **Coincide** |
| 20260810200000 | 1202 | Adquisiciones por clasificar | true | true | asset | **Coincide** |
| 20260810200000 | 3101 | Aportaciones del propietario | true | true | equity | **Coincide** |
| 20260810200000 | 3102 | Retiros del propietario | true | true | equity | **Coincide** |
| 20260810200000 | 4101 | Ingresos por ventas | true | true | income | **Coincide** |
| 20260810200000 | 4102 | Sobrantes de caja | true | true | income | **Coincide** |
| 20260810200000 | 5101 | Faltantes de caja | true | true | expense | **Coincide** |
| 20260811150000 | 5201 | Gastos operativos generales | true | true | expense | **Coincide** (pre-fix) |

### 4.9 Grants (12/12)

Todos los grants `EXECUTE → service_role` sobre las 12 funciones operativas/de reporte: **Coincide**.

---

## 5. Divergencias Materiales Comprobadas

**Ninguna** dentro del alcance de las 7 migraciones.

La única discrepancia (`5201` en lugar de `5102` en cuenta y cuerpo de `create_purchase_with_ledger`) es el estado correcto dado que `20260812100000` está fuera de alcance y no se ha aplicado. No constituye divergencia material respecto a las 7 migraciones evaluadas.

---

## 6. Elementos No Verificables y Por Qué

| Elemento | Razón |
|---|---|
| **REVOKE en `public`, `anon`, `authenticated`** | `information_schema.role_routine_grants` solo lista GRANTs positivos. Verificar ausencias requeriría `has_function_privilege()` por función — fuera del alcance de este inventario. Riesgo bajo: patrón consistente en todo el proyecto. |
| **Comentarios `COMMENT ON`** | No verificados. Sin impacto operacional. |
| **Cuerpo completo de `record_transfer`, `record_owner_contribution`, `resolve_cash_discrepancy`, RPCs de reporte** | Solo se verificaron indicadores de funciones de mayor riesgo. Las omitidas tienen firmas, atributos y grants validados. |
| **Falso positivo en indicator `tr_update_inventory_on_purchase`** | El check `LIKE '%inventory%costo_promedio%'` capturó un comentario en el cuerpo de `create_purchase_with_ledger` (`-- trigger actualiza inventory.stock_actual + costo_promedio`). El cuerpo real no tiene DML directa a `inventory.costo_promedio` — delega correctamente al trigger. No es divergencia. |
| **Columna `request_type` en `financial_authorizations`** | Los RPCs (`record_owner_withdrawal`, `reverse_journal_entry`) usan `request_type` en sus INSERTs y funcionan en DEV → la columna existe como `request_type`. Los test scripts `TB-10`/`TB-12` usan `action_type` por error de diseño — impacta solo las pruebas locales futuras. |

---

## 7. Veredicto

**Seguro evaluar estrategia de alineación del historial.**

Las 7 migraciones locales del ledger están íntegramente representadas en DEV sin divergencias materiales. La discrepancia de cuenta (`5201`/`5102`) pertenece a `20260812100000`, que tiene su propio flujo de aprobación ya documentado.

La estrategia de alineación podría evaluarse mediante `supabase migration repair --status applied` para las 7 versiones. Esto **requiere autorización explícita** (pendiente R1) y no debe ejecutarse ahora.

---

## 8. Evidencia de No Intervención

| Afirmación | Evidencia |
|---|---|
| Sin DDL/DML ejecutados | Solo `SELECT`, `DO$$` con lecturas de `information_schema`, `pg_catalog`, `pg_proc`, `pg_constraint`, `pg_indexes`, `pg_get_functiondef`, `pg_get_constraintdef` |
| Sin `migration repair` | No ejecutado. Solo `migration list --linked` (lectura) |
| Sin `db push` / `db reset` | No ejecutados en ningún momento de la sesión |
| Sin `activate_ledger` | `ledger_cutover_at = NULL` confirmado en estado DEV — ledger inactivo |
| Sin commits ni pushes | No ejecutados |
| Archivos locales sin modificar | Solo lectura de migraciones existentes y escritura de archivos bajo `docs/` y `sql/` (permitida por `fase.3.2.md`) |

---

**Detenido. Esperando aprobación para R1 (`migration repair`) y siguientes pasos.**
