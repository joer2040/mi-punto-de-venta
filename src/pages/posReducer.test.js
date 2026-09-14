import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInitialPosState, posReducer } from './posReducer.js'

const cerveza = { material_id: 'm1', name: 'Cerveza', unit_price: 35, is_inventoried: true }
const clamato = { material_id: 'm2', name: 'Clamato', unit_price: 60, is_inventoried: false }

test('add_cart_item appends a new item with quantity 1', () => {
  const state = posReducer(createInitialPosState(), { type: 'add_cart_item', item: cerveza })

  assert.deepEqual(state.cart, [{ ...cerveza, quantity: 1 }])
})

test('add_cart_item twice for same material increments quantity instead of duplicating', () => {
  let state = posReducer(createInitialPosState(), { type: 'add_cart_item', item: cerveza })
  state = posReducer(state, { type: 'add_cart_item', item: cerveza })

  assert.deepEqual(state.cart, [{ ...cerveza, quantity: 2 }])
})

test('add_cart_item keeps every previously added item (rapid taps regression)', () => {
  let state = posReducer(createInitialPosState(), { type: 'add_cart_item', item: cerveza })
  state = posReducer(state, { type: 'add_cart_item', item: clamato })

  assert.deepEqual(state.cart.map((c) => c.material_id), ['m1', 'm2'])
})

test('add_cart_item does not merge into a bundle line of the same material', () => {
  const bundleLine = { ...cerveza, quantity: 1, bundle_id: 'b1' }
  const state = posReducer(
    { ...createInitialPosState(), cart: [bundleLine] },
    { type: 'add_cart_item', item: cerveza }
  )

  assert.deepEqual(state.cart, [bundleLine, { ...cerveza, quantity: 1 }])
})

test('change_cart_quantity adjusts quantity of a non-bundle line', () => {
  const start = { ...createInitialPosState(), cart: [{ ...cerveza, quantity: 2 }] }
  const state = posReducer(start, { type: 'change_cart_quantity', materialId: 'm1', delta: 1 })

  assert.equal(state.cart[0].quantity, 3)
})

test('change_cart_quantity removes the line when quantity reaches zero', () => {
  const start = { ...createInitialPosState(), cart: [{ ...cerveza, quantity: 1 }] }
  const state = posReducer(start, { type: 'change_cart_quantity', materialId: 'm1', delta: -1 })

  assert.deepEqual(state.cart, [])
})

test('change_cart_quantity leaves bundle lines untouched', () => {
  const bundleLine = { ...cerveza, quantity: 1, bundle_id: 'b1' }
  const start = { ...createInitialPosState(), cart: [bundleLine] }
  const state = posReducer(start, { type: 'change_cart_quantity', materialId: 'm1', delta: 1 })

  assert.deepEqual(state.cart, [bundleLine])
})
