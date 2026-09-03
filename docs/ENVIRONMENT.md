# Variables de Entorno — mi-punto-de-venta

Documentación de variables de entorno requeridas para cada componente del sistema.
Creado en: 2026-09-02 — Auditoría preventiva post-incidente.

---

## Vercel (Frontend)

| Variable | Valor | Requerida |
|---|---|---|
| `VITE_SUPABASE_URL_PROD` | URL del proyecto Supabase PRD | ✅ |
| `VITE_SUPABASE_ANON_KEY_PROD` | Anon key del proyecto PRD | ✅ |

> Definidas en Vercel → Settings → Environment Variables → Production.

---

## Supabase Edge Functions

### Variables nativas (auto-provistas por Supabase)

| Variable | Descripción |
|---|---|
| `SUPABASE_URL` | URL del proyecto |
| `SUPABASE_ANON_KEY` | Clave anónima del proyecto |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |

### Secrets personalizados (configurar vía Supabase Dashboard → Edge Functions → Secrets)

| Variable | Función | Descripción | Criticidad |
|---|---|---|---|
| `PROJECT_PUBLISHABLE_KEY` | todas | Override del anon key. Si no existe, cae en `SUPABASE_ANON_KEY`. | Baja |
| `SERVICE_ROLE_KEY` | todas | Override del service role key. Si no existe, cae en `SUPABASE_SERVICE_ROLE_KEY`. | Baja |
| `ALLOWED_ORIGINS` | **financial-operations** | **CRÍTICO.** Lista separada por coma de origins permitidos para CORS estricto. Si está vacío o ausente, **todas las peticiones del navegador reciben 403**. | **P1** |

---

## ALLOWED_ORIGINS — Detalle

La función `financial-operations` implementa CORS estricto. Usa `ALLOWED_ORIGINS` para
validar el header `Origin` de cada request. Si el origin no coincide → `403 Origin not allowed`.

**Valor actual en PRD (verificado 2026-09-02):**
```
https://lacarreta.mobi
```

> Confirmado: el ledger fue activado exitosamente desde `lacarreta.mobi` → el origin está incluido.

**Formato del valor:**
```
https://lacarreta.mobi,https://otro-dominio.com
```
(Múltiples origins separados por coma, sin espacios antes/después de las comas.)

### ⚠️ Checklist obligatorio al cambiar de dominio

Antes de cualquier cambio de dominio o renovación de URL:

1. Actualizar `ALLOWED_ORIGINS` en Supabase → Secrets con el nuevo domain
2. Verificar que `lacarreta.mobi` (o el nuevo dominio) esté en la lista
3. Hacer una prueba de operación financiera desde el nuevo dominio antes de confirmar el cambio
4. Si se usa Vercel Preview URLs para pruebas: agregar el preview URL a `ALLOWED_ORIGINS` temporalmente

### Impacto de ALLOWED_ORIGINS vacío o incorrecto

Las siguientes operaciones quedan **bloqueadas** (todas usan `financial-operations`):
- Activar / consultar estado del ledger
- Registrar traspasos, aportaciones, retiros
- Reversar pólizas
- Resolver diferencias de caja
- Consultar balances, mayor, reportes financieros

Las siguientes operaciones **NO se ven afectadas** (usan otras EFs con CORS `*`):
- POS (ventas)
- Control de caja
- Compras / ERP
- Usuarios

---

## Local Development (.env.local)

Copiar `.env.local.example` a `.env.local` y completar:

```env
VITE_SUPABASE_URL=<supabase-local-url>
VITE_SUPABASE_ANON_KEY=<local-anon-key>
```

Para conectar al proyecto PRD localmente (solo lectura / desarrollo):
```env
VITE_SUPABASE_URL_PROD=<prd-url>
VITE_SUPABASE_ANON_KEY_PROD=<prd-anon-key>
```

---

## Historial de cambios

| Fecha | Cambio | Responsable |
|---|---|---|
| 2026-09-02 | Creación del documento, documentación de ALLOWED_ORIGINS | Auditoría preventiva |
