import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import MaterialForm from '../components/MaterialForm'

const Inventory = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [isAdminMode, setIsAdminMode] = useState(false)

  const refreshData = async () => {
    try {
      const data = await materialService.getAllMaterials()
      setItems(data || [])
    } catch (error) { console.error(error) }
    finally { setLoading(false) }
  }

  useEffect(() => { refreshData() }, [])

  const toggleAdminMode = () => {
    if (!isAdminMode) {
      if (prompt("PIN de autorización:") === "1234") setIsAdminMode(true)
    } else { setIsAdminMode(false) }
  }

  if (loading) return <div style={loadingStyle}>Cargando Maestro de Materiales...</div>

  return (
    <div style={containerStyle}>
      <section style={cardStyle}>
        <MaterialForm onMaterialAdded={refreshData} />
      </section>

      <div style={headerActionStyle}>
        <h2 style={{ color: '#1a202c', margin: 0 }}>Maestro de Materiales</h2>
        <button onClick={toggleAdminMode} style={isAdminMode ? btnLockStyle : btnUnlockStyle}>
          {isAdminMode ? "🔒 Bloquear Edición" : "🔓 Desbloquear Edición Manual"}
        </button>
      </div>

      <div style={tableWrapperStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={theadStyle}>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Producto</th>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Precio Venta</th>
              <th style={thStyle}>Stock Actual</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} style={index % 2 === 0 ? rowEvenStyle : rowOddStyle}>
                <td style={tdStyle}>
                  {isAdminMode ? (
                    <input
                      style={editInputStyle}
                      defaultValue={item.materials?.sku}
                      onBlur={(e) => materialService.updateMaterialField(item.materials.id, 'sku', e.target.value)}
                    />
                  ) : <span style={textStyle}>{item.materials?.sku}</span>}
                </td>

                <td style={tdStyle}>
                  {isAdminMode ? (
                    <input
                      style={{ ...editInputStyle, width: '250px', fontWeight: 'bold' }}
                      defaultValue={item.materials?.name}
                      onBlur={(e) => materialService.updateMaterialField(item.materials.id, 'name', e.target.value)}
                    />
                  ) : <span style={{ ...textStyle, fontWeight: 'bold' }}>{item.materials?.name}</span>}
                </td>

                <td style={tdStyle}><span style={badgeStyle}>{item.materials?.categories?.name}</span></td>

                <td style={tdStyle}>
                  {isAdminMode ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      $ <input
                        type="number"
                        style={editInputStyle}
                        defaultValue={item.precio_venta}
                        onBlur={(e) => materialService.updatePrice(item.materials.id, item.centers.id, e.target.value)}
                      />
                    </div>
                  ) : <span style={{ ...textStyle, color: '#2f855a', fontWeight: 'bold' }}>${item.precio_venta}</span>}
                </td>

                <td style={tdStyle}>
                  {isAdminMode && item.materials?.categories?.is_inventoried ? (
                    <input
                      type="number"
                      style={{ ...editInputStyle, width: '70px' }}
                      defaultValue={item.stock_actual}
                      onBlur={(e) => materialService.updateManualStock(item.materials.id, item.centers.id, e.target.value)}
                    />
                  ) : (
                    <span style={textStyle}>
                      {item.materials?.categories?.is_inventoried ? item.stock_actual : <span style={{ color: '#a0aec0' }}>N/A</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const containerStyle = { padding: '30px', backgroundColor: '#f7fafc', minHeight: '100vh' }
const cardStyle = { backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)', marginBottom: '30px' }
const tableWrapperStyle = { backgroundColor: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }
const headerActionStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }

const theadStyle = { backgroundColor: '#2d3748', color: '#ffffff' }
const thStyle = { padding: '15px', textAlign: 'left', textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }
const tdStyle = { padding: '12px 15px', borderBottom: '1px solid #e2e8f0' }

const textStyle = { color: '#1a202c', fontSize: '0.95rem' }
const rowEvenStyle = { backgroundColor: '#ffffff' }
const rowOddStyle = { backgroundColor: '#f8fafc' }

const badgeStyle = { backgroundColor: '#edf2f7', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', color: '#4a5568', fontWeight: '600' }

const editInputStyle = {
  padding: '6px 10px', borderRadius: '6px', border: '2px solid #3182ce', backgroundColor: '#ebf8ff',
  color: '#2c5282', fontWeight: 'bold', outline: 'none'
}

const btnUnlockStyle = { padding: '10px 20px', backgroundColor: '#2d3748', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }
const btnLockStyle = { ...btnUnlockStyle, backgroundColor: '#e53e3e' }
const loadingStyle = { padding: '50px', textAlign: 'center', fontSize: '1.2rem', color: '#4a5568' }

export default Inventory
