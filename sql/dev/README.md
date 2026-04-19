## SQL Dev

Guarda aqui scripts SQL de soporte que deban ejecutarse solo contra el proyecto de desarrollo.

`generated/` se usa para seeds locales exportados desde production. Esos archivos no se versionan.

Importante:

- `scripts/refresh-dev-core-data-from-prod.ps1` no es un sync neutro.
- el script refresca catalogos base desde production hacia development
- al final tambien restaura el layout operativo de DEV a `3 barras + 12 mesas`
- ese proceso deja todas las estaciones en `libre` y limpia ligas activas de pedidos en `public.tables`

Usalo como reset controlado de DEV, no como una sincronizacion inocua de datos transaccionales.

Ejemplo:

```powershell
npm run supabase:sql:dev -- -File sql/dev/2026-04-18_seed_tables.sql
```
