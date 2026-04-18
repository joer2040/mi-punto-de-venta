import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useResponsive } from '../lib/useResponsive'

const reportCards = [
  {
    id: 'report-inventory',
    title: 'Reporte de Existencias',
    description: 'Consulta stock actual, costo promedio y valor en inventario.',
    accent: '#b45309',
  },
  {
    id: 'report-purchases',
    title: 'Reporte de Compras',
    description: 'Visualiza compras por proveedor, factura, fecha y monto.',
    accent: '#0f766e',
  },
  {
    id: 'report-sales',
    title: 'Reporte de Ventas',
    description: 'Revisa fecha, folio de venta y monto total de cada cobro.',
    accent: '#be123c',
  },
  {
    id: 'report-movements',
    title: 'Movimiento de Materiales',
    description: 'Consulta documento, material, tipo, opcion, cantidad y unidad de cada movimiento.',
    accent: '#0f766e',
  },
]

const ReportsHome = ({ onNavigate }) => {
  const { isMobile } = useResponsive()
  const { canAccessPage } = useAuth()
  const visibleReports = reportCards.filter((card) => canAccessPage(card.id))

  return (
    <div style={getContainerStyle(isMobile)}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>CENTRO DE REPORTES</div>
          <h2 style={getTitleStyle(isMobile)}>Reportes</h2>
          <p style={subtitleStyle}>
            Aqui se agrupan los reportes operativos del sistema. En esta primera etapa dejamos
            disponibles existencias, compras, ventas y movimientos de materiales.
          </p>
        </div>
      </section>

      <section style={cardsSectionStyle}>
        <div style={getCardsGridStyle(isMobile)}>
          {visibleReports.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => onNavigate(card.id)}
              style={{
                ...cardButtonStyle,
                borderTop: `5px solid ${card.accent}`,
              }}
            >
              <div style={{ color: card.accent, ...moduleTagStyle }}>Reporte</div>
              <div style={cardTitleStyle}>{card.title}</div>
              <div style={cardDescriptionStyle}>{card.description}</div>
              <div style={{ ...cardLinkStyle, color: card.accent }}>Abrir</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? '16px' : '28px',
})

const heroStyle = {
  background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 55%, #dbeafe 100%)',
  borderRadius: '28px',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
  overflow: 'hidden',
  border: '1px solid rgba(148, 163, 184, 0.18)',
  padding: '28px',
}

const eyebrowStyle = {
  color: '#b45309',
  fontWeight: '800',
  fontSize: '0.82rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: '10px 0 12px 0',
  color: '#0f172a',
  fontSize: isMobile ? '1.9rem' : '2.6rem',
  lineHeight: 1.05,
})

const subtitleStyle = {
  margin: 0,
  color: '#475569',
  fontSize: '1rem',
  maxWidth: '700px',
  lineHeight: 1.6,
}

const cardsSectionStyle = {
  marginTop: '24px',
}

const getCardsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '18px',
})

const cardButtonStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '22px',
  padding: '22px',
  borderLeft: '1px solid #e2e8f0',
  borderRight: '1px solid #e2e8f0',
  borderBottom: '1px solid #e2e8f0',
  boxShadow: '0 14px 35px rgba(15, 23, 42, 0.07)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '10px',
  textAlign: 'left',
  cursor: 'pointer',
}

const moduleTagStyle = {
  fontWeight: '800',
  fontSize: '0.82rem',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const cardTitleStyle = {
  color: '#0f172a',
  fontWeight: '800',
  fontSize: '1.25rem',
}

const cardDescriptionStyle = {
  color: '#64748b',
  fontSize: '0.95rem',
  lineHeight: 1.55,
  flex: 1,
}

const cardLinkStyle = {
  fontWeight: '800',
  fontSize: '0.95rem',
}

export default ReportsHome
