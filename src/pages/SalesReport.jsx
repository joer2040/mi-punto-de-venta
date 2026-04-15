import React, { useEffect, useMemo, useState } from 'react'
import ReportView from '../components/ReportView'
import { materialService } from '../api/materialService'
import { formatCurrency, formatDateTime, formatNumericFolio } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'

const SalesReport = () => {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const { isMobile } = useResponsive()

  useEffect(() => {
    const loadReport = async () => {
      try {
        const data = await materialService.getSalesReport()
        setSales(data || [])
      } catch (error) {
        console.error('Error al cargar reporte de ventas:', error)
      } finally {
        setLoading(false)
      }
    }

    loadReport()
  }, [])

  const filteredSales = sales.filter((sale) => isWithinDateRange(sale.created_at, dateFrom, dateTo))

  const totalSold = useMemo(
    () => filteredSales.reduce((acc, sale) => acc + Number(sale.total_amount || 0), 0),
    [filteredSales]
  )

  const exportRows = filteredSales.map((sale) => ({
    fecha: formatDateTime(sale.created_at),
    folio_venta: formatNumericFolio(sale.document_number),
    monto: formatCurrency(sale.total_amount),
  }))

  if (loading) return <div style={loadingStyle}>Generando reporte de ventas...</div>

  return (
    <ReportView
      title="Reporte de Ventas"
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
        </div>
      }
      rows={filteredSales}
      columns={[
        { key: 'fecha', label: 'Fecha' },
        { key: 'folio_venta', label: 'Folio de Venta' },
        { key: 'monto', label: 'Monto' },
      ]}
      renderRow={(sale) => (
        <tr key={sale.id} style={rowStyle}>
          <td style={tdStyle}>{formatDateTime(sale.created_at)}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{formatNumericFolio(sale.document_number)}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#0f766e' }}>
            {formatCurrency(sale.total_amount)}
          </td>
        </tr>
      )}
      exportColumns={[
        { key: 'fecha', label: 'Fecha' },
        { key: 'folio_venta', label: 'Folio de Venta' },
        { key: 'monto', label: 'Monto' },
      ]}
      exportRows={exportRows}
      exportFileName="reporte-ventas"
      summary={`Total vendido: ${formatCurrency(totalSold)}`}
      emptyText="No hay ventas para los filtros seleccionados."
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
  backgroundColor: '#ffffff',
  color: '#0f172a',
  WebkitTextFillColor: '#0f172a',
}

const loadingStyle = { padding: '50px', textAlign: 'center' }
const tdStyle = { padding: '12px 15px', fontSize: '0.95rem', color: '#4a5568' }
const rowStyle = { borderBottom: '1px solid #e2e8f0' }

export default SalesReport
