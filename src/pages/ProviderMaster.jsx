import React, { useEffect, useState } from 'react'
import { providerService } from '../api/providerService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { useResponsive } from '../lib/useResponsive'

const ProviderMaster = () => {
  const [providers, setProviders] = useState([])
  const [formData, setFormData] = useState({ name: '', rfc: '', phone: '', email: '' })
  const { can } = useAuth()
  const { isMobile } = useResponsive()
  const canCreateProviders = can(PAGE_PERMISSION_MAP.providers, ACTION_KEYS.CREATE)

  const loadProviders = async () => {
    const data = await providerService.getProviders()
    setProviders(data || [])
  }

  useEffect(() => {
    let active = true

    providerService
      .getProviders()
      .then((data) => {
        if (active) {
          setProviders(data || [])
        }
      })
      .catch((error) => {
        console.error('Error al cargar proveedores:', error)
      })

    return () => {
      active = false
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canCreateProviders) return
    if (!formData.name || !formData.rfc) return alert('Nombre y RFC son obligatorios')

    try {
      await providerService.createProvider(formData)
      setFormData({ name: '', rfc: '', phone: '', email: '' })
      await loadProviders()
      alert('Proveedor registrado con exito')
    } catch (error) {
      console.error('Error al registrar proveedor:', error)
      alert(error?.message || 'Error al registrar')
    }
  }

  return (
    <div style={getContainerStyle(isMobile)}>
      <div style={headerStyle}>
        <h2 style={{ color: '#2d3748', margin: 0 }}>Maestro de Proveedores</h2>
        {!canCreateProviders && <span style={readOnlyBadgeStyle}>Solo lectura</span>}
      </div>

      {canCreateProviders && (
        <form onSubmit={handleSubmit} style={formCardStyle}>
          <div style={getGridStyle(isMobile)}>
            <input
              placeholder="Nombre del Proveedor *"
              style={inputStyle}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
            <input
              placeholder="RFC *"
              style={inputStyle}
              value={formData.rfc}
              onChange={(e) => setFormData({ ...formData, rfc: e.target.value })}
            />
            <input
              placeholder="Telefono"
              style={inputStyle}
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
            <input
              placeholder="Email"
              style={inputStyle}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>
          <button type="submit" style={btnSubmitStyle}>
            Registrar Proveedor
          </button>
        </form>
      )}

      <div style={tableWrapperStyle}>
        {isMobile ? (
          <div style={mobileCardsStyle}>
            {providers.map((provider) => (
              <article key={provider.id} style={mobileCardStyle}>
                <div style={mobileCardLabelStyle}>Proveedor</div>
                <div style={mobileCardTitleStyle}>{provider.name}</div>

                <div style={mobileCardGridStyle}>
                  <div style={mobileInfoBlockStyle}>
                    <div style={mobileCardLabelStyle}>RFC</div>
                    <div style={mobileInfoTextStyle}>{provider.rfc}</div>
                  </div>

                  <div style={mobileInfoBlockStyle}>
                    <div style={mobileCardLabelStyle}>Contacto</div>
                    <div style={mobileInfoTextStyle}>{provider.email || provider.phone || 'Sin datos'}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div style={tableScrollStyle}>
            <table style={tableStyle}>
              <thead>
                <tr style={{ backgroundColor: '#2d3748', color: 'white' }}>
                  <th style={thStyle}>Proveedor</th>
                  <th style={thStyle}>RFC</th>
                  <th style={thStyle}>Contacto</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider, index) => (
                  <tr
                    key={provider.id}
                    style={{
                      backgroundColor: index % 2 === 0 ? '#fff' : '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    <td style={tdStyle}>
                      <strong>{provider.name}</strong>
                    </td>
                    <td style={tdStyle}>{provider.rfc}</td>
                    <td style={tdStyle}>{provider.email || provider.phone || 'Sin datos'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const getContainerStyle = (isMobile) => ({
  padding: isMobile ? '16px' : '30px',
  backgroundColor: '#f7fafc',
  minHeight: '100vh',
})

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  marginBottom: '20px',
  flexWrap: 'wrap',
}

const formCardStyle = {
  backgroundColor: '#fff',
  padding: '20px',
  borderRadius: '12px',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  marginBottom: '30px',
}

const getGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
  gap: '15px',
  marginBottom: '15px',
})

const inputStyle = {
  padding: '10px',
  borderRadius: '6px',
  border: '1px solid #cbd5e0',
}

const btnSubmitStyle = {
  padding: '10px 20px',
  backgroundColor: '#3182ce',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  fontWeight: 'bold',
}

const tableWrapperStyle = {
  backgroundColor: '#fff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
  padding: '0',
}

const tableScrollStyle = {
  overflowX: 'auto',
}

const tableStyle = {
  width: '100%',
  minWidth: '680px',
  borderCollapse: 'collapse',
}

const thStyle = { padding: '15px', textAlign: 'left' }
const tdStyle = { padding: '12px 15px' }
const readOnlyBadgeStyle = {
  padding: '8px 12px',
  borderRadius: '999px',
  backgroundColor: '#edf2f7',
  color: '#4a5568',
  fontWeight: '700',
}

const mobileCardsStyle = {
  display: 'grid',
  gap: '12px',
  padding: '12px',
}

const mobileCardStyle = {
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  backgroundColor: '#f8fafc',
  padding: '14px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const mobileCardGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: '12px',
}

const mobileInfoBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const mobileCardLabelStyle = {
  color: '#64748b',
  fontSize: '0.78rem',
  fontWeight: '800',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const mobileCardTitleStyle = {
  color: '#0f172a',
  fontWeight: '900',
  fontSize: '1rem',
}

const mobileInfoTextStyle = {
  color: '#1e293b',
  fontWeight: '700',
}

export default ProviderMaster
