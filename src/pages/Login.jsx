import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

const SESSION_EXPIRED_MESSAGE_KEY = 'mi-punto-de-venta.session-expired-message'

const Login = () => {
  const { signIn } = useAuth()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState(() => {
    if (typeof window === 'undefined') return ''

    const message = sessionStorage.getItem(SESSION_EXPIRED_MESSAGE_KEY) || ''
    if (message) {
      sessionStorage.removeItem(SESSION_EXPIRED_MESSAGE_KEY)
    }
    return message
  })

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrorMessage('')
    setNoticeMessage('')

    try {
      await signIn(formData.username, formData.password)
    } catch (error) {
      console.error('Error al iniciar sesion:', error)
      setErrorMessage(error.message || 'No se pudo iniciar sesion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={heroStyle}>
          <img src={logoCarreta} alt="La Carreta" style={logoStyle} />
          <h1 style={titleStyle}>Acceso al sistema</h1>
          <p style={subtitleStyle}>
            Inicia sesion con tu usuario asignado para acceder a los modulos autorizados.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={formStyle}>
          <div>
            <label htmlFor="login-username" style={labelStyle}>Usuario</label>
            <input
              id="login-username"
              type="text"
              value={formData.username}
              onChange={(event) => setFormData((prev) => ({ ...prev, username: event.target.value }))}
              style={inputStyle}
              placeholder="usuario"
              autoCapitalize="none"
              autoCorrect="off"
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" style={labelStyle}>Contrasena</label>
            <input
              id="login-password"
              type="password"
              value={formData.password}
              onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
              style={inputStyle}
              placeholder="**********"
              required
            />
          </div>

          {noticeMessage && <div style={noticeStyle}>{noticeMessage}</div>}
          {errorMessage && <div style={errorStyle}>{errorMessage}</div>}

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? 'Entrando...' : 'Iniciar sesion'}
          </button>
        </form>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: space[12],
  background: 'linear-gradient(135deg, #e2e8f0 0%, #f8fafc 45%, #dbeafe 100%)',
}

const cardStyle = {
  width: '100%',
  maxWidth: '400px',
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  boxShadow: shadow.lg,
  overflow: 'hidden',
}

const heroStyle = {
  padding: `${space[10]} ${space[10]} ${space[6]}`,
  textAlign: 'center',
}

const logoStyle = {
  width: '140px',
  height: 'auto',
  objectFit: 'contain',
}

const titleStyle = {
  margin: `${space[4]} 0 ${space[3]}`,
  color: colors.gray900,
  fontSize: type.xl,
}

const subtitleStyle = {
  margin: 0,
  color: colors.gray500,
  lineHeight: 1.5,
  fontSize: type.sm,
}

const formStyle = {
  display: 'grid',
  gap: space[6],
  padding: `${space[6]} ${space[10]} ${space[10]}`,
}

const labelStyle = {
  display: 'block',
  marginBottom: space[2],
  color: colors.gray700,
  fontWeight: type.bold,
  fontSize: type.sm,
}

const inputStyle = {
  width: '100%',
  padding: `${space[4]} ${space[5]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  boxSizing: 'border-box',
}

const buttonStyle = {
  width: '100%',
  padding: `${space[4]} ${space[8]}`,
  borderRadius: radius.md,
  border: 'none',
  backgroundColor: colors.blue700,
  color: colors.white,
  fontWeight: type.black,
  cursor: 'pointer',
}

const errorStyle = {
  backgroundColor: colors.red50,
  color: colors.red700,
  borderRadius: radius.md,
  padding: `${space[5]} ${space[6]}`,
  fontWeight: type.medium,
}

const noticeStyle = {
  backgroundColor: colors.blue50,
  color: colors.blue700,
  borderRadius: radius.md,
  padding: `${space[5]} ${space[6]}`,
  fontWeight: type.medium,
}

export default Login
