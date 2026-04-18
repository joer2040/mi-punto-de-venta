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

## Vercel / Produccion

Configura en Vercel las variables del ambiente de produccion:

```bash
VITE_APP_ENV=production
VITE_BACKEND_ENV=production
VITE_SUPABASE_URL_PROD=https://tu-proyecto-prod.supabase.co
VITE_SUPABASE_ANON_KEY_PROD=tu-anon-key-prod
```

## Nota importante

Para una separacion real necesitas dos backends distintos:

- un proyecto Supabase para desarrollo
- un proyecto Supabase para produccion

Si ambos ambientes usan el mismo proyecto Supabase, entonces aunque Vercel y localhost esten separados a nivel de frontend, seguiran escribiendo sobre la misma base de datos.
