import { supabase } from '../lib/supabase'

const invokeFinancialOperation = async (action, payload = {}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('financial-operations', {
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

export const financialService = {
  // ── Consultas ─────────────────────────────────────────────────────────────

  getLedgerStatus() {
    return invokeFinancialOperation('get_ledger_status')
  },

  getAccountBalances(asOf = null) {
    return invokeFinancialOperation('get_account_balances', {
      ...(asOf ? { as_of: asOf } : {}),
    })
  },

  getJournalReport(fromDate, toDate) {
    return invokeFinancialOperation('get_journal_report', {
      from_date: fromDate,
      to_date: toDate,
    })
  },

  getAccountLedger(accountCode, fromDate = null, toDate = null) {
    return invokeFinancialOperation('get_account_ledger', {
      account_code: accountCode,
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    })
  },

  getCashSessionsReport(fromDate = null, toDate = null) {
    return invokeFinancialOperation('get_cash_sessions_report', {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    })
  },

  // ── Operaciones de escritura (Manager) ────────────────────────────────────

  recordTransfer({ fromCode, toCode, amount, description, idempotencyKey }) {
    return invokeFinancialOperation('record_transfer', {
      from_code: fromCode,
      to_code: toCode,
      amount: Number(amount),
      ...(description ? { description } : {}),
      idempotency_key: idempotencyKey,
    })
  },

  recordOwnerContribution({ destinationCode, amount, description, idempotencyKey }) {
    return invokeFinancialOperation('record_owner_contribution', {
      destination_code: destinationCode,
      amount: Number(amount),
      ...(description ? { description } : {}),
      idempotency_key: idempotencyKey,
    })
  },

  resolveDiscrepancy({ cashSessionId, resolutionType, amount, motive, idempotencyKey }) {
    return invokeFinancialOperation('resolve_cash_discrepancy', {
      cash_session_id: cashSessionId,
      resolution_type: resolutionType,
      amount: Number(amount),
      motive,
      idempotency_key: idempotencyKey,
    })
  },

  // ── Operaciones de escritura (Superadmin only) ────────────────────────────

  recordOwnerWithdrawal({ sourceCode, amount, authorizedBy, description, idempotencyKey }) {
    return invokeFinancialOperation('record_owner_withdrawal', {
      source_code: sourceCode,
      amount: Number(amount),
      authorized_by: authorizedBy,
      ...(description ? { description } : {}),
      idempotency_key: idempotencyKey,
    })
  },

  reverseJournalEntry({ journalEntryId, authorizedBy, justification, idempotencyKey }) {
    return invokeFinancialOperation('reverse_journal_entry', {
      journal_entry_id: journalEntryId,
      authorized_by: authorizedBy,
      justification,
      idempotency_key: idempotencyKey,
    })
  },
}
