import { useCallback, useEffect, useRef, useState } from 'react'
import { cashControlService } from '../api/cashControlService'
import { financialService } from '../api/financialService'
import { buildFundBalances } from './fundBalances'

// Ventana mínima entre refresh automáticos (focus/visibility/poll) y el último iniciado.
const AUTO_REFRESH_COOLDOWN_MS = 5_000

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

// Carga al montar + refresh manual; opcionalmente focus/visibility/polling (sin realtime).
export const useFundBalances = ({ autoRefresh = false, pollIntervalMs = 0 } = {}) => {
  const [state, setState] = useState({ funds: null, cashError: null, ledgerError: null })
  const [loading, setLoading] = useState(true)
  const requestSequenceRef = useRef(0)
  const lastStartedAtRef = useRef(0)
  const mountedRef = useRef(false)

  // Solo la petición más reciente escribe estado; respuestas anteriores se descartan.
  const runRefresh = useCallback(() => {
    const requestId = ++requestSequenceRef.current
    lastStartedAtRef.current = Date.now()
    return fetchFunds().then((next) => {
      if (!mountedRef.current || requestId !== requestSequenceRef.current) return
      setState(next)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    mountedRef.current = true
    runRefresh()
    return () => {
      mountedRef.current = false
    }
  }, [runRefresh])

  const refresh = useCallback(() => {
    setLoading(true)
    return runRefresh()
  }, [runRefresh])

  useEffect(() => {
    if (!autoRefresh) return undefined
    const autoTrigger = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - lastStartedAtRef.current < AUTO_REFRESH_COOLDOWN_MS) return
      runRefresh()
    }
    window.addEventListener('focus', autoTrigger)
    document.addEventListener('visibilitychange', autoTrigger)
    const intervalId = pollIntervalMs > 0 ? setInterval(autoTrigger, pollIntervalMs) : null
    return () => {
      window.removeEventListener('focus', autoTrigger)
      document.removeEventListener('visibilitychange', autoTrigger)
      if (intervalId) clearInterval(intervalId)
    }
  }, [autoRefresh, pollIntervalMs, runRefresh])

  return { ...state, loading, refresh, refreshSilent: runRefresh }
}
