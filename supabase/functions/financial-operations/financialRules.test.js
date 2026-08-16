import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isValidUUID,
  isValidIdempotencyKey,
  isValidFundCode,
  isValidResolutionType,
  isValidDateString,
  getCorsOriginHeader,
  callerIsManager,
  callerIsSuperadmin,
} from './financialRules.js'

// ─── isValidUUID ──────────────────────────────────────────────────────────────

test('isValidUUID acepta UUID v4 válido', () => {
  assert.equal(isValidUUID('550e8400-e29b-41d4-a716-446655440000'), true)
})

test('isValidUUID acepta UUID v7 válido', () => {
  assert.equal(isValidUUID('018e3bb5-a4d1-7000-a000-000000000001'), true)
})

test('isValidUUID rechaza cadena vacía', () => {
  assert.equal(isValidUUID(''), false)
})

test('isValidUUID rechaza UUID sin guiones', () => {
  assert.equal(isValidUUID('550e8400e29b41d4a716446655440000'), false)
})

test('isValidUUID rechaza cadena arbitraria', () => {
  assert.equal(isValidUUID('not-a-uuid'), false)
})

test('isValidUUID rechaza null', () => {
  assert.equal(isValidUUID(null), false)
})

test('isValidUUID rechaza número', () => {
  assert.equal(isValidUUID(123), false)
})

// ─── isValidIdempotencyKey ────────────────────────────────────────────────────

test('isValidIdempotencyKey acepta clave alfanumérica con guiones', () => {
  assert.equal(isValidIdempotencyKey('TRF-2026-08-15-a3f4b2c1'), true)
})

test('isValidIdempotencyKey acepta clave con punto y guion bajo', () => {
  assert.equal(isValidIdempotencyKey('CONTRIB.2026_08_15.001'), true)
})

test('isValidIdempotencyKey acepta clave de un solo carácter', () => {
  assert.equal(isValidIdempotencyKey('A'), true)
})

test('isValidIdempotencyKey acepta clave de 128 caracteres', () => {
  assert.equal(isValidIdempotencyKey('A'.repeat(128)), true)
})

test('isValidIdempotencyKey rechaza cadena vacía', () => {
  assert.equal(isValidIdempotencyKey(''), false)
})

test('isValidIdempotencyKey rechaza clave de 129 caracteres', () => {
  assert.equal(isValidIdempotencyKey('A'.repeat(129)), false)
})

test('isValidIdempotencyKey rechaza espacio en blanco', () => {
  assert.equal(isValidIdempotencyKey('clave con espacio'), false)
})

test('isValidIdempotencyKey rechaza carácter especial @', () => {
  assert.equal(isValidIdempotencyKey('clave@mail.com'), false)
})

test('isValidIdempotencyKey rechaza null', () => {
  assert.equal(isValidIdempotencyKey(null), false)
})

// ─── isValidFundCode ──────────────────────────────────────────────────────────

test('isValidFundCode acepta 1101 (Caja operativa)', () => {
  assert.equal(isValidFundCode('1101'), true)
})

test('isValidFundCode acepta 1102 (Caja fuerte)', () => {
  assert.equal(isValidFundCode('1102'), true)
})

test('isValidFundCode acepta 1103 (Banco)', () => {
  assert.equal(isValidFundCode('1103'), true)
})

test('isValidFundCode rechaza código de ingreso 4101', () => {
  assert.equal(isValidFundCode('4101'), false)
})

test('isValidFundCode rechaza código de aportaciones 3101', () => {
  assert.equal(isValidFundCode('3101'), false)
})

test('isValidFundCode rechaza cadena vacía', () => {
  assert.equal(isValidFundCode(''), false)
})

// ─── isValidResolutionType ────────────────────────────────────────────────────

test('isValidResolutionType acepta sobrante', () => {
  assert.equal(isValidResolutionType('sobrante'), true)
})

test('isValidResolutionType acepta faltante', () => {
  assert.equal(isValidResolutionType('faltante'), true)
})

test('isValidResolutionType acepta SOBRANTE en mayúsculas', () => {
  assert.equal(isValidResolutionType('SOBRANTE'), true)
})

test('isValidResolutionType rechaza tipo inventado', () => {
  assert.equal(isValidResolutionType('ajuste'), false)
})

test('isValidResolutionType rechaza null', () => {
  assert.equal(isValidResolutionType(null), false)
})

// ─── isValidDateString ────────────────────────────────────────────────────────

test('isValidDateString acepta formato YYYY-MM-DD válido', () => {
  assert.equal(isValidDateString('2026-08-15'), true)
})

test('isValidDateString rechaza formato DD/MM/YYYY', () => {
  assert.equal(isValidDateString('15/08/2026'), false)
})

test('isValidDateString rechaza fecha con mes de un dígito sin cero', () => {
  assert.equal(isValidDateString('2026-8-5'), false)
})

test('isValidDateString rechaza cadena vacía', () => {
  assert.equal(isValidDateString(''), false)
})

test('isValidDateString rechaza timestamp ISO', () => {
  assert.equal(isValidDateString('2026-08-15T00:00:00Z'), false)
})

// ─── getCorsOriginHeader (G04 corregido: sin wildcard) ───────────────────────

test('getCorsOriginHeader devuelve null cuando no hay allowedOrigins — sin fallback wildcard', () => {
  assert.equal(getCorsOriginHeader('https://app.example.com', []), null)
})

test('getCorsOriginHeader devuelve null cuando allowedOrigins es null', () => {
  assert.equal(getCorsOriginHeader('https://app.example.com', null), null)
})

test('getCorsOriginHeader devuelve null cuando allowedOrigins es undefined', () => {
  assert.equal(getCorsOriginHeader('https://app.example.com', undefined), null)
})

test('getCorsOriginHeader nunca retorna el string literal "*"', () => {
  assert.notEqual(getCorsOriginHeader('https://any.com', []), '*')
  assert.notEqual(getCorsOriginHeader('https://any.com', null), '*')
})

test('getCorsOriginHeader devuelve el origen exacto cuando está en la lista', () => {
  const allowed = ['https://mi-punto-de-venta.app']
  assert.equal(getCorsOriginHeader('https://mi-punto-de-venta.app', allowed), 'https://mi-punto-de-venta.app')
})

test('getCorsOriginHeader devuelve null para origen no autorizado — G04 bloqueado', () => {
  const allowed = ['https://mi-punto-de-venta.app']
  assert.equal(getCorsOriginHeader('https://evil.com', allowed), null)
})

test('getCorsOriginHeader devuelve null para origen vacío con lista de orígenes', () => {
  const allowed = ['https://mi-punto-de-venta.app']
  assert.equal(getCorsOriginHeader('', allowed), null)
  assert.equal(getCorsOriginHeader(null, allowed), null)
})

test('getCorsOriginHeader no realiza coincidencia parcial de dominio', () => {
  const allowed = ['https://mi-punto-de-venta.app']
  assert.equal(getCorsOriginHeader('https://evil.mi-punto-de-venta.app.evil.com', allowed), null)
})

// ─── callerIsManager (G01, G02, G03, G05) ────────────────────────────────────

test('callerIsManager: superadmin sin rol manager tiene acceso — G01/G02/G03/G05', () => {
  assert.equal(callerIsManager({ isSuperadmin: true, isManager: false }), true)
})

test('callerIsManager: manager sin superadmin tiene acceso — G01/G02/G03/G05', () => {
  assert.equal(callerIsManager({ isSuperadmin: false, isManager: true }), true)
})

test('callerIsManager: superadmin + manager tiene acceso', () => {
  assert.equal(callerIsManager({ isSuperadmin: true, isManager: true }), true)
})

test('callerIsManager: mesero activo sin manager bloqueado — G01/G02/G03/G05', () => {
  assert.equal(callerIsManager({ isSuperadmin: false, isManager: false, isWaiter: true }), false)
})

test('callerIsManager: usuario activo sin ningún rol bloqueado', () => {
  assert.equal(callerIsManager({ isSuperadmin: false, isManager: false }), false)
})

test('callerIsManager: contexto null bloqueado', () => {
  assert.equal(callerIsManager(null), false)
})

// ─── callerIsSuperadmin ───────────────────────────────────────────────────────

test('callerIsSuperadmin: superadmin tiene acceso', () => {
  assert.equal(callerIsSuperadmin({ isSuperadmin: true, isManager: true }), true)
})

test('callerIsSuperadmin: manager sin superadmin bloqueado en acciones superadmin-only', () => {
  assert.equal(callerIsSuperadmin({ isSuperadmin: false, isManager: true }), false)
})

test('callerIsSuperadmin: mesero bloqueado en acciones superadmin-only', () => {
  assert.equal(callerIsSuperadmin({ isSuperadmin: false, isManager: false, isWaiter: true }), false)
})

test('callerIsSuperadmin: contexto null bloqueado', () => {
  assert.equal(callerIsSuperadmin(null), false)
})
