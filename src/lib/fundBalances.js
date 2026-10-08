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
