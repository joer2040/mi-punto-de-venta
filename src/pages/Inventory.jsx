import React, { useEffect, useReducer } from 'react'
import MaterialForm from '../components/MaterialForm'
import { materialService } from '../api/materialService'
import { providerService } from '../api/providerService'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

const EDITION_PIN = '2024'

const normalizeMaterials = (rows = []) =>
  rows.map((row, index) => {
    const material = row.materials || {}
    const category = material.categories || {}
    const center = row.centers || {}

    return {
      rowKey: `${material.id || 'material'}-${center.id || index}`,
      materialId: material.id,
      centerId: center.id,
      sku: material.sku || '',
      name: material.name || '',
      providerId: material.provider_id || '',
      providerName: material.providers?.name || 'Sin proveedor',
      categoryName: category.name || 'Sin categoria',
      isInternalProduction: category.is_internal_production === true,
      categoryId: material.cat_id || category.id || null,
      price: Number(row.precio_venta ?? row.price ?? 0),
      stock: Number(row.stock_actual ?? row.stock ?? 0),
    }
  })

const createInitialInventoryState = () => ({
  items: [],
  providers: [],
  loading: true,
  manualEditUnlocked: false,
  savingKey: '',
})

const inventoryReducer = (state, action) => {
  switch (action.type) {
    case 'load-start':
      return {
        ...state,
        loading: true,
      }
    case 'load-success':
      return {
        ...state,
        loading: false,
        items: action.items,
        providers: action.providers,
      }
    case 'load-finish':
      return {
        ...state,
        loading: false,
      }
    case 'patch-item':
      return {
        ...state,
        items: state.items.map((item) =>
          item.rowKey === action.rowKey
            ? {
                ...item,
                [action.field]: action.value,
              }
            : item
        ),
      }
    case 'set-manual-edit-unlocked':
      return {
        ...state,
        manualEditUnlocked: action.value,
      }
    case 'set-saving-key':
      return {
        ...state,
        savingKey: action.value,
      }
    default:
      return state
  }
}

const InventoryHeader = ({ manualEditUnlocked, onLock, onUnlock }) => (
  <div style={tableHeaderRowStyle}>
    <h2 style={tableTitleStyle}>Maestro de Materiales</h2>

    {manualEditUnlocked ? (
      <button type="button" onClick={onLock} style={lockButtonStyle}>
        Bloquear Edicion
      </button>
    ) : (
      <button type="button" onClick={onUnlock} style={unlockButtonStyle}>
        Desbloquear Edicion Manual
      </button>
    )}
  </div>
)

const InventoryMobileList = ({
  items,
  manualEditUnlocked,
  onFieldChange,
  onSaveField,
  providers,
  savingKey,
}) => (
  <div style={mobileCardsGridStyle}>
    {items.map((item) => {
      const skuSaveKey = `${item.rowKey}:sku`
      const nameSaveKey = `${item.rowKey}:name`
      const priceSaveKey = `${item.rowKey}:price`
      const isInternalProduction = item.isInternalProduction

      return (
        <article key={item.rowKey} style={mobileCardStyle}>
          <div style={mobileCardTopStyle}>
            <div>
              <div style={mobileMetaLabelStyle}>SKU</div>
              {manualEditUnlocked ? (
                <input
                  value={item.sku}
                  onChange={(event) => onFieldChange(item.rowKey, 'sku', event.target.value)}
                  onBlur={() => onSaveField(item, 'sku')}
                  style={tableInputStyle}
                  disabled={savingKey === skuSaveKey}
                />
              ) : (
                <div style={mobileSkuTextStyle}>{item.sku || 'Sin SKU'}</div>
              )}
            </div>

            <span style={categoryPillStyle}>{item.categoryName}</span>
          </div>

          <div style={mobileFieldBlockStyle}>
            <div style={mobileMetaLabelStyle}>Producto</div>
            {manualEditUnlocked ? (
              <input
                value={item.name}
                onChange={(event) => onFieldChange(item.rowKey, 'name', event.target.value)}
                onBlur={() => onSaveField(item, 'name')}
                style={tableInputStyle}
                disabled={savingKey === nameSaveKey}
              />
            ) : (
              <div style={mobileNameTextStyle}>{item.name}</div>
            )}
          </div>

          <div style={mobileFieldBlockStyle}>
            <div style={mobileMetaLabelStyle}>Proveedor</div>
            {manualEditUnlocked && !isInternalProduction ? (
              <select
                value={item.providerId}
                onChange={(event) => onFieldChange(item.rowKey, 'providerId', event.target.value)}
                onBlur={() => onSaveField(item, 'providerId')}
                style={tableInputStyle}
              >
                <option value="">Selecciona proveedor...</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={mobileSkuTextStyle}>
                {isInternalProduction ? 'Produccion interna' : item.providerName}
              </div>
            )}
          </div>

          <div style={mobileMetricsGridStyle}>
            <div style={mobileMetricCardStyle}>
              <div style={mobileMetaLabelStyle}>Precio venta</div>
              {manualEditUnlocked ? (
                <div style={currencyInputWrapStyle}>
                  <span style={currencyMarkStyle}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={item.price}
                    onChange={(event) => onFieldChange(item.rowKey, 'price', event.target.value)}
                    onBlur={() => onSaveField(item, 'price')}
                    style={tableInputStyle}
                    disabled={savingKey === priceSaveKey}
                  />
                </div>
              ) : (
                <span style={priceTextStyle}>${Number(item.price || 0).toFixed(0)}</span>
              )}
            </div>

            <div style={mobileMetricCardStyle}>
              <div style={mobileMetaLabelStyle}>Stock actual</div>
              <div style={mobileStockTextStyle}>{Number(item.stock || 0)}</div>
              {manualEditUnlocked && (
                <div style={stockHintStyle}>El stock solo se ajusta desde Movimiento de Materiales.</div>
              )}
            </div>
          </div>
        </article>
      )
    })}
  </div>
)

const InventoryDesktopTable = ({
  items,
  manualEditUnlocked,
  onFieldChange,
  onSaveField,
  providers,
  savingKey,
}) => (
  <div style={tableWrapStyle}>
    <table style={tableStyle}>
      <thead>
        <tr style={tableHeadRowStyle}>
          <th style={headerCellStyle}>SKU</th>
          <th style={headerCellStyle}>PRODUCTO</th>
          <th style={headerCellStyle}>PROVEEDOR</th>
          <th style={headerCellStyle}>CATEGORIA</th>
          <th style={headerCellStyle}>PRECIO VENTA</th>
          <th style={headerCellStyle}>STOCK ACTUAL</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const skuSaveKey = `${item.rowKey}:sku`
          const nameSaveKey = `${item.rowKey}:name`
          const priceSaveKey = `${item.rowKey}:price`
          const isInternalProduction = item.isInternalProduction

          return (
            <tr key={item.rowKey} style={bodyRowStyle}>
              <td style={bodyCellStyle}>
                {manualEditUnlocked ? (
                  <input
                    value={item.sku}
                    onChange={(event) => onFieldChange(item.rowKey, 'sku', event.target.value)}
                    onBlur={() => onSaveField(item, 'sku')}
                    style={tableInputStyle}
                    disabled={savingKey === skuSaveKey}
                  />
                ) : (
                  item.sku
                )}
              </td>
              <td style={{ ...bodyCellStyle, fontWeight: 800 }}>
                {manualEditUnlocked ? (
                  <input
                    value={item.name}
                    onChange={(event) => onFieldChange(item.rowKey, 'name', event.target.value)}
                    onBlur={() => onSaveField(item, 'name')}
                    style={tableInputStyle}
                    disabled={savingKey === nameSaveKey}
                  />
                ) : (
                  item.name
                )}
              </td>
              <td style={bodyCellStyle}>
                {manualEditUnlocked && !isInternalProduction ? (
                  <select
                    value={item.providerId}
                    onChange={(event) => onFieldChange(item.rowKey, 'providerId', event.target.value)}
                    onBlur={() => onSaveField(item, 'providerId')}
                    style={tableInputStyle}
                  >
                    <option value="">Selecciona proveedor...</option>
                    {providers.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  isInternalProduction ? 'Produccion interna' : item.providerName
                )}
              </td>
              <td style={bodyCellStyle}>
                <span style={categoryPillStyle}>{item.categoryName}</span>
              </td>
              <td style={bodyCellStyle}>
                {manualEditUnlocked ? (
                  <div style={currencyInputWrapStyle}>
                    <span style={currencyMarkStyle}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(event) => onFieldChange(item.rowKey, 'price', event.target.value)}
                      onBlur={() => onSaveField(item, 'price')}
                      style={tableInputStyle}
                      disabled={savingKey === priceSaveKey}
                    />
                  </div>
                ) : (
                  <span style={priceTextStyle}>${Number(item.price || 0).toFixed(0)}</span>
                )}
              </td>
              <td style={bodyCellStyle}>
                <div>{Number(item.stock || 0)}</div>
                {manualEditUnlocked && <div style={stockHintStyle}>Ajusta desde Movimiento de Materiales.</div>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

const Inventory = () => {
  const { isMobile } = useResponsive()
  const [state, dispatch] = useReducer(inventoryReducer, undefined, createInitialInventoryState)
  const { items, providers, loading, manualEditUnlocked, savingKey } = state

  const loadMaterials = async () => {
    dispatch({ type: 'load-start' })
    try {
      const [data, providerRows] = await Promise.all([
        materialService.getAllMaterials(),
        providerService.getProviders(),
      ])
      dispatch({
        type: 'load-success',
        items: normalizeMaterials(data),
        providers: providerRows || [],
      })
    } catch (error) {
      console.error('Error cargando maestro de materiales:', error)
      alert(error?.message || 'No se pudo cargar el maestro de materiales.')
      dispatch({ type: 'load-finish' })
    }
  }

  useEffect(() => {
    loadMaterials()
  }, [])

  const handleFieldChange = (rowKey, field, value) => {
    dispatch({
      type: 'patch-item',
      rowKey,
      field,
      value,
    })
  }

  const handleUnlockManualEdit = () => {
    const pin = window.prompt('PIN de autorizacion:')
    if (pin === null) return

    if (pin !== EDITION_PIN) {
      window.alert('PIN incorrecto.')
      return
    }

    dispatch({ type: 'set-manual-edit-unlocked', value: true })
  }

  const handleSaveField = async (item, field) => {
    if (!item.materialId) return

    const saveKey = `${item.rowKey}:${field}`
    dispatch({ type: 'set-saving-key', value: saveKey })
    try {
      if (field === 'sku' || field === 'name' || field === 'providerId') {
        const nextField = field === 'providerId' ? 'provider_id' : field
        const nextValue =
          field === 'providerId' && item.isInternalProduction
            ? ''
            : item[field]
        await materialService.updateMaterialField(item.materialId, nextField, nextValue)
      }

      if (field === 'price') {
        await materialService.updatePrice(item.materialId, item.centerId, Number(item.price || 0))
      }

      if (field === 'stock') {
        await materialService.updateManualStock(item.materialId, item.centerId, Number(item.stock || 0), {
          reason_code: 'correction',
          notes: 'Edicion manual desde maestro de materiales',
        })
      }

      await loadMaterials()
    } catch (error) {
      console.error('Error guardando campo del material:', error)
      alert(error?.message || 'No se pudo guardar el cambio.')
    } finally {
      dispatch({ type: 'set-saving-key', value: '' })
    }
  }

  if (loading) {
    return <div style={{ padding: '24px' }}>Cargando maestro de materiales...</div>
  }

  return (
    <div style={getPageStyle(isMobile)}>
      <section style={formCardStyle}>
        <MaterialForm onMaterialAdded={loadMaterials} />
      </section>

      <section style={tableSectionStyle}>
        <InventoryHeader
          manualEditUnlocked={manualEditUnlocked}
          onLock={() => dispatch({ type: 'set-manual-edit-unlocked', value: false })}
          onUnlock={handleUnlockManualEdit}
        />

        {isMobile ? (
          <InventoryMobileList
            items={items}
            manualEditUnlocked={manualEditUnlocked}
            onFieldChange={handleFieldChange}
            onSaveField={handleSaveField}
            providers={providers}
            savingKey={savingKey}
          />
        ) : (
          <InventoryDesktopTable
            items={items}
            manualEditUnlocked={manualEditUnlocked}
            onFieldChange={handleFieldChange}
            onSaveField={handleSaveField}
            providers={providers}
            savingKey={savingKey}
          />
        )}
      </section>
    </div>
  )
}

const getPageStyle = (isMobile) => ({
  padding: isMobile ? space[6] : `${space[8]} ${space[2]} ${space[8]}`,
})

const formCardStyle = {
  marginBottom: space[8],
}

const tableSectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[6],
}

const tableHeaderRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: space[4],
  flexWrap: 'wrap',
}

const tableTitleStyle = {
  margin: 0,
  color: colors.gray900,
  fontSize: type.lg,
  fontWeight: type.black,
}

const unlockButtonStyle = {
  border: 'none',
  background: colors.gray800,
  color: colors.white,
  fontWeight: type.black,
  borderRadius: radius.md,
  padding: `${space[4]} ${space[9]}`,
  cursor: 'pointer',
}

const lockButtonStyle = {
  border: 'none',
  background: colors.red600,
  color: colors.white,
  fontWeight: type.black,
  borderRadius: radius.md,
  padding: `${space[4]} ${space[9]}`,
  cursor: 'pointer',
}

const mobileCardsGridStyle = {
  display: 'grid',
  gap: space[5],
}

const mobileCardStyle = {
  background: colors.white,
  borderRadius: radius.xl,
  border: `1px solid rgba(203, 213, 225, 0.85)`,
  boxShadow: shadow.md,
  padding: space[6],
  display: 'flex',
  flexDirection: 'column',
  gap: space[5],
}

const mobileCardTopStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: space[6],
}

const mobileMetaLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  fontWeight: type.black,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: space[1],
}

const mobileSkuTextStyle = {
  color: colors.gray800,
  fontWeight: type.black,
}

const mobileNameTextStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type.md,
}

const mobileFieldBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
}

const mobileMetricsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: space[6],
}

const mobileMetricCardStyle = {
  borderRadius: radius.lg,
  background: colors.gray100,
  border: `1px solid ${colors.gray200}`,
  padding: `${space[4]} ${space[5]}`,
}

const mobileStockTextStyle = {
  color: colors.gray900,
  fontWeight: type.black,
}

const stockHintStyle = {
  marginTop: space[3],
  color: colors.gray500,
  fontSize: type.xs,
  lineHeight: 1.45,
}

const tableWrapStyle = {
  overflowX: 'auto',
  background: colors.white,
  borderRadius: radius.xl,
  boxShadow: shadow.md,
  border: `1px solid rgba(203, 213, 225, 0.8)`,
}

const tableStyle = {
  width: '100%',
  minWidth: '880px',
  borderCollapse: 'collapse',
}

const tableHeadRowStyle = {
  background: colors.gray900,
}

const headerCellStyle = {
  padding: '10px 12px',
  color: colors.gray200,
  fontSize: type.xs,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  textAlign: 'left',
}

const bodyRowStyle = {
  borderBottom: `1px solid ${colors.gray200}`,
}

const bodyCellStyle = {
  padding: '8px 12px',
  color: colors.gray700,
  verticalAlign: 'top',
}

const categoryPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${space[1]} ${space[6]}`,
  borderRadius: radius.full,
  background: '#e0f2fe',
  color: '#0369a1',
  fontWeight: type.black,
  fontSize: type.xs,
}

const currencyInputWrapStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}

const currencyMarkStyle = {
  position: 'absolute',
  left: space[6],
  color: colors.gray600,
  fontWeight: type.bold,
}

const tableInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '32px',
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  padding: '7px 10px',
  fontSize: type.base,
  background: colors.white,
}

const priceTextStyle = {
  color: colors.green700,
  fontWeight: type.black,
}

export default Inventory
