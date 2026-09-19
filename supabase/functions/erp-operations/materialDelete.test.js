import assert from 'node:assert/strict'
import test from 'node:test'

import { validateDeleteInput, mapDeleteResult } from './materialDeleteRules.js'

// ─── validateDeleteInput ──────────────────────────────────────────────────────

test('acepta material_id valido', () => {
  const result = validateDeleteInput({ material_id: 'abc-123' })
  assert.equal(result.valid, true)
  assert.equal(result.materialId, 'abc-123')
})

test('rechaza body sin material_id', () => {
  const result = validateDeleteInput({})
  assert.equal(result.valid, false)
  assert.ok(result.error)
})

test('rechaza material_id vacio', () => {
  const result = validateDeleteInput({ material_id: '   ' })
  assert.equal(result.valid, false)
})

test('rechaza body nulo', () => {
  const result = validateDeleteInput(null)
  assert.equal(result.valid, false)
})

test('trim whitespace del material_id', () => {
  const result = validateDeleteInput({ material_id: '  uuid-x  ' })
  assert.equal(result.valid, true)
  assert.equal(result.materialId, 'uuid-x')
})

// ─── mapDeleteResult ──────────────────────────────────────────────────────────

test('blocked → 409 con mensaje de inventario', () => {
  const r = mapDeleteResult({ result: 'blocked', reason: 'stock_available', stock: 5 })
  assert.equal(r.status, 409)
  assert.equal(r.body.result, 'blocked')
  assert.ok(r.body.error.includes('inventario disponible'))
})

test('deactivated → 200 con result deactivated', () => {
  const r = mapDeleteResult({ result: 'deactivated' })
  assert.equal(r.status, 200)
  assert.equal(r.body.result, 'deactivated')
})

test('deleted → 200 con result deleted', () => {
  const r = mapDeleteResult({ result: 'deleted' })
  assert.equal(r.status, 200)
  assert.equal(r.body.result, 'deleted')
})

test('not_found → 404', () => {
  const r = mapDeleteResult({ result: 'not_found' })
  assert.equal(r.status, 404)
  assert.ok(r.body.error)
})

test('rpc null → 500', () => {
  const r = mapDeleteResult(null)
  assert.equal(r.status, 500)
  assert.ok(r.body.error)
})

test('resultado desconocido → 500', () => {
  const r = mapDeleteResult({ result: 'unexpected_value' })
  assert.equal(r.status, 500)
})

// ─── Comportamiento esperado por escenario funcional ─────────────────────────
// (documenta las reglas de negocio; el enforcement real está en la RPC)

test('inventariable stock > 0 → blocked', () => {
  // RPC devuelve blocked cuando is_inventoried=true y stock > 0
  const r = mapDeleteResult({ result: 'blocked', reason: 'stock_available', stock: 10 })
  assert.equal(r.status, 409)
  assert.equal(r.body.result, 'blocked')
})

test('inventariable stock 0 sin historial → deleted', () => {
  const r = mapDeleteResult({ result: 'deleted' })
  assert.equal(r.status, 200)
  assert.equal(r.body.result, 'deleted')
})

test('inventariable stock 0 con historial → deactivated', () => {
  const r = mapDeleteResult({ result: 'deactivated' })
  assert.equal(r.status, 200)
  assert.equal(r.body.result, 'deactivated')
})

test('no inventariable sin historial → deleted', () => {
  const r = mapDeleteResult({ result: 'deleted' })
  assert.equal(r.status, 200)
  assert.equal(r.body.result, 'deleted')
})

test('no inventariable con historial → deactivated', () => {
  const r = mapDeleteResult({ result: 'deactivated' })
  assert.equal(r.status, 200)
  assert.equal(r.body.result, 'deactivated')
})

// PIN y confirmación se validan en el frontend antes de llamar el backend.
// Escenario: PIN incorrecto → frontend no llama delete_material → EF no recibe la request.
// No hay test de EF para PIN incorrecto porque el EF no recibe la llamada en ese caso.
