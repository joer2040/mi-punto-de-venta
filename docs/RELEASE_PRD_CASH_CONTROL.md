# Release A PRD: Control Y Corte De Caja

Esta guia documenta el orden correcto para llevar a produccion el modulo
`Control y corte de caja` sin romper autenticacion, POS o permisos.

## Alcance del release

Este cambio no solo incluye frontend. Tambien depende de:

- migracion de esquema para `cash_sessions`
- migracion de permisos `cash_control`
- actualizacion de `pos-operations`
- nueva funcion `cash-operations`
- configuracion correcta de Edge Functions protegidas con `--no-verify-jwt`

## Pre-check obligatorio

Antes de tocar `PRD`, confirma esto:

1. `DEV` ya fue probado de extremo a extremo:
   - abrir caja
   - registrar venta en efectivo desde POS
   - cerrar caja
   - descargar PDF
2. El proyecto `PRD` tiene secretos runtime:
   - `SUPABASE_URL`
   - `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
   - `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`
3. Las funciones protegidas en `PRD` quedaran con `Verify JWT` desactivado.
4. Tienes claro si este release incluye tambien la migracion previa:
   - `20260419170000_support_general_provider_purchases.sql`

## Archivos backend que deben viajar

### Migraciones

- `supabase/migrations/20260419170000_support_general_provider_purchases.sql`
- `supabase/migrations/20260420143000_add_cash_control_schema.sql`
- `supabase/migrations/20260420144000_seed_cash_control_permissions.sql`

### Edge Functions

- `supabase/functions/pos-operations/index.ts`
- `supabase/functions/cash-operations/index.ts`
- `supabase/functions/user-admin/index.ts`
- `supabase/functions/erp-operations/index.ts`

## Orden recomendado

### 1. Congelar el alcance

No mezclar este release con cambios no relacionados de UI o de negocio.

### 2. Confirmar branch y estado local

```powershell
git status --short
git branch --show-current
```

### 3. Validar frontend local

```powershell
npm run build
```

### 4. Confirmar configuracion de autenticacion de funciones

Patron esperado:

- `requestClient` con `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- `adminClient` con `SERVICE_ROLE_KEY`
- `requestClient.auth.getUser()`
- deploy con `--no-verify-jwt`

Referencia:

- [SUPABASE_EDGE_FUNCTION_AUTH.md](C:/Users/jaime/OneDrive/Documentos/OneDrive/Escritorio%20Nube/Project%20Codex/pventa/mi-punto-de-venta/docs/SUPABASE_EDGE_FUNCTION_AUTH.md)

### 5. Aplicar migraciones a produccion

Si usaras el runner SQL del repo, aplica primero las migraciones pendientes en orden.

Si la base ya esta ligada al proyecto remoto y vas con CLI, el principio sigue siendo el mismo:

1. migracion previa de compras, si no existe en `PRD`
2. schema de `cash_sessions`
3. permisos `cash_control`

### 6. Desplegar funciones protegidas con flag obligatorio

Todas estas deben desplegarse con `--no-verify-jwt`:

```powershell
npm exec supabase functions deploy cash-operations -- --project-ref <project-ref-prd> --no-verify-jwt
npm exec supabase functions deploy pos-operations -- --project-ref <project-ref-prd> --no-verify-jwt
npm exec supabase functions deploy user-admin -- --project-ref <project-ref-prd> --no-verify-jwt
npm exec supabase functions deploy erp-operations -- --project-ref <project-ref-prd> --no-verify-jwt
```

### 7. Verificar en dashboard de Supabase

Para cada una:

- `cash-operations`
- `pos-operations`
- `user-admin`
- `erp-operations`

Confirmar:

- `Verify JWT` esta desactivado
- el ultimo deploy corresponde al release correcto

### 8. Smoke test en PRD

Ejecutar al menos esta secuencia:

1. iniciar sesion con usuario con permisos
2. abrir `Control y corte de caja`
3. abrir caja con monto inicial
4. intentar vender en POS en efectivo
5. confirmar que la venta pasa con caja abierta
6. cerrar caja
7. descargar PDF
8. revisar que el reporte muestre:
   - fondo inicial
   - ventas registradas
   - monto esperado
   - inventario inicial/final

### 9. Pruebas negativas minimas

Validar tambien:

1. POS no debe permitir venta en efectivo si no hay caja abierta
2. no debe existir mas de una caja abierta
3. un usuario sin permisos no debe poder operar el modulo

## Riesgos a vigilar

### Riesgo 1: JWT ES256

Si reaparece:

```json
{"code":"UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM","message":"Unsupported JWT algorithm ES256"}
```

Revisar primero:

1. `Verify JWT` de la funcion
2. si el deploy realmente uso `--no-verify-jwt`

No empezar depurando logica de negocio antes de revisar eso.

### Riesgo 2: migracion incompleta

Si `PRD` no tiene todas las migraciones esperadas, puedes ver:

- errores por columna faltante `cash_session_id`
- errores por tabla faltante `cash_sessions`
- permisos faltantes para `cash_control`

### Riesgo 3: secretos runtime

Si falta alguno de estos:

- `PROJECT_PUBLISHABLE_KEY`
- `SERVICE_ROLE_KEY`
- `SUPABASE_URL`

la funcion puede fallar aunque el deploy sea exitoso.

## Criterio de salida

El release a `PRD` se considera correcto si:

1. todas las migraciones necesarias quedaron aplicadas
2. las funciones protegidas quedaron con `Verify JWT` desactivado
3. el flujo completo de caja funciona en produccion
4. POS bloquea ventas en efectivo sin caja abierta
5. el PDF de cierre se genera correctamente

## Resumen ejecutivo

La parte mas delicada de este release no es la tabla nueva ni el frontend.

Es esta:

- autenticacion correcta dentro de funciones
- deploy con `--no-verify-jwt`
- consistencia de configuracion entre `DEV` y `PRD`

Si eso se respeta, el resto del cambio es razonablemente transportable.
