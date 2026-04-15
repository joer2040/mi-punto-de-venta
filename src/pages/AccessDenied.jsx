import React from 'react'

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
  padding: '24px',
}

const cardStyle = {
  maxWidth: '680px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '18px',
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
  padding: '28px',
  borderLeft: '6px solid #dc2626',
}

const titleStyle = {
  margin: '0 0 12px 0',
  color: '#7f1d1d',
}

const textStyle = {
  margin: 0,
  color: '#475569',
  lineHeight: 1.6,
}

export default AccessDenied
