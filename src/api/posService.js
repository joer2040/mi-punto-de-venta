import { supabase } from '../lib/supabase'

const invokePosOperation = async (action, payload) => {
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

      let errorBody = null
      try {
        errorBody = await jsonResponse.json()
      } catch {
        // response may not be JSON
      }

      if (errorBody?.error) throw new Error(errorBody.error)

      let errorText = ''
      try {
        errorText = await textResponse.text()
      } catch {
        // fall through to generic message
      }

      if (errorText) throw new Error(errorText)
    }

    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export const posService = {
  async saveTableOrder({ table_id, expected_order_id = null, items, lock_waiter_editing = false }) {
    return invokePosOperation('save_table_order', {
      table_id,
      expected_order_id,
      items: items || [],
      lock_waiter_editing,
    })
  },

  async finalizeSale({ table_id, expected_order_id, items, payments, idempotency_key }) {
    return invokePosOperation('finalize_sale', {
      table_id,
      expected_order_id,
      items: items || [],
      payments,
      idempotency_key,
    })
  },
}
