export const isActiveSaleTable = (table) =>
  String(table?.status || '').trim().toLowerCase() === 'ocupada' || Boolean(table?.current_order_id)

export const countActiveSales = (tables) => tables.filter(isActiveSaleTable).length

// Mirrors the CASE normalization in finalize_pos_sale (SQL).
// Required so sales.payment_method matches the exact Title Case filter
// used by loadSalesSummary in cash-operations (.eq('payment_method', 'Efectivo')).
export const normalizePaymentMethod = (raw) => {
  switch (String(raw ?? '').toLowerCase().trim()) {
    case 'efectivo':      return 'Efectivo'
    case 'tarjeta':       return 'Tarjeta'
    case 'transferencia': return 'Transferencia'
    default:              return String(raw ?? '').trim()
  }
}
