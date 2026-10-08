// PWA-UPDATE-01.2: registro de pestañas con Web Locks. Cada pestaña mantiene un lock
// compartido mientras vive; el navegador lo libera al cerrar, navegar o fallar la pestaña.
export const CLIENT_LOCK_NAME = 'la-carreta-client'

const getLocks = () => (typeof navigator === 'undefined' ? undefined : navigator.locks)

// Devuelve { supported, ready, release }. ready resuelve true solo cuando esta pestaña
// ya tiene su lock concedido; false si no hay Web Locks o la petición falla.
// release es seguro antes de la concesión: el callback devolverá una promesa ya resuelta.
export const joinClientLock = (locks = getLocks()) => {
  if (!locks?.request) return { supported: false, ready: Promise.resolve(false), release: () => {} }
  let release = () => {}
  const held = new Promise((resolve) => {
    release = resolve
  })
  let settleReady = () => {}
  const ready = new Promise((resolve) => {
    settleReady = resolve
  })
  locks
    .request(CLIENT_LOCK_NAME, { mode: 'shared' }, () => {
      settleReady(true)
      return held
    })
    .catch(() => settleReady(false))
  return { supported: true, ready, release: () => release() }
}

export const otherClientsFromHeld = (heldCount) => Math.max(heldCount - 1, 0)

// Sin Web Locks no se asume una sola pestaña: otherTabs = null.
// Cuenta held + pending: una pestaña recién abierta puede seguir en pending. Restar 1
// es válido solo si el lock de esta pestaña ya fue concedido (joinClientLock().ready).
export const countOtherClients = async (locks = getLocks()) => {
  if (!locks?.query) return { supported: false, otherTabs: null }
  const { held = [], pending = [] } = await locks.query()
  const clientCount = [...held, ...pending].filter(
    (lock) => lock.name === CLIENT_LOCK_NAME && lock.mode === 'shared',
  ).length
  return { supported: true, otherTabs: otherClientsFromHeld(clientCount) }
}

// Activar el worker nuevo recarga todas las pestañas: solo sin otras pestañas o con
// confirmación explícita del usuario.
export const decideUpdateAction = ({ otherTabs, locksSupported, overrideConfirmed = false }) =>
  overrideConfirmed || (locksSupported && otherTabs === 0) ? 'update' : 'blocked'
