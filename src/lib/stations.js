const normalizeStation = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

export const isDirectSaleStation = (table) =>
  normalizeStation(table?.number) === normalizeStation('Venta Directa')

export const partitionStations = (tables) => {
  const direct = []
  const bars = []
  const dining = []
  for (const table of tables || []) {
    if (isDirectSaleStation(table)) direct.push(table)
    else if (/^barra\b/i.test(String(table?.number || '').trim())) bars.push(table)
    else dining.push(table)
  }
  return { direct, bars, dining }
}
