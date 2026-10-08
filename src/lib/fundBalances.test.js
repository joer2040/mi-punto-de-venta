import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFundBalances, getFundByCode, purchaseFundCode } from './fundBalances.js'

const ledger = [
  { code: '1101', balance: '999.00' },
  { code: '1102', balance: '500.00' },
  { code: '1103', balance: '1000.00' },
]

test('C1 open session uses expected_cash_total', () => {
  const { operatingCash } = buildFundBalances({
    cashOverview: { session: { status: 'open', expected_cash_total: 1500 } },
    accountBalances: ledger,
  })
  assert.equal(operatingCash.value, 1500)
  assert.equal(operatingCash.hasOpenSession, true)
  assert.equal(operatingCash.source, 'cash_session')
})

test('C2 no session leaves operating cash empty (not ledger 1101)', () => {
  const { operatingCash } = buildFundBalances({ cashOverview: { session: null }, accountBalances: ledger })
  assert.equal(operatingCash.value, null)
  assert.equal(operatingCash.hasOpenSession, false)
})

test('C3 closed session does not expose frozen expected as current cash', () => {
  const { operatingCash } = buildFundBalances({
    cashOverview: { session: { status: 'closed', expected_cash_total: 800 } },
    accountBalances: ledger,
  })
  assert.equal(operatingCash.value, null)
  assert.equal(operatingCash.hasOpenSession, false)
})

test('C4 safe uses ledger 1102', () => {
  const { safe } = buildFundBalances({ cashOverview: null, accountBalances: ledger })
  assert.equal(safe.value, 500)
  assert.equal(safe.available, true)
})

test('C5 bank uses ledger 1103', () => {
  const { bank } = buildFundBalances({ cashOverview: null, accountBalances: ledger })
  assert.equal(bank.value, 1000)
  assert.equal(bank.available, true)
})

test('C6 negative balance is kept, not clamped', () => {
  const { safe } = buildFundBalances({
    cashOverview: null,
    accountBalances: [{ code: '1102', balance: '-3800.80' }],
  })
  assert.equal(safe.value, -3800.8)
})

test('C7 missing account is unavailable, not zero', () => {
  const { safe, bank } = buildFundBalances({ cashOverview: null, accountBalances: [{ code: '1101', balance: '1' }] })
  assert.deepEqual([safe.available, safe.value], [false, null])
  assert.deepEqual([bank.available, bank.value], [false, null])
  const failed = buildFundBalances({ cashOverview: null, accountBalances: null })
  assert.deepEqual([failed.safe.available, failed.safe.value], [false, null])
})

const funds = buildFundBalances({
  cashOverview: { session: { status: 'open', expected_cash_total: 520.24 } },
  accountBalances: [
    { code: '1102', balance: '-3800.80' },
    { code: '1103', balance: '0.00' },
  ],
})

test('getFundByCode maps fund codes to fund entries', () => {
  assert.equal(getFundByCode(funds, '1101'), funds.operatingCash)
  assert.equal(getFundByCode(funds, '1102'), funds.safe)
  assert.equal(getFundByCode(funds, '1103'), funds.bank)
})

test('getFundByCode returns null for unknown code, null code or missing funds', () => {
  assert.equal(getFundByCode(funds, '9999'), null)
  assert.equal(getFundByCode(funds, null), null)
  assert.equal(getFundByCode(null, '1102'), null)
})

test('getFundByCode keeps 1101 without session distinct from unknown code', () => {
  const closed = buildFundBalances({ cashOverview: { session: { status: 'closed' } }, accountBalances: [] })
  const fund = getFundByCode(closed, '1101')
  assert.notEqual(fund, null)
  assert.deepEqual([fund.hasOpenSession, fund.value], [false, null])
})

test('purchaseFundCode mirrors the backend payment account', () => {
  assert.equal(purchaseFundCode('Efectivo', 'caja_operativa'), '1101')
  assert.equal(purchaseFundCode('Efectivo', 'caja_fuerte'), '1102')
  assert.equal(purchaseFundCode('Transferencia', ''), '1103')
  assert.equal(purchaseFundCode('Tarjeta', ''), '1103')
})

test('purchaseFundCode returns null until an account can be resolved', () => {
  assert.equal(purchaseFundCode('Efectivo', ''), null)
  assert.equal(purchaseFundCode('', ''), null)
  assert.equal(purchaseFundCode('Cheque', ''), null)
})
