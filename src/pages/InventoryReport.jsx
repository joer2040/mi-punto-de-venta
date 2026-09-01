import { useEffect, useMemo, useState } from 'react'
import ReportView from '../components/ReportView'
import { materialService } from '../api/materialService'
import { formatCurrency } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius } from '../lib/designTokens'

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
        const inventoriedItems = materialsData?.filter((item) => item.materials?.categories?.is_inventoried === true) || []
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
    new Set(
      items.flatMap((item) => {
        const categoryName = item.materials?.categories?.name
        return categoryName ? [categoryName] : []
      })
    )
  ).sort((a, b) => a.localeCompare(b, 'es'))

  const filteredItems = items.filter((item) => {
    const matchesProduct =
      !productQuery ||
      item.materials?.name?.toLowerCase().includes(productQuery.toLowerCase()) ||
      item.materials?.sku?.toLowerCase().includes(productQuery.toLowerCase())

    const matchesCategory = !selectedCategory || item.materials?.categories?.name === selectedCategory

    return matchesProduct && matchesCategory
  })

  const totalInventoryValue = useMemo(
    () => filteredItems.reduce(
      (acc, item) => acc + Number(item.stock_actual || 0) * Number(item.costo_promedio || 0),
      0
    ),
    [filteredItems]
  )

  const exportRows = filteredItems.map((item) => ({
    sku: item.materials?.sku || '',
    producto: item.materials?.name || '',
    categoria: item.materials?.categories?.name || '',
    stock_fisico: item.stock_actual ?? 0,
    costo_promedio: formatCurrency(item.costo_promedio),
    valor_inventario: formatCurrency(Number(item.stock_actual || 0) * Number(item.costo_promedio || 0)),
  }))

  if (loading) return <div style={{ padding: '50px', textAlign: 'center' }}>Generando reporte...</div>

  return (
    <ReportView
      title="Reporte de Inventario Actual"
      isMobile={isMobile}
      filters={
        <div style={getFilterGridStyle(isMobile)}>
          <div>
            <label htmlFor="inventory-report-product" style={filterLabelStyle}>Producto</label>
            <input
              id="inventory-report-product"
              type="text"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Buscar por nombre o SKU"
              style={filterInputStyle}
            />
          </div>
          <div>
            <label htmlFor="inventory-report-category" style={filterLabelStyle}>Categoria</label>
            <select
              id="inventory-report-category"
              value={selectedCategory}
              onChange={(event) => setSelectedCategory(event.target.value)}
              style={filterInputStyle}
            >
              <option value="">Todas las categorias</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
      rows={filteredItems}
      columns={[
        { key: 'sku', label: 'SKU' },
        { key: 'producto', label: 'Producto' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'stock_fisico', label: 'Stock Fisico' },
        { key: 'costo_promedio', label: 'Costo Promedio' },
        { key: 'valor_inventario', label: 'Valor del Inventario' },
      ]}
      renderRow={(item) => (
        <tr
          key={item.materials?.id || item.materials?.sku || item.id}
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
          <td style={tdStyle}>{formatCurrency(item.costo_promedio)}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#2b6cb0' }}>
            {formatCurrency(Number(item.stock_actual || 0) * Number(item.costo_promedio || 0))}
          </td>
        </tr>
      )}
      exportColumns={[
        { key: 'sku', label: 'SKU' },
        { key: 'producto', label: 'Producto' },
        { key: 'categoria', label: 'Categoria' },
        { key: 'stock_fisico', label: 'Stock Fisico' },
        { key: 'costo_promedio', label: 'Costo Promedio' },
        { key: 'valor_inventario', label: 'Valor del Inventario' },
      ]}
      exportRows={exportRows}
      exportFileName="reporte-inventario"
      summary={`Valor Total en Almacen: ${formatCurrency(totalInventoryValue)}`}
      emptyText="No hay registros para los filtros seleccionados."
    />
  )
}

const getFilterGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
  gap: space[6],
})

const filterLabelStyle = {
  display: 'block',
  marginBottom: space[2],
  color: colors.gray600,
  fontWeight: type.bold,
  fontSize: type.sm,
}

const filterInputStyle = {
  width: '100%',
  padding: `${space[4]} ${space[5]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  boxSizing: 'border-box',
  backgroundColor: colors.white,
  color: colors.gray900,
  WebkitTextFillColor: colors.gray900,
}

const tdStyle = { padding: '8px 12px', fontSize: type.md, color: colors.gray600 }

export default InventoryReport
