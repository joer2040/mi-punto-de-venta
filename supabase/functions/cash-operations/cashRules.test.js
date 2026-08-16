import assert from 'node:assert/strict'
import test from 'node:test'

import { countActiveSales, isActiveSaleTable } from './cashRules.js'

test('detecta como activa una mesa ocupada', () => {
  assert.equal(isActiveSaleTable({ status: 'ocupada', current_order_id: null }), true)
})

test('normaliza espacios y mayusculas en el estado', () => {
  assert.equal(isActiveSaleTable({ status: ' OCUPADA ', current_order_id: null }), true)
})

test('detecta como activa una mesa con pedido vigente aunque figure libre', () => {
  assert.equal(isActiveSaleTable({ status: 'libre', current_order_id: 'order-id' }), true)
})

test('no marca como activa una mesa libre sin pedido', () => {
  assert.equal(isActiveSaleTable({ status: 'libre', current_order_id: null }), false)
})

test('cuenta una vez cada mesa activa aunque cumpla ambas condiciones', () => {
  assert.equal(countActiveSales([
    { status: 'ocupada', current_order_id: 'order-1' },
    { status: 'libre', current_order_id: 'order-2' },
    { status: 'libre', current_order_id: null },
  ]), 2)
})
