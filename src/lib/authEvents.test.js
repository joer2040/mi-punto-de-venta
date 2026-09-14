import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldReloadAccess } from './authEvents.js'

test('reloads access on first session (no previous user)', () => {
  assert.equal(shouldReloadAccess({ event: 'SIGNED_IN', previousUserId: null, nextUserId: 'u1' }), true)
})

test('skips reload when focus re-emits SIGNED_IN for the same user', () => {
  assert.equal(shouldReloadAccess({ event: 'SIGNED_IN', previousUserId: 'u1', nextUserId: 'u1' }), false)
})

test('skips reload on TOKEN_REFRESHED for the same user', () => {
  assert.equal(shouldReloadAccess({ event: 'TOKEN_REFRESHED', previousUserId: 'u1', nextUserId: 'u1' }), false)
})

test('reloads when the user changes', () => {
  assert.equal(shouldReloadAccess({ event: 'SIGNED_IN', previousUserId: 'u1', nextUserId: 'u2' }), true)
})

test('reloads on SIGNED_OUT', () => {
  assert.equal(shouldReloadAccess({ event: 'SIGNED_OUT', previousUserId: 'u1', nextUserId: null }), true)
})

test('reloads on USER_UPDATED even for the same user', () => {
  assert.equal(shouldReloadAccess({ event: 'USER_UPDATED', previousUserId: 'u1', nextUserId: 'u1' }), true)
})
