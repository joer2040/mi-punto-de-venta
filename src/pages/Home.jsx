import React from 'react'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'
import { useResponsive } from '../lib/useResponsive'

const sections = [
  {
    id: 'master',
    label: 'Maestro de Materiales',
    description: 'Administra materiales, categorias, unidades y precios base.',
    accent: '#1d4ed8',
  },
  {
    id: 'providers',
    label: 'Proveedores',
    description: 'Consulta y registra la informacion general de tus proveedores.',
    accent: '#7c3aed',
  },
  {
    id: 'purchases',
    label: 'Entrada por Compra',
    description: 'Captura facturas, costos y entradas al inventario.',
    accent: '#0f766e',
  },
  {
    id: 'reports',
    label: 'Reportes',
    description: 'Accede a existencias, compras y ventas desde un solo lugar.',
    accent: '#b45309',
  },
  {
    id: 'pos',
    label: 'Punto de Venta',
    description: 'Opera mesas, cuentas activas y el cierre de ventas.',
    accent: '#be123c',
  },
]

const Home = ({ onNavigate }) => {
  const { isMobile, isTablet } = useResponsive()

  return (
    <div style={getPageStyle(isMobile)}>
      <section style={heroStyle}>
        <div style={getHeroContentStyle(isTablet)}>
          <div style={heroTextBlockStyle}>
            <div style={eyebrowStyle}>LA CARRETA</div>
            <h1 style={getTitleStyle(isMobile)}>Inicio</h1>
            <p style={getSubtitleStyle(isMobile)}>
              Esta pantalla queda como punto principal del sistema. Desde aqui puedes entrar rapido a cada modulo y volver despues cuando lo necesites.
            </p>
          </div>

          <div style={getLogoWrapStyle(isTablet)}>
            <img src={logoCarreta} alt="La Carreta" style={getLogoStyle(isMobile)} />
          </div>
        </div>
      </section>

      <section style={cardsSectionStyle}>
        <div style={getCardsGridStyle(isMobile)}>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => onNavigate(section.id)}
              style={{
                ...cardButtonStyle,
                borderTop: `5px solid ${section.accent}`,
              }}
              type="button"
            >
              <div style={{ color: section.accent, fontWeight: '800', fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Modulo
              </div>
              <div style={cardTitleStyle}>{section.label}</div>
              <div style={cardDescriptionStyle}>{section.description}</div>
              <div style={{ ...cardLinkStyle, color: section.accent }}>Entrar</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

const getPageStyle = (isMobile) => ({
  padding: isMobile ? '16px' : '28px',
})

const heroStyle = {
  background: 'linear-gradient(135deg, #f8fafc 0%, #ffffff 55%, #dbeafe 100%)',
  borderRadius: '28px',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
  overflow: 'hidden',
  border: '1px solid rgba(148, 163, 184, 0.18)',
}

const getHeroContentStyle = (isTablet) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) 340px',
  alignItems: 'center',
  gap: '20px',
  padding: isTablet ? '22px' : '34px',
})

const heroTextBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const eyebrowStyle = {
  color: '#1d4ed8',
  fontWeight: '800',
  fontSize: '0.82rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: 0,
  color: '#0f172a',
  fontSize: isMobile ? '2rem' : '3rem',
  lineHeight: 1.05,
})

const getSubtitleStyle = (isMobile) => ({
  margin: 0,
  color: '#475569',
  fontSize: isMobile ? '1rem' : '1.08rem',
  maxWidth: '620px',
  lineHeight: 1.6,
})

const getLogoWrapStyle = (isTablet) => ({
  display: 'flex',
  justifyContent: isTablet ? 'center' : 'flex-end',
  alignItems: 'flex-start',
})

const getLogoStyle = (isMobile) => ({
  width: '100%',
  maxWidth: isMobile ? '240px' : '320px',
  height: 'auto',
  objectFit: 'contain',
})

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

export default Home
