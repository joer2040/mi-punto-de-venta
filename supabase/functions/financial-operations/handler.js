// Handler factory for financial-operations Edge Function.
// No Deno globals or npm imports — deps are injected so the handler is testable in Node.js.
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

const CORS_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type'
const CORS_ALLOW_METHODS = 'POST, OPTIONS'

const appError = (message, status = 400) => Object.assign(new Error(message), { status })

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const resolveAuthenticatedUser = async (requestClient) => {
  const { data, error } = await requestClient.auth.getUser()
  if (error || !data?.user) {
    return { user: null, error: new Error('Sesion invalida o expirada.') }
  }
  return { user: data.user, error: null }
}

const readRoleName = (roleLink) => {
  if (Array.isArray(roleLink.app_roles)) return roleLink.app_roles[0]?.name ?? null
  return roleLink.app_roles?.name ?? null
}

const isManagerRoleName = (v) =>
  ['manager', 'administrador operativo'].includes((v || '').trim().toLowerCase())

const loadCallerContext = async (adminClient, userId) => {
  const { data: profile, error } = await adminClient
    .from('app_profiles')
    .select('id, is_superadmin, status')
    .eq('id', userId)
    .maybeSingle()

  if (error || !profile || profile.status !== 'active') {
    throw appError('No tienes permisos para operar el módulo financiero.', 403)
  }

  const { data: roleLinks, error: roleError } = await adminClient
    .from('app_user_roles')
    .select('role_id, app_roles(name)')
    .eq('user_id', userId)

  if (roleError) throw roleError

  const roleNames = Array.from(
    new Set((roleLinks || []).map(readRoleName).filter(Boolean))
  )

  const isSuperadmin = Boolean(profile.is_superadmin)
  const isManager = roleNames.some((n) => isManagerRoleName(n))

  // Financial module requires at minimum manager-level access.
  if (!isSuperadmin && !isManager) {
    throw appError('No tienes permisos para operar el módulo financiero.', 403)
  }

  return { profile, isSuperadmin, isManager }
}

const normalizeBankItems = (raw) => {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      description: String(item?.description ?? '').trim(),
      amount: toNumber(item?.amount, 0),
      item_type: String(item?.item_type ?? '').trim().toLowerCase(),
    }))
    .filter(
      (item) =>
        item.description &&
        item.amount > 0 &&
        (item.item_type === 'deposit' || item.item_type === 'charge')
    )
}

/**
 * Returns an async request handler for the financial-operations Edge Function.
 *
 * @param {object} deps
 * @param {(url: string, key: string) => object} deps.createAdminClient
 * @param {(url: string, key: string, opts: object) => object} deps.createRequestClient
 * @param {(key: string) => string|null} deps.getEnv
 */
export const createFinancialHandler = ({ createAdminClient, createRequestClient, getEnv }) => {
  return async (req) => {
    const allowedOrigins = (getEnv('ALLOWED_ORIGINS') ?? '')
      .split(',').map((o) => o.trim()).filter(Boolean)

    const requestOrigin = req.headers.get('origin')
    const corsOrigin = getCorsOriginHeader(requestOrigin, allowedOrigins)

    // Build per-request CORS headers. Never use '*' — corsOrigin is null or an exact origin.
    const corsHeaders = {
      'Access-Control-Allow-Headers': CORS_ALLOW_HEADERS,
      'Access-Control-Allow-Methods': CORS_ALLOW_METHODS,
      ...(corsOrigin ? { 'Access-Control-Allow-Origin': corsOrigin, Vary: 'Origin' } : {}),
    }

    const respond = (body, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

    if (req.method === 'OPTIONS') {
      // Browser preflight with unauthorized origin → reject explicitly, do not reach auth.
      if (requestOrigin !== null && corsOrigin === null) {
        return new Response('Origin not allowed', { status: 403 })
      }
      return new Response('ok', { headers: corsHeaders })
    }

    // Browser POST with unauthorized origin → reject before touching auth or RPCs.
    if (requestOrigin !== null && corsOrigin === null) {
      return respond({ error: 'Origen no permitido.' }, 403)
    }

    try {
      const supabaseUrl    = getEnv('SUPABASE_URL')
      const publishableKey = getEnv('PROJECT_PUBLISHABLE_KEY') || getEnv('SUPABASE_ANON_KEY')
      const serviceRoleKey = getEnv('SERVICE_ROLE_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY')
      const authorization  = req.headers.get('Authorization')

      if (!authorization) {
        return respond({ error: 'No se recibio token de autenticacion.' }, 401)
      }

      const requestClient = createRequestClient(supabaseUrl, publishableKey, {
        global: { headers: { Authorization: authorization } },
      })
      const adminClient = createAdminClient(supabaseUrl, serviceRoleKey)

      const { user, error: userError } = await resolveAuthenticatedUser(requestClient)
      if (userError || !user) {
        return respond({ error: 'Sesion invalida o expirada.' }, 401)
      }

      const caller = await loadCallerContext(adminClient, user.id)

      const body = await req.json()
      const action = String(body?.action ?? '')

      // ── get_ledger_status ──────────────────────────────────────────────────
      if (action === 'get_ledger_status') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador.' }, 403)
        }
        const { data: settings, error: settingsError } = await adminClient
          .from('ledger_settings')
          .select('ledger_cutover_at, activated_at, activated_by, initial_journal_entry_id')
          .eq('id', true)
          .maybeSingle()
        if (settingsError) throw settingsError
        return respond({
          is_active: Boolean(settings?.ledger_cutover_at),
          ledger_cutover_at: settings?.ledger_cutover_at ?? null,
          activated_at: settings?.activated_at ?? null,
        })
      }

      // ── activate_ledger ────────────────────────────────────────────────────
      if (action === 'activate_ledger') {
        if (!callerIsSuperadmin(caller)) {
          return respond({ error: 'Solo un Superadministrador puede activar el ledger.' }, 403)
        }
        const openingCashOperativa = toNumber(body.opening_cash_operativa, -1)
        const openingCashFuerte    = toNumber(body.opening_cash_fuerte, -1)
        const openingBanco         = toNumber(body.opening_banco, -1)
        const idemKeyRaw = body.idempotency_key ? String(body.idempotency_key).trim() : null
        if (idemKeyRaw !== null && !isValidIdempotencyKey(idemKeyRaw)) {
          return respond({ error: 'idempotency_key contiene caracteres no permitidos o supera 128 caracteres.' }, 400)
        }
        const bankPendingItems = normalizeBankItems(body.bank_pending_items)
        if (openingCashOperativa < 0 || openingCashFuerte < 0 || openingBanco < 0) {
          return respond({ error: 'Los saldos iniciales son obligatorios y no pueden ser negativos.' }, 400)
        }
        const { data: result, error: rpcError } = await adminClient.rpc('activate_ledger', {
          p_performed_by:           user.id,
          p_opening_cash_operativa: openingCashOperativa,
          p_opening_cash_fuerte:    openingCashFuerte,
          p_opening_banco:          openingBanco,
          p_bank_pending_items:     bankPendingItems,
          p_idempotency_key:        idemKeyRaw,
        })
        if (rpcError) {
          const msg = rpcError.message ?? ''
          const status = msg.includes('ya fue activado') || msg.includes('idempotencia') ? 409
            : msg.includes('Superadministrador') ? 403 : 400
          throw appError(msg, status)
        }
        return respond({ ledger: result })
      }

      // ── record_transfer ────────────────────────────────────────────────────
      if (action === 'record_transfer') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador para registrar traspasos.' }, 403)
        }
        const fromCode   = String(body.from_code   ?? '').trim()
        const toCode     = String(body.to_code     ?? '').trim()
        const amount     = toNumber(body.amount, -1)
        const desc       = String(body.description ?? '').trim() || null
        const idemKeyRaw = body.idempotency_key ? String(body.idempotency_key).trim() : null
        if (!fromCode || !toCode) return respond({ error: 'Faltan from_code / to_code.' }, 400)
        if (!isValidFundCode(fromCode)) return respond({ error: 'from_code debe ser 1101, 1102 o 1103.' }, 400)
        if (!isValidFundCode(toCode))   return respond({ error: 'to_code debe ser 1101, 1102 o 1103.' }, 400)
        if (amount <= 0) return respond({ error: 'El importe debe ser mayor que cero.' }, 400)
        if (idemKeyRaw !== null && !isValidIdempotencyKey(idemKeyRaw)) {
          return respond({ error: 'idempotency_key contiene caracteres no permitidos o supera 128 caracteres.' }, 400)
        }
        const { data: result, error: rpcError } = await adminClient.rpc('record_transfer', {
          p_from_code:       fromCode,
          p_to_code:         toCode,
          p_amount:          amount,
          p_description:     desc,
          p_performed_by:    user.id,
          p_idempotency_key: idemKeyRaw,
        })
        if (rpcError) {
          const msg = rpcError.message ?? ''
          throw appError(msg, msg.includes('idempotencia') ? 409 : 400)
        }
        return respond({ transfer: result })
      }

      // ── record_owner_contribution ──────────────────────────────────────────
      if (action === 'record_owner_contribution') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador para registrar aportaciones.' }, 403)
        }
        const destCode   = String(body.destination_code ?? '').trim()
        const amount     = toNumber(body.amount, -1)
        const desc       = String(body.description      ?? '').trim() || null
        const idemKeyRaw = body.idempotency_key ? String(body.idempotency_key).trim() : null
        if (!destCode) return respond({ error: 'Falta destination_code.' }, 400)
        if (!isValidFundCode(destCode)) return respond({ error: 'destination_code debe ser 1101, 1102 o 1103.' }, 400)
        if (amount <= 0) return respond({ error: 'El importe debe ser mayor que cero.' }, 400)
        if (idemKeyRaw !== null && !isValidIdempotencyKey(idemKeyRaw)) {
          return respond({ error: 'idempotency_key contiene caracteres no permitidos o supera 128 caracteres.' }, 400)
        }
        const { data: result, error: rpcError } = await adminClient.rpc('record_owner_contribution', {
          p_destination_code: destCode,
          p_amount:           amount,
          p_description:      desc,
          p_performed_by:     user.id,
          p_idempotency_key:  idemKeyRaw,
        })
        if (rpcError) {
          const msg = rpcError.message ?? ''
          throw appError(msg, msg.includes('idempotencia') ? 409 : 400)
        }
        return respond({ contribution: result })
      }

      // ── record_owner_withdrawal ────────────────────────────────────────────
      if (action === 'record_owner_withdrawal') {
        if (!callerIsSuperadmin(caller)) {
          return respond({ error: 'Solo un Superadministrador puede registrar retiros del propietario.' }, 403)
        }
        const sourceCode   = String(body.source_code   ?? '').trim()
        const amount       = toNumber(body.amount, -1)
        const desc         = String(body.description   ?? '').trim() || null
        const authorizedBy = String(body.authorized_by ?? '').trim()
        const idemKeyRaw   = body.idempotency_key ? String(body.idempotency_key).trim() : null
        if (!sourceCode) return respond({ error: 'Falta source_code.' }, 400)
        if (!isValidFundCode(sourceCode)) return respond({ error: 'source_code debe ser 1101, 1102 o 1103.' }, 400)
        if (amount <= 0) return respond({ error: 'El importe debe ser mayor que cero.' }, 400)
        if (!authorizedBy) return respond({ error: 'El retiro del propietario requiere authorized_by.' }, 400)
        if (!isValidUUID(authorizedBy)) return respond({ error: 'authorized_by no tiene formato UUID válido.' }, 400)
        if (idemKeyRaw !== null && !isValidIdempotencyKey(idemKeyRaw)) {
          return respond({ error: 'idempotency_key contiene caracteres no permitidos o supera 128 caracteres.' }, 400)
        }
        const { data: result, error: rpcError } = await adminClient.rpc('record_owner_withdrawal', {
          p_source_code:     sourceCode,
          p_amount:          amount,
          p_description:     desc,
          p_performed_by:    user.id,
          p_authorized_by:   authorizedBy,
          p_idempotency_key: idemKeyRaw,
        })
        if (rpcError) {
          const msg = rpcError.message ?? ''
          throw appError(msg, msg.includes('idempotencia') ? 409 : 400)
        }
        return respond({ withdrawal: result })
      }

      // ── reverse_journal_entry ──────────────────────────────────────────────
      if (action === 'reverse_journal_entry') {
        if (!callerIsSuperadmin(caller)) {
          return respond({ error: 'Solo un Superadministrador puede autorizar reversas.' }, 403)
        }
        const entryId       = String(body.journal_entry_id ?? '').trim()
        const authorizedBy  = String(body.authorized_by    ?? '').trim()
        const justification = String(body.justification    ?? '').trim()
        const idemKeyRaw    = body.idempotency_key ? String(body.idempotency_key).trim() : null
        if (!entryId) return respond({ error: 'Falta journal_entry_id.' }, 400)
        if (!isValidUUID(entryId)) return respond({ error: 'journal_entry_id no tiene formato UUID válido.' }, 400)
        if (!authorizedBy) return respond({ error: 'La reversa requiere authorized_by.' }, 400)
        if (!isValidUUID(authorizedBy)) return respond({ error: 'authorized_by no tiene formato UUID válido.' }, 400)
        if (!justification) return respond({ error: 'La reversa requiere justification.' }, 400)
        if (idemKeyRaw !== null && !isValidIdempotencyKey(idemKeyRaw)) {
          return respond({ error: 'idempotency_key contiene caracteres no permitidos o supera 128 caracteres.' }, 400)
        }
        const { data: result, error: rpcError } = await adminClient.rpc('reverse_journal_entry', {
          p_journal_entry_id: entryId,
          p_authorized_by:    authorizedBy,
          p_justification:    justification,
          p_performed_by:     user.id,
          p_idempotency_key:  idemKeyRaw,
        })
        if (rpcError) {
          const msg = rpcError.message ?? ''
          throw appError(msg, msg.includes('idempotencia') ? 409 : 400)
        }
        return respond({ reversal: result })
      }

      // ── get_account_balances ───────────────────────────────────────────────
      if (action === 'get_account_balances') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador.' }, 403)
        }
        const asOf = body.as_of ? String(body.as_of).trim() : null
        const { data, error: rpcError } = await adminClient.rpc('get_account_balances', { p_as_of: asOf })
        if (rpcError) throw appError(rpcError.message, 400)
        return respond({ balances: data })
      }

      // ── get_journal_report ─────────────────────────────────────────────────
      if (action === 'get_journal_report') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador.' }, 403)
        }
        const fromDate = String(body.from_date ?? '').trim()
        const toDate   = String(body.to_date   ?? '').trim()
        if (!fromDate || !toDate) return respond({ error: 'Faltan from_date y to_date.' }, 400)
        if (!isValidDateString(fromDate) || !isValidDateString(toDate)) {
          return respond({ error: 'Las fechas deben tener formato YYYY-MM-DD.' }, 400)
        }
        const { data, error: rpcError } = await adminClient.rpc('get_journal_report', {
          p_from_date: fromDate,
          p_to_date:   toDate,
        })
        if (rpcError) throw appError(rpcError.message, 400)
        return respond({ entries: data })
      }

      // ── get_account_ledger ─────────────────────────────────────────────────
      if (action === 'get_account_ledger') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador.' }, 403)
        }
        const accountCode = String(body.account_code ?? '').trim()
        if (!accountCode) return respond({ error: 'Falta account_code.' }, 400)
        const fromDate = body.from_date ? String(body.from_date).trim() : null
        const toDate   = body.to_date   ? String(body.to_date).trim()   : null
        if (fromDate && !isValidDateString(fromDate)) {
          return respond({ error: 'from_date debe tener formato YYYY-MM-DD.' }, 400)
        }
        if (toDate && !isValidDateString(toDate)) {
          return respond({ error: 'to_date debe tener formato YYYY-MM-DD.' }, 400)
        }
        const { data, error: rpcError } = await adminClient.rpc('get_account_ledger', {
          p_account_code: accountCode,
          p_from_date:    fromDate,
          p_to_date:      toDate,
        })
        if (rpcError) throw appError(rpcError.message, 400)
        return respond({ ledger: data })
      }

      // ── get_cash_sessions_report ───────────────────────────────────────────
      if (action === 'get_cash_sessions_report') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador.' }, 403)
        }
        const fromDate = body.from_date ? String(body.from_date).trim() : null
        const toDate   = body.to_date   ? String(body.to_date).trim()   : null
        if (fromDate && !isValidDateString(fromDate)) {
          return respond({ error: 'from_date debe tener formato YYYY-MM-DD.' }, 400)
        }
        if (toDate && !isValidDateString(toDate)) {
          return respond({ error: 'to_date debe tener formato YYYY-MM-DD.' }, 400)
        }
        const { data, error: rpcError } = await adminClient.rpc('get_cash_sessions_report', {
          p_from_date: fromDate,
          p_to_date:   toDate,
        })
        if (rpcError) throw appError(rpcError.message, 400)
        return respond({ sessions: data })
      }

      // ── resolve_cash_discrepancy ───────────────────────────────────────────
      if (action === 'resolve_cash_discrepancy') {
        if (!callerIsManager(caller)) {
          return respond({ error: 'Se requiere perfil de manager o superadministrador para resolver diferencias de caja.' }, 403)
        }
        const sessionId      = String(body.cash_session_id  ?? '').trim()
        const resolutionType = String(body.resolution_type  ?? '').trim()
        const amount         = toNumber(body.amount, -1)
        const motive         = String(body.motive           ?? '').trim()
        const idemKeyRaw     = body.idempotency_key ? String(body.idempotency_key).trim() : null
        if (!sessionId) return respond({ error: 'Falta cash_session_id.' }, 400)
        if (!isValidUUID(sessionId)) return respond({ error: 'cash_session_id no tiene formato UUID válido.' }, 400)
        if (!resolutionType) return respond({ error: 'Falta resolution_type.' }, 400)
        if (!isValidResolutionType(resolutionType)) {
          return respond({ error: 'resolution_type debe ser "sobrante" o "faltante".' }, 400)
        }
        if (amount <= 0) return respond({ error: 'El importe debe ser mayor que cero.' }, 400)
        if (!motive) return respond({ error: 'El motivo es obligatorio.' }, 400)
        if (idemKeyRaw !== null && !isValidIdempotencyKey(idemKeyRaw)) {
          return respond({ error: 'idempotency_key contiene caracteres no permitidos o supera 128 caracteres.' }, 400)
        }
        const { data: result, error: rpcError } = await adminClient.rpc('resolve_cash_discrepancy', {
          p_cash_session_id: sessionId,
          p_resolution_type: resolutionType,
          p_amount:          amount,
          p_motive:          motive,
          p_performed_by:    user.id,
          p_idempotency_key: idemKeyRaw,
        })
        if (rpcError) {
          const msg = rpcError.message ?? ''
          throw appError(msg, msg.includes('idempotencia') ? 409 : 400)
        }
        return respond({ resolution: result })
      }

      return respond({ error: 'Accion no soportada.' }, 400)
    } catch (err) {
      const status = typeof err?.status === 'number' ? err.status : 500
      return respond(
        { error: err instanceof Error ? err.message : 'Error inesperado.' },
        status
      )
    }
  }
}
