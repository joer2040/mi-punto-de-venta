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

test('joinClientLock holds a shared lock until released (real Web Locks)', { skip: !globalThis.navigator?.locks }, async () => {
  const locks = globalThis.navigator.locks
  const releaseA = joinClientLock(locks)
  const releaseB = joinClientLock(locks)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 1 })
  releaseB()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 0 })
  releaseA()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(await countOtherClients(locks), { supported: true, otherTabs: 0 })
})
