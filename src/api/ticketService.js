// IMPRESORA-01: isolated read/receipt snapshot service; never calls finalize_sale.
import { supabase } from '../lib/supabase'

const requestTicket = async (action, payload = {}) => {
  const { data: sessionData, error: authError } = await supabase.auth.getSession()
  if (authError || !sessionData?.session?.access_token) throw new Error('Sesión requerida.')
  const { data, error } = await supabase.functions.invoke('ticket-operations', {
    body: { action, ...payload },
    headers: { Authorization: 'Bearer ' + sessionData.session.access_token },
  })
  if (error) {
    let message = error.message
    if (error.context && typeof error.context.json === 'function') {
      try { message = (await error.context.json())?.error || message } catch { /* retain original */ }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data.ticket
}

export const ticketService = {
  capture: (saleId, idempotencyKey) =>
    requestTicket('capture', { sale_id: saleId, idempotency_key: idempotencyKey }),
  get: (saleId) => requestTicket('get', { sale_id: saleId }),
}
