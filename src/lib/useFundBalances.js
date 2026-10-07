import { useCallback, useEffect, useState } from 'react'
import { cashControlService } from '../api/cashControlService'
import { financialService } from '../api/financialService'
import { buildFundBalances } from './fundBalances'

// Fuentes independientes: una falla no oculta la otra.
const fetchFunds = async () => {
  const [cash, ledger] = await Promise.allSettled([
    cashControlService.getSessionOverview(),
    financialService.getAccountBalances(null),
  ])
  return {
    cashError: cash.status === 'rejected' ? cash.reason?.message || 'Error' : null,
    ledgerError: ledger.status === 'rejected' ? ledger.reason?.message || 'Error' : null,
    funds: buildFundBalances({
      cashOverview: cash.status === 'fulfilled' ? cash.value : null,
      accountBalances: ledger.status === 'fulfilled' ? ledger.value?.balances : null,
    }),
  }
}

// Carga al montar + refresh manual (sin polling/realtime: FUNDS-01E).
export const useFundBalances = () => {
  const [state, setState] = useState({ funds: null, cashError: null, ledgerError: null })
  const [loading, setLoading] = useState(true)

  const apply = useCallback((next) => {
    setState(next)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchFunds().then(apply)
  }, [apply])

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchFunds().then(apply)
  }, [apply])

  return { ...state, loading, refresh }
}
