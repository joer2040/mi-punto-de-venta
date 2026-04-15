import React, { useEffect, useMemo, useState } from 'react'
import ReportView from '../components/ReportView'
import { materialService } from '../api/materialService'
import { formatCurrency, formatDateTime } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'

const PurchasesReport = () => {
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedProvider, setSelectedProvider] = useState('')
  const { isMobile } = useResponsive()

  useEffect(() => {
    const loadReport = async () => {
      try {
        const data = await materialService.getPurchasesReport()
        setPurchases(data || [])
      } catch (error) {
        console.error('Error al cargar reporte de compras:', error)
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [])

  const providerOptions = Array.from(
    new Set(purchases.map((purchase) => purchase.provider_name).filter(Boolean))
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
            <label style={filterLabelStyle}>Fecha desde</label>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={filterInputStyle} />
          </div>
          <div>
            <label style={filterLabelStyle}>Fecha hasta</label>
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={filterInputStyle} />
          </div>
          <div>
            <label style={filterLabelStyle}>Proveedor</label>
            <select
              value={selectedProvider}
              onChange={(event) => setSelectedProvider(event.target.value)}
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
