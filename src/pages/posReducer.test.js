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

test('upsert_table replaces the matching table in place and keeps order', () => {
  const t1 = { id: 'a', number: 'Barra 1', status: 'libre', current_order_id: null }
  const t2 = { id: 'b', number: 'Barra 2', status: 'libre', current_order_id: null }
  const updated = { id: 'a', number: 'Barra 1', status: 'ocupada', current_order_id: 'o1' }
  const state = posReducer({ ...createInitialPosState(), tables: [t1, t2] }, { type: 'upsert_table', table: updated })

  assert.deepEqual(state.tables, [updated, t2])
})

test('upsert_table with unknown id leaves tables unchanged', () => {
  const t1 = { id: 'a', number: 'Barra 1', status: 'libre', current_order_id: null }
  const state = posReducer({ ...createInitialPosState(), tables: [t1] }, { type: 'upsert_table', table: { id: 'zzz' } })

  assert.deepEqual(state.tables, [t1])
})

test('initial state has paymentMethod Efectivo', () => {
  assert.equal(createInitialPosState().paymentMethod, 'Efectivo')
})

test('set_payment_method accepts Efectivo', () => {
  const state = posReducer(createInitialPosState(), { type: 'set_payment_method', value: 'Efectivo' })
  assert.equal(state.paymentMethod, 'Efectivo')
})

test('set_payment_method accepts Tarjeta', () => {
  const state = posReducer(createInitialPosState(), { type: 'set_payment_method', value: 'Tarjeta' })
  assert.equal(state.paymentMethod, 'Tarjeta')
})

test('set_payment_method ignores unknown values', () => {
  const state = posReducer(createInitialPosState(), { type: 'set_payment_method', value: 'Transferencia' })
  assert.equal(state.paymentMethod, 'Efectivo')
})

test('leave_selected_table resets paymentMethod to Efectivo', () => {
  const withTarjeta = posReducer(createInitialPosState(), { type: 'set_payment_method', value: 'Tarjeta' })
  const state = posReducer(withTarjeta, { type: 'leave_selected_table' })
  assert.equal(state.paymentMethod, 'Efectivo')
})

test('initial state has loadError false', () => {
  assert.equal(createInitialPosState().loadError, false)
})

test('bootstrap_error sets loading false and loadError true', () => {
  const state = posReducer(createInitialPosState(), { type: 'bootstrap_error' })
  assert.equal(state.loading, false)
  assert.equal(state.loadError, true)
})

test('bootstrap_data clears loadError after a previous error', () => {
  const withError = posReducer(createInitialPosState(), { type: 'bootstrap_error' })
  const state = posReducer(withError, {
    type: 'bootstrap_data',
    inventory: [],
    tables: [],
  })
  assert.equal(state.loading, false)
  assert.equal(state.loadError, false)
})
