import React from 'react'
import { useAuth } from '../contexts/AuthContext'
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
    id: 'movements',
    label: 'Movimiento de Materiales',
    description: 'Registra entradas y salidas controladas de inventario con verificacion previa.',
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
  {
    id: 'security',
    label: 'Usuarios',
    description: 'Administra cuentas del sistema y asigna si cada usuario es manager o mesero.',
    accent: '#0f172a',
  },
]

const Home = ({ onNavigate }) => {
  const { isMobile, isTablet } = useResponsive()
  const { canAccessPage, profile, signOut } = useAuth()
  const visibleSections = sections.filter((section) => canAccessPage(section.id))

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Error al cerrar sesion:', error)
      window.alert('No se pudo cerrar sesion.')
    }
  }

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

            <div style={getMetaRowStyle(isMobile)}>
              <span style={userBadgeStyle}>{profile?.full_name || profile?.username || 'Usuario activo'}</span>
              <button type="button" onClick={handleSignOut} style={signOutButtonStyle}>
                Cerrar sesion
              </button>
            </div>
          </div>

          <div style={getLogoWrapStyle(isTablet)}>
            <img src={logoCarreta} alt="La Carreta" style={getLogoStyle(isMobile)} />
          </div>
        </div>
      </section>

      <section style={cardsSectionStyle}>
        <div style={getCardsGridStyle(isMobile)}>
          {visibleSections.map((section) => (
            <button
              key={section.id}
              onClick={() => onNavigate(section.id)}
              style={{
                ...cardButtonStyle,
                borderTop: `6px solid ${section.accent}`,
              }}
              type="button"
            >
              <div style={{ color: section.accent, ...moduleTagStyle }}>Modulo</div>
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
  padding: isMobile ? '16px' : '28px 30px 40px',
})

const heroStyle = {
  background: 'linear-gradient(90deg, #ffffff 0%, #ffffff 44%, #dcebff 100%)',
  borderRadius: '32px',
  boxShadow: '0 18px 50px rgba(15, 23, 42, 0.09)',
  overflow: 'hidden',
  border: '1px solid rgba(191, 219, 254, 0.95)',
}

const getHeroContentStyle = (isTablet) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) 380px',
  alignItems: 'center',
  gap: isTablet ? '18px' : '30px',
  padding: isTablet ? '24px' : '42px 42px 38px',
})

const heroTextBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
}

const eyebrowStyle = {
  color: '#1d4ed8',
  fontWeight: '900',
  fontSize: '0.85rem',
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: 0,
  color: '#0f172a',
  fontSize: isMobile ? '2.6rem' : '4rem',
  lineHeight: 1,
  fontWeight: '900',
})

const getSubtitleStyle = (isMobile) => ({
  margin: 0,
  color: '#1e3a5f',
  fontSize: isMobile ? '1.02rem' : '1.1rem',
  maxWidth: '760px',
  lineHeight: 1.7,
})

const getMetaRowStyle = (isMobile) => ({
  display: 'flex',
  gap: '14px',
  flexWrap: 'wrap',
  alignItems: 'center',
  marginTop: isMobile ? '4px' : '8px',
})

const userBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: '999px',
  background: '#ffffff',
  border: '1px solid #bfdbfe',
  color: '#1e3a5f',
  fontWeight: 800,
  boxShadow: '0 10px 24px rgba(59, 130, 246, 0.08)',
}

const signOutButtonStyle = {
  border: '1px solid #fca5a5',
  background: '#ffffff',
  color: '#b91c1c',
  fontWeight: 800,
  borderRadius: '999px',
  padding: '12px 18px',
  cursor: 'pointer',
}

const getLogoWrapStyle = (isTablet) => ({
  display: 'flex',
  justifyContent: isTablet ? 'center' : 'flex-end',
  alignItems: 'center',
})

const getLogoStyle = (isMobile) => ({
  width: '100%',
  maxWidth: isMobile ? '240px' : '340px',
  height: 'auto',
  objectFit: 'contain',
})

const cardsSectionStyle = {
  marginTop: '28px',
}

const getCardsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: '22px',
})

const cardButtonStyle = {
  backgroundColor: '#ffffff',
  borderRadius: '26px',
  padding: '26px 26px 24px',
  borderLeft: '1px solid #dbe4f0',
  borderRight: '1px solid #dbe4f0',
  borderBottom: '1px solid #dbe4f0',
  boxShadow: '0 16px 40px rgba(15, 23, 42, 0.07)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '12px',
  textAlign: 'left',
  cursor: 'pointer',
  minHeight: '280px',
}

const moduleTagStyle = {
  fontWeight: '900',
  fontSize: '0.82rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const cardTitleStyle = {
  color: '#0f172a',
  fontWeight: '900',
  fontSize: '1.42rem',
  lineHeight: 1.25,
}

const cardDescriptionStyle = {
  color: '#314e72',
  fontSize: '0.98rem',
  lineHeight: 1.65,
  flex: 1,
}

const cardLinkStyle = {
  fontWeight: '900',
  fontSize: '0.96rem',
}

export default Home
