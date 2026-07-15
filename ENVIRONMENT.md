# Separacion de ambientes

El proyecto ahora soporta configuracion separada para `development` y `production`.

## Localhost

Usa un archivo local no versionado llamado:

```bash
.env.development.local
```

Contenido esperado:

```bash
VITE_APP_ENV=development
VITE_BACKEND_ENV=development
VITE_SUPABASE_URL_DEV=https://tu-proyecto-dev.supabase.co
VITE_SUPABASE_ANON_KEY_DEV=tu-anon-key-dev
```

Si por alguna razon necesitas apuntar localmente a produccion, debes hacerlo de forma explicita:

```bash
VITE_BACKEND_ENV=production
VITE_ALLOW_PROD_BACKEND_IN_DEV=true
```

Si quieres ejecutar scripts SQL remotos contra Supabase desde terminal, agrega tambien:

```bash
SUPABASE_DB_URL_DEV=postgresql://postgres:tu-password-dev@db.tu-proyecto-dev.supabase.co:5432/postgres
```

Para las Edge Functions protegidas agrega tambien:

```bash
PROJECT_PUBLISHABLE_KEY=tu-publishable-key-dev
SERVICE_ROLE_KEY=tu-service-role-key-dev
```

En nuestros despliegues actuales la validacion de sesion ya no usa
`PROJECT_LEGACY_SERVICE_ROLE_KEY` ni llamadas manuales a `/auth/v1/user`.
El patron correcto es:

- `requestClient` con `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- `Authorization` reenviado desde el request
- `requestClient.auth.getUser()` para resolver al usuario
- `adminClient` separado con `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`

## Vercel / Produccion

Configura en Vercel las variables del ambiente de produccion:

```bash
VITE_APP_ENV=production
VITE_BACKEND_ENV=production
VITE_SUPABASE_URL_PROD=https://tu-proyecto-prod.supabase.co
VITE_SUPABASE_ANON_KEY_PROD=tu-anon-key-prod
```

Para ejecutar scripts SQL remotos contra produccion desde terminal, agrega tambien:

```bash
SUPABASE_DB_URL_PROD=postgresql://postgres:tu-password-prod@db.tu-proyecto-prod.supabase.co:5432/postgres
```

Para las Edge Functions desplegadas en produccion agrega tambien:

```bash
PROJECT_PUBLISHABLE_KEY=tu-publishable-key-prod
SERVICE_ROLE_KEY=tu-service-role-key-prod
```

Si el proyecto usa tokens `ES256`, las funciones protegidas deben desplegarse con
`--no-verify-jwt`. De lo contrario, Supabase puede rechazar la peticion antes de
ejecutar tu codigo con errores como `Unsupported JWT algorithm ES256`.

## Ejecutar SQL por ambiente

El repo ahora incluye scripts para aplicar archivos `.sql` al ambiente correcto sin entrar al SQL Editor.

Desarrollo:

```powershell
npm run supabase:sql:dev -- -File sql/dev/2026-04-18_seed_tables.sql
```

Produccion:

```powershell
npm run supabase:sql:prod -- -File sql/prod/2026-04-18_hotfix.sql -AllowProduction
```

Regla sugerida:

- cambios estructurales permanentes: `supabase/migrations/`
- parches o cargas puntuales solo de un ambiente: `sql/dev/` o `sql/prod/`

## Edge Functions

Las funciones protegidas hoy asumen:

- `SUPABASE_URL`
- `PROJECT_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY`
- `SERVICE_ROLE_KEY` o `SUPABASE_SERVICE_ROLE_KEY`

Y deben desplegarse con:

```powershell
npm exec supabase functions deploy <nombre-funcion> -- --project-ref <project-ref> --no-verify-jwt
```

Consulta [SUPABASE_EDGE_FUNCTION_AUTH.md](C:/Users/jaime/OneDrive/Documentos/OneDrive/Escritorio%20Nube/Project%20Codex/pventa/mi-punto-de-venta/docs/SUPABASE_EDGE_FUNCTION_AUTH.md) para la guia operativa completa.

## Nota importante

Para una separacion real necesitas dos backends distintos:

- un proyecto Supabase para desarrollo
- un proyecto Supabase para produccion

Si ambos ambientes usan el mismo proyecto Supabase, entonces aunque Vercel y localhost esten separados a nivel de frontend, seguiran escribiendo sobre la misma base de datos.
