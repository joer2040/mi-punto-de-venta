# Homologacion DEV vs PRD

Esta guia define que significa que `DEV` y `PRD` esten homologados en este proyecto.

La regla principal es simple:

- `DEV` y `PRD` no necesitan tener los mismos datos vivos
- `DEV` y `PRD` si deben compartir la misma estructura, logica y comportamiento

## Objetivo

Buscamos que ambos ambientes se comporten igual ante las mismas entradas, aunque los datos operativos sean distintos.

Eso incluye:

- mismas tablas
- mismos campos
- mismas relaciones
- mismas restricciones
- mismas politicas de acceso
- mismas Edge Functions
- mismo frontend desplegado
- misma logica funcional

## Que si debe estar homologado

### 1. Esquema de base de datos

Ambos ambientes deben tener:

- las mismas tablas
- las mismas columnas
- los mismos tipos de datos
- los mismos valores por default
- las mismas claves primarias
- las mismas llaves foraneas
- las mismas restricciones `unique`, `check` y `not null`

Fuente de verdad preferida:

- `supabase/migrations/`
- `sql/dev/`
- `sql/prod/`

Evitar cambios manuales en el dashboard que no queden versionados.

### 2. Seguridad y acceso

Ambos ambientes deben compartir:

- mismas politicas `RLS`
- misma logica de permisos
- mismas tablas funcionales de seguridad
- mismos secretos requeridos por las Edge Functions

En este proyecto, revisar especialmente:

- `PROJECT_PUBLISHABLE_KEY`
- `SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Un redeploy sin los secretos correctos puede romper autenticacion aunque el codigo sea igual.

### 3. Edge Functions

Las funciones desplegadas en `DEV` y `PRD` deben estar alineadas en:

- codigo
- variables de entorno
- estrategia de autenticacion
- nombres de secretos
- flag de despliegue `--no-verify-jwt` para funciones protegidas con tokens `ES256`

Las funciones clave hoy son:

- `pos-operations`
- `user-admin`
- `erp-operations`
- `cash-operations`

Patron de autenticacion esperado:

- `requestClient` con publishable key
- `adminClient` con service role key
- `requestClient.auth.getUser()`
- despliegue con `--no-verify-jwt`

### 4. Frontend

La app desplegada en `DEV` y `PRD` debe compartir:

- mismas pantallas
- mismas validaciones
- mismo flujo funcional
- mismo comportamiento de UI

Si una diferencia visual aparece solo en produccion, revisar primero:

- despliegue en GitHub / Vercel
- cache del navegador
- service worker / PWA

### 5. Tooling operativo

El flujo de trabajo tambien debe ser consistente:

- cambios locales primero
- luego commit en Git
- luego push a GitHub
- luego despliegue en Vercel o Supabase segun corresponda

Si un cambio requiere SQL manual o Edge Functions, debe quedar rastreable en el repo.

## Que no necesita ser igual

No es necesario que `DEV` y `PRD` compartan los mismos datos del dia a dia:

- ventas
- compras
- movimientos
- pedidos abiertos
- historicos operativos
- volumen real de informacion

Eso puede variar sin problema, siempre que la estructura y la logica sean equivalentes.

## Checklist corto antes de considerar homologado un cambio

### Esquema

- existe el mismo cambio en ambos ambientes
- la modificacion esta versionada en migracion o script

### Seguridad

- las politicas `RLS` coinciden
- los secretos necesarios existen en ambos ambientes

### Edge Functions

- la funcion fue desplegada en `DEV`
- la funcion fue desplegada en `PRD` si aplica
- responde igual al mismo caso de prueba

### Frontend

- el cambio fue llevado a GitHub
- Vercel desplego la version correcta
- la UI y el flujo son equivalentes en ambos ambientes

### Validacion minima

- `npm run lint`
- `npm run build`
- probar flujo feliz principal
- probar al menos una Edge Function critica

## Reglas practicas del proyecto

### 1. No dejar cambios solo en dashboard

Si algo se cambia en Supabase manualmente, despues debe quedar en alguno de estos lugares:

- `supabase/migrations/`
- `sql/dev/`
- `sql/prod/`
- documentacion del repo

### 2. DEV puede tener seeds especiales

`DEV` puede usar datos semilla o resets propios para facilitar pruebas, siempre que no cambien la logica del sistema.

Ejemplo actual:

- el refresh de `DEV` restaura el POS con `3 barras + 12 mesas`

### 3. PRD se toca con cambios pequenos y auditables

Cuando un cambio afecta produccion:

- preferir cambios aditivos
- evitar borrar o renombrar datos en uso
- dejar el SQL versionado
- validar inmediatamente despues de aplicar

## Senales de deshomologacion

Estas pistas suelen indicar que `DEV` y `PRD` ya no estan alineados:

- una pantalla funciona en un ambiente pero no en el otro
- una Edge Function responde distinto sin razon de datos
- faltan columnas o tablas en uno de los ambientes
- un secreto existe en `DEV` pero no en `PRD`
- el frontend desplegado no coincide con el codigo esperado
- hay cambios hechos desde dashboard sin rastro en Git

## Flujo recomendado para cambios futuros

1. hacer el cambio en local
2. versionar codigo y SQL
3. validar con `lint` y `build`
4. desplegar o aplicar primero en `DEV`
5. probar comportamiento
6. llevar el mismo cambio a `PRD` si corresponde
7. validar en produccion
8. dejar documentado cualquier requisito especial

## Resumen

La homologacion correcta no significa clonar todos los datos de produccion.

Significa que `DEV` y `PRD`:

- piensan igual
- validan igual
- guardan igual
- responden igual

y que solo cambia el contexto operativo de los datos.
