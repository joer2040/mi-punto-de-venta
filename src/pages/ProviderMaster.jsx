import React, { useEffect, useState } from 'react'
import { providerService } from '../api/providerService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

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
        <h2 style={{ color: colors.gray800, margin: 0, fontSize: type['3xl'] }}>Maestro de Proveedores</h2>
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
                <tr style={{ backgroundColor: '#2d3748', color: colors.white }}>
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
  padding: isMobile ? space[6] : `${space[8]} ${space[10]}`,
  backgroundColor: colors.gray100,
  minHeight: '100vh',
})

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: space[6],
  marginBottom: space[8],
  flexWrap: 'wrap',
}

const formCardStyle = {
  backgroundColor: colors.white,
  padding: space[8],
  borderRadius: radius.lg,
  boxShadow: shadow.sm,
  marginBottom: space[8],
}

const getGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
  gap: space[7],
  marginBottom: space[6],
})

const inputStyle = {
  padding: `${space[4]} ${space[5]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
}

const btnSubmitStyle = {
  padding: `${space[4]} ${space[10]}`,
  backgroundColor: colors.blue600,
  color: colors.white,
  border: 'none',
  borderRadius: radius.md,
  cursor: 'pointer',
  fontWeight: type.bold,
}

const tableWrapperStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  overflow: 'hidden',
  boxShadow: shadow.sm,
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

const thStyle = { padding: '10px 12px', textAlign: 'left' }
const tdStyle = { padding: '8px 12px' }
const readOnlyBadgeStyle = {
  padding: `${space[1]} ${space[6]}`,
  borderRadius: radius.full,
  backgroundColor: colors.gray150,
  color: colors.gray600,
  fontWeight: type.bold,
}

const mobileCardsStyle = {
  display: 'grid',
  gap: space[5],
  padding: space[6],
}

const mobileCardStyle = {
  borderRadius: radius.xl,
  border: `1px solid ${colors.gray200}`,
  backgroundColor: colors.gray100,
  padding: space[6],
  display: 'flex',
  flexDirection: 'column',
  gap: space[5],
}

const mobileCardGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: space[5],
}

const mobileInfoBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[1],
}

const mobileCardLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  fontWeight: type.black,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const mobileCardTitleStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type.md,
}

const mobileInfoTextStyle = {
  color: colors.gray800,
  fontWeight: type.bold,
}

export default ProviderMaster
