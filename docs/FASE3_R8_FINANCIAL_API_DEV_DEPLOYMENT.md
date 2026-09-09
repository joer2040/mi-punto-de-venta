# FASE3 — R8: Deployment DEV — financial-operations

**Fecha (UTC):** 2026-08-16T20:22:24Z  
**Entorno:** DEV (`rtkdrnfqihulqdhixxzf`)  
**Función desplegada:** `financial-operations` únicamente  
**Versión Supabase CLI:** v2.92.1  
**Restricciones aplicadas:** sin despliegues a PRD, sin SQL, sin migraciones, sin secretos, sin `--no-verify-jwt`, sin modificación de ledger ni datos operativos.

---

## 1. Fuente del código

| Item | Detalle |
|------|---------|
| Rama | `main` |
| Merge commit | `a55c5db` — `fix(finance): secure financial operations edge function (#6)` |
| PR | #6 |
| Commits incluidos | `c0220ea` (G01–G08), `8824cfd` (88 tests, comando canónico) |
| Archivos desplegados | `supabase/functions/financial-operations/index.ts`, `handler.js`, `financialRules.js` |

---

## 2. Despliegue

```
npx supabase functions deploy financial-operations --project-ref rtkdrnfqihulqdhixxzf
```

Sin flag `--no-verify-jwt`. JWT verification activo (comportamiento por defecto).

**Resultado:**

```
Bundling Function: financial-operations
Deploying Function: financial-operations (script size: 1.07MB)
Deployed Functions on project rtkdrnfqihulqdhixxzf: financial-operations
```

| Campo | Pre-deploy | Post-deploy |
|-------|-----------|-------------|
| Versión | 1 | **2** |
| Status | ACTIVE | ACTIVE |
| Updated at (UTC) | 2026-08-11 17:06:53 | **2026-08-16 20:22:24** |

---

## 3. Estado de ALLOWED_ORIGINS

`ALLOWED_ORIGINS` **no configurado** en DEV — decisión intencional: la UI DEV aún no existe.

Consecuencia per diseño R8 (G04):
- `getCorsOriginHeader` retorna `null`
- Ningún header `Access-Control-Allow-Origin` se emite desde el handler R8
- Cualquier solicitud de navegador con header `Origin` es rechazada por el handler
- Acceso servidor-a-servidor (sin `Origin`) pasa al handler y es bloqueado por JWT verification de la plataforma

---

## 4. Smoke Tests

URL base: `https://rtkdrnfqihulqdhixxzf.supabase.co/functions/v1/financial-operations`

### Test 1 — POST sin token

```
curl -X POST <URL> -H "Content-Type: application/json" -d '{"action":"get_ledger_status"}'
```

| Campo | Valor |
|-------|-------|
| HTTP status | **401** |
| Cuerpo | `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` |
| x-deno-execution-id | ausente (gateway Supabase interceptó antes de llamar al handler) |
| Resultado | ✅ PASS |

---

### Test 2 — OPTIONS preflight con origen no autorizado

```
curl -X OPTIONS <URL> \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

| Campo | Valor |
|-------|-------|
| HTTP status | **403** |
| Cuerpo | `Origin not allowed` |
| `Access-Control-Allow-Origin` | **ausente** |
| x-deno-execution-id | `c8160c11-8b06-42be-9230-0e0c12d08da5` ← **handler R8 ejecutó** |
| Resultado | ✅ PASS — nuestro código retornó 403 antes de tocar auth o RPC |

---

### Test 3 — POST con origen no autorizado y sin JWT

```
curl -X POST <URL> \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{"action":"get_ledger_status"}'
```

| Campo | Valor |
|-------|-------|
| HTTP status | **401** |
| Cuerpo | `{"code":"UNAUTHORIZED_NO_AUTH_HEADER",...}` |
| `Access-Control-Allow-Origin` | `*` — **emitido por gateway Supabase**, no por R8 |
| x-deno-execution-id | **ausente** — handler R8 no ejecutó |

**Análisis:** El gateway de Supabase (`verify_jwt = true`) rechazó la solicitud antes de invocar el handler R8. El `*` es un header estático de la capa de gateway, no del código R8. La ausencia de `x-deno-execution-id` lo confirma. El handler R8 nunca llegó a evaluar el origen.

El control de CORS de R8 es efectivo para solicitudes que pasan el JWT del gateway (como OPTIONS). Para POST sin JWT el gateway actúa primero — resultado igualmente seguro (401 sin acceso a datos), pero el bloqueo de origen lo hace la plataforma, no R8.

Resultado funcional: ✅ PASS (la solicitud fue rechazada antes de llegar a auth o RPC). El wildcard en el 401 del gateway es comportamiento de la plataforma Supabase, fuera del alcance del código R8.

---

### Test 4 — OPTIONS sin Origin (acceso servidor-a-servidor)

```
curl -X OPTIONS <URL> \
  -H "Access-Control-Request-Method: POST"
```

| Campo | Valor |
|-------|-------|
| HTTP status | **200** |
| `Access-Control-Allow-Origin` | **ausente** ✅ (ALLOWED_ORIGINS vacío → getCorsOriginHeader retorna null) |
| `Access-Control-Allow-Headers` | `authorization, x-client-info, apikey, content-type` |
| `Access-Control-Allow-Methods` | `POST, OPTIONS` |
| x-deno-execution-id | `d533d02b-1519-41a4-bd34-961c466c3ba7` ← **handler R8 ejecutó** |
| Resultado | ✅ PASS — sin wildcard, CORS headers correctos |

---

### Test 5 — Confirmación de ausencia de wildcard en código R8

OPTIONS sin Origin confirma que cuando el handler R8 corre con `ALLOWED_ORIGINS` ausente:
- No emite `Access-Control-Allow-Origin` en ningún valor
- El `*` de los tests de POST es exclusivamente de la capa de gateway Supabase sobre respuestas 401

✅ PASS — R8 nunca retorna `Access-Control-Allow-Origin: *`

---

## 5. Resumen de smoke tests

| # | Escenario | Status | Origen del rechazo | Resultado |
|---|-----------|--------|-------------------|-----------|
| 1 | POST sin token | 401 | Gateway Supabase | ✅ |
| 2 | OPTIONS + origin no autorizado | 403 | **Handler R8** | ✅ |
| 3 | POST + origin no autorizado + sin JWT | 401 | Gateway Supabase (R8 no corrió) | ✅ func. |
| 4 | OPTIONS sin Origin | 200 sin ACAO | **Handler R8** | ✅ |
| 5 | Wildcard `*` nunca en respuestas R8 | — | Verificado por T2 + T4 | ✅ |

---

## 6. Hallazgo documentado — gateway CORS

El gateway de Supabase añade `access-control-allow-origin: *` en todas sus respuestas 401 propias (antes de invocar el handler). Este es comportamiento de la infraestructura de la plataforma, no configurable por el código de la Edge Function. Solo afecta solicitudes rechazadas por JWT inválido/ausente. Las respuestas generadas por el handler R8 nunca contienen `*`.

**Impacto en seguridad:** bajo. Un cliente malicioso con `Origin: evil.com` sin JWT recibe 401 (no datos, no RPC ejecutado). El wildcard en ese 401 no expone información sensible.

---

## 7. Funciones en DEV post-despliegue

| Función | Versión | Status | Modificada en esta sesión |
|---------|---------|--------|--------------------------|
| erp-operations | 11 | ACTIVE | No |
| pos-operations | 20 | ACTIVE | No |
| user-admin | 7 | ACTIVE | No |
| cash-operations | 11 | ACTIVE | No |
| **financial-operations** | **2** | **ACTIVE** | **Sí (R8)** |

---

## 8. Pendientes para uso desde UI

1. Configurar `ALLOWED_ORIGINS` en secrets DEV con la URL exacta del frontend DEV antes de conectar la UI.
2. Añadir `SCREEN_KEYS.FINANZAS` en `src/lib/permissionConfig.js`.
3. Registrar ruta `/finanzas` en `src/App.jsx` con guard `isManager`.

---

> ### DESPLEGADO
>
> `financial-operations` v2 activa en DEV desde `main@a55c5db`.  
> 88/88 tests PASS (comando canónico: `npm run test:finance`).  
> G01–G08 cerradas. ALLOWED_ORIGINS no configurado — acceso de navegador bloqueado por diseño.  
> Smoke tests: 5/5 PASS. Sin wildcard en respuestas del handler R8.

---

*Documento generado: 2026-08-16 UTC. Sin modificaciones a BD, migraciones, datos DEV/PRD, secretos ni otras Edge Functions.*
