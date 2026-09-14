import { useRegisterSW } from 'virtual:pwa-register/react'
import { colors, radius, shadow, space, type } from '../lib/designTokens'

// A POS tablet stays open all day, so poll for a new build periodically and
// let staff choose when to reload instead of reloading mid-sale.
const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000

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

  if (!needRefresh) return null

  return (
    <div role="status" style={bannerStyle}>
      <span style={textStyle}>Hay una nueva version de La Carreta POS.</span>
      <button type="button" style={buttonStyle} onClick={() => updateServiceWorker(true)}>
        Actualizar
      </button>
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
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[8],
  padding: `${space[4]} ${space[8]}`,
  background: colors.gray900,
  color: colors.white,
  borderRadius: radius.lg,
  boxShadow: shadow.lg,
}

const textStyle = {
  fontSize: type.sm,
  fontWeight: 600,
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

export default UpdatePrompt
