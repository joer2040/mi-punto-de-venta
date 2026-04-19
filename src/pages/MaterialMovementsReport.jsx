import React, { useEffect, useMemo, useReducer } from 'react'
import ReportView from '../components/ReportView'
import { materialService } from '../api/materialService'
import { formatDateTime } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'

const createInitialMaterialMovementsReportState = () => ({
  movements: [],
  loading: true,
  dateFrom: '',
  dateTo: '',
  productQuery: '',
  selectedMovementType: '',
})

const materialMovementsReportReducer = (state, action) => {
  switch (action.type) {
    case 'load_success':
      return {
        ...state,
        movements: action.movements,
        loading: false,
      }
    case 'load_error':
      return {
        ...state,
        loading: false,
      }
    case 'set_filter':
      return {
        ...state,
        [action.field]: action.value,
      }
    default:
      return state
  }
}

const FiltersPanel = ({
  isMobile,
  dateFrom,
  dateTo,
  productQuery,
  selectedMovementType,
  movementTypeOptions,
  onFilterChange,
}) => (
  <div style={getFilterGridStyle(isMobile)}>
    <div>
      <label htmlFor="movements-report-date-from" style={filterLabelStyle}>Fecha desde</label>
      <input id="movements-report-date-from" type="date" value={dateFrom} onChange={(event) => onFilterChange('dateFrom', event.target.value)} style={filterInputStyle} />
    </div>
    <div>
      <label htmlFor="movements-report-date-to" style={filterLabelStyle}>Fecha hasta</label>
      <input id="movements-report-date-to" type="date" value={dateTo} onChange={(event) => onFilterChange('dateTo', event.target.value)} style={filterInputStyle} />
    </div>
    <div>
      <label htmlFor="movements-report-product" style={filterLabelStyle}>Producto</label>
      <input
        id="movements-report-product"
        type="text"
        value={productQuery}
        onChange={(event) => onFilterChange('productQuery', event.target.value)}
        placeholder="Buscar por material o SKU"
        style={filterInputStyle}
      />
    </div>
    <div>
      <label htmlFor="movements-report-type" style={filterLabelStyle}>Tipo de movimiento</label>
      <select
        id="movements-report-type"
        value={selectedMovementType}
        onChange={(event) => onFilterChange('selectedMovementType', event.target.value)}
        style={filterInputStyle}
      >
        <option value="">Todos los tipos</option>
        {movementTypeOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  </div>
)

const MaterialMovementsReport = () => {
  const [state, dispatch] = useReducer(
    materialMovementsReportReducer,
    undefined,
    createInitialMaterialMovementsReportState
  )
  const { isMobile } = useResponsive()
  const {
    movements,
    loading,
    dateFrom,
    dateTo,
    productQuery,
    selectedMovementType,
  } = state

  useEffect(() => {
    const loadReport = async () => {
      try {
        const data = await materialService.getMaterialMovementsReport()
        dispatch({ type: 'load_success', movements: data || [] })
      } catch (error) {
        console.error('Error al cargar reporte de movimientos de materiales:', error)
        dispatch({ type: 'load_error' })
      }
    }

    loadReport()
  }, [])

  const movementTypeOptions = Array.from(
    new Set(
      movements.flatMap((movement) => (
        movement.movement_type_label ? [movement.movement_type_label] : []
      ))
    )
  ).sort((a, b) => a.localeCompare(b, 'es'))

  const filteredMovements = useMemo(
    () =>
      movements.filter((movement) => {
        const matchesDate = isWithinDateRange(movement.created_at, dateFrom, dateTo)
        const matchesType = !selectedMovementType || movement.movement_type_label === selectedMovementType
        const query = productQuery.trim().toLowerCase()
        const matchesProduct =
          !query ||
          movement.material_name.toLowerCase().includes(query) ||
          movement.material_sku.toLowerCase().includes(query)

        return matchesDate && matchesType && matchesProduct
      }),
    [dateFrom, dateTo, movements, productQuery, selectedMovementType]
  )

  const exportRows = filteredMovements.map((movement) => ({
    numero_documento: movement.document_number,
    material: movement.material_name,
    tipo_movimiento: movement.movement_type_label,
    opcion_movimiento: movement.movement_option_label,
    cantidad: movement.quantity,
    unidad_medida: movement.unit_abbr,
    fecha: formatDateTime(movement.created_at),
  }))

  const handleFilterChange = (field, value) => {
    dispatch({ type: 'set_filter', field, value })
  }

  if (loading) return <div style={loadingStyle}>Generando reporte de movimientos de materiales...</div>

  return (
    <ReportView
      title="Reporte de Movimiento de Materiales"
      isMobile={isMobile}
      filters={
        <FiltersPanel
          isMobile={isMobile}
          dateFrom={dateFrom}
          dateTo={dateTo}
          productQuery={productQuery}
          selectedMovementType={selectedMovementType}
          movementTypeOptions={movementTypeOptions}
          onFilterChange={handleFilterChange}
        />
      }
      rows={filteredMovements}
      columns={[
        { key: 'numero_documento', label: 'Numero de Documento' },
        { key: 'material', label: 'Material' },
        { key: 'tipo_movimiento', label: 'Tipo de Movimiento' },
        { key: 'opcion_movimiento', label: 'Opcion de Movimiento' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'unidad_medida', label: 'Unidad de Medida' },
        { key: 'fecha', label: 'Fecha' },
      ]}
      renderRow={(movement) => (
        <tr key={movement.id} style={rowStyle}>
          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{movement.document_number}</td>
          <td style={tdStyle}>
            <div style={materialNameStyle}>{movement.material_name}</div>
            <div style={materialSkuStyle}>{movement.material_sku}</div>
          </td>
          <td style={tdStyle}>{movement.movement_type_label}</td>
          <td style={tdStyle}>{movement.movement_option_label}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{movement.quantity}</td>
          <td style={tdStyle}>{movement.unit_abbr}</td>
          <td style={tdStyle}>{formatDateTime(movement.created_at)}</td>
        </tr>
      )}
      exportColumns={[
        { key: 'numero_documento', label: 'Numero de Documento' },
        { key: 'material', label: 'Material' },
        { key: 'tipo_movimiento', label: 'Tipo de Movimiento' },
        { key: 'opcion_movimiento', label: 'Opcion de Movimiento' },
        { key: 'cantidad', label: 'Cantidad' },
        { key: 'unidad_medida', label: 'Unidad de Medida' },
        { key: 'fecha', label: 'Fecha' },
      ]}
      exportRows={exportRows}
      exportFileName="reporte-movimiento-materiales"
      summary={`Movimientos encontrados: ${filteredMovements.length}`}
      emptyText="No hay movimientos de materiales para los filtros seleccionados."
    />
  )
}

const isWithinDateRange = (value, dateFrom, dateTo) => {
  const current = new Date(value)
  if (dateFrom) {
    const from = new Date(`${dateFrom}T00:00:00`)
    if (current < from) return false
  }

  if (dateTo) {
    const to = new Date(`${dateTo}T23:59:59`)
    if (current > to) return false
  }

  return true
}

const getFilterGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))',
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
  backgroundColor: '#ffffff',
  color: '#0f172a',
  WebkitTextFillColor: '#0f172a',
}

const loadingStyle = { padding: '50px', textAlign: 'center' }
const rowStyle = { borderBottom: '1px solid #e2e8f0' }
const tdStyle = { padding: '12px 15px', fontSize: '0.95rem', color: '#4a5568' }
const materialNameStyle = { color: '#0f172a', fontWeight: '800' }
const materialSkuStyle = { color: '#64748b', fontSize: '0.85rem', marginTop: '4px' }

export default MaterialMovementsReport
