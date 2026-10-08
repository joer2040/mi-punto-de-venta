import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLIENT_LOCK_NAME, countOtherClients, decideUpdateAction, joinClientLock, otherClientsFromHeld } from './pwaUpdate.js'

test('decideUpdateAction updates only when this is the single tab', () => {
  assert.equal(decideUpdateAction({ otherTabs: 0, locksSupported: true }), 'update')
  assert.equal(decideUpdateAction({ otherTabs: 1, locksSupported: true }), 'blocked')
  assert.equal(decideUpdateAction({ otherTabs: 3, locksSupported: true }), 'blocked')
})

test('decideUpdateAction blocks when tabs cannot be counted', () => {
  assert.equal(decideUpdateAction({ otherTabs: null, locksSupported: false }), 'blocked')
  assert.equal(decideUpdateAction({ otherTabs: 0, locksSupported: false }), 'blocked')
})

test('decideUpdateAction allows an explicitly confirmed global update', () => {
  assert.equal(decideUpdateAction({ otherTabs: 3, locksSupported: true, overrideConfirmed: true }), 'update')
  assert.equal(decideUpdateAction({ otherTabs: null, locksSupported: false, overrideConfirmed: true }), 'update')
})

test('otherClientsFromHeld excludes the current tab', () => {
  assert.equal(otherClientsFromHeld(0), 0)
  assert.equal(otherClientsFromHeld(1), 0)
  assert.equal(otherClientsFromHeld(2), 1)
})

test('countOtherClients reports unsupported without Web Locks', async () => {
  assert.deepEqual(await countOtherClients(null), { supported: false, otherTabs: null })
})

test('countOtherClients counts only shared la-carreta-client locks', async () => {
  const locks = {
    query: async () => ({
      held: [
        { name: CLIENT_LOCK_NAME, mode: 'shared' },
        { name: CLIENT_LOCK_NAME, mode: 'shared' },
        { name: CLIENT_LOCK_NAME, mode: 'exclusive' },
        { name: 'other-lock', mode: 'shared' },
      ],
    }),
  }
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 1 })
})

test('countOtherClients counts a pending lock from another tab', async () => {
  const locks = {
    query: async () => ({
      held: [{ name: CLIENT_LOCK_NAME, mode: 'shared' }],
      pending: [{ name: CLIENT_LOCK_NAME, mode: 'shared' }],
    }),
  }
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 1 })
})

test('countOtherClients counts only matching shared locks across held and pending', async () => {
  const locks = {
    query: async () => ({
      held: [
        { name: CLIENT_LOCK_NAME, mode: 'shared' },
        { name: CLIENT_LOCK_NAME, mode: 'shared' },
      ],
      pending: [
        { name: CLIENT_LOCK_NAME, mode: 'shared' },
        { name: CLIENT_LOCK_NAME, mode: 'exclusive' },
        { name: 'other-lock', mode: 'shared' },
      ],
    }),
  }
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 2 })
})

test('joinClientLock without Web Locks is unsupported, not ready and safe to release', async () => {
  const handle = joinClientLock(null)
  assert.equal(handle.supported, false)
  assert.equal(await handle.ready, false)
  assert.doesNotThrow(() => handle.release())
})

test('joinClientLock ready resolves false when the lock request fails', async () => {
  const handle = joinClientLock({ request: () => Promise.reject(new Error('denied')) })
  assert.equal(handle.supported, true)
  assert.equal(await handle.ready, false)
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test('joinClientLock holds a shared lock until released (real Web Locks)', { skip: !globalThis.navigator?.locks }, async () => {
  const locks = globalThis.navigator.locks
  const handleA = joinClientLock(locks)
  assert.equal(await handleA.ready, true)
  const handleB = joinClientLock(locks)
  assert.equal(await handleB.ready, true)
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 1 })
  handleB.release()
  await settle()
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 0 })
  handleA.release()
  await settle()
  const { held, pending } = await locks.query()
  assert.equal([...held, ...pending].filter((lock) => lock.name === CLIENT_LOCK_NAME).length, 0)
})

test('joinClientLock released before grant leaves no lock behind (real Web Locks)', { skip: !globalThis.navigator?.locks }, async () => {
  const locks = globalThis.navigator.locks
  const handle = joinClientLock(locks)
  handle.release()
  assert.equal(await handle.ready, true)
  await settle()
  const { held, pending } = await locks.query()
  assert.equal([...held, ...pending].filter((lock) => lock.name === CLIENT_LOCK_NAME).length, 0)
})
