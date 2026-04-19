import React, { useEffect, useMemo, useReducer } from 'react'
import ReportView from '../components/ReportView'
import { materialService } from '../api/materialService'
import { formatCurrency, formatDateTime } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'

const createInitialPurchasesState = () => ({
  purchases: [],
  loading: true,
  dateFrom: '',
  dateTo: '',
  selectedProvider: '',
})

const purchasesReducer = (state, action) => {
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
        purchases: action.purchases,
      }
    case 'load-finish':
      return {
        ...state,
        loading: false,
      }
    case 'set-date-from':
      return {
        ...state,
        dateFrom: action.value,
      }
    case 'set-date-to':
      return {
        ...state,
        dateTo: action.value,
      }
    case 'set-provider':
      return {
        ...state,
        selectedProvider: action.value,
      }
    default:
      return state
  }
}

const PurchasesReport = () => {
  const [state, dispatch] = useReducer(purchasesReducer, undefined, createInitialPurchasesState)
  const { purchases, loading, dateFrom, dateTo, selectedProvider } = state
  const { isMobile } = useResponsive()

  useEffect(() => {
    const loadReport = async () => {
      dispatch({ type: 'load-start' })
      try {
        const data = await materialService.getPurchasesReport()
        dispatch({ type: 'load-success', purchases: data || [] })
      } catch (error) {
        console.error('Error al cargar reporte de compras:', error)
        dispatch({ type: 'load-finish' })
      }
    }

    loadReport()
  }, [])

  const providerOptions = Array.from(
    new Set(
      purchases.flatMap((purchase) => (
        purchase.provider_name ? [purchase.provider_name] : []
      ))
    )
  ).sort((a, b) => a.localeCompare(b, 'es'))

  const filteredPurchases = purchases.filter((purchase) => {
    const matchesProvider = !selectedProvider || purchase.provider_name === selectedProvider
    const matchesDate = isWithinDateRange(purchase.created_at, dateFrom, dateTo)
    return matchesProvider && matchesDate
  })

  const totalPurchased = useMemo(
    () => filteredPurchases.reduce((acc, purchase) => acc + Number(purchase.total_amount || 0), 0),
    [filteredPurchases]
  )

  const exportRows = filteredPurchases.map((purchase) => ({
    proveedor: purchase.provider_name,
    factura: purchase.invoice_ref,
    fecha: formatDateTime(purchase.created_at),
    monto: formatCurrency(purchase.total_amount),
  }))

  if (loading) return <div style={loadingStyle}>Generando reporte de compras...</div>

  return (
    <ReportView
      title="Reporte de Compras"
      isMobile={isMobile}
      filters={
        <div style={getFilterGridStyle(isMobile)}>
          <div>
            <label htmlFor="purchases-report-date-from" style={filterLabelStyle}>Fecha desde</label>
            <input
              id="purchases-report-date-from"
              type="date"
              value={dateFrom}
              onChange={(event) => dispatch({ type: 'set-date-from', value: event.target.value })}
              style={filterInputStyle}
            />
          </div>
          <div>
            <label htmlFor="purchases-report-date-to" style={filterLabelStyle}>Fecha hasta</label>
            <input
              id="purchases-report-date-to"
              type="date"
              value={dateTo}
              onChange={(event) => dispatch({ type: 'set-date-to', value: event.target.value })}
              style={filterInputStyle}
            />
          </div>
          <div>
            <label htmlFor="purchases-report-provider" style={filterLabelStyle}>Proveedor</label>
            <select
              id="purchases-report-provider"
              value={selectedProvider}
              onChange={(event) => dispatch({ type: 'set-provider', value: event.target.value })}
              style={filterInputStyle}
            >
              <option value="">Todos los proveedores</option>
              {providerOptions.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
          </div>
        </div>
      }
      rows={filteredPurchases}
      columns={[
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'factura', label: 'Factura' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'monto', label: 'Monto' },
      ]}
      renderRow={(purchase) => (
        <tr key={purchase.id} style={rowStyle}>
          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{purchase.provider_name}</td>
          <td style={tdStyle}>{purchase.invoice_ref}</td>
          <td style={tdStyle}>{formatDateTime(purchase.created_at)}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#1d4ed8' }}>
            {formatCurrency(purchase.total_amount)}
          </td>
        </tr>
      )}
      exportColumns={[
        { key: 'proveedor', label: 'Proveedor' },
        { key: 'factura', label: 'Factura' },
        { key: 'fecha', label: 'Fecha' },
        { key: 'monto', label: 'Monto' },
      ]}
      exportRows={exportRows}
      exportFileName="reporte-compras"
      summary={`Total comprado: ${formatCurrency(totalPurchased)}`}
      emptyText="No hay compras para los filtros seleccionados."
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
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
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
const tdStyle = { padding: '12px 15px', fontSize: '0.95rem', color: '#4a5568' }
const rowStyle = { borderBottom: '1px solid #e2e8f0' }

export default PurchasesReport
