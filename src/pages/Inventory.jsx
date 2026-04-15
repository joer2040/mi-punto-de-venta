import React, { useEffect, useMemo, useState } from 'react'
import MaterialForm from '../components/MaterialForm'
import { materialService } from '../api/materialService'
import { useResponsive } from '../lib/useResponsive'

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
      categoryName: category.name || 'Sin categoria',
      categoryId: material.cat_id || category.id || null,
      price: Number(row.precio_venta ?? row.price ?? 0),
      stock: Number(row.stock_actual ?? row.stock ?? 0),
    }
  })

const Inventory = () => {
  const { isMobile } = useResponsive()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [manualEditUnlocked, setManualEditUnlocked] = useState(false)
  const [savingKey, setSavingKey] = useState('')

  const loadMaterials = async () => {
    setLoading(true)
    try {
      const data = await materialService.getAllMaterials()
      setItems(normalizeMaterials(data))
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
      if (field === 'sku' || field === 'name') {
        await materialService.updateMaterialField(item.materialId, field, item[field])
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

        <div style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={tableHeadRowStyle}>
                <th style={headerCellStyle}>SKU</th>
                <th style={headerCellStyle}>PRODUCTO</th>
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
                const stockSaveKey = `${item.rowKey}:stock`

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
                      {manualEditUnlocked ? (
                        <input
                          type="number"
                          step="0.001"
                          value={item.stock}
                          onChange={(event) => handleFieldChange(item.rowKey, 'stock', event.target.value)}
                          onBlur={() => handleSaveField(item, 'stock')}
                          style={tableInputStyle}
                          disabled={savingKey === stockSaveKey}
                        />
                      ) : (
                        Number(item.stock || 0)
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
