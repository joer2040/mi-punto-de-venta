import assert from 'node:assert/strict'
import test from 'node:test'
import { createFinancialHandler } from './handler.js'

// ─── Mock factories ───────────────────────────────────────────────────────────

/**
 * Builds a chainable mock query that is both directly awaitable
 * and has a .maybeSingle() method — matching the Supabase client API.
 */
const makeChain = (data, error = null) => {
  const chain = {
    select: () => chain,
    eq:     () => chain,
    is:     () => chain,
    maybeSingle: () => Promise.resolve({ data, error }),
    then:    (res, rej) => Promise.resolve({ data, error }).then(res, rej),
    catch:   (rej)      => Promise.resolve({ data, error }).catch(rej),
    finally: (fn)       => Promise.resolve({ data, error }).finally(fn),
  }
  return chain
}

const makeAdminClient = (tableData = {}, rpcReturn = { data: { ok: true }, error: null }) => {
  let rpcCallCount = 0
  const rpcCalls = []
  return {
    from: (table) => makeChain(tableData[table] ?? null),
    rpc:  (name, params) => {
      rpcCallCount++
      rpcCalls.push({ name, params })
      return Promise.resolve(rpcReturn)
    },
    get rpcCallCount() { return rpcCallCount },
    get rpcCalls()     { return [...rpcCalls] },
  }
}

const makeRequestClient = (userId = 'user-test', userError = null) => ({
  auth: {
    getUser: () => Promise.resolve({
      data: userError ? { user: null } : { user: { id: userId } },
      error: userError,
    }),
  },
})

const makeEnv = (overrides = {}) => (key) => {
  const defaults = {
    SUPABASE_URL:              'https://test.supabase.co',
    SUPABASE_ANON_KEY:         'test-anon-key',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    ALLOWED_ORIGINS:           '',
  }
  return { ...defaults, ...overrides }[key] ?? null
}

// ─── Caller profiles ──────────────────────────────────────────────────────────

const MESERO_PROFILE    = { id: 'user-m',   is_superadmin: false, status: 'active' }
const MESERO_ROLES      = [{ role_id: 'r1', app_roles: { name: 'mesero'  } }]

const MANAGER_PROFILE   = { id: 'user-mgr', is_superadmin: false, status: 'active' }
const MANAGER_ROLES     = [{ role_id: 'r2', app_roles: { name: 'manager' } }]

const SUPERADMIN_PROFILE = { id: 'user-sa', is_superadmin: true,  status: 'active' }
const SUPERADMIN_ROLES   = []

const NOROLE_PROFILE    = { id: 'user-nr',  is_superadmin: false, status: 'active' }
const NOROLE_ROLES      = []

// ─── Handler builder ─────────────────────────────────────────────────────────

const makeHandler = ({
  profile     = MANAGER_PROFILE,
  roles       = MANAGER_ROLES,
  envOverrides = {},
  rpcReturn   = { data: { result: 'ok' }, error: null },
  userId      = 'user-test',
  userError   = null,
} = {}) => {
  const adminClient   = makeAdminClient(
    { app_profiles: profile, app_user_roles: roles },
    rpcReturn
  )
  const requestClient = makeRequestClient(userId, userError)

  const handler = createFinancialHandler({
    createAdminClient:   () => adminClient,
    createRequestClient: () => requestClient,
    getEnv: makeEnv(envOverrides),
  })

  return { handler, adminClient }
}

const post = (handler, action, payload = {}, opts = {}) => {
  const { origin, token = 'Bearer test-token' } = opts
  const headers = {
    'Content-Type': 'application/json',
    ...(token   ? { Authorization: token } : {}),
    ...(origin  ? { Origin: origin }        : {}),
  }
  return handler(new Request('https://x.co', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...payload }),
  }))
}

const options = (handler, opts = {}) => {
  const { origin } = opts
  return handler(new Request('https://x.co', {
    method: 'OPTIONS',
    headers: origin ? { Origin: origin } : {},
  }))
}

const bodyOf = async (res) => res.json()

// ─── G04 — CORS (corrected: no wildcard) ─────────────────────────────────────

test('G04 CORS: OPTIONS sin Origin (servidor) → 200, sin Access-Control-Allow-Origin', async () => {
  const { handler } = makeHandler()
  const res = await options(handler)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null)
})

test('G04 CORS: OPTIONS con origen autorizado → 200 con Access-Control-Allow-Origin exacto', async () => {
  const { handler } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: 'https://app.example.com' } })
  const res = await options(handler, { origin: 'https://app.example.com' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com')
  assert.equal(res.headers.get('Vary'), 'Origin')
})

test('G04 CORS: OPTIONS con origen no autorizado → 403 explícito, no llega a auth', async () => {
  const { handler, adminClient } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: 'https://app.example.com' } })
  const res = await options(handler, { origin: 'https://evil.com' })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G04 CORS: OPTIONS con ALLOWED_ORIGINS ausente y Origin → 403 (sin fallback wildcard)', async () => {
  const { handler, adminClient } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: '' } })
  const res = await options(handler, { origin: 'https://any.com' })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G04 CORS: POST con origen autorizado → llega a handler (no rechazado por CORS)', async () => {
  const { handler } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: 'https://app.example.com' } })
  // action desconocida → 400, pero pasó el filtro CORS
  const res = await post(handler, 'unknown_action', {}, { origin: 'https://app.example.com' })
  assert.notEqual(res.status, 403)
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://app.example.com')
})

test('G04 CORS: POST con origen no autorizado → 403 antes de auth, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: 'https://app.example.com' } })
  const res = await post(handler, 'record_transfer', {}, { origin: 'https://evil.com' })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G04 CORS: POST sin Origin (servidor-a-servidor) → pasa al handler sin CORS headers', async () => {
  const { handler } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: 'https://app.example.com' } })
  const res = await post(handler, 'unknown_action', {})
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null)
  // Llegó al handler (obtuvo 400 por accion desconocida, no 403 de CORS)
  assert.equal(res.status, 400)
})

test('G04 CORS: POST con ALLOWED_ORIGINS ausente y Origin → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ envOverrides: { ALLOWED_ORIGINS: '' } })
  const res = await post(handler, 'record_transfer', {}, { origin: 'https://any.com' })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G04 CORS: respuesta nunca incluye Access-Control-Allow-Origin: *', async () => {
  // Con allowedOrigins vacío y cualquier origen
  const { handler } = makeHandler()
  const res = await options(handler, { origin: 'https://any.com' })
  assert.notEqual(res.headers.get('Access-Control-Allow-Origin'), '*')
})

// ─── Auth ─────────────────────────────────────────────────────────────────────

test('Auth: falta Authorization → 401', async () => {
  const { handler } = makeHandler()
  const res = await post(handler, 'get_ledger_status', {}, { token: null })
  assert.equal(res.status, 401)
})

test('Auth: JWT inválido → 401', async () => {
  const { handler } = makeHandler({ userError: new Error('invalid jwt') })
  const res = await post(handler, 'get_ledger_status', {})
  assert.equal(res.status, 401)
})

// ─── G01 — record_transfer bloqueado para mesero ──────────────────────────────

test('G01: mesero → record_transfer → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'record_transfer', { from_code: '1101', to_code: '1102', amount: 100 })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G01: usuario sin rol → record_transfer → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: NOROLE_PROFILE, roles: NOROLE_ROLES })
  const res = await post(handler, 'record_transfer', { from_code: '1101', to_code: '1102', amount: 100 })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── G02 — record_owner_contribution bloqueado para mesero ───────────────────

test('G02: mesero → record_owner_contribution → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'record_owner_contribution', { destination_code: '1101', amount: 500 })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── G03 — resolve_cash_discrepancy bloqueado para mesero ────────────────────

test('G03: mesero → resolve_cash_discrepancy → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'resolve_cash_discrepancy', {
    cash_session_id: '550e8400-e29b-41d4-a716-446655440000',
    resolution_type: 'sobrante',
    amount: 50,
    motive: 'test',
  })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── G05 — reportes bloqueados para mesero ───────────────────────────────────

test('G05: mesero → get_account_balances → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'get_account_balances', {})
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G05: mesero → get_journal_report → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'get_journal_report', { from_date: '2026-08-01', to_date: '2026-08-15' })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G05: mesero → get_account_ledger → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'get_account_ledger', { account_code: '1101' })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G05: mesero → get_cash_sessions_report → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'get_cash_sessions_report', {})
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G05: mesero → get_ledger_status → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MESERO_PROFILE, roles: MESERO_ROLES })
  const res = await post(handler, 'get_ledger_status', {})
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── Manager autorizado llega a RPC ──────────────────────────────────────────

test('Manager → record_transfer válido → RPC invocada (count=1)', async () => {
  const { handler, adminClient } = makeHandler({
    profile: MANAGER_PROFILE,
    roles:   MANAGER_ROLES,
    rpcReturn: { data: { journal_entry_id: 'je-001' }, error: null },
  })
  const res = await post(handler, 'record_transfer', {
    from_code:        '1101',
    to_code:          '1102',
    amount:           200,
    idempotency_key:  'TRF-2026-08-16-001',
  })
  assert.equal(res.status, 200)
  assert.equal(adminClient.rpcCallCount, 1)
  assert.equal(adminClient.rpcCalls[0].name, 'record_transfer')
  const body = await bodyOf(res)
  assert.ok(body.transfer)
})

test('Manager → get_account_balances → RPC invocada (count=1)', async () => {
  const { handler, adminClient } = makeHandler({
    profile:   MANAGER_PROFILE,
    roles:     MANAGER_ROLES,
    rpcReturn: { data: [{ code: '1101', balance: 1000 }], error: null },
  })
  const res = await post(handler, 'get_account_balances', {})
  assert.equal(res.status, 200)
  assert.equal(adminClient.rpcCallCount, 1)
})

test('Manager → reverse_journal_entry (superadmin-only) → 403, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MANAGER_PROFILE, roles: MANAGER_ROLES })
  const res = await post(handler, 'reverse_journal_entry', {
    journal_entry_id: '550e8400-e29b-41d4-a716-446655440000',
    authorized_by:    '550e8400-e29b-41d4-a716-446655440001',
    justification:    'test',
  })
  assert.equal(res.status, 403)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── Superadmin puede acciones superadmin-only y manager-level ───────────────

test('Superadmin → reverse_journal_entry → RPC invocada (count=1)', async () => {
  const { handler, adminClient } = makeHandler({
    profile:   SUPERADMIN_PROFILE,
    roles:     SUPERADMIN_ROLES,
    rpcReturn: { data: { reversal_entry_id: 'rev-001' }, error: null },
  })
  const res = await post(handler, 'reverse_journal_entry', {
    journal_entry_id: '550e8400-e29b-41d4-a716-446655440000',
    authorized_by:    '550e8400-e29b-41d4-a716-446655440001',
    justification:    'Error de captura',
    idempotency_key:  'REV-2026-08-16-001',
  })
  assert.equal(res.status, 200)
  assert.equal(adminClient.rpcCallCount, 1)
  assert.equal(adminClient.rpcCalls[0].name, 'reverse_journal_entry')
})

test('Superadmin → record_transfer (manager-level) → RPC invocada (count=1)', async () => {
  const { handler, adminClient } = makeHandler({
    profile:   SUPERADMIN_PROFILE,
    roles:     SUPERADMIN_ROLES,
    rpcReturn: { data: { journal_entry_id: 'je-002' }, error: null },
  })
  const res = await post(handler, 'record_transfer', {
    from_code: '1101',
    to_code:   '1102',
    amount:    500,
  })
  assert.equal(res.status, 200)
  assert.equal(adminClient.rpcCallCount, 1)
})

// ─── G07 — Validación UUID ────────────────────────────────────────────────────

test('G07: reverse_journal_entry con journal_entry_id no UUID → 400, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: SUPERADMIN_PROFILE, roles: SUPERADMIN_ROLES })
  const res = await post(handler, 'reverse_journal_entry', {
    journal_entry_id: 'not-a-uuid',
    authorized_by:    '550e8400-e29b-41d4-a716-446655440001',
    justification:    'test',
  })
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
  const body = await bodyOf(res)
  assert.match(body.error, /UUID/)
})

test('G07: record_owner_withdrawal con authorized_by no UUID → 400, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: SUPERADMIN_PROFILE, roles: SUPERADMIN_ROLES })
  const res = await post(handler, 'record_owner_withdrawal', {
    source_code:   '1101',
    amount:        200,
    authorized_by: 'bad-uuid',
  })
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
})

test('G07: resolve_cash_discrepancy con cash_session_id no UUID → 400, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MANAGER_PROFILE, roles: MANAGER_ROLES })
  const res = await post(handler, 'resolve_cash_discrepancy', {
    cash_session_id: 'bad-id',
    resolution_type: 'sobrante',
    amount:          50,
    motive:          'test',
  })
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── G07 — Validación código de fondo ────────────────────────────────────────

test('G07: record_transfer con from_code inválido → 400, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MANAGER_PROFILE, roles: MANAGER_ROLES })
  const res = await post(handler, 'record_transfer', {
    from_code: '4101',
    to_code:   '1102',
    amount:    100,
  })
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
  const body = await bodyOf(res)
  assert.match(body.error, /from_code/)
})

// ─── G08 — Validación idempotency_key ────────────────────────────────────────

test('G08: record_transfer con idempotency_key inválida → 400, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MANAGER_PROFILE, roles: MANAGER_ROLES })
  const res = await post(handler, 'record_transfer', {
    from_code:       '1101',
    to_code:         '1102',
    amount:          100,
    idempotency_key: 'clave con espacios!',
  })
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
  const body = await bodyOf(res)
  assert.match(body.error, /idempotency_key/)
})

test('G08: record_owner_contribution con idempotency_key de 129 chars → 400, RPC=0', async () => {
  const { handler, adminClient } = makeHandler({ profile: MANAGER_PROFILE, roles: MANAGER_ROLES })
  const res = await post(handler, 'record_owner_contribution', {
    destination_code: '1101',
    amount:           500,
    idempotency_key:  'A'.repeat(129),
  })
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
})

// ─── Compatibilidad flujos existentes ────────────────────────────────────────

test('Manager → record_owner_contribution válido → RPC invocada con params correctos', async () => {
  const { handler, adminClient } = makeHandler({
    profile:   MANAGER_PROFILE,
    roles:     MANAGER_ROLES,
    rpcReturn: { data: { journal_entry_id: 'je-003' }, error: null },
  })
  const res = await post(handler, 'record_owner_contribution', {
    destination_code: '1103',
    amount:           10000,
    description:      'Aportación agosto',
    idempotency_key:  'CONTRIB-2026-08-16-001',
  })
  assert.equal(res.status, 200)
  assert.equal(adminClient.rpcCallCount, 1)
  const call = adminClient.rpcCalls[0]
  assert.equal(call.name, 'record_owner_contribution')
  assert.equal(call.params.p_destination_code, '1103')
  assert.equal(call.params.p_amount, 10000)
})

test('Manager → acción desconocida → 400 sin RPC', async () => {
  const { handler, adminClient } = makeHandler({ profile: MANAGER_PROFILE, roles: MANAGER_ROLES })
  const res = await post(handler, 'hack_the_ledger', {})
  assert.equal(res.status, 400)
  assert.equal(adminClient.rpcCallCount, 0)
  const body = await bodyOf(res)
  assert.match(body.error, /soportada/)
})
