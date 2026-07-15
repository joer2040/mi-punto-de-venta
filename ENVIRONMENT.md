# Separacion de ambientes

Este proyecto separa `development` y `production` a nivel de frontend, backend y operacion.

## Regla base

Para una separacion real necesitas dos backends distintos:

- un proyecto Supabase para `development`
- un proyecto Supabase para `production`

Si ambos ambientes usan el mismo proyecto Supabase, la separacion del frontend no evita que ambos escriban sobre la misma base de datos.

## Development local

Usa `.env.development.local`, archivo local no versionado.

Variables base:

```bash
VITE_APP_ENV=development
VITE_BACKEND_ENV=development
VITE_SUPABASE_URL_DEV=https://tu-proyecto-dev.supabase.co
VITE_SUPABASE_ANON_KEY_DEV=tu-anon-key-dev
```

Si necesitas ejecutar SQL remoto contra `development` desde terminal:

```bash
SUPABASE_DB_URL_DEV=postgresql://postgres:tu-password-dev@db.tu-proyecto-dev.supabase.co:5432/postgres
```

Si necesitas variables para Edge Functions protegidas en `development`:

```bash
PROJECT_PUBLISHABLE_KEY=tu-publishable-key-dev
SERVICE_ROLE_KEY=tu-service-role-key-dev
```

Si por una razon excepcional necesitas apuntar localmente al backend de `production`, debe ser explicito:

```bash
VITE_BACKEND_ENV=production
VITE_ALLOW_PROD_BACKEND_IN_DEV=true
```

## Production en Vercel

Configura estas variables en Vercel para `production`:

```bash
VITE_APP_ENV=production
VITE_BACKEND_ENV=production
VITE_SUPABASE_URL_PROD=https://tu-proyecto-prod.supabase.co
VITE_SUPABASE_ANON_KEY_PROD=tu-anon-key-prod
```

Si necesitas ejecutar SQL remoto contra `production` desde terminal:

```bash
SUPABASE_DB_URL_PROD=postgresql://postgres:tu-password-prod@db.tu-proyecto-prod.supabase.co:5432/postgres
```

Si necesitas variables para Edge Functions protegidas en `production`:

```bash
PROJECT_PUBLISHABLE_KEY=tu-publishable-key-prod
SERVICE_ROLE_KEY=tu-service-role-key-prod
```

## SQL por ambiente

El repo incluye scripts para aplicar archivos `.sql` al ambiente correcto sin usar el SQL Editor.

Development:

```powershell
npm run supabase:sql:dev -- -File sql/dev/2026-04-18_seed_tables.sql
```

Production:

```powershell
npm run supabase:sql:prod -- -File sql/prod/2026-04-18_hotfix.sql -AllowProduction
```

Usa esta regla:

- cambios estructurales permanentes: `supabase/migrations/`
- parches o cargas puntuales de un solo ambiente: `sql/dev/` o `sql/prod/`

## Edge Functions protegidas

Las funciones protegidas deben asumir:

- `SUPABASE_URL`
- `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`

Patron de autenticacion actual:

- `requestClient` con `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- `Authorization` reenviado desde el request
- `requestClient.auth.getUser()` para resolver al usuario
- `adminClient` separado con `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`

No usar:

- `PROJECT_LEGACY_SERVICE_ROLE_KEY`
- validacion manual via `/auth/v1/user`

Si el proyecto usa tokens `ES256`, las funciones protegidas deben desplegarse con `--no-verify-jwt`. Si no, Supabase puede rechazar la peticion antes de ejecutar el codigo con errores como `Unsupported JWT algorithm ES256`.

Deploy esperado:

```powershell
npm exec supabase functions deploy <nombre-funcion> -- --project-ref <project-ref> --no-verify-jwt
```

Guia completa:

- [SUPABASE_EDGE_FUNCTION_AUTH.md](C:/Users/jaime/OneDrive/Documentos/OneDrive/Escritorio%20Nube/Project%20Codex/pventa/mi-punto-de-venta/docs/SUPABASE_EDGE_FUNCTION_AUTH.md)
