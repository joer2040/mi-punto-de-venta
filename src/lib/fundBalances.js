export const FUND_OPTIONS = [
  { code: '1101', name: 'Caja operativa' },
  { code: '1102', name: 'Caja fuerte' },
  { code: '1103', name: 'Banco' },
]

// FUNDS-01C: resumen de fondos. 1101 sale de la sesión de caja abierta (expected_cash_total,
// autoritativo por CAJA-03B); 1102/1103 salen del saldo contable. Sin cálculos contables aquí.
const ledgerFund = (accountBalances, code, name) => {
  const row = accountBalances?.find((b) => b.code === code)
  return {
    code,
    name,
    value: row ? Number(row.balance) : null,
    available: Boolean(row),
    source: 'ledger',
  }
}

export const buildFundBalances = ({ cashOverview, accountBalances }) => {
  const session = cashOverview?.session
  const hasOpenSession = session?.status === 'open'
  return {
    operatingCash: {
      code: '1101',
      name: 'Caja operativa',
      value: hasOpenSession ? Number(session.expected_cash_total) : null,
      hasOpenSession,
      source: 'cash_session',
    },
    safe: ledgerFund(accountBalances, '1102', 'Caja fuerte'),
    bank: ledgerFund(accountBalances, '1103', 'Banco'),
  }
}

const FUND_KEY_BY_CODE = { 1101: 'operatingCash', 1102: 'safe', 1103: 'bank' }

// 1101 sin sesión devuelve operatingCash (hasOpenSession:false); código desconocido → null.
export const getFundByCode = (funds, code) => funds?.[FUND_KEY_BY_CODE[code]] ?? null

// Refleja create_purchase_with_ledger: Efectivo usa cash_source; Tarjeta/Transferencia → Banco.
export const purchaseFundCode = (paymentMethod, cashSource) => {
  if (paymentMethod === 'Efectivo') {
    return { caja_operativa: '1101', caja_fuerte: '1102' }[cashSource] ?? null
  }
  return paymentMethod === 'Transferencia' || paymentMethod === 'Tarjeta' ? '1103' : null
}
