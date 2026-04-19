import React, { useEffect, useReducer } from 'react'
import MaterialForm from '../components/MaterialForm'
import { materialService } from '../api/materialService'
import { providerService } from '../api/providerService'
import { useResponsive } from '../lib/useResponsive'

const EDITION_PIN = '2024'
const normalizeCategoryName = (value) => (value || '').trim().toLowerCase()
const isExtraCategoryName = (value) => normalizeCategoryName(value) === 'extras'

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
      const isExtraCategory = isExtraCategoryName(item.categoryName)

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
            {manualEditUnlocked && !isExtraCategory ? (
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
                {isExtraCategory ? 'Produccion interna' : item.providerName}
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
          const isExtraCategory = isExtraCategoryName(item.categoryName)

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
                {manualEditUnlocked && !isExtraCategory ? (
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
                  isExtraCategory ? 'Produccion interna' : item.providerName
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
          field === 'providerId' && isExtraCategoryName(item.categoryName)
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
  padding: isMobile ? '16px' : '18px 4px 32px',
})

const formCardStyle = {
  marginBottom: '30px',
}

const tableSectionStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const tableHeaderRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '16px',
  flexWrap: 'wrap',
}

const tableTitleStyle = {
  margin: 0,
  color: '#0f172a',
  fontSize: '1.15rem',
  fontWeight: 900,
}

const unlockButtonStyle = {
  border: 'none',
  background: '#1f2937',
  color: '#ffffff',
  fontWeight: 800,
  borderRadius: '10px',
  padding: '10px 18px',
  cursor: 'pointer',
}

const lockButtonStyle = {
  border: 'none',
  background: '#ef4444',
  color: '#ffffff',
  fontWeight: 800,
  borderRadius: '10px',
  padding: '10px 18px',
  cursor: 'pointer',
}

const mobileCardsGridStyle = {
  display: 'grid',
  gap: '14px',
}

const mobileCardStyle = {
  background: '#ffffff',
  borderRadius: '18px',
  border: '1px solid rgba(203, 213, 225, 0.85)',
  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.08)',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}

const mobileCardTopStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
}

const mobileMetaLabelStyle = {
  color: '#64748b',
  fontSize: '0.78rem',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: '6px',
}

const mobileSkuTextStyle = {
  color: '#1e3a5f',
  fontWeight: 800,
}

const mobileNameTextStyle = {
  color: '#0f172a',
  fontWeight: 900,
  fontSize: '1rem',
}

const mobileFieldBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
}

const mobileMetricsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: '12px',
}

const mobileMetricCardStyle = {
  borderRadius: '14px',
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  padding: '12px',
}

const mobileStockTextStyle = {
  color: '#0f172a',
  fontWeight: 800,
}

const stockHintStyle = {
  marginTop: '6px',
  color: '#64748b',
  fontSize: '0.78rem',
  lineHeight: 1.45,
}

const tableWrapStyle = {
  overflowX: 'auto',
  background: '#ffffff',
  borderRadius: '18px',
  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.08)',
  border: '1px solid rgba(203, 213, 225, 0.8)',
}

const tableStyle = {
  width: '100%',
  minWidth: '880px',
  borderCollapse: 'collapse',
}

const tableHeadRowStyle = {
  background: '#0f172a',
}

const headerCellStyle = {
  padding: '14px 16px',
  color: '#e2e8f0',
  fontSize: '0.8rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  textAlign: 'left',
}

const bodyRowStyle = {
  borderBottom: '1px solid #e2e8f0',
}

const bodyCellStyle = {
  padding: '14px 16px',
  color: '#334155',
  verticalAlign: 'top',
}

const categoryPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 12px',
  borderRadius: '999px',
  background: '#e0f2fe',
  color: '#0369a1',
  fontWeight: 800,
  fontSize: '0.8rem',
}

const currencyInputWrapStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}

const currencyMarkStyle = {
  position: 'absolute',
  left: '12px',
  color: '#475569',
  fontWeight: 700,
}

const tableInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  minHeight: '40px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  padding: '10px 12px',
  fontSize: '0.95rem',
  background: '#ffffff',
}

const priceTextStyle = {
  color: '#166534',
  fontWeight: 900,
}

export default Inventory
