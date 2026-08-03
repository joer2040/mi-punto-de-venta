import { supabase } from '../lib/supabase'

const invokePosOperation = async (action, payload = {}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('pos-operations', {
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
      } catch {
        // The response may contain plain text instead of JSON.
      }

      if (parsedJson?.error) {
        throw new Error(parsedJson.error)
      }

      let errorText = ''
      try {
        errorText = await textResponse.text()
      } catch {
        // Fall through to the original Supabase error below.
      }

      if (errorText) {
        throw new Error(errorText)
      }
    }

    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export const posService = {
  async getCashSessionStatus() {
    return invokePosOperation('get_cash_session_status')
  },

  async saveTableOrder({ table_id, expected_order_id = null, items, lock_waiter_editing = false }) {
    return invokePosOperation('save_table_order', {
      table_id,
      expected_order_id,
      items: items || [],
      lock_waiter_editing,
    })
  },

  async finalizeSale({ table_id, expected_order_id, items, payment_method = 'Efectivo' }) {
    return invokePosOperation('finalize_sale', {
      table_id,
      expected_order_id,
      items: items || [],
      payment_method,
    })
  },
}
