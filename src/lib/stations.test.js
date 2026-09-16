import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDirectSaleStation, partitionStations } from './stations.js'

// isDirectSaleStation

test('isDirectSaleStation returns true for exact match', () => {
  assert.equal(isDirectSaleStation({ number: 'Venta Directa' }), true)
})

test('isDirectSaleStation is case-insensitive', () => {
  assert.equal(isDirectSaleStation({ number: 'venta directa' }), true)
  assert.equal(isDirectSaleStation({ number: 'VENTA DIRECTA' }), true)
})

test('isDirectSaleStation is accent-insensitive', () => {
  assert.equal(isDirectSaleStation({ number: 'Vénta Dirécta' }), true)
})

test('isDirectSaleStation returns false for bars and tables', () => {
  assert.equal(isDirectSaleStation({ number: 'Barra 1' }), false)
  assert.equal(isDirectSaleStation({ number: 'Mesa 5' }), false)
})

test('isDirectSaleStation returns false for null/undefined', () => {
  assert.equal(isDirectSaleStation(null), false)
  assert.equal(isDirectSaleStation({}), false)
})

// partitionStations

test('partitionStations splits into direct, bars, dining', () => {
  const tables = [
    { id: '1', number: 'Venta Directa' },
    { id: '2', number: 'Barra 1' },
    { id: '3', number: 'Barra 2' },
    { id: '4', number: 'Mesa 1' },
    { id: '5', number: 'Mesa 2' },
  ]
  const { direct, bars, dining } = partitionStations(tables)
  assert.deepEqual(direct.map((t) => t.id), ['1'])
  assert.deepEqual(bars.map((t) => t.id), ['2', '3'])
  assert.deepEqual(dining.map((t) => t.id), ['4', '5'])
})

test('partitionStations excludes direct from bars and dining', () => {
  const tables = [{ id: '1', number: 'Venta Directa' }, { id: '2', number: 'Barra 1' }]
  const { bars, dining } = partitionStations(tables)
  assert.equal(bars.length, 1)
  assert.equal(dining.length, 0)
})

test('partitionStations handles empty array', () => {
  const { direct, bars, dining } = partitionStations([])
  assert.deepEqual(direct, [])
  assert.deepEqual(bars, [])
  assert.deepEqual(dining, [])
})
