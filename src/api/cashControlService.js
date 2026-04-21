import { supabase } from '../lib/supabase'

const invokeCashOperation = async (action, payload = {}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('cash-operations', {
    body: {
      action,
      ...payload,
    },
    headers: session?.access_token
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : undefined,
  })

  if (error) {
    const response = error.context

    if (response && typeof response.clone === 'function') {
      const jsonResponse = response.clone()
      const textResponse = response.clone()

      let parsedJson = null
      try {
        parsedJson = await jsonResponse.json()
      } catch {}

      if (parsedJson?.error) {
        throw new Error(parsedJson.error)
      }

      let errorText = ''
      try {
        errorText = await textResponse.text()
      } catch {}

      if (errorText) {
        throw new Error(errorText)
      }
    }

    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export const cashControlService = {
  async getSessionOverview() {
    return invokeCashOperation('get_session_overview')
  },

  async openCashSession(openingAmount) {
    return invokeCashOperation('open_cash_session', {
      opening_amount: Number(openingAmount),
    })
  },

  async closeCashSession() {
    return invokeCashOperation('close_cash_session')
  },
}
