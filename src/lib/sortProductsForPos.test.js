import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sortProductsForPos } from './sortProductsForPos.js'

const p = (catName, name, id) => ({
  materials: {
    id,
    name,
    categories: catName ? { name: catName } : null,
  },
})

test('groups products by category alphabetically', () => {
  const input = [
    p('Bebidas', 'Modelo', 'm3'),
    p('Botanas', 'Nachos', 'b1'),
    p('Bebidas', 'Agua', 'm1'),
  ]
  const result = sortProductsForPos(input)
  assert.deepEqual(result.map((x) => x.materials.categories.name), [
    'Bebidas',
    'Bebidas',
    'Botanas',
  ])
})

test('sorts alphabetically within category', () => {
  const input = [
    p('Bebidas', 'Modelo', 'm3'),
    p('Bebidas', 'Agua', 'm1'),
    p('Bebidas', 'Corona', 'm2'),
  ]
  const result = sortProductsForPos(input)
  assert.deepEqual(result.map((x) => x.materials.name), ['Agua', 'Corona', 'Modelo'])
})

test('products without category go last', () => {
  const input = [
    p(null, 'Misterio', 'x1'),
    p('Bebidas', 'Agua', 'm1'),
    p('Botanas', 'Nachos', 'b1'),
  ]
  const result = sortProductsForPos(input)
  assert.equal(result[0].materials.categories?.name, 'Bebidas')
  assert.equal(result[1].materials.categories?.name, 'Botanas')
  assert.equal(result[2].materials.categories, null)
})

test('does not mutate the input array', () => {
  const input = [
    p('Bebidas', 'Modelo', 'm3'),
    p('Bebidas', 'Agua', 'm1'),
  ]
  const originalOrder = input.map((x) => x.materials.id)
  sortProductsForPos(input)
  assert.deepEqual(input.map((x) => x.materials.id), originalOrder)
})

test('returns identical order for shuffled input (deterministic)', () => {
  const products = [
    p('Vinos', 'Tinto', 'v2'),
    p('Bebidas', 'Agua', 'm1'),
    p('Bebidas', 'Corona', 'm2'),
    p(null, 'Misterio', 'x1'),
    p('Botanas', 'Nachos', 'b1'),
  ]
  const shuffled = [products[3], products[0], products[2], products[4], products[1]]
  const r1 = sortProductsForPos(products)
  const r2 = sortProductsForPos(shuffled)
  assert.deepEqual(
    r1.map((x) => x.materials.id),
    r2.map((x) => x.materials.id),
  )
})
