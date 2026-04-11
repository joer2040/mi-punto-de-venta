import React, { useEffect, useState } from 'react'
import { materialService } from '../api/materialService'
import { useResponsive } from '../lib/useResponsive'

const PurchasesReport = () => {
  const [purchases, setPurchases] = useState([])
  const [loading, setLoading] = useState(true)
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

  if (loading) return <div style={loadingStyle}>Generando reporte de compras...</div>

  return (
    <div style={getContainerStyle(isMobile)}>
      <h2 style={getTitleStyle(isMobile)}>Reporte de Compras</h2>

      <div style={tableWrapperStyle}>
        <div style={tableScrollStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={theadStyle}>
                <th style={thStyle}>Proveedor</th>
                <th style={thStyle}>Factura</th>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Monto</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id} style={rowStyle}>
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>{purchase.provider_name}</td>
                  <td style={tdStyle}>{purchase.invoice_ref}</td>
                  <td style={tdStyle}>{formatDateTime(purchase.created_at)}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: '#1d4ed8' }}>
                    ${purchase.total_amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={getSummaryStyle(isMobile)}>
        Total comprado: ${purchases.reduce((acc, purchase) => acc + purchase.total_amount, 0).toFixed(2)}
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
const tableStyle = { width: '100%', minWidth: '760px', borderCollapse: 'collapse' }
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

export default PurchasesReport
