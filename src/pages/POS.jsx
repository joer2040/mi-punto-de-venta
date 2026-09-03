import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { cashControlService } from '../api/cashControlService'
import { materialService } from '../api/materialService'
import { posService } from '../api/posService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { supabase } from '../lib/supabase'
import { useResponsive } from '../lib/useResponsive'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

const TICKET_WIDTH_MM = 80
const CUBETA_ALLOWED_SKUS = [
  '75004132',
  '7501064115400',
  '7501064101410',
  '750106696971',
  '7501064101465',
]
const CAGUAMITA_SKU = '7503024416459'
const CUBETA_BUNDLE_TYPE = 'cubeta'
const CAGUAMITA_BUNDLE_TYPE = 'cubeta_caguamita'
const CUBETA_BUNDLE_LABEL = 'Cubeta Mixta'
const CAGUAMITA_BUNDLE_LABEL = 'Cubeta Caguamita'
const CUBETA_REQUIRED_PIECES = 10
const CUBETA_FIXED_PRICE = 320
const CUBETA_FIXED_UNIT_PRICE = CUBETA_FIXED_PRICE / CUBETA_REQUIRED_PIECES
const CAGUAMITA_REQUIRED_PIECES = 5
const CAGUAMITA_FIXED_PRICE = 130
const CAGUAMITA_FIXED_UNIT_PRICE = CAGUAMITA_FIXED_PRICE / CAGUAMITA_REQUIRED_PIECES
const BUNDLE_TYPES = new Set([CUBETA_BUNDLE_TYPE, CAGUAMITA_BUNDLE_TYPE])
const CLOSED_CASH_SESSION_MESSAGE = 'No hay una sesión de caja abierta.'
let jsPdfModulePromise = null

const loadJsPdf = async () => {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import('jspdf')
  }

  return jsPdfModulePromise
}

const sortTablesForDisplay = (rows = []) =>
  [...rows].sort((left, right) =>
    String(left?.number || '').localeCompare(String(right?.number || ''), 'es', {
      numeric: true,
      sensitivity: 'base',
    })
  )

const isBarStation = (table) => /^barra\b/i.test(String(table?.number || '').trim())

const getStationDisplayName = (table) => {
  const rawValue = String(table?.number || '').trim()
  if (!rawValue) return 'General'
  if (/^(barra|mesa)\b/i.test(rawValue)) return rawValue
  return `Mesa ${rawValue}`
}

const getStationTypeName = (table) => (isBarStation(table) ? 'Barra' : 'Mesa')
const normalizeText = (value) => String(value || '').trim().toLowerCase()
const buildBundleId = (bundleType = CUBETA_BUNDLE_TYPE) =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? `${bundleType}-${crypto.randomUUID()}`
    : `${bundleType}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const getBaseUnitPrice = (item) => {
  const parsedBase = Number(item?.base_unit_price)
  if (Number.isFinite(parsedBase) && parsedBase > 0) return parsedBase
  const parsedPrice = Number(item?.unit_price)
  return Number.isFinite(parsedPrice) ? parsedPrice : 0
}

const getCartMaterialQuantityMap = (cart = []) =>
  cart.reduce((map, item) => {
    const materialId = item?.material_id
    const quantity = Number(item?.quantity || 0)

    if (!materialId || quantity <= 0) return map

    map.set(materialId, (map.get(materialId) || 0) + quantity)
    return map
  }, new Map())

const buildGroupedBundleDetails = (rows = []) =>
  Array.from(
    rows.reduce((map, row) => {
      const key = row.material_id || row.name
      const existing = map.get(key)

      if (existing) {
        existing.quantity += row.quantity
        return map
      }

      map.set(key, {
        name: row.name,
        quantity: row.quantity,
        unitPrice: getBaseUnitPrice(row),
      })

      return map
    }, new Map()).values()
  )

const buildDisplayCartItems = (cart = []) => {
  const bundleGroups = new Map()
  const standaloneItems = []

  cart.forEach((item) => {
    if (item.bundle_id && BUNDLE_TYPES.has(item.bundle_type)) {
      const currentBundle = bundleGroups.get(item.bundle_id) || []
      currentBundle.push(item)
      bundleGroups.set(item.bundle_id, currentBundle)
      return
    }

    standaloneItems.push({
      id: `material:${item.material_id}`,
      kind: 'material',
      material_id: item.material_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.quantity * item.unit_price,
    })
  })

  const bundleItems = Array.from(bundleGroups.entries()).map(([bundleId, rows]) => {
    const bundleTotal = rows.reduce((acc, row) => acc + row.quantity * row.unit_price, 0)
    const details = buildGroupedBundleDetails(rows)
    const totalPieces = details.reduce((acc, detail) => acc + detail.quantity, 0)

    return {
      id: `bundle:${bundleId}`,
      kind: 'bundle',
      bundle_id: bundleId,
      name: rows[0]?.bundle_label || CUBETA_BUNDLE_LABEL,
      quantity: 1,
      unit_price: bundleTotal,
      subtotal: bundleTotal,
      details,
      totalPieces,
    }
  })

  return [...bundleItems, ...standaloneItems]
}

const buildTicketDisplayItems = (cart = [], { includeBundleDetails = true } = {}) =>
  buildDisplayCartItems(cart).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    subtotal: Number(item.subtotal),
    details: includeBundleDetails ? item.details || [] : [],
    totalPieces: item.totalPieces || null,
  }))

const buildCubetaConfig = (availableProducts = [], cart = []) => {
  const currentQuantities = getCartMaterialQuantityMap(cart)
  const products = CUBETA_ALLOWED_SKUS.map((sku) =>
    availableProducts.find((item) => String(item?.materials?.sku || '').trim() === sku) || null
  )

  if (products.some((product) => !product)) {
    return {
      isAvailable: false,
      disabledReason: 'Cubeta no disponible: faltan productos configurados en el catalogo de venta.',
      products: [],
    }
  }

  const normalizedProducts = products.map((product) => {
    const materialId = product.materials?.id
    const currentReserved = currentQuantities.get(materialId) || 0

    return {
      sku: product.materials?.sku,
      materialId,
      name: product.materials?.name,
      price: Number(product.precio_venta || 0),
      categoryName: product.materials?.categories?.name,
      stockActual: Number(product.stock_actual || 0),
      remainingStock: Math.max(Number(product.stock_actual || 0) - currentReserved, 0),
    }
  })

  const priceSet = new Set(normalizedProducts.map((product) => product.price))
  const allAreBeer = normalizedProducts.every((product) => normalizeText(product.categoryName) === 'cerveza')
  const allHaveSalePrice = normalizedProducts.every((product) => product.price > 0)
  const totalRemainingStock = normalizedProducts.reduce((acc, product) => acc + product.remainingStock, 0)

  if (!allAreBeer) {
    return {
      isAvailable: false,
      disabledReason: 'Cubeta solo se habilita con productos de categoria Cerveza.',
      products: normalizedProducts,
    }
  }

  if (!allHaveSalePrice) {
    return {
      isAvailable: false,
      disabledReason: 'Cubeta requiere precio de venta valido en todos los SKU permitidos.',
      products: normalizedProducts,
    }
  }

  if (priceSet.size !== 1) {
    return {
      isAvailable: false,
      disabledReason: 'Cubeta requiere que todos los SKU permitidos compartan el mismo precio de venta.',
      products: normalizedProducts,
    }
  }

  if (totalRemainingStock < CUBETA_REQUIRED_PIECES) {
    return {
      isAvailable: false,
      disabledReason: 'No hay suficientes existencias combinadas para completar una cubeta.',
      products: normalizedProducts,
    }
  }

  const unitPrice = normalizedProducts[0]?.price || 0

  return {
    isAvailable: true,
    disabledReason: null,
    bundleType: CUBETA_BUNDLE_TYPE,
    bundleLabel: CUBETA_BUNDLE_LABEL,
    requiredPieces: CUBETA_REQUIRED_PIECES,
    fixedUnitPrice: CUBETA_FIXED_UNIT_PRICE,
    unitPrice,
    bundlePrice: CUBETA_FIXED_PRICE,
    products: normalizedProducts,
  }
}

const buildCaguamitaConfig = (availableProducts = [], cart = []) => {
  const currentQuantities = getCartMaterialQuantityMap(cart)
  const product = availableProducts.find((item) => String(item?.materials?.sku || '').trim() === CAGUAMITA_SKU)

  if (!product) {
    return {
      isAvailable: false,
      disabledReason: 'Cubeta Caguamita no disponible: falta el SKU configurado en el catalogo de venta.',
      products: [],
    }
  }

  const materialId = product.materials?.id
  const currentReserved = currentQuantities.get(materialId) || 0
  const normalizedProduct = {
    sku: product.materials?.sku,
    materialId,
    name: product.materials?.name,
    price: Number(product.precio_venta || 0),
    categoryName: product.materials?.categories?.name,
    stockActual: Number(product.stock_actual || 0),
    remainingStock: Math.max(Number(product.stock_actual || 0) - currentReserved, 0),
  }

  if (normalizeText(normalizedProduct.categoryName) !== 'cerveza') {
    return {
      isAvailable: false,
      disabledReason: 'Cubeta Caguamita solo se habilita con producto de categoria Cerveza.',
      products: [normalizedProduct],
    }
  }

  if (normalizedProduct.remainingStock < CAGUAMITA_REQUIRED_PIECES) {
    return {
      isAvailable: false,
      disabledReason: 'No hay suficientes existencias para completar una Cubeta Caguamita.',
      products: [normalizedProduct],
    }
  }

  return {
    isAvailable: true,
    disabledReason: null,
    bundleType: CAGUAMITA_BUNDLE_TYPE,
    bundleLabel: CAGUAMITA_BUNDLE_LABEL,
    requiredPieces: CAGUAMITA_REQUIRED_PIECES,
    fixedUnitPrice: CAGUAMITA_FIXED_UNIT_PRICE,
    bundlePrice: CAGUAMITA_FIXED_PRICE,
    products: [normalizedProduct],
  }
}

const getStationShortName = (table) => {
  const rawValue = String(table?.number || '').trim()
  const prefixedMatch = rawValue.match(/^(?:barra|mesa)\s+(.+)$/i)
  if (prefixedMatch) return prefixedMatch[1]
  return rawValue || 'General'
}

const shouldPersistTableOrder = (table, items) =>
  Boolean(table) &&
  !(
    table.status === 'libre' &&
    !table.current_order_id &&
    (items?.length ?? 0) === 0
  )

const createInitialPosState = () => ({
  inventory: [],
  tables: [],
  selectedTable: null,
  cart: [],
  ticketData: null,
  notice: null,
  loading: true,
  isHydratingTable: false,
  waiterEditLocked: false,
  showFinalizeConfirm: false,
  isFinalizingSale: false,
})

const posReducer = (state, action) => {
  switch (action.type) {
    case 'bootstrap_data':
      return {
        ...state,
        inventory: action.inventory,
        tables: action.tables,
        loading: false,
      }
    case 'set_loading':
      return {
        ...state,
        loading: action.value,
      }
    case 'set_inventory':
      return {
        ...state,
        inventory: action.inventory,
      }
    case 'set_tables':
      return {
        ...state,
        tables: action.tables,
      }
    case 'set_notice':
      return {
        ...state,
        notice: action.notice,
      }
    case 'set_ticket_data':
      return {
        ...state,
        ticketData: action.ticketData,
      }
    case 'set_show_finalize_confirm':
      return {
        ...state,
        showFinalizeConfirm: action.value,
      }
    case 'set_finalizing_sale':
      return {
        ...state,
        isFinalizingSale: action.value,
      }
    case 'set_selected_table':
      return {
        ...state,
        selectedTable: action.table,
      }
    case 'set_cart':
      return {
        ...state,
        cart: action.cart,
      }
    case 'set_waiter_edit_locked':
      return {
        ...state,
        waiterEditLocked: action.value,
      }
    case 'hydrate_table_start':
      return {
        ...state,
        isHydratingTable: true,
        selectedTable: action.table,
        waiterEditLocked: false,
      }
    case 'hydrate_table_ready':
      return {
        ...state,
        cart: action.cart,
        waiterEditLocked: action.waiterEditLocked,
        isHydratingTable: false,
      }
    case 'hydrate_table_finish':
      return {
        ...state,
        isHydratingTable: false,
      }
    case 'leave_selected_table':
      return {
        ...state,
        selectedTable: null,
        cart: [],
        waiterEditLocked: false,
      }
    default:
      return state
  }
}

const ServiceMapView = ({
  notice,
  isMobile,
  canOperatePOS,
  meseroLockedTable,
  freeBars,
  occupiedBars,
  freeDiningTables,
  occupiedDiningTables,
  barTables,
  diningTables,
  onNoticeClose,
  onSelectTable,
  ticketData,
  onCloseTicket,
}) => (
  <>
    {notice && <NoticeBanner notice={notice} onClose={onNoticeClose} />}
    <div style={getContainerStyle(isMobile)}>
      <div style={heroCardStyle}>
        <div>
          <h2 style={{ color: '#1f2937', margin: 0, fontSize: isMobile ? '1.5rem' : '1.9rem' }}>Mapa de Servicio</h2>
          <p style={{ ...mutedTextStyle, margin: '8px 0 0 0' }}>
            Elige una barra o una mesa para abrir su cuenta y seguir tomando pedidos.
          </p>
          {!canOperatePOS && (
            <div style={readOnlyHintStyle}>
              Tu usuario puede consultar estaciones, pero no modificar pedidos.
            </div>
          )}
          {meseroLockedTable && (
            <div style={warningHintStyle}>
              Cuenta ocupada: como mesero solo puedes agregar productos o aumentar cantidades.
            </div>
          )}
        </div>

        <div style={getStatsGridStyle(isMobile)}>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Barras libres</span>
            <strong style={statValueStyle}>{freeBars}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Barras ocupadas</span>
            <strong style={statValueStyle}>{occupiedBars}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Mesas libres</span>
            <strong style={statValueStyle}>{freeDiningTables}</strong>
          </div>
          <div style={statCardStyle}>
            <span style={statLabelStyle}>Mesas ocupadas</span>
            <strong style={statValueStyle}>{occupiedDiningTables}</strong>
          </div>
        </div>
      </div>

      <div style={stationSectionsStyle}>
        <StationSection
          title="Barras"
          description="Acceso rapido para consumo en barra."
          stations={barTables}
          isMobile={isMobile}
          emptyMessage="Aun no hay barras configuradas."
          onSelect={onSelectTable}
        />
        <StationSection
          title="Mesas"
          description="Mesas disponibles para servicio en piso."
          stations={diningTables}
          isMobile={isMobile}
          emptyMessage="Aun no hay mesas configuradas."
          onSelect={onSelectTable}
        />
      </div>
    </div>
    {ticketData && <TicketModal ticket={ticketData} onClose={onCloseTicket} />}
  </>
)

const ProductCatalog = ({
  isMobile,
  canOperatePOS,
  availableProducts,
  totalItems,
  onAddToCart,
  cubetaConfig,
  caguamitaConfig,
  onOpenBundleBuilder,
}) => (
  <>
    <div style={{ ...heroCardStyle, ...(isMobile && { display: 'none' }) }}>
      <div>
        <h2 style={{ color: '#1f2937', margin: 0, fontSize: isMobile ? '1.35rem' : '1.65rem' }}>Productos Disponibles</h2>
        <p style={{ ...mutedTextStyle, margin: '8px 0 0 0' }}>
          Toca un producto para agregarlo a la cuenta activa.
        </p>
        {!canOperatePOS && (
          <div style={readOnlyHintStyle}>
            Modo solo lectura. Puedes revisar el contenido de la cuenta, pero no cambiarlo.
          </div>
        )}
      </div>

      <div style={getStatsGridStyle(isMobile)}>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Productos</span>
          <strong style={statValueStyle}>{availableProducts.length}</strong>
        </div>
        <div style={statCardStyle}>
          <span style={statLabelStyle}>Articulos</span>
          <strong style={statValueStyle}>{totalItems}</strong>
        </div>
      </div>
    </div>

    <div style={getProductGridStyle(isMobile)}>
      <button
        type="button"
        onClick={() => onOpenBundleBuilder('cubeta')}
        disabled={!canOperatePOS || !cubetaConfig?.isAvailable}
        style={{
          ...cubetaCardStyle,
          ...getProductCardStyle(isMobile),
          opacity: !cubetaConfig?.isAvailable ? 0.55 : 1,
          cursor: !canOperatePOS || !cubetaConfig?.isAvailable ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <div style={cubetaPillStyle}>Bundle virtual</div>
        <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: isMobile ? '0.95rem' : '1rem' }}>
          {CUBETA_BUNDLE_LABEL}
        </div>
        <div style={{ color: '#0f766e', fontWeight: 'bold', marginTop: '10px', fontSize: isMobile ? '1.1rem' : '1.2rem' }}>
          ${Number(cubetaConfig?.bundlePrice || 0).toFixed(2)}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '10px', lineHeight: 1.45 }}>
          Precio fijo de cubeta mixta con 10 cervezas permitidas.
        </div>
        {!cubetaConfig?.isAvailable && (
          <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '10px', lineHeight: 1.45 }}>
            {cubetaConfig?.disabledReason}
          </div>
        )}
      </button>
      <button
        type="button"
        onClick={() => onOpenBundleBuilder('caguamita')}
        disabled={!canOperatePOS || !caguamitaConfig?.isAvailable}
        style={{
          ...cubetaCardStyle,
          ...getProductCardStyle(isMobile),
          opacity: !caguamitaConfig?.isAvailable ? 0.55 : 1,
          cursor: !canOperatePOS || !caguamitaConfig?.isAvailable ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <div style={cubetaPillStyle}>Bundle virtual</div>
        <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: isMobile ? '0.95rem' : '1rem' }}>
          {CAGUAMITA_BUNDLE_LABEL}
        </div>
        <div style={{ color: '#0f766e', fontWeight: 'bold', marginTop: '10px', fontSize: isMobile ? '1.1rem' : '1.2rem' }}>
          ${Number(caguamitaConfig?.bundlePrice || 0).toFixed(2)}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '10px', lineHeight: 1.45 }}>
          Precio fijo con 5 piezas del SKU {CAGUAMITA_SKU}.
        </div>
        {!caguamitaConfig?.isAvailable && (
          <div style={{ fontSize: '0.78rem', color: '#b91c1c', marginTop: '10px', lineHeight: 1.45 }}>
            {caguamitaConfig?.disabledReason}
          </div>
        )}
      </button>
      {availableProducts.map((item) => {
        const isInventoried = item.materials?.categories?.is_inventoried === true
        const isOutOfStock = isInventoried && item.stock_actual <= 0
        const isProductDisabled = !canOperatePOS || isOutOfStock

        return (
          <button
            key={item.materials?.id || item.id}
            type="button"
            onClick={() => onAddToCart(item)}
            disabled={isProductDisabled}
            style={{
              ...getProductCardStyle(isMobile),
              opacity: isOutOfStock ? 0.52 : 1,
              cursor: isProductDisabled ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <div style={productCategoryPillStyle}>{item.materials.categories.name}</div>
            <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: isMobile ? '0.95rem' : '1rem' }}>
              {item.materials.name}
            </div>
            <div style={{ color: '#0f766e', fontWeight: 'bold', marginTop: '10px', fontSize: isMobile ? '1.1rem' : '1.2rem' }}>
              ${item.precio_venta}
            </div>

            {item.materials.categories.is_inventoried ? (
              <div style={{ fontSize: '0.78rem', color: item.stock_actual <= 0 ? '#b91c1c' : '#475569', marginTop: '10px' }}>
                Stock: {item.stock_actual}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '10px' }}>
                Venta sin inventario fisico
              </div>
            )}
          </button>
        )
      })}
    </div>
  </>
)

const CartPanel = ({
  isTablet,
  isMobile,
  cart,
  displayCart,
  total,
  totalItems,
  canOperatePOS,
  canDecreaseOrRemoveFromOccupiedTable,
  onChangeQuantity,
  onRemoveFromCart,
  onRequestFinalizeSale,
  outerRef,
  checkoutHeight,
}) => (
  <section style={{ ...getCartContainerStyle(isTablet, isMobile), ...(isMobile && checkoutHeight > 0 ? { paddingBottom: checkoutHeight } : {}) }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
      <div>
        <h3 style={{ margin: 0, color: '#1f2937' }}>Cuenta Actual</h3>
        <p style={{ ...mutedTextStyle, margin: '6px 0 0 0' }}>{totalItems} articulos en la cuenta</p>
      </div>
      <div style={cartBadgeStyle}>${total.toFixed(2)}</div>
    </div>

    <div style={cartListStyle}>
      {cart.length === 0 ? (
        <div style={emptyCartStyle}>
          <strong style={{ color: '#334155' }}>Aun no hay productos</strong>
          <span style={{ ...mutedTextStyle, marginTop: '6px' }}>Agrega articulos para comenzar la cuenta.</span>
        </div>
      ) : (
        displayCart.map((item) => (
          <div key={item.id} style={cartItemStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.95rem', color: '#0f172a', fontWeight: '700' }}>{item.name}</div>
                {item.kind === 'bundle' && <span style={cartBundleBadgeStyle}>{item.totalPieces} piezas</span>}
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
                {item.kind === 'bundle' ? `$${item.subtotal.toFixed(2)} por bundle` : `$${item.unit_price} c/u`}
              </div>
              {item.kind === 'bundle' && (
                <div style={bundleDetailListStyle}>
                  {item.details.map((detail) => (
                    <div key={`${item.id}-${detail.name}`} style={bundleDetailRowStyle}>
                      <span>{detail.name}</span>
                      <strong>{detail.quantity}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cartActionsStyle}>
              {item.kind === 'bundle' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <span style={qtyValueStyle}>1</span>
                  <button onClick={() => onRemoveFromCart(item.id)} disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable} style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable ? deleteBtnStyle : disabledDeleteBtnStyle} type="button">
                    Quitar bundle
                  </button>
                </div>
              ) : (
                <>
                  <div style={quantityControlStyle}>
                    <button onClick={() => onChangeQuantity(item.id, -1)} disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable} style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable ? qtyBtnStyle : disabledQtyBtnStyle} type="button">
                      -
                    </button>
                    <span style={qtyValueStyle}>{item.quantity}</span>
                    <button onClick={() => onChangeQuantity(item.id, 1)} disabled={!canOperatePOS} style={canOperatePOS ? qtyBtnStyle : disabledQtyBtnStyle} type="button">
                      +
                    </button>
                  </div>

                  <button onClick={() => onRemoveFromCart(item.id)} disabled={!canOperatePOS || !canDecreaseOrRemoveFromOccupiedTable} style={canOperatePOS && canDecreaseOrRemoveFromOccupiedTable ? deleteBtnStyle : disabledDeleteBtnStyle} type="button">
                    Quitar
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>

    <div ref={outerRef} style={getCheckoutPanelStyle(isMobile)}>
      <div style={checkoutRowStyle}>
        <span>Total</span>
        <strong>${total.toFixed(2)}</strong>
      </div>
      <button onClick={onRequestFinalizeSale} disabled={cart.length === 0 || !canOperatePOS} style={cart.length === 0 || !canOperatePOS ? disabledCheckoutBtnStyle : checkoutBtnStyle}>
        Finalizar Venta
      </button>
    </div>
  </section>
)

const ActiveOrderView = ({
  notice,
  isTablet,
  isMobile,
  canOperatePOS,
  selectedTable,
  selectedStationLabel,
  availableProducts,
  cubetaConfig,
  caguamitaConfig,
  totalItems,
  total,
  cart,
  displayCart,
  canDecreaseOrRemoveFromOccupiedTable,
  showFinalizeConfirm,
  showCubetaBuilder,
  ticketData,
  onNoticeClose,
  onSaveAndExit,
  onAddToCart,
  onOpenBundleBuilder,
  onChangeQuantity,
  onRemoveFromCart,
  onRequestFinalizeSale,
  onCloseTicket,
  onCloseFinalizeConfirm,
  onConfirmFinalizeSale,
  onCloseCubetaBuilder,
  onConfirmCubetaBuilder,
}) => {
  const cartRef = useRef(null)
  const [cartPanelHeight, setCartPanelHeight] = useState(0)

  useEffect(() => {
    if (!isMobile || !cartRef.current) return undefined

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      setCartPanelHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)
    })
    observer.observe(cartRef.current)
    return () => observer.disconnect()
  }, [isMobile])

  return (
    <>
      {notice && <NoticeBanner notice={notice} onClose={onNoticeClose} />}
      <div style={getWorkspaceStyle(isTablet, isMobile)}>
        <section>
          <div style={topBarStyle(isMobile)}>
            <button onClick={onSaveAndExit} disabled={!canOperatePOS} style={canOperatePOS ? btnSecondaryStyle : disabledSecondaryBtnStyle}>
              Volver a Barras y Mesas
            </button>
            <div style={tableInfoCardStyle}>
              <span style={tableInfoLabelStyle}>Atendiendo</span>
              <strong style={{ color: '#1f2937', fontSize: isMobile ? '1rem' : '1.15rem' }}>
                {selectedStationLabel}
              </strong>
            </div>
          </div>

          <ProductCatalog
            isMobile={isMobile}
            canOperatePOS={canOperatePOS}
            availableProducts={availableProducts}
            cubetaConfig={cubetaConfig}
            caguamitaConfig={caguamitaConfig}
            totalItems={totalItems}
            onAddToCart={onAddToCart}
            onOpenBundleBuilder={onOpenBundleBuilder}
          />
        </section>

        <CartPanel
          isTablet={isTablet}
          isMobile={isMobile}
          cart={cart}
          displayCart={displayCart}
          total={total}
          totalItems={totalItems}
          canOperatePOS={canOperatePOS}
          canDecreaseOrRemoveFromOccupiedTable={canDecreaseOrRemoveFromOccupiedTable}
          onChangeQuantity={onChangeQuantity}
          onRemoveFromCart={onRemoveFromCart}
          onRequestFinalizeSale={onRequestFinalizeSale}
          outerRef={cartRef}
          checkoutHeight={cartPanelHeight}
        />
      </div>
      {ticketData && <TicketModal ticket={ticketData} onClose={onCloseTicket} />}
      {showFinalizeConfirm && (
        <FinalizeSaleModal
          table={selectedTable}
          total={total}
          totalItems={totalItems}
          onCancel={onCloseFinalizeConfirm}
          onConfirm={onConfirmFinalizeSale}
        />
      )}
      {showCubetaBuilder && (
        <CubetaBuilderModal
          cubetaConfig={showCubetaBuilder === 'caguamita' ? caguamitaConfig : cubetaConfig}
          onCancel={onCloseCubetaBuilder}
          onConfirm={onConfirmCubetaBuilder}
        />
      )}
    </>
  )
}

const usePosController = ({ onEditingStateChange = () => {} }) => {
  const [state, dispatch] = useReducer(posReducer, undefined, createInitialPosState)
  const [showCubetaBuilder, setShowCubetaBuilder] = useState(false)
  const { isMobile, isTablet } = useResponsive()
  const { can, isManager, isSuperadmin, isWaiter } = useAuth()
  const canCreateSale = can(PAGE_PERMISSION_MAP.pos, ACTION_KEYS.CREATE)
  const canEditSale = can(PAGE_PERMISSION_MAP.pos, ACTION_KEYS.EDIT)
  const canOperatePOS = canCreateSale || canEditSale
  const canFullyEditOccupiedTable = isSuperadmin || isManager
  const latestTableRef = useRef(null)
  const latestCartRef = useRef([])
  const finalizeSaleInFlightRef = useRef(false)
  const finalizeSaleIdempotencyKeyRef = useRef(null)
  const tableOrderSaveQueueRef = useRef(Promise.resolve(null))
  const {
    inventory,
    tables,
    selectedTable,
    cart,
    ticketData,
    notice,
    loading,
    isHydratingTable,
    waiterEditLocked,
    showFinalizeConfirm,
    isFinalizingSale,
  } = state

  const persistTableOrder = useCallback(async (table, items, options = {}) => {
    const { table: persistedTable, order } = await posService.saveTableOrder({
      table_id: table.id,
      expected_order_id: table.current_order_id ?? null,
      items,
      lock_waiter_editing: Boolean(options.lockWaiterEditing),
    })

    latestTableRef.current = persistedTable
    dispatch({ type: 'set_waiter_edit_locked', value: Boolean(order?.waiter_edit_locked) })
    return persistedTable
  }, [])

  const queueTableOrderSave = useCallback((options = {}) => {
    if (finalizeSaleInFlightRef.current) {
      return Promise.resolve(latestTableRef.current)
    }

    const saveOperation = tableOrderSaveQueueRef.current
      .catch(() => null)
      .then(() => {
        const table = latestTableRef.current
        const items = latestCartRef.current

        if (!shouldPersistTableOrder(table, items)) return table
        return persistTableOrder(table, items, options)
      })

    tableOrderSaveQueueRef.current = saveOperation.catch(() => null)
    return saveOperation
  }, [persistTableOrder])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [inventoryData, tablesResult] = await Promise.all([
          materialService.getAllMaterials(),
          supabase.from('tables').select('*').order('number'),
        ])

        if (tablesResult.error) throw tablesResult.error

        dispatch({
          type: 'bootstrap_data',
          inventory: inventoryData || [],
          tables: sortTablesForDisplay(tablesResult.data || []),
        })
      } catch (error) {
        console.error('Error al iniciar POS:', error)
        dispatch({ type: 'set_loading', value: false })
      }
    }

    loadData()
  }, [isWaiter])

  useEffect(() => {
    if (!notice) return undefined

    const timer = window.setTimeout(() => {
      dispatch({ type: 'set_notice', notice: null })
    }, 3200)

    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    const handleTicketNotice = (event) => {
      if (event.detail) {
        showNotice(event.detail, 'info')
      }
    }

    window.addEventListener('pos-ticket-notice', handleTicketNotice)
    return () => window.removeEventListener('pos-ticket-notice', handleTicketNotice)
  }, [isWaiter])

  useEffect(() => {
    latestTableRef.current = selectedTable
    latestCartRef.current = cart
  }, [cart, selectedTable])

  const isOccupiedTable = selectedTable?.status === 'ocupada' || Boolean(selectedTable?.current_order_id)
  const meseroLockedTable =
    isWaiter && isOccupiedTable && !canFullyEditOccupiedTable && waiterEditLocked
  const canDecreaseOrRemoveFromOccupiedTable = !meseroLockedTable

  useEffect(() => {
    onEditingStateChange(Boolean(selectedTable))

    return () => {
      onEditingStateChange(false)
    }
  }, [onEditingStateChange, selectedTable])

  useEffect(() => {
    if (isHydratingTable || !shouldPersistTableOrder(selectedTable, cart)) return undefined

    const persistCurrentTable = async () => {
      try {
        const persistedTable = await queueTableOrderSave()
        if (
          persistedTable &&
          (
            persistedTable.current_order_id !== selectedTable.current_order_id ||
            persistedTable.status !== selectedTable.status
          )
        ) {
          dispatch({ type: 'set_selected_table', table: persistedTable })
        }
        await loadTables()
      } catch (error) {
        console.error('Error al guardar automaticamente la mesa:', error)

        let message = error?.message || 'No se pudo guardar la mesa.'
        if (message === 'Error inesperado.') {
          try {
            const cashSessionOverview = await cashControlService.getSessionOverview()
            if (cashSessionOverview?.session?.status !== 'open') {
              message = CLOSED_CASH_SESSION_MESSAGE
            }
          } catch (cashSessionError) {
            console.error('Error al verificar el estado de caja:', cashSessionError)
          }
        }

        dispatch({
          type: 'set_notice',
          notice: {
            message,
            type: 'warning',
          },
        })
      }
    }

    persistCurrentTable()
    return undefined
  }, [cart, isHydratingTable, queueTableOrderSave, selectedTable])

  useEffect(() => {
    const handlePageHide = () => {
      const table = latestTableRef.current
      const items = latestCartRef.current

      if (!shouldPersistTableOrder(table, items)) return

      queueTableOrderSave({
        lockWaiterEditing: isWaiter && items.length > 0,
      }).catch((error) => {
        console.error('Error al guardar la mesa al salir de la pantalla:', error)
      })
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [isWaiter, queueTableOrderSave])

  const showNotice = (message, type = 'info') => {
    dispatch({ type: 'set_notice', notice: { message, type } })
  }

  const loadInventory = async () => {
    try {
      const data = await materialService.getAllMaterials()
      dispatch({ type: 'set_inventory', inventory: data || [] })
    } catch (error) {
      console.error('Error al cargar inventario para POS:', error)
    }
  }

  const loadTables = async () => {
    try {
      const { data, error } = await supabase
        .from('tables')
        .select('*')
        .order('number')

      if (error) throw error
      dispatch({ type: 'set_tables', tables: sortTablesForDisplay(data || []) })
    } catch (error) {
      console.error('Error al cargar mesas:', error)
    }
  }

  const handleSelectTable = async (table) => {
    if (finalizeSaleInFlightRef.current) return

    try {
      dispatch({ type: 'hydrate_table_start', table })

      if (!table.current_order_id) {
        dispatch({
          type: 'hydrate_table_ready',
          cart: [],
          waiterEditLocked: false,
        })
        return
      }

      const { data: order, error } = await supabase
        .from('table_orders')
        .select('*')
        .eq('id', table.current_order_id)
        .maybeSingle()

      if (error) throw error
      dispatch({
        type: 'hydrate_table_ready',
        cart: order?.items || [],
        waiterEditLocked: Boolean(order?.waiter_edit_locked),
      })
    } catch (error) {
      console.error('Error al cargar la mesa:', error)
      alert('No se pudo abrir la mesa.')
    } finally {
      dispatch({ type: 'hydrate_table_finish' })
    }
  }

  const handleSaveAndExit = async () => {
    if (!canOperatePOS || finalizeSaleInFlightRef.current || !selectedTable) return

    if (!shouldPersistTableOrder(selectedTable, cart)) {
      dispatch({ type: 'leave_selected_table' })
      return
    }

    try {
      const persistedTable = await queueTableOrderSave({
        lockWaiterEditing: isWaiter && cart.length > 0,
      })
      if (persistedTable) {
        dispatch({ type: 'set_selected_table', table: persistedTable })
      }
      dispatch({ type: 'leave_selected_table' })
      await loadTables()
    } catch (error) {
      console.error('Error al guardar la mesa:', error)
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      alert(`Error al guardar la mesa: ${errorMessage}`)
    }
  }

  const addToCart = (item) => {
    if (!canOperatePOS || finalizeSaleInFlightRef.current) return
    const isInventoried = item.materials?.categories?.is_inventoried === true

    if (item.precio_venta <= 0) {
      showNotice('Este producto no tiene precio de venta asignado.', 'warning')
      return
    }

    if (isInventoried && item.stock_actual <= 0) {
      showNotice('No hay existencias de este producto.', 'warning')
      return
    }

    const existing = cart.find((c) => c.material_id === item.materials.id && !c.bundle_id)

    if (isInventoried && existing && existing.quantity >= item.stock_actual) {
      showNotice(`Solo hay ${item.stock_actual} unidades disponibles.`, 'warning')
      return
    }

    if (existing) {
      dispatch({
        type: 'set_cart',
        cart: cart.map((c) =>
          c.material_id === item.materials.id ? { ...c, quantity: c.quantity + 1 } : c
        ),
      })
    } else {
      dispatch({
        type: 'set_cart',
        cart: [
          ...cart,
          {
            material_id: item.materials.id,
            name: item.materials.name,
            unit_price: item.precio_venta,
            quantity: 1,
            is_inventoried: isInventoried,
          },
        ],
      })
    }
  }

  const changeQuantity = (id, delta) => {
    if (!canOperatePOS || finalizeSaleInFlightRef.current) return
    if (delta < 0 && !canDecreaseOrRemoveFromOccupiedTable) {
      showNotice('Los meseros no pueden disminuir cantidades en una mesa ya ocupada. Solo un manager puede hacerlo.', 'warning')
      return
    }

    const materialId = String(id || '').replace('material:', '')

    dispatch({
      type: 'set_cart',
      cart: cart
        .map((item) => {
          if (item.bundle_id || item.material_id !== materialId) return item
          return { ...item, quantity: item.quantity + delta }
        })
        .filter((item) => item.quantity > 0),
    })
  }

  const removeFromCart = (id) => {
    if (!canOperatePOS || finalizeSaleInFlightRef.current) return
    if (!canDecreaseOrRemoveFromOccupiedTable) {
      showNotice('Los meseros no pueden remover productos de una mesa ya ocupada. Solo un manager puede hacerlo.', 'warning')
      return
    }

    if (String(id || '').startsWith('bundle:')) {
      const bundleId = String(id).replace('bundle:', '')
      dispatch({ type: 'set_cart', cart: cart.filter((item) => item.bundle_id !== bundleId) })
      return
    }

    const materialId = String(id || '').replace('material:', '')
    dispatch({ type: 'set_cart', cart: cart.filter((item) => item.bundle_id || item.material_id !== materialId) })
  }

  const total = cart.reduce((acc, curr) => acc + curr.unit_price * curr.quantity, 0)
  const totalItems = cart.reduce((acc, curr) => acc + curr.quantity, 0)
  const availableProducts = inventory.filter((item) => item.materials?.categories?.is_for_sale === true)
  const cubetaConfig = buildCubetaConfig(availableProducts, cart)
  const caguamitaConfig = buildCaguamitaConfig(availableProducts, cart)
  const activeBundleConfig = showCubetaBuilder === 'caguamita' ? caguamitaConfig : cubetaConfig
  const displayCart = buildDisplayCartItems(cart)
  const barTables = tables.filter((table) => isBarStation(table))
  const diningTables = tables.filter((table) => !isBarStation(table))
  const freeBars = barTables.filter((table) => table.status === 'libre').length
  const occupiedBars = barTables.filter((table) => table.status === 'ocupada').length
  const freeDiningTables = diningTables.filter((table) => table.status === 'libre').length
  const occupiedDiningTables = diningTables.filter((table) => table.status === 'ocupada').length
  const selectedStationLabel = getStationDisplayName(selectedTable)

  const buildTicketData = (sale, items, table, documentNumber) => {
    const chargedAt = sale?.created_at || new Date().toISOString()
    const authoritativeTotal = Number(sale?.total_amount)

    return {
      saleId: sale?.id,
      documentNumber,
      chargedAt,
      tableNumber: getStationDisplayName(table),
      items: buildTicketDisplayItems(items, { includeBundleDetails: false }),
      total: Number.isFinite(authoritativeTotal)
        ? authoritativeTotal
        : items.reduce((acc, item) => acc + parseFloat(item.unit_price) * parseFloat(item.quantity), 0),
    }
  }

  const handleOpenCubetaBuilder = (bundleKind = 'cubeta') => {
    if (!canOperatePOS || finalizeSaleInFlightRef.current) return
    const targetConfig = bundleKind === 'caguamita' ? caguamitaConfig : cubetaConfig
    if (!targetConfig.isAvailable) {
      showNotice(targetConfig.disabledReason || 'Bundle no disponible en este momento.', 'warning')
      return
    }

    setShowCubetaBuilder(bundleKind)
  }

  const handleConfirmCubetaBuilder = (selections) => {
    if (!canOperatePOS || finalizeSaleInFlightRef.current) return

    if (!activeBundleConfig.isAvailable) {
      showNotice(activeBundleConfig.disabledReason || 'Bundle no disponible en este momento.', 'warning')
      return
    }

    const totalSelected = Object.values(selections || {}).reduce((acc, value) => acc + Number(value || 0), 0)
    if (totalSelected !== activeBundleConfig.requiredPieces) {
      showNotice(`${activeBundleConfig.bundleLabel} requiere exactamente ${activeBundleConfig.requiredPieces} piezas.`, 'warning')
      return
    }

    const hasSelection = activeBundleConfig.products.some((product) => Number(selections?.[product.sku] || 0) > 0)
    if (!hasSelection) {
      showNotice('Selecciona al menos un producto para armar el bundle.', 'warning')
      return
    }

    const bundleId = buildBundleId(activeBundleConfig.bundleType)
    const bundleRows = activeBundleConfig.products.flatMap((product) => {
      const quantity = Number(selections?.[product.sku] || 0)
      if (quantity <= 0) return []

      return [
        {
          material_id: product.materialId,
          name: product.name,
          base_unit_price: product.price,
          unit_price: activeBundleConfig.fixedUnitPrice,
          quantity,
          is_extra: false,
          bundle_id: bundleId,
          bundle_type: activeBundleConfig.bundleType,
          bundle_label: activeBundleConfig.bundleLabel,
        },
      ]
    })

    dispatch({
      type: 'set_cart',
      cart: [...cart, ...bundleRows],
    })
    setShowCubetaBuilder(false)
    showNotice(`${activeBundleConfig.bundleLabel} agregada a la cuenta.`, 'success')
  }

  const handleRequestFinalizeSale = () => {
    if (!canOperatePOS) return
    if (!selectedTable || cart.length === 0) return
    if (finalizeSaleInFlightRef.current) return
    if (normalizeText(selectedTable.status) !== 'ocupada' || !selectedTable.current_order_id) {
      showNotice('Espera a que el pedido termine de guardarse antes de finalizar.', 'info')
      return
    }
    dispatch({ type: 'set_show_finalize_confirm', value: true })
  }

  const handleFinalizeSale = async () => {
    if (!canOperatePOS) return
    if (!selectedTable || cart.length === 0) return
    if (finalizeSaleInFlightRef.current) return
    if (normalizeText(selectedTable.status) !== 'ocupada' || !selectedTable.current_order_id) {
      dispatch({ type: 'set_show_finalize_confirm', value: false })
      showNotice('El pedido ya no esta activo o todavia no termina de guardarse.', 'warning')
      return
    }

    finalizeSaleInFlightRef.current = true
    dispatch({ type: 'set_finalizing_sale', value: true })

    try {
      dispatch({ type: 'set_show_finalize_confirm', value: false })
      await tableOrderSaveQueueRef.current

      const finalizingTable = latestTableRef.current
      const finalizingCart = latestCartRef.current

      if (
        !finalizingTable ||
        normalizeText(finalizingTable.status) !== 'ocupada' ||
        !finalizingTable.current_order_id ||
        finalizingCart.length === 0
      ) {
        showNotice('El pedido ya no esta activo o todavia no termina de guardarse.', 'warning')
        return
      }

      const currentOrderId = finalizingTable.current_order_id
      if (
        !finalizeSaleIdempotencyKeyRef.current ||
        finalizeSaleIdempotencyKeyRef.current.orderId !== currentOrderId
      ) {
        finalizeSaleIdempotencyKeyRef.current = { orderId: currentOrderId, key: crypto.randomUUID() }
      }
      const idempotencyKey = finalizeSaleIdempotencyKeyRef.current.key

      const cashSessionOverview = await cashControlService.getSessionOverview()
      if (cashSessionOverview?.session?.status !== 'open') {
        showNotice('No hay una caja abierta. Debes abrir caja antes de registrar ventas en efectivo.', 'warning')
        return
      }

      const centerId = inventory[0]?.centers?.id
      if (!centerId) {
        showNotice('No se encontro un centro de inventario para procesar la venta.', 'warning')
        return
      }

      const latestInventory = await materialService.getAllMaterials()
      const inventoryByMaterialId = new Map(
        (latestInventory || [])
          .filter((item) => item.centers?.id === centerId)
          .map((item) => [item.materials?.id, item])
      )

      const normalizedCart = finalizingCart.map((item) => {
        const inventoryItem = inventoryByMaterialId.get(item.material_id)
        const isInventoried = inventoryItem?.materials?.categories?.is_inventoried === true

        return {
          ...item,
          is_inventoried: isInventoried,
        }
      })

      const requestedQuantityByMaterial = normalizedCart.reduce((map, item) => {
        if (!item.is_inventoried) return map

        map.set(item.material_id, (map.get(item.material_id) || 0) + Number(item.quantity || 0))
        return map
      }, new Map())

      for (const [materialId, requestedQuantity] of requestedQuantityByMaterial.entries()) {
        const inventoryItem = inventoryByMaterialId.get(materialId)
        const availableStock = Number(inventoryItem?.stock_actual ?? 0)
        if (requestedQuantity > availableStock) {
          showNotice(`No hay stock suficiente para ${inventoryItem?.materials?.name || 'este producto'}. Disponible: ${availableStock}, solicitado: ${requestedQuantity}.`, 'warning')
          await loadInventory()
          return
        }
      }


      const saleAmount = parseFloat(
        normalizedCart.reduce((acc, item) => acc + Number(item.unit_price || 0) * Number(item.quantity || 0), 0).toFixed(2)
      )
      const { sale } = await posService.finalizeSale({
        table_id: finalizingTable.id,
        expected_order_id: finalizingTable.current_order_id,
        items: normalizedCart,
        payments: [{ method: 'Efectivo', amount: saleAmount }],
        idempotency_key: idempotencyKey,
      })
      const documentNumber = sale?.document_number || null
      const canonicalTicketItems = Array.isArray(sale?.items) && sale.items.length > 0
        ? sale.items.map((item) => ({
            ...item,
            quantity: Number(item.quantity || 0),
            unit_price: Number(item.unit_price || 0),
            base_unit_price: Number(item.base_unit_price || item.unit_price || 0),
          }))
        : normalizedCart
      dispatch({
        type: 'set_ticket_data',
        ticketData: buildTicketData(sale, canonicalTicketItems, finalizingTable, documentNumber),
      })
      showNotice('Venta realizada con exito', 'success')
      finalizeSaleIdempotencyKeyRef.current = null
      latestTableRef.current = null
      latestCartRef.current = []
      dispatch({ type: 'leave_selected_table' })
      await Promise.all([loadInventory(), loadTables()])
    } catch (error) {
      console.error('Error en la venta:', error)
      alert(`Hubo un error al procesar la venta: ${error.message || 'Error desconocido'}`)
    } finally {
      finalizeSaleInFlightRef.current = false
      dispatch({ type: 'set_finalizing_sale', value: false })
    }
  }

  return {
    dispatch,
    isMobile,
    isTablet,
    canOperatePOS: canOperatePOS && !isFinalizingSale,
    selectedTable,
    selectedStationLabel,
    loading,
    notice,
    ticketData,
    meseroLockedTable,
    freeBars,
    occupiedBars,
    freeDiningTables,
    occupiedDiningTables,
    barTables,
    diningTables,
    availableProducts,
    totalItems,
    total,
    cart,
    cubetaConfig,
    caguamitaConfig,
    displayCart,
    canDecreaseOrRemoveFromOccupiedTable,
    showFinalizeConfirm,
    showCubetaBuilder,
    handleSelectTable,
    handleSaveAndExit,
    addToCart,
    handleOpenCubetaBuilder,
    changeQuantity,
    removeFromCart,
    handleRequestFinalizeSale,
    handleFinalizeSale,
    handleConfirmCubetaBuilder,
    setShowCubetaBuilder,
  }
}

const POS = ({ onEditingStateChange = () => {} }) => {
  const {
    dispatch,
    isMobile,
    isTablet,
    canOperatePOS,
    selectedTable,
    selectedStationLabel,
    loading,
    notice,
    ticketData,
    meseroLockedTable,
    freeBars,
    occupiedBars,
    freeDiningTables,
    occupiedDiningTables,
    barTables,
    diningTables,
    availableProducts,
    cubetaConfig,
    caguamitaConfig,
    totalItems,
    total,
    cart,
    displayCart,
    canDecreaseOrRemoveFromOccupiedTable,
    showFinalizeConfirm,
    showCubetaBuilder,
    handleSelectTable,
    handleSaveAndExit,
    addToCart,
    handleOpenCubetaBuilder,
    changeQuantity,
    removeFromCart,
    handleRequestFinalizeSale,
    handleFinalizeSale,
    handleConfirmCubetaBuilder,
    setShowCubetaBuilder,
  } = usePosController({ onEditingStateChange })

  if (loading) return <div style={{ padding: '20px' }}>Iniciando terminal de venta...</div>

  if (!selectedTable) {
    return (
      <ServiceMapView
        notice={notice}
        isMobile={isMobile}
        canOperatePOS={canOperatePOS}
        meseroLockedTable={meseroLockedTable}
        freeBars={freeBars}
        occupiedBars={occupiedBars}
        freeDiningTables={freeDiningTables}
        occupiedDiningTables={occupiedDiningTables}
        barTables={barTables}
        diningTables={diningTables}
        onNoticeClose={() => dispatch({ type: 'set_notice', notice: null })}
        onSelectTable={handleSelectTable}
        ticketData={ticketData}
        onCloseTicket={() => dispatch({ type: 'set_ticket_data', ticketData: null })}
      />
    )
  }

  return (
    <ActiveOrderView
      notice={notice}
      isTablet={isTablet}
      isMobile={isMobile}
      canOperatePOS={canOperatePOS}
      selectedTable={selectedTable}
      selectedStationLabel={selectedStationLabel}
      availableProducts={availableProducts}
      cubetaConfig={cubetaConfig}
      caguamitaConfig={caguamitaConfig}
      totalItems={totalItems}
      total={total}
      cart={cart}
      displayCart={displayCart}
      canDecreaseOrRemoveFromOccupiedTable={canDecreaseOrRemoveFromOccupiedTable}
      showFinalizeConfirm={showFinalizeConfirm}
      showCubetaBuilder={showCubetaBuilder}
      ticketData={ticketData}
      onNoticeClose={() => dispatch({ type: 'set_notice', notice: null })}
      onSaveAndExit={handleSaveAndExit}
      onAddToCart={addToCart}
      onOpenBundleBuilder={handleOpenCubetaBuilder}
      onChangeQuantity={changeQuantity}
      onRemoveFromCart={removeFromCart}
      onRequestFinalizeSale={handleRequestFinalizeSale}
      onCloseTicket={() => dispatch({ type: 'set_ticket_data', ticketData: null })}
      onCloseFinalizeConfirm={() => dispatch({ type: 'set_show_finalize_confirm', value: false })}
      onConfirmFinalizeSale={handleFinalizeSale}
      onCloseCubetaBuilder={() => setShowCubetaBuilder(false)}
      onConfirmCubetaBuilder={handleConfirmCubetaBuilder}
    />
  )
}

const NoticeBanner = ({ notice, onClose }) => (
  <div style={noticeWrapStyle}>
    <div
      style={{
        ...noticeCardStyle,
        borderLeft: `5px solid ${getNoticeAccent(notice.type)}`,
      }}
    >
      <div>
        <strong style={{ color: '#111827', display: 'block', marginBottom: '4px' }}>
          {getNoticeTitle(notice.type)}
        </strong>
        <span style={{ color: '#475569' }}>{notice.message}</span>
      </div>
      <button type="button" onClick={onClose} style={noticeCloseStyle}>
        Cerrar
      </button>
    </div>
  </div>
)

const StationSection = ({ title, description, stations, isMobile, emptyMessage, onSelect }) => (
  <section style={stationSectionStyle}>
    <div style={stationSectionHeaderStyle}>
      <div>
        <h3 style={stationSectionTitleStyle}>{title}</h3>
        <p style={stationSectionDescriptionStyle}>{description}</p>
      </div>
      <div style={stationSectionCountStyle}>
        {stations.length} {stations.length === 1 ? 'estacion' : 'estaciones'}
      </div>
    </div>

    {stations.length === 0 ? (
      <div style={emptyStationStateStyle}>{emptyMessage}</div>
    ) : (
      <div style={getTableGridStyle(isMobile)}>
        {stations.map((table) => {
          const isFree = table.status === 'libre'
          const typeLabel = getStationTypeName(table)
          const shortName = getStationShortName(table)

          return (
            <button
              key={table.id}
              type="button"
              onClick={() => onSelect(table)}
              style={{
                ...getTableButtonStyle(isMobile),
                background: isFree
                  ? 'linear-gradient(135deg, #2f855a 0%, #276749 100%)'
                  : 'linear-gradient(135deg, #c53030 0%, #9b2c2c 100%)',
              }}
            >
              <span style={{ fontSize: isMobile ? '1rem' : '0.9rem', opacity: 0.88 }}>{typeLabel}</span>
              <strong style={{ fontSize: isMobile ? '1.35rem' : '1.55rem' }}>{shortName}</strong>
              <span style={tableStatusBadgeStyle}>{(table.status || 'libre').toUpperCase()}</span>
            </button>
          )
        })}
      </div>
    )}
  </section>
)

const FinalizeSaleModal = ({ table, total, totalItems, onCancel, onConfirm }) => (
  <div style={confirmOverlayStyle}>
    <div style={confirmCardStyle}>
      <div style={confirmBadgeStyle}>Confirmar venta</div>
      <h3 style={confirmTitleStyle}>Estas por finalizar la cuenta</h3>
      <p style={confirmTextStyle}>
        Se cerrara la venta de <strong>{getStationDisplayName(table)}</strong> y la estacion quedara libre para un nuevo pedido.
      </p>
      <div style={confirmSummaryStyle}>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Articulos</span>
          <strong style={confirmMetricValueStyle}>{totalItems}</strong>
        </div>
        <div style={confirmMetricStyle}>
          <span style={confirmMetricLabelStyle}>Total</span>
          <strong style={confirmMetricValueStyle}>{total.toFixed(2)}</strong>
        </div>
      </div>
      <div style={confirmActionsStyle}>
        <button type="button" onClick={onCancel} style={confirmCancelBtnStyle}>
          Cancelar
        </button>
        <button type="button" onClick={onConfirm} style={confirmApproveBtnStyle}>
          Si, finalizar venta
        </button>
      </div>
    </div>
  </div>
)
const getTicketLabels = (ticket) => {
  const chargedAt = new Date(ticket.chargedAt)

  return {
    dateLabel: chargedAt.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    timeLabel: chargedAt.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
    }),
    ticketReference: ticket.documentNumber,
  }
}

const getTicketFileName = (ticket) => `ticket-la-carreta-${ticket.documentNumber || Date.now()}.pdf`

const loadTicketLogoDataUrl = async () => {
  const response = await fetch(logoCarreta)
  const blob = await response.blob()

  return await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

const buildTicketPdf = async ({ ticket, dateLabel, timeLabel, ticketReference }) => {
  const { jsPDF } = await loadJsPdf()
  const pageWidth = TICKET_WIDTH_MM
  const margin = 6
  const lineHeight = 4.3
  const itemBlockHeight = 9
  const baseHeight = 52
  const footerHeight = 16
  const pageHeight = Math.max(110, baseHeight + ticket.items.length * itemBlockHeight + footerHeight)
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [pageWidth, pageHeight],
  })

  const watermarkUrl = await loadTicketLogoDataUrl()
  const centerX = pageWidth / 2
  const contentWidth = pageWidth - margin * 2
  const headerRight = pageWidth - margin
  let y = 8

  pdf.setFillColor(255, 255, 255)
  pdf.rect(0, 0, pageWidth, pageHeight, 'F')

  pdf.setGState(new pdf.GState({ opacity: 0.08 }))
  pdf.addImage(watermarkUrl, 'PNG', 9, pageHeight / 2 - 22, 62, 44, undefined, 'FAST')
  pdf.setGState(new pdf.GState({ opacity: 1 }))

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('LA CARRETA', centerX, y, { align: 'center' })
  y += 6

  pdf.setFontSize(10)
  pdf.text('Ticket virtual', centerX, y, { align: 'center' })
  y += 7

  pdf.setDrawColor(203, 213, 225)
  pdf.line(margin, y, headerRight, y)
  y += 5

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  if (ticketReference) {
    pdf.text(`Folio de venta: ${ticketReference}`, margin, y)
    y += lineHeight
  }
  pdf.text(`Fecha: ${dateLabel}`, margin, y)
  y += lineHeight
  pdf.text(`Hora: ${timeLabel}`, margin, y)
  y += lineHeight
  pdf.text(`Cuenta: ${ticket.tableNumber || 'General'}`, margin, y)
  y += lineHeight

  y += 2
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Producto', margin, y)
  pdf.text('Importe', headerRight, y, { align: 'right' })
  y += 2
  pdf.line(margin, y, headerRight, y)
  y += 5

  ticket.items.forEach((item) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.4)
    const itemNameLines = pdf.splitTextToSize(item.name, contentWidth - 16)
    pdf.text(itemNameLines, margin, y)
    pdf.text(`$${item.subtotal.toFixed(2)}`, headerRight, y, { align: 'right' })
    y += itemNameLines.length * 3.7
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.8)
    const detailPieces = item.totalPieces || item.details?.reduce((acc, detail) => acc + detail.quantity, 0) || 0
    pdf.text(
      item.details?.length > 0
        ? `${detailPieces} piezas · $${item.unitPrice.toFixed(2)}`
        : `${item.quantity} x $${item.unitPrice.toFixed(2)}`,
      margin,
      y
    )
    y += 5

    if (item.details?.length > 0) {
      pdf.setFontSize(7.2)
      item.details.forEach((detail) => {
        pdf.text(`- ${detail.name} x${detail.quantity}`, margin + 2, y)
        y += 3.5
      })
      y += 1.5
    }
  })

  pdf.line(margin, y, headerRight, y)
  y += 6

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  pdf.text('Total', margin, y)
  pdf.text(`$${ticket.total.toFixed(2)}`, headerRight, y, { align: 'right' })

  return pdf
}

const buildTicketPrintHtml = ({ ticket, dateLabel, timeLabel, ticketReference }) => {
  const watermarkUrl = new URL('../assets/la_carreta_sin_fondo.png', import.meta.url).href
  const itemsMarkup = ticket.items
    .map(
      (item) => `
        <div class="ticket-row">
          <div>
            <div class="item-name">${item.name}</div>
            <div class="item-meta">${
              item.details?.length > 0
                ? `${item.totalPieces || item.details.reduce((acc, detail) => acc + detail.quantity, 0)} piezas · $${item.unitPrice.toFixed(2)}`
                : `${item.quantity} x $${item.unitPrice.toFixed(2)}`
            }</div>
            ${
              item.details?.length > 0
                ? `<div class="bundle-details">${item.details
                    .map((detail) => `<div class="bundle-detail">- ${detail.name} x${detail.quantity}</div>`)
                    .join('')}</div>`
                : ''
            }
          </div>
          <strong>$${item.subtotal.toFixed(2)}</strong>
        </div>
      `
    )
    .join('')

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <title>Ticket Virtual</title>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: #f3f4f6;
            color: #111827;
          }
          @page {
            size: ${TICKET_WIDTH_MM}mm auto;
            margin: 0;
          }
          .sheet {
            position: relative;
            width: ${TICKET_WIDTH_MM}mm;
            max-width: ${TICKET_WIDTH_MM}mm;
            margin: 24px auto;
            padding: 8mm 6mm;
            background: #ffffff;
            border-radius: 18px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
            box-sizing: border-box;
          }
          .watermark {
            position: absolute;
            inset: 50% auto auto 50%;
            transform: translate(-50%, -50%);
            width: 64mm;
            opacity: 0.08;
            pointer-events: none;
          }
          .header,
          .total-row,
          .ticket-row,
          .items-header {
            position: relative;
            z-index: 1;
          }
          .header h1 {
            margin: 0 0 14px 0;
            font-size: 24px;
          }
          .meta {
            position: relative;
            z-index: 1;
            display: grid;
            gap: 6px;
            margin-bottom: 18px;
            font-size: 14px;
            color: #374151;
          }
          .items-header {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 12px;
            font-weight: 700;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.04em;
          }
          .ticket-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 0;
            border-bottom: 1px solid #f1f5f9;
          }
          .item-name {
            font-weight: 700;
          }
          .item-meta {
            margin-top: 4px;
            color: #6b7280;
            font-size: 13px;
          }
          .bundle-details {
            margin-top: 8px;
            display: grid;
            gap: 4px;
          }
          .bundle-detail {
            color: #475569;
            font-size: 12px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 18px;
            padding-top: 14px;
            border-top: 2px solid #e5e7eb;
            font-size: 18px;
            font-weight: 800;
          }
          @media print {
            body {
              background: #ffffff;
            }
            .sheet {
              margin: 0;
              width: ${TICKET_WIDTH_MM}mm;
              max-width: ${TICKET_WIDTH_MM}mm;
              border-radius: 0;
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="sheet">
          <img src="${watermarkUrl}" alt="" class="watermark" />
          <div class="header">
            <h1>Ticket Virtual</h1>
          </div>
          <div class="meta">
            ${ticketReference ? `<div><strong>Folio de venta:</strong> ${ticketReference}</div>` : ''}
            <div><strong>Fecha:</strong> ${dateLabel}</div>
            <div><strong>Hora:</strong> ${timeLabel}</div>
            <div><strong>Cuenta:</strong> ${ticket.tableNumber || 'General'}</div>
          </div>
          <div class="items-header">
            <span>Producto</span>
            <span>Importe</span>
          </div>
          ${itemsMarkup}
          <div class="total-row">
            <span>Total</span>
            <strong>$${ticket.total.toFixed(2)}</strong>
          </div>
        </div>
      </body>
    </html>
  `
}

const useTicketModalController = ({ ticket }) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const { dateLabel, timeLabel, ticketReference } = getTicketLabels(ticket)

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true)
      const pdf = await buildTicketPdf({ ticket, dateLabel, timeLabel, ticketReference })
      pdf.save(getTicketFileName(ticket))
    } catch (error) {
      console.error('Error al generar PDF:', error)
      alert('No se pudo generar el PDF del ticket.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handleShareTicket = async () => {
    try {
      setIsExportingPdf(true)
      const pdf = await buildTicketPdf({ ticket, dateLabel, timeLabel, ticketReference })
      const blob = pdf.output('blob')
      const file = new File([blob], getTicketFileName(ticket), {
        type: 'application/pdf',
      })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Ticket La Carreta',
          text: `Ticket de consumo${ticket.tableNumber ? ` - ${ticket.tableNumber}` : ''}`,
          files: [file],
        })
      } else {
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = file.name
        link.click()
        URL.revokeObjectURL(url)
        showTicketNotice('Tu navegador no permite compartir archivos directamente. Se descargo el PDF para que lo compartas manualmente.')
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('Error al compartir ticket:', error)
        alert('No se pudo compartir el ticket en este dispositivo.')
      }
    } finally {
      setIsExportingPdf(false)
    }
  }

  const handlePrintTicket = () => {
    const printWindow = window.open('', '_blank', 'width=760,height=900')

    if (!printWindow) {
      alert('No se pudo abrir la ventana de impresion. Revisa si el navegador bloqueo la ventana emergente.')
      return
    }

    printWindow.document.write(buildTicketPrintHtml({ ticket, dateLabel, timeLabel, ticketReference }))
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
  }

  return {
    isExportingPdf,
    dateLabel,
    timeLabel,
    ticketReference,
    handleDownloadPdf,
    handleShareTicket,
    handlePrintTicket,
  }
}

const TicketModalHeader = ({
  isExportingPdf,
  onDownloadPdf,
  onShareTicket,
  onPrintTicket,
  onClose,
}) => (
  <div style={ticketHeaderStyle}>
    <h3 style={{ margin: 0, color: '#111827' }}>Ticket Virtual</h3>
    <div style={ticketHeaderActionsStyle}>
      <button type="button" onClick={onDownloadPdf} style={ticketPdfBtnStyle} disabled={isExportingPdf}>
        {isExportingPdf ? 'Generando...' : 'Descargar PDF'}
      </button>
      <button type="button" onClick={onShareTicket} style={ticketShareBtnStyle} disabled={isExportingPdf}>
        Compartir
      </button>
      <button type="button" onClick={onPrintTicket} style={ticketPrintBtnStyle} disabled={isExportingPdf}>
        Imprimir
      </button>
      <button type="button" onClick={onClose} style={ticketCloseBtnStyle}>
        Cerrar
      </button>
    </div>
  </div>
)

const CubetaBuilderModal = ({ cubetaConfig, onCancel, onConfirm }) => {
  const [selections, setSelections] = useState(() =>
    Object.fromEntries((cubetaConfig?.products || []).map((product) => [product.sku, 0]))
  )

  const totalSelected = Object.values(selections).reduce((acc, value) => acc + value, 0)

  const updateSelection = (sku, delta) => {
    setSelections((current) => {
      const targetProduct = cubetaConfig.products.find((product) => product.sku === sku)
      if (!targetProduct) return current

      const currentTotal = Object.values(current).reduce((acc, value) => acc + Number(value || 0), 0)
      const nextValue = Math.max(0, Math.min((current[sku] || 0) + delta, targetProduct.remainingStock))
      const otherSelections = currentTotal - (current[sku] || 0)

      if (delta > 0 && otherSelections + nextValue > cubetaConfig.requiredPieces) {
        return current
      }

      return {
        ...current,
        [sku]: nextValue,
      }
    })
  }

  return (
    <div style={confirmOverlayStyle}>
      <div
        style={{
          ...confirmCardStyle,
          width: 'min(680px, calc(100vw - 32px))',
          maxWidth: '680px',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
        }}
      >
        <div style={confirmBadgeStyle}>Armar {cubetaConfig.bundleLabel}</div>
        <h3 style={confirmTitleStyle}>Selecciona {cubetaConfig.requiredPieces} piezas</h3>
        <p style={confirmTextStyle}>
          {cubetaConfig.bundleLabel} se cobra a precio fijo de ${Number(cubetaConfig.bundlePrice || 0).toFixed(2)}.
        </p>
        <div style={cubetaSummaryStyle}>
          <div style={confirmMetricStyle}>
            <span style={confirmMetricLabelStyle}>Seleccionadas</span>
            <strong style={confirmMetricValueStyle}>{totalSelected}/{cubetaConfig.requiredPieces}</strong>
          </div>
          <div style={confirmMetricStyle}>
            <span style={confirmMetricLabelStyle}>Precio fijo</span>
            <strong style={confirmMetricValueStyle}>${Number(cubetaConfig.bundlePrice || 0).toFixed(2)}</strong>
          </div>
        </div>
        <div style={cubetaListStyle}>
          {cubetaConfig.products.map((product) => (
            <div key={product.sku} style={cubetaProductRowStyle}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: '#111827', display: 'block' }}>{product.name}</strong>
                <div style={cubetaProductMetaStyle}>
                  SKU {product.sku} · Stock disponible {product.remainingStock} · ${product.price.toFixed(2)}
                </div>
              </div>
              <div style={quantityControlStyle}>
                <button type="button" onClick={() => updateSelection(product.sku, -1)} style={qtyBtnStyle}>
                  -
                </button>
                <span style={qtyValueStyle}>{selections[product.sku] || 0}</span>
                <button
                  type="button"
                  onClick={() => updateSelection(product.sku, 1)}
                  disabled={(selections[product.sku] || 0) >= product.remainingStock || totalSelected >= cubetaConfig.requiredPieces}
                  style={(selections[product.sku] || 0) >= product.remainingStock || totalSelected >= cubetaConfig.requiredPieces ? disabledQtyBtnStyle : qtyBtnStyle}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
        <div style={confirmActionsStyle}>
          <button type="button" onClick={onCancel} style={confirmCancelBtnStyle}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selections)}
            disabled={totalSelected !== cubetaConfig.requiredPieces}
            style={totalSelected === cubetaConfig.requiredPieces ? confirmApproveBtnStyle : disabledCheckoutBtnStyle}
          >
            Agregar {cubetaConfig.bundleLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

const TicketMeta = ({ ticketReference, dateLabel, timeLabel, tableNumber }) => (
  <div style={ticketMetaStyle}>
    {ticketReference && <div><strong>Folio de venta:</strong> {ticketReference}</div>}
    <div><strong>Fecha:</strong> {dateLabel}</div>
    <div><strong>Hora:</strong> {timeLabel}</div>
    <div><strong>Cuenta:</strong> {tableNumber || 'General'}</div>
  </div>
)

const TicketItems = ({ items }) => (
  <div style={ticketItemsWrapStyle}>
    <div style={ticketItemsHeaderStyle}>
      <span>Producto</span>
      <span>Importe</span>
    </div>

    {items.map((item) => (
      <div key={`${item.name}-${item.unitPrice}`} style={ticketItemRowStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={ticketItemNameStyle}>{item.name}</div>
          <div style={ticketItemMetaStyle}>
            {item.details?.length > 0
              ? `${item.totalPieces || item.details.reduce((acc, detail) => acc + detail.quantity, 0)} piezas · $${item.unitPrice.toFixed(2)}`
              : `${item.quantity} x $${item.unitPrice.toFixed(2)}`}
          </div>
          {item.details?.length > 0 && (
            <div style={ticketBundleDetailsStyle}>
              {item.details.map((detail) => (
                <div key={`${item.name}-${detail.name}`} style={ticketBundleDetailStyle}>
                  <span>{detail.name}</span>
                  <strong>x{detail.quantity}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
        <strong style={{ color: '#111827' }}>${item.subtotal.toFixed(2)}</strong>
      </div>
    ))}
  </div>
)

const TicketSummary = ({ total }) => (
  <div style={ticketTotalStyle}>
    <span>Total</span>
    <strong>${total.toFixed(2)}</strong>
  </div>
)

const TicketModal = ({ ticket, onClose }) => {
  const {
    isExportingPdf,
    dateLabel,
    timeLabel,
    ticketReference,
    handleDownloadPdf,
    handleShareTicket,
    handlePrintTicket,
  } = useTicketModalController({ ticket })

  return (
    <div style={ticketOverlayStyle}>
      <div style={ticketCardStyle}>
        <img src={logoCarreta} alt="" style={ticketWatermarkStyle} />

        <TicketModalHeader
          isExportingPdf={isExportingPdf}
          onDownloadPdf={handleDownloadPdf}
          onShareTicket={handleShareTicket}
          onPrintTicket={handlePrintTicket}
          onClose={onClose}
        />

        <TicketMeta
          ticketReference={ticketReference}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
          tableNumber={ticket.tableNumber}
        />
        <TicketItems items={ticket.items} />
        <TicketSummary total={ticket.total} />
      </div>
    </div>
  )
}

const showTicketNotice = (message) => {
  window.dispatchEvent(new CustomEvent('pos-ticket-notice', { detail: message }))
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? space[6] : space[8],
  backgroundColor: colors.gray100,
  minHeight: '100vh',
})

const getWorkspaceStyle = (isTablet, isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) 380px',
  gap: isMobile ? space[6] : space[8],
  padding: isMobile ? space[6] : space[8],
  backgroundColor: colors.gray100,
  minHeight: '100vh',
  fontFamily: 'sans-serif',
})

const heroCardStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: space[7],
  boxShadow: shadow.sm,
  marginBottom: space[7],
  display: 'flex',
  justifyContent: 'space-between',
  gap: space[8],
  flexWrap: 'wrap',
}

const mutedTextStyle = {
  color: colors.gray500,
  fontSize: type.sm,
  lineHeight: 1.4,
}

const getStatsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(2, 120px)',
  gap: space[5],
  width: isMobile ? '100%' : 'auto',
})

const statCardStyle = {
  backgroundColor: colors.gray100,
  borderRadius: radius.lg,
  padding: `${space[4]} ${space[6]}`,
  border: `1px solid ${colors.gray200}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const statLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const statValueStyle = {
  color: colors.gray900,
  fontSize: type.xl,
}

const stationSectionsStyle = {
  display: 'grid',
  gap: space[6],
}

const stationSectionStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: space[7],
  boxShadow: shadow.sm,
  border: `1px solid ${colors.gray200}`,
}

const stationSectionHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: space[6],
  flexWrap: 'wrap',
  marginBottom: space[7],
}

const stationSectionTitleStyle = {
  margin: 0,
  color: colors.gray800,
  fontSize: type.lg,
}

const stationSectionDescriptionStyle = {
  color: colors.gray500,
  fontSize: type.sm,
  lineHeight: 1.4,
  margin: `${space[3]} 0 0 0`,
}

const stationSectionCountStyle = {
  backgroundColor: colors.blue50,
  color: colors.blue700,
  borderRadius: radius.full,
  padding: `${space[1]} ${space[5]}`,
  fontWeight: type.bold,
  fontSize: type.xs,
}

const emptyStationStateStyle = {
  backgroundColor: colors.gray100,
  border: `1px dashed ${colors.gray300}`,
  borderRadius: radius.lg,
  padding: space[7],
  color: colors.gray500,
  fontWeight: type.medium,
}

const getTableGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(160px, 1fr))',
  gap: isMobile ? space[4] : space[5],
})

const getTableButtonStyle = (isMobile) => ({
  minHeight: isMobile ? '110px' : '120px',
  padding: isMobile ? `${space[6]} ${space[5]}` : `${space[8]} ${space[7]}`,
  borderRadius: radius.xl,
  border: 'none',
  color: 'white',
  cursor: 'pointer',
  boxShadow: '0 14px 25px rgba(15, 23, 42, 0.14)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  textAlign: 'left',
})

const tableStatusBadgeStyle = {
  backgroundColor: 'rgba(255,255,255,0.18)',
  borderRadius: radius.full,
  padding: `${space[1]} ${space[5]}`,
  fontSize: type.xs,
  fontWeight: type.bold,
  letterSpacing: '0.04em',
}

const topBarStyle = (isMobile) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: isMobile ? 'stretch' : 'center',
  flexDirection: isMobile ? 'column' : 'row',
  gap: space[6],
  marginBottom: space[7],
})

const tableInfoCardStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  padding: `${space[4]} ${space[6]}`,
  border: `1px solid ${colors.gray200}`,
  display: 'flex',
  flexDirection: 'column',
  minWidth: '140px',
}

const tableInfoLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: space[2],
}

const getProductGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(170px, 1fr))',
  gap: isMobile ? space[4] : space[5],
})

const getProductCardStyle = (isMobile) => ({
  padding: isMobile ? `${space[5]} ${space[4]}` : space[6],
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
  border: `1px solid ${colors.gray200}`,
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'left',
  minHeight: isMobile ? '128px' : '140px',
})

const productCategoryPillStyle = {
  alignSelf: 'flex-start',
  backgroundColor: colors.blue50,
  color: colors.blue700,
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  fontSize: type.xs,
  fontWeight: type.bold,
  marginBottom: space[5],
}

const cubetaPillStyle = {
  alignSelf: 'flex-start',
  backgroundColor: '#ecfccb',
  color: '#3f6212',
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  fontSize: type.xs,
  fontWeight: type.bold,
  marginBottom: space[5],
}

const cubetaCardStyle = {
  background: 'linear-gradient(145deg, #ffffff 0%, #f7fee7 100%)',
}

const getCartContainerStyle = (isTablet, isMobile) => ({
  backgroundColor: colors.white,
  padding: isMobile ? space[6] : space[8],
  borderRadius: radius.xl,
  boxShadow: shadow.sm,
  display: 'flex',
  flexDirection: 'column',
  gap: space[6],
  ...(isMobile ? {
    // normal flow — checkout bar fixed separately
  } : isTablet ? {
    height: 'auto',
    maxHeight: 'none',
    position: 'static',
  } : {
    height: 'calc(100vh - 40px)',
    maxHeight: 'calc(100vh - 40px)',
    position: 'sticky',
    top: '20px',
  }),
})

const cartBadgeStyle = {
  backgroundColor: colors.green50,
  color: colors.green700,
  borderRadius: radius.full,
  padding: `${space[1]} ${space[5]}`,
  fontWeight: type.black,
  fontSize: type.md,
}

const cartListStyle = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: space[5],
}

const emptyCartStyle = {
  backgroundColor: colors.gray100,
  border: `1px dashed ${colors.gray300}`,
  borderRadius: radius.lg,
  padding: space[7],
  display: 'flex',
  flexDirection: 'column',
}

const cartItemStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: space[5],
  padding: space[5],
  borderRadius: radius.lg,
  backgroundColor: colors.gray100,
  border: `1px solid ${colors.gray200}`,
}

const cartActionsStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: space[5],
  flexWrap: 'wrap',
}

const quantityControlStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[4],
  backgroundColor: colors.white,
  borderRadius: radius.full,
  padding: space[2],
  border: `1px solid ${colors.gray300}`,
}

const qtyBtnStyle = {
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  border: 'none',
  backgroundColor: colors.gray200,
  color: colors.gray900,
  fontWeight: type.black,
  cursor: 'pointer',
}
const disabledQtyBtnStyle = {
  ...qtyBtnStyle,
  color: colors.gray400,
  cursor: 'not-allowed',
}

const qtyValueStyle = {
  minWidth: '18px',
  textAlign: 'center',
  fontWeight: type.bold,
  color: colors.gray900,
}

const cartBundleBadgeStyle = {
  alignSelf: 'flex-start',
  backgroundColor: '#ecfccb',
  color: '#3f6212',
  borderRadius: radius.full,
  padding: `${space[2]} ${space[5]}`,
  fontSize: type.xs,
  fontWeight: type.bold,
}

const bundleDetailListStyle = {
  marginTop: space[5],
  display: 'grid',
  gap: space[3],
}

const bundleDetailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: space[5],
  color: colors.gray600,
  fontSize: type.sm,
}

const deleteBtnStyle = {
  background: 'none',
  border: 'none',
  color: colors.red600,
  cursor: 'pointer',
  fontSize: type.sm,
  fontWeight: type.bold,
  padding: `${space[3]} 0`,
}
const disabledDeleteBtnStyle = {
  ...deleteBtnStyle,
  color: colors.gray400,
  cursor: 'not-allowed',
}

const getCheckoutPanelStyle = (isMobile) => ({
  borderTop: `1px solid ${colors.gray200}`,
  ...(isMobile ? {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    padding: `${space[6]} ${space[6]} calc(${space[6]} + env(safe-area-inset-bottom, 0px))`,
    zIndex: 200,
  } : {
    paddingTop: space[7],
  }),
})

const checkoutRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: type.lg,
  fontWeight: type.black,
  color: colors.gray900,
}

const btnSecondaryStyle = {
  padding: `${space[4]} ${space[9]}`,
  backgroundColor: colors.gray800,
  color: 'white',
  border: 'none',
  borderRadius: radius.md,
  cursor: 'pointer',
  fontWeight: type.bold,
  fontSize: type.md,
}
const disabledSecondaryBtnStyle = {
  ...btnSecondaryStyle,
  backgroundColor: colors.gray400,
  cursor: 'not-allowed',
}

const checkoutBtnStyle = {
  width: '100%',
  marginTop: space[7],
  padding: space[4],
  backgroundColor: colors.green500,
  color: 'white',
  border: 'none',
  borderRadius: radius.md,
  fontWeight: type.black,
  fontSize: type.base,
  cursor: 'pointer',
}
const disabledCheckoutBtnStyle = {
  ...checkoutBtnStyle,
  backgroundColor: colors.gray400,
  cursor: 'not-allowed',
}
const readOnlyHintStyle = {
  marginTop: space[6],
  display: 'inline-flex',
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  backgroundColor: colors.gray200,
  color: colors.gray600,
  fontWeight: type.bold,
  fontSize: type.xs,
}
const warningHintStyle = {
  marginTop: space[6],
  display: 'inline-flex',
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  backgroundColor: colors.amber50,
  color: colors.amber700,
  fontWeight: type.bold,
  fontSize: type.xs,
}

const confirmOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space[9],
  zIndex: 1050,
}

const confirmCardStyle = {
  width: '100%',
  maxWidth: '460px',
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  boxShadow: '0 28px 70px rgba(15, 23, 42, 0.28)',
  padding: space[10],
  border: `1px solid ${colors.red100}`,
}

const confirmBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${space[1]} ${space[5]}`,
  borderRadius: radius.full,
  backgroundColor: colors.amber50,
  color: '#c2410c',
  fontWeight: type.black,
  fontSize: type.xs,
  marginBottom: space[7],
}

const confirmTitleStyle = {
  margin: 0,
  color: colors.gray900,
  fontSize: type['2xl'],
}

const confirmTextStyle = {
  margin: `${space[6]} 0 0 0`,
  color: colors.gray600,
  lineHeight: 1.65,
}

const confirmSummaryStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: space[6],
  marginTop: space[9],
}

const confirmMetricStyle = {
  backgroundColor: colors.gray100,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.lg,
  padding: `${space[5]} ${space[6]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const confirmMetricLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const confirmMetricValueStyle = {
  color: colors.gray900,
  fontSize: type.lg,
}

const confirmActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[5],
  flexWrap: 'wrap',
  marginTop: space[9],
}

const confirmCancelBtnStyle = {
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray700,
  borderRadius: radius.md,
  padding: `${space[4]} ${space[8]}`,
  fontWeight: type.bold,
  cursor: 'pointer',
}

const confirmApproveBtnStyle = {
  border: 'none',
  backgroundColor: colors.red600,
  color: colors.white,
  borderRadius: radius.md,
  padding: `${space[4]} ${space[8]}`,
  fontWeight: type.black,
  cursor: 'pointer',
}

const cubetaSummaryStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: space[6],
  marginTop: space[9],
  marginBottom: space[9],
}

const cubetaListStyle = {
  display: 'grid',
  gap: space[6],
}

const cubetaProductRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: space[7],
  padding: `${space[5]} ${space[7]}`,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.lg,
  backgroundColor: colors.gray100,
}

const cubetaProductMetaStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  marginTop: space[2],
}
const ticketOverlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(15, 23, 42, 0.52)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space[9],
  zIndex: 1000,
}

const ticketCardStyle = {
  position: 'relative',
  width: '100%',
  maxWidth: '520px',
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  boxShadow: '0 30px 70px rgba(15, 23, 42, 0.28)',
  padding: space[10],
  overflow: 'hidden',
}

const ticketWatermarkStyle = {
  position: 'absolute',
  inset: '50% auto auto 50%',
  transform: 'translate(-50%, -50%)',
  width: '78%',
  opacity: 0.08,
  pointerEvents: 'none',
}

const ticketHeaderStyle = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: space[6],
  marginBottom: space[7],
}

const ticketHeaderActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[4],
  flexWrap: 'wrap',
}

const ticketPrintBtnStyle = {
  border: 'none',
  borderRadius: radius.full,
  backgroundColor: colors.green500,
  color: colors.white,
  fontWeight: type.bold,
  cursor: 'pointer',
  padding: `${space[1]} ${space[7]}`,
}

const ticketPdfBtnStyle = {
  border: 'none',
  borderRadius: radius.full,
  backgroundColor: colors.blue700,
  color: colors.white,
  fontWeight: type.bold,
  cursor: 'pointer',
  padding: `${space[1]} ${space[7]}`,
}

const ticketShareBtnStyle = {
  border: 'none',
  borderRadius: radius.full,
  backgroundColor: colors.violet700,
  color: colors.white,
  fontWeight: type.bold,
  cursor: 'pointer',
  padding: `${space[1]} ${space[7]}`,
}

const ticketCloseBtnStyle = {
  border: 'none',
  borderRadius: radius.full,
  backgroundColor: colors.gray200,
  color: colors.gray900,
  fontWeight: type.bold,
  cursor: 'pointer',
  padding: `${space[1]} ${space[6]}`,
}

const ticketMetaStyle = {
  position: 'relative',
  display: 'grid',
  gap: space[3],
  color: colors.gray700,
  marginBottom: space[7],
  fontSize: type.md,
}

const ticketItemsWrapStyle = {
  position: 'relative',
  display: 'grid',
  gap: space[5],
}

const ticketItemsHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: space[6],
  color: colors.gray500,
  fontWeight: type.bold,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  paddingBottom: space[4],
  borderBottom: `1px solid ${colors.gray200}`,
}

const ticketItemRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: space[6],
}

const ticketItemNameStyle = {
  color: colors.gray900,
  fontWeight: type.bold,
}

const ticketItemMetaStyle = {
  color: colors.gray500,
  fontSize: type.sm,
  marginTop: space[2],
}

const ticketBundleDetailsStyle = {
  marginTop: space[4],
  display: 'grid',
  gap: space[2],
}

const ticketBundleDetailStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: space[6],
  color: colors.gray600,
  fontSize: type.sm,
}

const ticketTotalStyle = {
  position: 'relative',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: space[9],
  paddingTop: space[8],
  borderTop: `2px solid ${colors.gray200}`,
  fontSize: type.lg,
  color: colors.gray900,
}

const noticeWrapStyle = {
  position: 'fixed',
  top: space[9],
  right: space[9],
  zIndex: 1100,
  width: 'min(420px, calc(100vw - 32px))',
}

const noticeCardStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  boxShadow: shadow.lg,
  padding: `${space[7]} ${space[8]}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: space[6],
}

const noticeCloseStyle = {
  border: 'none',
  background: 'transparent',
  color: colors.blue600,
  fontWeight: type.bold,
  cursor: 'pointer',
  padding: 0,
}

const getNoticeAccent = (type) => {
  if (type === 'success') return '#16a34a'
  if (type === 'warning') return '#d97706'
  return '#2563eb'
}

const getNoticeTitle = (type) => {
  if (type === 'success') return 'Operacion exitosa'
  if (type === 'warning') return 'Aviso'
  return 'Informacion'
}

export default POS




