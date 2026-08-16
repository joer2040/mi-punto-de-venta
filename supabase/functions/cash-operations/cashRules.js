export const isActiveSaleTable = (table) =>
  String(table?.status || '').trim().toLowerCase() === 'ocupada' || Boolean(table?.current_order_id)

export const countActiveSales = (tables) => tables.filter(isActiveSaleTable).length
