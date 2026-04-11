import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { useResponsive } from '../lib/useResponsive'

const SalesReport = () => {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
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

  if (loading) return <div style={loadingStyle}>Generando reporte de ventas...</div>

  return (
    <div style={getContainerStyle(isMobile)}>
      <h2 style={getTitleStyle(isMobile)}>Reporte de Ventas</h2>

      <div style={tableWrapperStyle}>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={theadStyle}>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Folio de Venta</th>
                <th style={thStyle}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => (
                <tr key={sale.id} style={rowStyle}>
                  <td style={tdStyle}>{formatDateTime(sale.created_at)}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{sale.document_number}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: '#0f766e' }}>
                    ${sale.total_amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={getSummaryStyle(isMobile)}>
        Total vendido: ${sales.reduce((acc, sale) => acc + sale.total_amount, 0).toFixed(2)}
      </div>
    </div>
  )
}

const formatDateTime = (value) =>
  new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

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

const loadingStyle = { padding: '50px', textAlign: 'center' }
const tableWrapperStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
}
const tableScrollStyle = { overflowX: 'auto' }
const tableStyle = { width: '100%', minWidth: '680px', borderCollapse: 'collapse' }
const theadStyle = { backgroundColor: '#4a5568', color: '#ffffff' }
const thStyle = { padding: '15px', textAlign: 'left', fontSize: '0.85rem' }
const tdStyle = { padding: '12px 15px', fontSize: '0.95rem', color: '#4a5568' }
const rowStyle = { borderBottom: '1px solid #e2e8f0' }
const getSummaryStyle = (isMobile) => ({
  marginTop: '20px',
  textAlign: isMobile ? 'left' : 'right',
  padding: isMobile ? '16px 8px' : '20px',
  fontSize: isMobile ? '1rem' : '1.2rem',
  fontWeight: 'bold',
  color: '#2d3748',
})

export default SalesReport
