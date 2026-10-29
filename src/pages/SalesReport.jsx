import { useEffect, useMemo, useState } from 'react'
import ReportView from '../components/ReportView'
import { materialService } from '../api/materialService'
import { formatCurrency, formatDateTime, formatNumericFolio } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius } from '../lib/designTokens'
import { ticketService } from '../api/ticketService'
import { printPos58Ticket } from '../lib/printPos58Ticket'
import { useAuth } from '../contexts/AuthContext'
import { SCREEN_KEYS, ACTION_KEYS } from '../lib/permissionConfig'

const SalesReport = () => {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeTo, setTimeTo] = useState('')
  const { isMobile } = useResponsive()
  const { can } = useAuth()
  const canReprint = can(SCREEN_KEYS.REPORT_SALES, ACTION_KEYS.VIEW)
  const [printingSaleId, setPrintingSaleId] = useState(null)
  const [ticketError, setTicketError] = useState('')

  const handleReprint = async (saleId) => {
    const printWindow = window.open('', '_blank', 'width=420,height=720')
    if (!printWindow) {
      setTicketError('Permite las ventanas emergentes para reimprimir.')
      return
    }
    setPrintingSaleId(saleId)
    setTicketError('')
    try {
      const ticket = await ticketService.get(saleId)
      printPos58Ticket(ticket, printWindow)
    } catch (error) {
      printWindow.close()
      setTicketError(error.message || 'No se pudo recuperar el comprobante.')
    } finally {
      setPrintingSaleId(null)
    }
  }

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

  const filteredSales = sales.filter((sale) => isWithinDateRange(sale.created_at, dateFrom, timeFrom, dateTo, timeTo))

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
        <div>
        {ticketError && <p role="alert" style={{ color: '#b91c1c' }}>{ticketError}</p>}
        <div style={getFilterGridStyle(isMobile)}>
          <div>
            <label htmlFor="sales-report-date-from" style={filterLabelStyle}>Fecha desde</label>
            <input id="sales-report-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={filterInputStyle} />
          </div>
          <div>
            <label htmlFor="sales-report-time-from" style={filterLabelStyle}>Hora desde (00:00-23:59)</label>
            <input
              id="sales-report-time-from"
              type="time"
              value={timeFrom}
              onChange={(event) => setTimeFrom(event.target.value)}
              style={filterInputStyle}
              disabled={!dateFrom}
            />
          </div>
          <div>
            <label htmlFor="sales-report-date-to" style={filterLabelStyle}>Fecha hasta</label>
            <input id="sales-report-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={filterInputStyle} />
          </div>
          <div>
            <label htmlFor="sales-report-time-to" style={filterLabelStyle}>Hora hasta (00:00-23:59)</label>
            <input
              id="sales-report-time-to"
              type="time"
              value={timeTo}
              onChange={(event) => setTimeTo(event.target.value)}
              style={filterInputStyle}
              disabled={!dateTo}
            />
          </div>
        </div>
        </div>
      }
      rows={filteredSales}
      columns={[
        { key: 'fecha', label: 'Fecha' },
        { key: 'folio_venta', label: 'Folio de Venta' },
        { key: 'monto', label: 'Monto' },
        ...(canReprint ? [{ key: 'ticket', label: 'Ticket' }] : []),
      ]}
      renderRow={(sale) => (
        <tr key={sale.id} style={rowStyle}>
          <td style={tdStyle}>{formatDateTime(sale.created_at)}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold' }}>{formatNumericFolio(sale.document_number)}</td>
          <td style={{ ...tdStyle, fontWeight: 'bold', color: '#0f766e' }}>
            {formatCurrency(sale.total_amount)}
          </td>
          {canReprint && <td style={tdStyle}>
            {Date.now() < new Date(sale.created_at).getTime() + 15 * 86400000 ? (
              <button type="button" disabled={printingSaleId !== null}
                onClick={() => handleReprint(sale.id)}
                style={{ padding: '8px 12px', cursor: printingSaleId ? 'wait' : 'pointer' }}>
                {printingSaleId === sale.id ? 'Cargando...' : 'Reimprimir ticket'}
              </button>
            ) : <span>Vencido</span>}
          </td>}
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

const isWithinDateRange = (value, dateFrom, timeFrom, dateTo, timeTo) => {
  const current = new Date(value)
  if (dateFrom) {
    const from = new Date(`${dateFrom}T${timeFrom || '00:00'}:00`)
    if (current < from) return false
  }

  if (dateTo) {
    const to = new Date(`${dateTo}T${timeTo || '23:59'}:59`)
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

const loadingStyle = { padding: '50px', textAlign: 'center' }
const tdStyle = { padding: '8px 12px', fontSize: type.md, color: colors.gray600 }
const rowStyle = { borderBottom: '1px solid #e2e8f0' }

export default SalesReport
