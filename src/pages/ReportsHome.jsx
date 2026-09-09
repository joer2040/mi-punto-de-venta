import { useAuth } from '../contexts/AuthContext'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

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
  padding: isMobile ? space[6] : `${space[8]} ${space[10]}`,
})

const heroStyle = {
  background: 'linear-gradient(135deg, #fff7ed 0%, #ffffff 55%, #dbeafe 100%)',
  borderRadius: radius.xl,
  boxShadow: shadow.lg,
  overflow: 'hidden',
  border: `1px solid rgba(148, 163, 184, 0.18)`,
  padding: space[10],
}

const eyebrowStyle = {
  color: colors.amber700,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: `${space[5]} 0 ${space[6]} 0`,
  color: colors.gray900,
  fontSize: isMobile ? type['2xl'] : type['3xl'],
  lineHeight: 1.05,
})

const subtitleStyle = {
  margin: 0,
  color: colors.gray600,
  fontSize: type.md,
  maxWidth: '700px',
  lineHeight: 1.6,
}

const cardsSectionStyle = {
  marginTop: space[8],
}

const getCardsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: space[7],
})

const cardButtonStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: `${space[7]} ${space[8]}`,
  borderLeft: `1px solid ${colors.gray200}`,
  borderRight: `1px solid ${colors.gray200}`,
  borderBottom: `1px solid ${colors.gray200}`,
  boxShadow: shadow.md,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[4],
  textAlign: 'left',
  cursor: 'pointer',
}

const moduleTagStyle = {
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const cardTitleStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type.xl,
}

const cardDescriptionStyle = {
  color: colors.gray500,
  fontSize: type.md,
  lineHeight: 1.55,
  flex: 1,
}

const cardLinkStyle = {
  fontWeight: type.black,
  fontSize: type.md,
}

export default ReportsHome
