import React from 'react'
import { useAuth } from '../contexts/AuthContext'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

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
    id: 'cash-control',
    label: 'Control y corte de caja',
    description: 'Abre caja, monitorea efectivo esperado y genera el corte final en PDF.',
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

const Home = ({ onNavigate, isCashSessionOpen = false, cashStatusLoading = true }) => {
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
          {visibleSections.map((section) => {
            const isPosBlocked = section.id === 'pos' && (cashStatusLoading || !isCashSessionOpen)

            return (
            <button
              key={section.id}
              onClick={() => onNavigate(section.id)}
              disabled={isPosBlocked}
              title={isPosBlocked ? 'Abre caja para ingresar a Mesas y Barras.' : undefined}
              style={{
                ...cardButtonStyle,
                borderTop: `6px solid ${section.accent}`,
                ...(isPosBlocked ? disabledCardButtonStyle : null),
              }}
              type="button"
            >
              <div style={{ color: section.accent, ...moduleTagStyle }}>
                {isPosBlocked ? (cashStatusLoading ? 'Validando caja' : 'Caja cerrada') : 'Modulo'}
              </div>
              <div style={cardTitleStyle}>{section.label}</div>
              <div style={cardDescriptionStyle}>
                {isPosBlocked ? 'Debes abrir caja antes de ingresar al menu de Mesas y Barras.' : section.description}
              </div>
              <div style={{ ...cardLinkStyle, color: section.accent }}>
                {isPosBlocked ? 'Acceso bloqueado' : 'Entrar'}
              </div>
            </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}

const getPageStyle = (isMobile) => ({
  padding: isMobile ? space[6] : `${space[8]} ${space[10]} ${space[10]}`,
})

const heroStyle = {
  background: 'linear-gradient(90deg, #ffffff 0%, #ffffff 44%, #dcebff 100%)',
  borderRadius: radius.xl,
  boxShadow: shadow.lg,
  overflow: 'hidden',
  border: '1px solid rgba(191, 219, 254, 0.95)',
}

const getHeroContentStyle = (isTablet) => ({
  display: 'grid',
  gridTemplateColumns: isTablet ? '1fr' : 'minmax(0, 1fr) 320px',
  alignItems: 'center',
  gap: isTablet ? space[9] : space[10],
  padding: isTablet ? space[8] : `${space[12]} ${space[12]} ${space[10]}`,
})

const heroTextBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
}

const eyebrowStyle = {
  color: colors.blue700,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: 0,
  color: colors.gray900,
  fontSize: isMobile ? type['3xl'] : type['4xl'],
  lineHeight: 1,
  fontWeight: type.black,
})

const getSubtitleStyle = (isMobile) => ({
  margin: 0,
  color: colors.gray800,
  fontSize: isMobile ? type.md : type.lg,
  maxWidth: '760px',
  lineHeight: 1.65,
})

const getMetaRowStyle = (isMobile) => ({
  display: 'flex',
  gap: space[6],
  flexWrap: 'wrap',
  alignItems: 'center',
  marginTop: isMobile ? space[2] : space[4],
})

const userBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: `${space[3]} ${space[7]}`,
  borderRadius: radius.full,
  background: colors.white,
  border: `1px solid ${colors.blue100}`,
  color: colors.gray800,
  fontWeight: type.black,
  boxShadow: shadow.sm,
}

const signOutButtonStyle = {
  border: '1px solid #fca5a5',
  background: colors.white,
  color: colors.red700,
  fontWeight: type.black,
  borderRadius: radius.full,
  padding: `${space[3]} ${space[7]}`,
  cursor: 'pointer',
}

const getLogoWrapStyle = (isTablet) => ({
  display: 'flex',
  justifyContent: isTablet ? 'center' : 'flex-end',
  alignItems: 'center',
})

const getLogoStyle = (isMobile) => ({
  width: '100%',
  maxWidth: isMobile ? '200px' : '280px',
  height: 'auto',
  objectFit: 'contain',
})

const cardsSectionStyle = {
  marginTop: space[9],
}

const getCardsGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: space[7],
})

const cardButtonStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: `${space[8]} ${space[8]} ${space[7]}`,
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
  minHeight: '200px',
}

const disabledCardButtonStyle = {
  opacity: 0.62,
  cursor: 'not-allowed',
  boxShadow: shadow.sm,
}

const moduleTagStyle = {
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
}

const cardTitleStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type['2xl'],
  lineHeight: 1.25,
}

const cardDescriptionStyle = {
  color: colors.gray700,
  fontSize: type.md,
  lineHeight: 1.65,
  flex: 1,
}

const cardLinkStyle = {
  fontWeight: type.black,
  fontSize: type.md,
}

export default Home
