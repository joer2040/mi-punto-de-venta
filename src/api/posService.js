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

    if (response) {
      try {
        const errorBody = await response.json()
        throw new Error(errorBody?.error || error.message)
      } catch {
        try {
          const errorText = await response.text()
          throw new Error(errorText || error.message)
        } catch {
          throw new Error(error.message)
        }
      }
    }

    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export const posService = {
  async saveTableOrder({ table_id, items, lock_waiter_editing = false }) {
    return invokePosOperation('save_table_order', {
      table_id,
      items: items || [],
      lock_waiter_editing,
    })
  },

  async finalizeSale({ table_id, items, payment_method = 'Efectivo' }) {
    return invokePosOperation('finalize_sale', {
      table_id,
      items: items || [],
      payment_method,
    })
  },
}
