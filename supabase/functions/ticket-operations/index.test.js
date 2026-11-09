// ticket-operations: loads the real index.ts under Node (type stripping) with a fake Supabase client.
// No network, no database, no Deno runtime.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const SUPABASE_STUB = 'data:text/javascript,export const createClient = (...args) => globalThis.__ticketOpsCreateClient(...args)'

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'npm:@supabase/supabase-js@2') return { url: SUPABASE_STUB, shortCircuit: true }
    return nextResolve(specifier, context)
  },
})

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER_USER = '22222222-2222-4222-8222-222222222222'
const SALE = '33333333-3333-4333-8333-333333333333'
const OTHER_SALE = '44444444-4444-4444-8444-444444444444'
const OPERATION = '55555555-5555-4555-8555-555555555555'
const KEY = '66666666-6666-4666-8666-666666666666'

let scenario = null
let handler = null

globalThis.Deno = {
  serve: (fn) => { handler = fn },
  env: {
    get: (name) => ({
      SUPABASE_URL: 'https://example.test',
      SUPABASE_ANON_KEY: 'anon-test',
      SUPABASE_SERVICE_ROLE_KEY: 'service-test',
    })[name],
  },
}

// Records every query and answers from the active scenario. No rpc: an economic call would throw.
const createFakeClient = (url, key, options) => {
  if (options?.global?.headers?.Authorization) {
    return { auth: { getUser: async () => scenario.auth } }
  }
  return {
    from(table) {
      const query = { table, op: 'select', columns: null, filters: {} }
      const run = () => {
        scenario.calls.push(query)
        return Promise.resolve(scenario.respond(query))
      }
      const builder = {
        select(columns) { query.columns = columns; return builder },
        eq(column, value) { query.filters[column] = value; return builder },
        in(column, value) { query.filters[column] = value; return builder },
        gt(column, value) { query.filters[`${column}>`] = value; return builder },
        maybeSingle: run,
        then: (resolve, reject) => run().then(resolve, reject),
        insert(row) { query.op = 'insert'; query.row = row; return run() },
      }
      return builder
    },
  }
}
globalThis.__ticketOpsCreateClient = createFakeClient

await import('./index.ts')
assert.equal(typeof handler, 'function')

const confirmedSaleJson = () => ({
  id: SALE,
  total_amount: 390,
  items: [
    { name: 'Producto de prueba', quantity: 2, unit_price: 35, bundle_id: null, bundle_type: null, bundle_label: null },
    ...Array.from({ length: 10 }, () => ({
      name: 'Cerveza de prueba', quantity: 1, unit_price: 32, bundle_id: 'b-1', bundle_type: 'cubeta', bundle_label: 'Cubeta Mixta',
    })),
  ],
  payments: [{ method: 'Efectivo', amount: '390.00' }],
})

// Defaults: active superadmin, confirmed v1 sale by USER (no actor_id column), ledger operation linked.
const makeScenario = (overrides = {}) => {
  const state = {
    auth: { data: { user: { id: USER } }, error: null },
    profile: { status: 'active', is_superadmin: true },
    permissionKeys: null,
    sale: {
      id: SALE,
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      total_amount: 390,
      financial_operation_id: OPERATION,
    },
    idem: { status: 'completed', response_json: confirmedSaleJson() },
    idemError: null,
    actor: { error: { code: '42703', message: 'column idempotency_requests.actor_id does not exist' } },
    operation: {
      performed_by: USER,
      operation_type: 'sale',
      status: 'confirmed',
      source_type: 'sales',
      source_id: SALE,
      idempotency_key: KEY,
    },
    insertError: null,
    stored: null,
    ...overrides,
    calls: [],
  }

  state.respond = (query) => {
    const { table, op, columns } = query
    if (table === 'app_profiles') return { data: state.profile, error: null }
    if (table === 'app_user_roles') return { data: state.permissionKeys ? [{ role_id: 'r1' }] : [], error: null }
    if (table === 'app_role_permissions') return { data: [{ permission_id: 'p1' }], error: null }
    if (table === 'app_permissions') {
      return {
        data: (state.permissionKeys || []).map((value) => {
          const [screen_key, action_key] = value.split(':')
          return { screen_key, action_key }
        }),
        error: null,
      }
    }
    if (table === 'sales') return { data: state.sale, error: null }
    if (table === 'idempotency_requests' && columns === 'status,response_json') {
      return { data: state.idem, error: state.idemError }
    }
    if (table === 'idempotency_requests' && columns === 'actor_id') {
      return state.actor.error ? { data: null, error: state.actor.error } : { data: { actor_id: state.actor.actorId }, error: null }
    }
    if (table === 'financial_operations') return { data: state.operation, error: null }
    if (table === 'sale_print_tickets' && op === 'insert') {
      if (!state.insertError) {
        state.stored = state.stored || { ticket_json: query.row.ticket_json, expires_at: query.row.expires_at }
      }
      return { data: null, error: state.insertError }
    }
    if (table === 'sale_print_tickets') return { data: state.stored, error: null }
    throw new Error(`Unexpected query on ${table}`)
  }
  return state
}

const call = async (body, overrides = {}, { authorization = 'Bearer test' } = {}) => {
  scenario = makeScenario(overrides)
  const headers = { 'content-type': 'application/json' }
  if (authorization) headers.authorization = authorization
  const response = await handler(new Request('https://example.test/ticket-operations', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }))
  return { status: response.status, json: await response.json(), calls: scenario.calls }
}

const capture = (overrides, options) => call({ action: 'capture', sale_id: SALE, idempotency_key: KEY }, overrides, options)
const tables = (calls) => calls.map((entry) => `${entry.op}:${entry.table}`)

test('v1: no actor_id column, linked operation by the caller -> captures the ticket', async () => {
  const { status, json, calls } = await capture()

  assert.equal(status, 200)
  assert.equal(json.ticket.saleId, SALE)
  assert.equal(json.ticket.total, '390.00')
  assert.deepEqual(json.ticket.items.map((item) => [item.name, item.quantity, item.subtotal]), [
    ['Producto de prueba', 2, '70.00'],
    ['Cubeta Mixta', 1, '320.00'],
  ])
  const operationQuery = calls.find((entry) => entry.table === 'financial_operations')
  assert.equal(operationQuery.filters.id, OPERATION)
  assert.equal(operationQuery.columns, 'performed_by,operation_type,status,source_type,source_id,idempotency_key')
})

test('v1: operation performed by another user -> rejected', async () => {
  const { status } = await capture({ operation: { ...makeScenario().operation, performed_by: OTHER_USER } })
  assert.equal(status, 403)
})

test('v1: operation not linked to this sale, key, type or status -> rejected', async () => {
  const base = makeScenario().operation
  for (const operation of [
    { ...base, source_id: OTHER_SALE },
    { ...base, source_type: 'purchases' },
    { ...base, idempotency_key: 'other-key' },
    { ...base, operation_type: 'reversal' },
    { ...base, status: 'reversed' },
    null,
  ]) {
    const { status, calls } = await capture({ operation })
    assert.equal(status, 403)
    assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
  }
})

test('v1: sale without financial_operation_id -> rejected without querying operations', async () => {
  const { status, calls } = await capture({ sale: { ...makeScenario().sale, financial_operation_id: null } })
  assert.equal(status, 403)
  assert.ok(!tables(calls).includes('select:financial_operations'))
})

test('v2: matching actor_id -> captures without needing the ledger operation', async () => {
  const { status, json, calls } = await capture({
    actor: { actorId: USER },
    sale: { ...makeScenario().sale, financial_operation_id: null },
  })
  assert.equal(status, 200)
  assert.equal(json.ticket.saleId, SALE)
  assert.ok(!tables(calls).includes('select:financial_operations'))
})

test('v2: different actor_id -> rejected even when the v1 evidence would match', async () => {
  const { status, calls } = await capture({ actor: { actorId: OTHER_USER } })
  assert.equal(status, 403)
  assert.ok(!tables(calls).includes('select:financial_operations'))
  assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
})

test('v2 schema with no recorded actor (v1 sale in DEV) -> falls back to the ledger operation', async () => {
  const allowed = await capture({ actor: { actorId: null } })
  assert.equal(allowed.status, 200)

  const denied = await capture({ actor: { actorId: null }, operation: { ...makeScenario().operation, performed_by: OTHER_USER } })
  assert.equal(denied.status, 403)
})

test('actor_id query errors other than undefined_column never fall back to v1', async () => {
  for (const error of [
    { code: '42501', message: 'permission denied for table idempotency_requests' },
    { code: 'PGRST301', message: 'JWT expired' },
    { code: '57014', message: 'canceling statement due to statement timeout' },
    { code: undefined, message: 'column actor_id does not exist' },
  ]) {
    const { status, calls } = await capture({ actor: { error } })
    assert.equal(status, 500)
    assert.ok(!tables(calls).includes('select:financial_operations'))
    assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
  }
})

test('undefined_column on the base idempotency query is an error, not v1', async () => {
  const { status, calls } = await capture({ idemError: { code: '42703', message: 'column does not exist' } })
  assert.equal(status, 500)
  assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
})

test('missing, incomplete or foreign idempotency record -> rejected', async () => {
  for (const idem of [
    null,
    { status: 'processing', response_json: confirmedSaleJson() },
    { status: 'completed', response_json: null },
    { status: 'completed', response_json: { ...confirmedSaleJson(), id: OTHER_SALE } },
  ]) {
    const { status, calls } = await capture({ idem })
    assert.equal(status, 409)
    assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
  }
})

test('unauthenticated, invalid session, inactive or without POS permission -> rejected', async () => {
  assert.equal((await capture({}, { authorization: null })).status, 401)
  assert.equal((await capture({ auth: { data: { user: null }, error: { message: 'invalid' } } })).status, 401)
  assert.equal((await capture({ profile: { status: 'inactive', is_superadmin: true } })).status, 403)
  assert.equal((await capture({ profile: { status: 'active', is_superadmin: false }, permissionKeys: ['report_sales:view'] })).status, 403)
  assert.equal((await capture({ profile: { status: 'active', is_superadmin: false }, permissionKeys: ['pos:create'] })).status, 200)
})

test('duplicate capture (23505) keeps returning the stored ticket', async () => {
  const stored = { ticket_json: { saleId: SALE, chargedAt: 'x', items: [], total: '390.00', version: 'POS58-v1' }, expires_at: '2099-01-01T00:00:00.000Z' }
  const { status, json } = await capture({ insertError: { code: '23505' }, stored })
  assert.equal(status, 200)
  assert.equal(json.ticket.saleId, SALE)
  assert.equal(json.ticket.expiresAt, stored.expires_at)
})

test('get keeps its contract and report_sales:view permission', async () => {
  const stored = { ticket_json: { saleId: SALE, chargedAt: 'x', items: [], total: '390.00', version: 'POS58-v1' }, expires_at: '2099-01-01T00:00:00.000Z' }

  const ok = await call({ action: 'get', sale_id: SALE }, { stored })
  assert.equal(ok.status, 200)
  assert.equal(ok.json.ticket.saleId, SALE)
  const read = ok.calls.find((entry) => entry.table === 'sale_print_tickets')
  assert.equal(read.filters.sale_id, SALE)
  assert.ok(read.filters['expires_at>'])

  const missing = await call({ action: 'get', sale_id: SALE }, { stored: null })
  assert.equal(missing.status, 404)

  const denied = await call({ action: 'get', sale_id: SALE }, { profile: { status: 'active', is_superadmin: false }, permissionKeys: ['pos:create'] })
  assert.equal(denied.status, 403)
})

test('capture never touches economic tables: only reads, plus the receipt insert', async () => {
  const runs = [
    await capture(),
    await capture({ actor: { actorId: OTHER_USER } }),
    await capture({ insertError: { code: '42501' } }),
  ]
  assert.equal(runs[2].status, 500)
  const economic = ['payments', 'financial_payments', 'journal_entries', 'ledger', 'inventory', 'cash_sessions', 'table_orders']
  for (const { calls } of runs) {
    for (const entry of calls) {
      assert.ok(!economic.includes(entry.table), entry.table)
      if (entry.op !== 'select') assert.equal(`${entry.op}:${entry.table}`, 'insert:sale_print_tickets')
    }
  }
})

// --- Timestamp precision (sales.created_at has microseconds; JS Dates hold milliseconds) ---

const HOURS_360 = 360 * 60 * 60 * 1000

// Recent created_at with six fractional digits, e.g. 2026-11-01T02:40:06.638774+00:00.
const microsecondCreatedAt = () =>
  new Date(Date.now() - 60 * 60 * 1000).toISOString().replace(/\.(\d{3})Z$/, '.$1774+00:00')

test('capture stores confirmed_at and expires_at from the same Date: exactly 360 h apart', async () => {
  const createdAt = microsecondCreatedAt()
  assert.match(createdAt, /\.\d{6}\+00:00$/)
  const { status, json, calls } = await capture({ sale: { ...makeScenario().sale, created_at: createdAt } })

  assert.equal(status, 200)
  const insert = calls.find((entry) => entry.op === 'insert' && entry.table === 'sale_print_tickets')
  assert.ok(insert)
  assert.equal(insert.row.confirmed_at, new Date(createdAt).toISOString())
  assert.match(insert.row.confirmed_at, /\.\d{3}Z$/)
  assert.equal(Date.parse(insert.row.expires_at) - Date.parse(insert.row.confirmed_at), HOURS_360)
  // Sub-millisecond gap to the original timestamp is expected; the original stays in the ticket.
  assert.ok(Date.parse(createdAt) - Date.parse(insert.row.confirmed_at) < 1)
  assert.equal(insert.row.ticket_json.chargedAt, createdAt)
  assert.equal(json.ticket.chargedAt, createdAt)
})

test('capture with an invalid sale timestamp is rejected without inserting', async () => {
  const { status, calls } = await capture({ sale: { ...makeScenario().sale, created_at: 'not-a-date' } })
  assert.equal(status, 409)
  assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
})

test('capture of a sale older than 360 h is still rejected as expired', async () => {
  const old = new Date(Date.now() - HOURS_360 - 1000).toISOString().replace(/Z$/, '123+00:00')
  const { status, calls } = await capture({ sale: { ...makeScenario().sale, created_at: old } })
  assert.equal(status, 410)
  assert.ok(!tables(calls).includes('insert:sale_print_tickets'))
})
