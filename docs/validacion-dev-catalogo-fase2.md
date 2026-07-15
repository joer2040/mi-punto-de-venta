# Validación DEV previa a Fase 2 - Catálogo e inventario

Fecha de validación: 2026-07-14
Proyecto: `mi-punto-de-venta`
Ambiente validado: DEV

## 1. Veredicto

DEV validado para preparar diseño, con una salvedad operativa.

DEV sí está separado de PRD y fue consultado exitosamente en modo sólo lectura. No se ejecutaron escrituras, migraciones, seeds, refresh, deploy, reset ni cambios de archivos. La salvedad: REST con anon key no tiene permisos para leer catálogo; fue necesario usar `SUPABASE_DB_URL_DEV` con `psql` local para consultas `SELECT` únicamente.

## 2. Evidencia DEV/PRD sin secretos

- Frontend local DEV se configura por `.env.development.local`.
- `VITE_APP_ENV`: `development`
- `VITE_BACKEND_ENV`: `development`
- `VITE_ALLOW_PROD_BACKEND_IN_DEV`: ausente
- `VITE_SUPABASE_URL_DEV`: presente
- `VITE_SUPABASE_ANON_KEY_DEV`: presente
- `SUPABASE_DB_URL_DEV`: presente
- DEV project ref: `rtkd...xxzf`
- PRD project ref local: `cxpo...euwk`
- Son distintos: sí
- `.env.production.local`: no existe
- Riesgo de localhost usando PRD: bajo, porque `src/lib/supabase.js` en modo dev sólo toma variables `*_DEV` / `*_DEVELOPMENT`; si faltan, lanza error en vez de caer a `.env.local`.

Conectividad:

- REST anon DEV: accesible, pero `categories` devuelve `401 / 42501 permission denied`.
- `psql` DEV: exitoso con consultas `SELECT`.
- Hora consulta DB: `2026-07-14T05:02:16Z`.
- Método usado para catálogo: `.tools\psql\psql.exe` contra `SUPABASE_DB_URL_DEV`, sólo lectura.
- Edge Functions listadas con Supabase CLI, sólo lectura.

## 3. Estado real de categorías DEV

| Categoría | ID | Venta | Inventario | Materiales |
|---|---:|---:|---:|---:|
| Botanas | `eb549536...` | true | true | 0 |
| Botellas/Otros | `5e7c4402...` | false | true | 3 |
| Cerveza | `10504da0...` | true | true | 8 |
| Extras | `0b637345...` | true | false | 4 |
| Refrescos | `f8ca157a...` | true | true | 0 |
| Servicios | `f817f518...` | false | false | 0 |

Resultado:

- `Coctelería`: no existe.
- `Botella`: no existe.
- Duplicados normalizados básicos: no detectados.
- `categories.is_internal_production`: no existe.

## 4. Estado real de productos afectados

| SKU | Producto | Estado | Categoría actual | Proveedor | U compra | U venta | Precio/stock |
|---:|---|---|---|---|---|---|---|
| 1480051534 | CLAMATO PREPARADO. | encontrado | Extras | null | pz | pz | Bar Principal: $60, stock 0 |
| 10001 | PREPARACION CLAMATO. | encontrado | Extras | null | pz | pz | Bar Principal: $35, stock 0 |
| 10002 | PREPARACION CHELADO. | encontrado | Extras | null | pz | pz | Bar Principal: $25, stock 0 |
| 7501035010559 | MEZCALITA LA CARRETA (JAMAICA) | no encontrado | - | - | - | - | - |
| 7501035010560 | MEZCALITA DE LA DONA (GUAYABA) | no encontrado | - | - | - | - | - |
| 75035259 | CIGARROS MARLBORO BLANCOS LARGOS. | encontrado | Botellas/Otros | OXXO | pz | pz | Bar Principal: $10, stock 0 |
| 75021597 | CIGARROS MARLBORO ROJOS LARGOS. | encontrado | Botellas/Otros | OXXO | pz | pz | Bar Principal: $10, stock 0 |
| 10009 | BOTANAS | no encontrado | - | - | - | - | - |
| 2222 | TEQUILA CUERVO ESPECIA3 990 MIL. | encontrado | Extras | null | pz | pz | Bar Principal: $45, stock 0 |

Historial para estos productos:

- Todos los productos encontrados tienen:
  - `sale_items_count = 0`
  - `purchase_items_count = 0`
  - `inventory_movements_count = 0`
- Duplicados por SKU: no detectados.
- Duplicados por nombre básico: no detectados.
- Todos tienen 1 registro de inventario.

## 5. Contenido actual de `Botanas`

La categoría `Botanas` existe, pero no tiene materiales relacionados.

Esto cambia la propuesta de Fase 2: no hay productos actuales que mover desde categoría `Botanas` a `Extras`. Lo pendiente es crear o confirmar el producto `BOTANAS` SKU `10009`.

## 6. Contenido actual de `Botellas/Otros`

| SKU | Producto | Clasificación propuesta | Precio/stock |
|---:|---|---|---|
| 75035259 | CIGARROS MARLBORO BLANCOS LARGOS. | no botella evidente | $10, stock 0 |
| 75021597 | CIGARROS MARLBORO ROJOS LARGOS. | no botella evidente | $10, stock 0 |
| 7501035010550 | TEQUILA CUERVO ESPECIAL 990 MIL. | botella evidente | $45, stock 13 |

Propuesta derivada:

- Cigarros -> `Extras`
- Tequila Cuervo Especial 990 ml -> `Botella`

## 7. Esquema, trigger y Edge Functions DEV

Esquema confirmado:

- `categories`: no tiene `is_internal_production`.
- `sale_items`: `id`, `sale_id`, `material_id`, `quantity`, `unit_price`, `created_at`, `subtotal`.
- `inventory_movements`: estructura compatible con movimientos de venta, compra, ajuste e inicial.

Trigger confirmado:

- `tr_update_inventory_on_sale`
- Tabla: `sale_items`
- Evento: `AFTER INSERT`
- Ejecuta: `update_inventory_on_sale()`

Definición vigente de `update_inventory_on_sale`:

- Busca `center_id` desde `sales`.
- Resta `NEW.quantity` de `public.inventory`.
- No consulta `categories.is_inventoried`.
- Por lo tanto, cualquier producto insertado en `sale_items` descuenta inventario.

Edge Functions DEV:

| Function | Estado | verify_jwt | Versión |
|---|---:|---:|---:|
| `pos-operations` | ACTIVE | false | 16 |
| `erp-operations` | ACTIVE | false | 8 |

Backend/código actual:

- `pos-operations` identifica `Extras` por nombre.
- `pos-operations` excluye `Extras` de `sale_items`.
- `erp-operations` permite proveedor nulo únicamente para `Extras`.
- DB descuenta inventario por cada inserción en `sale_items`.

## 8. Diferencias contra los seeds usados en la Fase 1

No hay diferencia relevante entre los seeds revisados en Fase 1 y DEV real para el catálogo base:

- `Extras` existe y es no inventariable.
- `Botanas` existe como categoría vacía.
- `Botellas/Otros` tiene 3 materiales: dos cigarros y un tequila.
- Las dos Mezcalitas no existen.
- `Botanas` SKU `10009` no existe.
- SKU `2222` existe en `Extras`.

La diferencia principal es de certeza: ahora está confirmado contra DEV real, no sólo contra seeds.

## 9. Decisiones/datos faltantes

Antes de implementar Fase 2, siguen faltando estas decisiones:

- Confirmar crear `BOTANAS` con SKU `10009`, unidad `pz`, categoría `Extras`, precio e inventario inicial.
- Confirmar crear las Mezcalitas con:
  - SKU `7501035010559`
  - SKU `7501035010560`
  - unidad `pz`
  - precios de venta
  - stock inicial 0 o sin stock positivo
- Confirmar renombrar SKU `2222` a `Tequila Cuervo Especial Shot`, moverlo a `Coctelería`, mantener precio $45 y proveedor null.
- Confirmar si productos no inventariables deben registrarse en `sale_items`. El prompt objetivo dice que sí; eso requiere cambiar trigger/backend para evitar descuento por `is_inventoried = false`.

## 10. Riesgos y bloqueos

Riesgos técnicos:

- Si se cumple “todo producto vendido debe registrarse en `sale_items`”, el trigger actual causaría descuento indebido para Coctelería.
- Por eso Fase 2 no puede limitarse a cambiar categorías; debe cambiar también la función SQL `update_inventory_on_sale`.
- `pos-operations` debe dejar de excluir productos no inventariables de `sale_items`.
- `inventory_movements` debe generarse sólo para inventariables.
- `erp-operations` debe dejar de usar `Extras` como permiso para proveedor nulo.

Bloqueo funcional:

- Faltan precios/confirmación para productos nuevos (`Mezcalitas`, `Botanas`) si se van a crear.

## 11. Plan actualizado para Fase 2

1. Código backend:
   - `pos-operations`: registrar todos los productos en `sale_items`.
   - Validar/descontar stock sólo si `categories.is_inventoried = true`.
   - Generar `inventory_movements` sólo para inventariables.

2. SQL/migración:
   - Agregar `categories.is_internal_production`.
   - Crear `Coctelería`.
   - Configurar `Extras` como vendible e inventariable.
   - Renombrar `Botellas/Otros` a `Botella`.
   - Reasignar cigarros a `Extras`.
   - Mantener botella real en `Botella`.
   - Reasignar/renombrar SKU `2222` según aprobación.
   - Actualizar `update_inventory_on_sale` para descontar sólo inventariables.

3. Frontend:
   - POS usa `is_inventoried`, no nombre de categoría.
   - MaterialForm usa `is_internal_production` / regla de categoría, no `Extras`.
   - Actualizar lógica `Botellas/Otros` -> `Botella`.

4. Validación DEV:
   - `npm run lint`
   - `npm run build`
   - aplicar migración sólo en DEV con aprobación explícita
   - probar ventas de Coctelería sin descuento
   - probar Extras con stock obligatorio
   - comprobar `sale_items` para todos los productos vendidos
   - comprobar `inventory_movements` sólo inventariables

## Recomendación

Es seguro preparar la Fase 2, pero no ejecutarla todavía hasta que se confirmen los datos faltantes de productos nuevos y exista autorización explícita para la implementación.
