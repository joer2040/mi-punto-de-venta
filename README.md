# Mi Punto de Venta

Aplicacion web para operacion de inventario, compras, movimiento de materiales, usuarios y punto de venta de La Carreta.

## Stack

- React 19
- Vite
- Supabase
- Supabase Edge Functions

## Modulos principales

- Materiales
- Proveedores
- Entrada por compra
- Movimiento de materiales
- Reportes
- Punto de venta
- Usuarios

## Estructura importante

- `src/`: frontend de la aplicacion
- `src/api/`: servicios cliente para Supabase y Edge Functions
- `src/pages/`: pantallas principales
- `supabase/migrations/`: historial principal de cambios de base de datos
- `supabase/functions/`: Edge Functions desplegadas en Supabase
- `sql/`: scripts manuales o historicos de apoyo
- `scripts/apply-supabase-sql.ps1`: runner para ejecutar SQL remoto por ambiente

## Ambiente local

Frontend local:

```powershell
npm install
npm run dev
```

Validaciones:

```powershell
npm run lint
npm run build
```

## Variables de entorno

Desarrollo y produccion usan configuracion separada.

Archivos locales no versionados:

- `.env.development.local`
- `.env.local` o `.env.production.local`

Consulta [ENVIRONMENT.md](C:/Users/jaime/OneDrive/Documentos/OneDrive/Escritorio%20Nube/Project%20Codex/pventa/mi-punto-de-venta/ENVIRONMENT.md) para la configuracion de frontend y conexiones SQL remotas.

## SQL remoto por ambiente

Desarrollo:

```powershell
npm run supabase:sql:dev -- -File sql/dev/tu-script.sql
```

Produccion:

```powershell
npm run supabase:sql:prod -- -File sql/prod/tu-script.sql -AllowProduction
```

## Notas operativas

- las Edge Functions dependen de `PROJECT_LEGACY_SERVICE_ROLE_KEY` para validar sesion correctamente en nuestros proyectos Supabase actuales
- `scripts/refresh-dev-core-data-from-prod.ps1` esta pensado como reset controlado de DEV y tambien restaura el POS de desarrollo a `3 barras + 12 mesas`
- no asumas que ese refresh preserva pedidos abiertos o estado operativo previo en DEV

## Regla de mantenimiento

- cambios permanentes de esquema: `supabase/migrations/`
- cambios de logica backend en Supabase: `supabase/functions/`
- scripts puntuales por ambiente: `sql/dev/` y `sql/prod/`
