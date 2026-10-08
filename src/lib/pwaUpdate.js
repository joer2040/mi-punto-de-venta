// PWA-UPDATE-01.2: registro de pestañas con Web Locks. Cada pestaña mantiene un lock
// compartido mientras vive; el navegador lo libera al cerrar, navegar o fallar la pestaña.
export const CLIENT_LOCK_NAME = 'la-carreta-client'

const getLocks = () => (typeof navigator === 'undefined' ? undefined : navigator.locks)

// Devuelve la función de liberación. Sin Web Locks no hay nada que liberar.
export const joinClientLock = (locks = getLocks()) => {
  if (!locks?.request) return () => {}
  let release = () => {}
  const held = new Promise((resolve) => {
    release = resolve
  })
  locks.request(CLIENT_LOCK_NAME, { mode: 'shared' }, () => held).catch(() => {})
  return () => release()
}

export const otherClientsFromHeld = (heldCount) => Math.max(heldCount - 1, 0)

// Sin Web Locks no se asume una sola pestaña: otherTabs = null.
export const countOtherClients = async (locks = getLocks()) => {
  if (!locks?.query) return { supported: false, otherTabs: null }
  const { held = [] } = await locks.query()
  const heldCount = held.filter((lock) => lock.name === CLIENT_LOCK_NAME && lock.mode === 'shared').length
  return { supported: true, otherTabs: otherClientsFromHeld(heldCount) }
}

// Activar el worker nuevo recarga todas las pestañas: solo sin otras pestañas o con
// confirmación explícita del usuario.
export const decideUpdateAction = ({ otherTabs, locksSupported, overrideConfirmed = false }) =>
  overrideConfirmed || (locksSupported && otherTabs === 0) ? 'update' : 'blocked'
