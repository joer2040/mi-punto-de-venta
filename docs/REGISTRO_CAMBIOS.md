# Registro de Cambios

Este archivo concentra el registro historico de cambios funcionales, tecnicos y operativos liberados en el proyecto.

## 2026-05-04

### POS: Cubeta virtual

Estado:
- liberado en `DEV`
- liberado en `PRD`
- validado tecnicamente en frontend y backend

Resumen:
- se agrego `Cubeta` como bundle virtual en el POS, sin crear material nuevo en maestro
- la cubeta solo se puede armar con 10 piezas exactas de una lista cerrada de SKU de categoria `Cerveza`
- el precio de venta de la cubeta se fijo en `$320.00`
- el ticket muestra solo el concepto `Cubeta`
- el consumo de inventario se mantiene sobre las 10 piezas reales

Frontend:
- se agrego una tarjeta especial `Cubeta` en el catalogo del POS
- la tarjeta abre un modal de armado con seleccion exacta de 10 piezas
- el modal valida stock disponible por SKU en tiempo real
- la cuenta activa muestra resumen de cubeta para operar el carrito
- el ticket local, PDF e impresion muestran solo el concepto `Cubeta`

Backend:
- `pos-operations` ahora preserva metadatos opcionales de bundle en `table_orders.items`
- `finalize_sale` valida:
  - solo SKU permitidos
  - misma base de precio en todos los SKU del bundle
  - 10 piezas exactas por cubeta
  - total fijo de `$320.00`
- la venta se persiste con `sale_items` reales y `inventory_movements` reales

Archivos/versionado:
- `src/pages/POS.jsx`
- `supabase/functions/pos-operations/index.ts`

Despliegue:
- frontend liberado por flujo `local -> GitHub -> Vercel`
- `pos-operations` desplegada en `PRD`

Validacion:
- `npx eslint src/pages/POS.jsx`: OK
- `npm run build`: OK

Notas:
- `npm run lint` sigue fallando por errores previos no relacionados en `src/api/cashControlService.js`

### POS: Barra 4

Estado:
- liberado en `DEV`
- liberado en `PRD`
- validado funcionalmente en `DEV`

Resumen:
- se agrego una estacion adicional `Barra 4` en el layout operativo del POS
- la nueva barra reutiliza la misma funcionalidad que las demas estaciones porque el POS consume dinamicamente el catalogo de `public.tables`

Base de datos:
- se versiono un script idempotente para insertar `Barra 4` con estado `libre`

Archivos/versionado:
- scripts SQL:
  - `sql/dev/2026-05-04_add_barra_4.sql`
  - `sql/prod/2026-05-04_add_barra_4.sql`

Despliegue:
- SQL aplicado en `DEV`
- SQL aplicado en `PRD`

Validacion:
- `DEV` muestra `Barra 1`, `Barra 2`, `Barra 3`, `Barra 4`
- `PRD` muestra `Barra 1`, `Barra 2`, `Barra 3`, `Barra 4`

## 2026-04-20

### Compras: Proveedor General

Estado:
- liberado en `DEV`
- liberado en `PRD`
- validado funcionalmente en ambos ambientes

Resumen:
- se agrego `Proveedor General` como proveedor fijo y real en compras
- cuando se selecciona `Proveedor General`, el modulo permite capturar conceptos libres sin `material_id`
- estas compras se registran contablemente en `purchases` y `purchase_items`
- los renglones libres no generan movimientos de inventario ni alteran `inventory`

Frontend:
- `PurchaseEntry` ahora soporta dos modos:
  - proveedor normal con selector de material
  - `Proveedor General` con descripcion libre, cantidad y costo
- se agrego el boton `Check` antes de `Procesar Factura Completa`
- el `Check` usa un modal nativo de la app para revisar proveedor, folio, total y renglones
- se elimino la confirmacion nativa del navegador al cambiar proveedor con items capturados y se reemplazo por modal nativo
- se bloqueo el doble click durante el guardado con estado `Procesando...`

Backend:
- `erp-operations` soporta compras estandar y compras de `Proveedor General`
- para `Proveedor General`, `material_id` puede ir `null` y `item_description` es obligatorio
- se agrego defensa anti-duplicado en backend con ventana corta de 120 segundos usando:
  - proveedor
  - centro
  - folio
  - total
  - fingerprint de renglones

Base de datos:
- `purchase_items.item_description` agregado como `text not null default ''`
- script idempotente para asegurar existencia de `Proveedor General` en `providers`

Reportes y lectura:
- el detalle de compras ya soporta renglones sin material asociado
- `MaterialMovements` ignora renglones libres al cargar ajustes basados en factura

Archivos/versionado:
- commit principal: `71896d5` `feat: support general provider purchases`
- migracion:
  - `supabase/migrations/20260419170000_support_general_provider_purchases.sql`
- scripts SQL:
  - `sql/dev/2026-04-19_support_general_provider_purchases.sql`
  - `sql/prod/2026-04-19_support_general_provider_purchases.sql`

Despliegue:
- frontend liberado por flujo `local -> GitHub -> Vercel`
- `erp-operations` desplegada en `DEV` y `PRD`
- SQL aplicado en `DEV` y `PRD`

Validacion:
- `npm run lint`: OK
- `npm run build`: OK
- pruebas funcionales en `PRD`: OK

Notas:
- el cambio local visual de `src/index.css` para marcar `Development` no forma parte de esta liberacion
- futuros registros deben agregarse en este mismo archivo
