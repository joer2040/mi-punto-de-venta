import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { useResponsive } from '../lib/useResponsive'

const InventoryReport = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [productQuery, setProductQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const { isMobile } = useResponsive()

  useEffect(() => {
    const loadReport = async () => {
      try {
        const materialsData = await materialService.getAllMaterials()
        const inventoriedItems = materialsData?.filter((i) => i.materials?.categories?.is_inventoried === true) || []
        setItems(inventoriedItems)
      } catch (error) {
        console.error('Error al cargar reporte:', error)
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [])

  const categoryOptions = Array.from(
    new Set(items.map((item) => item.materials?.categories?.name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'es'))

  const filteredItems = items.filter((item) => {
    const matchesProduct =
      !productQuery ||
      item.materials?.name?.toLowerCase().includes(productQuery.toLowerCase()) ||
      item.materials?.sku?.toLowerCase().includes(productQuery.toLowerCase())

    const matchesCategory = !selectedCategory || item.materials?.categories?.name === selectedCategory

    return matchesProduct && matchesCategory
  })

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Generando reporte...</div>

  return (
    <div style={getContainerStyle(isMobile)}>
      <h2 style={getTitleStyle(isMobile)}>Reporte de Inventario Actual</h2>

      <div style={filterCardStyle}>
        <div style={getFilterGridStyle(isMobile)}>
          <div>
            <label style={filterLabelStyle}>Producto</label>
            <input
              type="text"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Buscar por nombre o SKU"
              style={filterInputStyle}
            />
          </div>
          <div>
            <label style={filterLabelStyle}>Categoria</label>
            <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} style={filterInputStyle}>
              <option value="">Todas las categorias</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div style={tableWrapperStyle}>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={theadStyle}>
                <th style={thStyle}>SKU</th>
                <th style={thStyle}>Producto</th>
                <th style={thStyle}>Categoria</th>
                <th style={thStyle}>Stock Fisico</th>
                <th style={thStyle}>Costo Promedio</th>
                <th style={thStyle}>Valor del Inventario</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr
                  key={index}
                  style={{
                    borderBottom: '1px solid #e2e8f0',
                    backgroundColor: item.stock_actual <= 0 ? '#fff5f5' : 'transparent',
                  }}
                >
                  <td style={tdStyle}>{item.materials?.sku}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{item.materials?.name}</td>
                  <td style={tdStyle}>{item.materials?.categories?.name}</td>
                  <td style={{ ...tdStyle, color: item.stock_actual <= 0 ? '#c53030' : '#2d3748', fontWeight: 'bold' }}>
                    {item.stock_actual}
                  </td>
                  <td style={tdStyle}>${item.costo_promedio}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: '#2b6cb0' }}>
                    ${(item.stock_actual * item.costo_promedio).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={getSummaryStyle(isMobile)}>
        Valor Total en Almacen: ${filteredItems.reduce((acc, item) => acc + item.stock_actual * item.costo_promedio, 0).toFixed(2)}
      </div>
    </div>
  )
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? '16px' : '30px',
  backgroundColor: '#f7fafc',
  minHeight: '100vh',
})

const getTitleStyle = (isMobile) => ({
  color: '#2d3748',
  marginBottom: '20px',
  borderBottom: '2px solid #cbd5e0',
  paddingBottom: '10px',
  fontSize: isMobile ? '1.35rem' : '1.75rem',
})

const filterCardStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '18px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.08)',
  marginBottom: '18px',
}

const getFilterGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
  gap: '12px',
})

const filterLabelStyle = {
  display: 'block',
  marginBottom: '6px',
  color: '#475569',
  fontWeight: '700',
  fontSize: '0.85rem',
}

const filterInputStyle = {
  width: '100%',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  boxSizing: 'border-box',
}

const tableWrapperStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
}

const tableScrollStyle = {
  overflowX: 'auto',
}

const tableStyle = {
  width: '100%',
  minWidth: '780px',
  borderCollapse: 'collapse',
}

const getSummaryStyle = (isMobile) => ({
  marginTop: '20px',
  textAlign: isMobile ? 'left' : 'right',
  padding: isMobile ? '16px 8px' : '20px',
  fontSize: isMobile ? '1rem' : '1.2rem',
  fontWeight: 'bold',
  color: '#2d3748',
})

const theadStyle = { backgroundColor: '#4a5568', color: '#ffffff' }
const thStyle = { padding: '15px', textAlign: 'left', fontSize: '0.85rem' }
const tdStyle = { padding: '12px 15px', fontSize: '0.95rem', color: '#4a5568' }

export default InventoryReport
