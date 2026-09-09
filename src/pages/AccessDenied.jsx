import { colors, space, radius, shadow } from '../lib/designTokens'

const AccessDenied = () => (
  <div style={pageStyle}>
    <div style={cardStyle}>
      <h2 style={titleStyle}>Acceso restringido</h2>
      <p style={textStyle}>
        Tu cuenta no tiene permisos para acceder a esta seccion. Si necesitas este acceso,
        solicita autorizacion a un administrador.
      </p>
    </div>
  </div>
)

const pageStyle = {
  padding: space[8],
}

const cardStyle = {
  maxWidth: '680px',
  margin: '0 auto',
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  boxShadow: shadow.md,
  padding: space[10],
  borderLeft: `6px solid ${colors.red600}`,
}

const titleStyle = {
  margin: `0 0 ${space[6]} 0`,
  color: '#7f1d1d',
}

const textStyle = {
  margin: 0,
  color: colors.gray600,
  lineHeight: 1.6,
}

export default AccessDenied
