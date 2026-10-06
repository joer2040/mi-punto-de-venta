import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import test from 'node:test'

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const summary = source.slice(source.indexOf('const loadSalesSummary ='), source.indexOf('// Efectivo esperado:'))
// Exercise the actual Edge calculation without starting a server or importing remote dependencies.
const load = new Function('toNumber', `${summary.replace('adminClient: ReturnType<typeof createClient>, sessionId: string', 'adminClient, sessionId')}; return loadSalesSummary`)(Number)

for (const sales of [[], [{ id: 'cash-sale', center_id: 'bar', total_amount: 200, payment_method: 'Efectivo' }]]) {
  test(`Edge uses helper even with ${sales.length} cash sales`, async () => {
    const calls = []
    const query = { select() { return this }, eq(...args) { calls.push(args); return this }, async order() { return { data: sales } } }
    const client = { from(name) { assert.equal(name, 'sales'); return query }, async rpc(name, args) {
      assert.equal(name, 'get_cash_session_profit'); assert.deepEqual(args, { p_session_id: 'session' })
      return { data: '80.00', error: null }
    } }
    const result = await load(client, 'session')
    assert.equal(result.profitTotal, 80)
    assert.equal(result.sales.length, sales.length)
    assert.deepEqual(calls, [['cash_session_id', 'session'], ['payment_method', 'Efectivo']])
    client.rpc = async () => ({ error: new Error('profit unavailable') })
    await assert.rejects(load(client, 'session'), /profit unavailable/)
  })
}

test('atomic functions change only their profit blocks', () => {
  const root = new URL('../../migrations/', import.meta.url)
  const before = readFileSync(new URL('20261001235354_cash_expected_from_ledger.sql', root), 'utf8').replaceAll('\r\n', '\n')
  const after = readFileSync(new URL('20261005194051_centralize_cash_session_profit.sql', root), 'utf8').replaceAll('\r\n', '\n')
  const extract = (text, name) => {
    const start = text.indexOf(`create or replace function public.${name}(`)
    const delimiter = name === 'close_cash_session_atomic' ? '$function$' : '$$'
    const body = text.indexOf(`as ${delimiter}`, start)
    return text.slice(start, text.indexOf(`${delimiter};`, body + delimiter.length + 3) + delimiter.length + 1)
  }
  for (const name of ['record_first_cash_count_atomic', 'submit_cash_recount_atomic', 'close_cash_session_atomic']) {
    const original = extract(before, name)
    const expected = original.replace(/select coalesce\(\s*sum\([\s\S]*?into v_profit_total[\s\S]*?and lower\(trim\(coalesce\(sale\.payment_method, ''\)\)\) = (?:'efectivo'|lower\('Efectivo'\));/, `v_profit_total := public.get_cash_session_profit(${name === 'close_cash_session_atomic' ? 'v_open_session.id' : 'p_session_id'});`)
    assert.notEqual(expected, original)
    assert.equal(extract(after, name), expected)
  }
})
