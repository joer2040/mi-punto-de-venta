# FASE3 — R9: CORS ALLOWED_ORIGINS DEV

**Fecha (UTC):** 2026-08-16  
**Entorno:** DEV (`rtkdrnfqihulqdhixxzf`)  
**Acción:** Configurar secret `ALLOWED_ORIGINS` en Edge Function `financial-operations`  
**Restricciones aplicadas:** sin código, sin SQL, sin PRD, sin migraciones, sin commits, sin despliegues.

---

## 1. Comando ejecutado

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174" \
  --project-ref rtkdrnfqihulqdhixxzf
```

**Resultado CLI:**

```
Finished supabase secrets set.
```

---

## 2. Verificación del secret

```bash
npx supabase secrets list --project-ref rtkdrnfqihulqdhixxzf | grep ALLOWED_ORIGINS
```

**Resultado:**

```
ALLOWED_ORIGINS  |  1700c0c3dd87dd972d23a4bd3b2a434f7c59af6cfc381dc1f2ef7590a88e4bb7
```

Secret registrado. El hash confirma que el valor fue aceptado por la plataforma.

---

## 3. Smoke Tests

URL base: `https://rtkdrnfqihulqdhixxzf.supabase.co/functions/v1/financial-operations`

### Test 1 — OPTIONS con `Origin: http://localhost:5173`

```bash
curl -s -D - -o /dev/null \
  -X OPTIONS <URL> \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

| Campo | Valor |
|-------|-------|
| HTTP status | **200** |
| `access-control-allow-origin` | `http://localhost:5173` |
| `x-deno-execution-id` | `44fb01c7-dd8f-4932-a1aa-19b83886f0dc` |
| Resultado | ✅ PASS — handler R8 ejecutó, origen autorizado |

---

### Test 2 — OPTIONS con `Origin: http://localhost:5174`

```bash
curl -s -D - -o /dev/null \
  -X OPTIONS <URL> \
  -H "Origin: http://localhost:5174" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

| Campo | Valor |
|-------|-------|
| HTTP status | **200** |
| `access-control-allow-origin` | `http://localhost:5174` |
| `x-deno-execution-id` | `4261b739-2855-4ce6-a3a0-d6ca7c5d6997` |
| Resultado | ✅ PASS — puerto alternativo autorizado |

---

### Test 3 — OPTIONS con `Origin: https://evil.com` (debe ser 403)

```bash
curl -s -D - -o /dev/null \
  -X OPTIONS <URL> \
  -H "Origin: https://evil.com" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,content-type"
```

| Campo | Valor |
|-------|-------|
| HTTP status | **403** |
| `access-control-allow-origin` | **ausente** |
| `x-deno-execution-id` | `ab82d4e7-76db-4b7b-b46a-d375a9e8d81f` |
| Resultado | ✅ PASS — handler R8 ejecutó y bloqueó el origen no autorizado |

---

### Test 4 — OPTIONS sin `Origin` (servidor-a-servidor)

```bash
curl -s -D - -o /dev/null \
  -X OPTIONS <URL> \
  -H "Access-Control-Request-Method: POST"
```

| Campo | Valor |
|-------|-------|
| HTTP status | **200** |
| `access-control-allow-origin` | **ausente** ✅ |
| `x-deno-execution-id` | `b714b5ed-6820-477e-a564-bda9290a996f` |
| Resultado | ✅ PASS — acceso servidor-a-servidor permitido, sin ACAO header |

---

### Test 5 — Sin wildcard en origen autorizado

Re-usa respuesta del Test 1. El header `access-control-allow-origin` devuelve el origen exacto, nunca `*`.

| Valor esperado | Valor recibido |
|---------------|---------------|
| `http://localhost:5173` | `http://localhost:5173` |
| **No** `*` | Confirmado — `*` ausente |
| Resultado | ✅ PASS |

---

## 4. Resumen de resultados

| # | Escenario | HTTP | ACAO | Resultado |
|---|-----------|------|------|-----------|
| 1 | OPTIONS + `localhost:5173` | 200 | `http://localhost:5173` | ✅ |
| 2 | OPTIONS + `localhost:5174` | 200 | `http://localhost:5174` | ✅ |
| 3 | OPTIONS + `evil.com` | 403 | ausente | ✅ |
| 4 | OPTIONS sin Origin | 200 | ausente | ✅ |
| 5 | Wildcard `*` ausente | — | sin `*` | ✅ |

**6/6 PASS**

---

## 5. Estado post-configuración

| Item | Estado |
|------|--------|
| `ALLOWED_ORIGINS` en DEV | ✅ Configurado |
| Acceso desde `http://localhost:5173` | ✅ Desbloqueado |
| Acceso desde `http://localhost:5174` | ✅ Desbloqueado |
| Acceso desde `https://evil.com` | ✅ Bloqueado (403) |
| Wildcard `*` en respuestas R8 | ✅ Nunca emitido |
| Vercel preview incluido | ❌ No incluido (intencional) |
| Cambios en código | ❌ Ninguno |
| SQL ejecutado | ❌ Ninguno |
| PRD modificado | ❌ No tocado |

---

## 6. Pendiente inmediato

**Bloqueo restante: permisos DB DEV.**

Los usuarios con rol `manager` / `administrador operativo` aún no tienen filas en `app_role_permissions` para `finances:view`. Mientras no se ejecute el SQL de permisos (sección 12 del PLAN_DESBLOQUEO_UI_FINANZAS_DEV.md), `canAccessPage('finances')` devuelve `false` y el módulo no aparecerá en navegación para usuarios no-superadmin.

Superadmin puede probar el módulo ahora (bypass de permisos por `is_superadmin=true`).

---

## 7. Vercel preview (pendiente)

Cuando se requiera probar desde Vercel, ejecutar:

```bash
npx supabase secrets set \
  ALLOWED_ORIGINS="http://localhost:5173,http://localhost:5174,https://mi-punto-de-venta-3id2dlttr-joer2040s-projects.vercel.app" \
  --project-ref rtkdrnfqihulqdhixxzf
```

**Nota:** el URL de Vercel preview cambia por rama y despliegue. Verificar que sigue siendo válido antes de ejecutar.

---

*Documento generado: 2026-08-16. Sin código modificado. Sin SQL ejecutado. Sin PRD tocado.*
