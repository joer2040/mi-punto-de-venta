import React, { useEffect, useMemo, useState } from 'react'
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

const Inventory = () => {
  const { isMobile } = useResponsive()
  const [items, setItems] = useState([])
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [manualEditUnlocked, setManualEditUnlocked] = useState(false)
  const [savingKey, setSavingKey] = useState('')

  const loadMaterials = async () => {
    setLoading(true)
    try {
      const [data, providerRows] = await Promise.all([
        materialService.getAllMaterials(),
        providerService.getProviders(),
      ])
      setItems(normalizeMaterials(data))
      setProviders(providerRows || [])
    } catch (error) {
      console.error('Error cargando maestro de materiales:', error)
      alert(error?.message || 'No se pudo cargar el maestro de materiales.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMaterials()
  }, [])

  const groupedItems = useMemo(() => items, [items])

  const handleFieldChange = (rowKey, field, value) => {
    setItems((prev) =>
      prev.map((item) =>
        item.rowKey === rowKey
          ? {
              ...item,
              [field]: value,
            }
          : item
      )
    )
  }

  const handleUnlockManualEdit = () => {
    const pin = window.prompt('PIN de autorizacion:')
    if (pin === null) return

    if (pin !== EDITION_PIN) {
      window.alert('PIN incorrecto.')
      return
    }

    setManualEditUnlocked(true)
  }

  const handleSaveField = async (item, field) => {
    if (!item.materialId) return

    const saveKey = `${item.rowKey}:${field}`
    setSavingKey(saveKey)
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
      setSavingKey('')
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
        <div style={tableHeaderRowStyle}>
          <h2 style={tableTitleStyle}>Maestro de Materiales</h2>

          {manualEditUnlocked ? (
            <button type="button" onClick={() => setManualEditUnlocked(false)} style={lockButtonStyle}>
              Bloquear Edicion
            </button>
          ) : (
            <button type="button" onClick={handleUnlockManualEdit} style={unlockButtonStyle}>
              Desbloquear Edicion Manual
            </button>
          )}
        </div>

        {isMobile ? (
          <div style={mobileCardsGridStyle}>
            {groupedItems.map((item) => {
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
                          onChange={(event) => handleFieldChange(item.rowKey, 'sku', event.target.value)}
                          onBlur={() => handleSaveField(item, 'sku')}
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
                        onChange={(event) => handleFieldChange(item.rowKey, 'name', event.target.value)}
                        onBlur={() => handleSaveField(item, 'name')}
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
                        onChange={(event) => handleFieldChange(item.rowKey, 'providerId', event.target.value)}
                        onBlur={() => handleSaveField(item, 'providerId')}
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
                            onChange={(event) => handleFieldChange(item.rowKey, 'price', event.target.value)}
                            onBlur={() => handleSaveField(item, 'price')}
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
        ) : (
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
                {groupedItems.map((item) => {
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
                            onChange={(event) => handleFieldChange(item.rowKey, 'sku', event.target.value)}
                            onBlur={() => handleSaveField(item, 'sku')}
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
                            onChange={(event) => handleFieldChange(item.rowKey, 'name', event.target.value)}
                            onBlur={() => handleSaveField(item, 'name')}
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
                            onChange={(event) => handleFieldChange(item.rowKey, 'providerId', event.target.value)}
                            onBlur={() => handleSaveField(item, 'providerId')}
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
                              onChange={(event) => handleFieldChange(item.rowKey, 'price', event.target.value)}
                              onBlur={() => handleSaveField(item, 'price')}
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
  borderCollapse: 'collapse',
}

const tableHeadRowStyle = {
  background: '#374151',
}

const headerCellStyle = {
  color: '#ffffff',
  fontSize: '0.85rem',
  fontWeight: 900,
  letterSpacing: '0.04em',
  padding: '16px 14px',
  textAlign: 'left',
}

const bodyRowStyle = {
  borderBottom: '1px solid #e5e7eb',
}

const bodyCellStyle = {
  padding: '12px 14px',
  color: '#0f172a',
  verticalAlign: 'middle',
}

const categoryPillStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: '#eff6ff',
  color: '#1e3a5f',
  borderRadius: '8px',
  padding: '4px 10px',
  fontSize: '0.9rem',
}

const priceTextStyle = {
  color: '#16a34a',
  fontWeight: 800,
}

const tableInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: '8px',
  border: '2px solid #3b82f6',
  background: '#eff6ff',
  fontWeight: 700,
  color: '#0f172a',
}

const currencyInputWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

const currencyMarkStyle = {
  color: '#334155',
  fontWeight: 800,
}

export default Inventory
