// Pure validation and authorization helpers for financial-operations.
// No Deno / Supabase dependencies — importable from both Deno EF and Node test runner.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const IDEM_KEY_RE = /^[A-Za-z0-9\-_.]{1,128}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const FUND_CODES = ['1101', '1102', '1103']
const RESOLUTION_TYPES = ['sobrante', 'faltante']

export const isValidUUID = (v) => typeof v === 'string' && UUID_RE.test(v)

export const isValidIdempotencyKey = (v) => typeof v === 'string' && IDEM_KEY_RE.test(v)

export const isValidFundCode = (v) => FUND_CODES.includes(v)

export const isValidResolutionType = (v) =>
  RESOLUTION_TYPES.includes(String(v ?? '').toLowerCase().trim())

export const isValidDateString = (v) => typeof v === 'string' && DATE_RE.test(v)

/**
 * Returns the exact origin to echo in Access-Control-Allow-Origin, or null.
 * Null means no CORS header — caller must never fall back to '*'.
 * Empty / absent allowedOrigins → null (no allowlist = no browser access).
 */
export const getCorsOriginHeader = (requestOrigin, allowedOrigins) => {
  if (!Array.isArray(allowedOrigins) || allowedOrigins.length === 0) return null
  const origin = (requestOrigin ?? '').trim()
  return allowedOrigins.includes(origin) ? origin : null
}

/** True when the caller context has manager-or-above access (superadmin counts). */
export const callerIsManager = (caller) =>
  Boolean(caller?.isSuperadmin) || Boolean(caller?.isManager)

/** True only for superadmin callers. */
export const callerIsSuperadmin = (caller) => Boolean(caller?.isSuperadmin)
