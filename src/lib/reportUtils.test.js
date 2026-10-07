import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toEndOfDayUtc } from './reportUtils.js'

test('toEndOfDayUtc maps a cut-off date to its last UTC instant', () => {
  assert.equal(toEndOfDayUtc('2026-10-01'), '2026-10-01T23:59:59.999Z')
})

test('toEndOfDayUtc maps an empty cut-off date to null (current balance)', () => {
  assert.equal(toEndOfDayUtc(''), null)
  assert.equal(toEndOfDayUtc(null), null)
})
