import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { countOtherClients, decideUpdateAction, joinClientLock } from '../lib/pwaUpdate'
import { colors, radius, shadow, space, type } from '../lib/designTokens'

// A POS tablet stays open all day, so poll for a new build periodically and
// let staff choose when to reload instead of reloading mid-sale.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

// Activating the new worker reloads every tab, so with other tabs open the update
// waits for them to close or for an explicit "update all" confirmation.
const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      setInterval(() => {
        registration.update().catch(() => {})
      }, UPDATE_CHECK_INTERVAL_MS)
    },
  })
  const [status, setStatus] = useState('available')
  const [otherTabs, setOtherTabs] = useState(null)
  const updateInFlightRef = useRef(false)
  const reloadStartedRef = useRef(false)

  useEffect(() => joinClientLock(), [])

  // Safety net: any old tab reloads when the controller changes, even if it never
  // showed the banner, so no tab keeps running old JS under the new worker.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const handleControllerChange = () => {
      if (reloadStartedRef.current) return
      reloadStartedRef.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
  }, [])

  const startUpdate = async () => {
    if (updateInFlightRef.current) return
    updateInFlightRef.current = true
    setStatus('updating')
    try {
      await updateServiceWorker()
    } catch {
      updateInFlightRef.current = false
      setStatus('error')
    }
  }

  const checkTabsAndUpdate = async () => {
    if (updateInFlightRef.current) return
    setStatus('checking')
    let result = { supported: false, otherTabs: null }
    try {
      result = await countOtherClients()
    } catch {
      // Conservative: an unknown tab count blocks like an unsupported API.
    }
    setOtherTabs(result.otherTabs)
    if (decideUpdateAction({ otherTabs: result.otherTabs, locksSupported: result.supported }) === 'update') {
      await startUpdate()
    } else {
      setStatus('blocked')
    }
  }

  const confirmUpdateAll = () => {
    if (decideUpdateAction({ overrideConfirmed: true }) === 'update') startUpdate()
  }

  if (!needRefresh) return null

  const busy = status === 'checking' || status === 'updating'

  return (
    <div role="status" style={bannerStyle}>
      <div style={textBlockStyle}>
        {status === 'blocked' && otherTabs !== null ? (
          <>
            <strong style={titleStyle}>Hay {otherTabs} pestaña(s) más de La Carreta abiertas.</strong>
            <span style={textStyle}>Ciérralas o termina lo pendiente antes de actualizar.</span>
          </>
        ) : status === 'blocked' ? (
          <>
            <strong style={titleStyle}>No se puede comprobar si hay otras pestañas abiertas.</strong>
            <span style={textStyle}>
              Para evitar perder capturas sin guardar, puedes cerrar las demás pestañas de La Carreta o
              actualizar todas bajo tu confirmación.
            </span>
          </>
        ) : status === 'confirm' ? (
          <>
            <strong style={titleStyle}>Actualizar todas las pestañas</strong>
            <span style={textStyle}>
              Se recargarán todas las pestañas abiertas de La Carreta y se perderá cualquier captura no
              guardada en ellas.
            </span>
          </>
        ) : status === 'error' ? (
          <strong style={titleStyle}>No fue posible iniciar la actualización. Vuelve a intentarlo.</strong>
        ) : (
          <>
            <strong style={titleStyle}>Hay una nueva versión de La Carreta POS.</strong>
            <span style={textStyle}>Guarda o termina cualquier operación pendiente antes de actualizar.</span>
          </>
        )}
      </div>

      <div style={actionsStyle}>
        {status === 'blocked' && (
          <>
            <button type="button" style={secondaryButtonStyle} onClick={checkTabsAndUpdate}>
              Reintentar
            </button>
            <button type="button" style={buttonStyle} onClick={() => setStatus('confirm')}>
              Actualizar todas…
            </button>
          </>
        )}
        {status === 'confirm' && (
          <>
            <button type="button" style={secondaryButtonStyle} onClick={() => setStatus('blocked')}>
              Cancelar
            </button>
            <button type="button" style={buttonStyle} onClick={confirmUpdateAll}>
              Actualizar todas
            </button>
          </>
        )}
        {status === 'error' && (
          <button type="button" style={buttonStyle} onClick={checkTabsAndUpdate}>
            Reintentar
          </button>
        )}
        {(status === 'available' || busy) && (
          <button
            type="button"
            style={busy ? disabledButtonStyle : buttonStyle}
            onClick={checkTabsAndUpdate}
            disabled={busy}
          >
            {status === 'checking' ? 'Comprobando pestañas...' : status === 'updating' ? 'Actualizando...' : 'Actualizar'}
          </button>
        )}
      </div>
    </div>
  )
}

const bannerStyle = {
  position: 'fixed',
  left: space[8],
  right: space[8],
  bottom: space[8],
  zIndex: 1000,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[8],
  padding: `${space[4]} ${space[8]}`,
  background: colors.gray900,
  color: colors.white,
  borderRadius: radius.lg,
  boxShadow: shadow.lg,
}

const textBlockStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  flex: '1 1 260px',
  minWidth: 0,
}

const titleStyle = {
  fontSize: type.sm,
  fontWeight: 700,
}

const textStyle = {
  fontSize: type.sm,
  fontWeight: 400,
  color: colors.gray300,
}

const actionsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: space[4],
}

const buttonStyle = {
  padding: `${space[4]} ${space[8]}`,
  border: 'none',
  borderRadius: radius.md,
  background: colors.green500,
  color: colors.white,
  fontWeight: 700,
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  ...buttonStyle,
  background: 'transparent',
  border: `1px solid ${colors.gray400}`,
}

const disabledButtonStyle = {
  ...buttonStyle,
  background: colors.gray600,
  cursor: 'default',
}

export default UpdatePrompt
