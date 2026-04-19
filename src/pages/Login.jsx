import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import logoCarreta from '../assets/la_carreta_sin_fondo.png'

const Login = () => {
  const { signIn } = useAuth()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setErrorMessage('')

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
  padding: '24px',
  background: 'linear-gradient(135deg, #e2e8f0 0%, #f8fafc 45%, #dbeafe 100%)',
}

const cardStyle = {
  width: '100%',
  maxWidth: '440px',
  backgroundColor: '#ffffff',
  borderRadius: '24px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.14)',
  overflow: 'hidden',
}

const heroStyle = {
  padding: '28px 28px 16px',
  textAlign: 'center',
}

const logoStyle = {
  width: '180px',
  height: 'auto',
  objectFit: 'contain',
}

const titleStyle = {
  margin: '16px 0 8px',
  color: '#0f172a',
  fontSize: '1.8rem',
}

const subtitleStyle = {
  margin: 0,
  color: '#64748b',
  lineHeight: 1.5,
}

const formStyle = {
  display: 'grid',
  gap: '16px',
  padding: '16px 28px 28px',
}

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  color: '#334155',
  fontWeight: '700',
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  boxSizing: 'border-box',
}

const buttonStyle = {
  width: '100%',
  padding: '13px 16px',
  borderRadius: '12px',
  border: 'none',
  backgroundColor: '#1d4ed8',
  color: '#ffffff',
  fontWeight: '800',
  cursor: 'pointer',
}

const errorStyle = {
  backgroundColor: '#fef2f2',
  color: '#b91c1c',
  borderRadius: '10px',
  padding: '10px 12px',
  fontWeight: '600',
}

export default Login
