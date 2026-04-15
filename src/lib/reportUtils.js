const PAGE_SIZE_OPTIONS = [10, 20]
const MAX_ROWS_PER_PAGE = 20

export const clampRowsPerPage = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return PAGE_SIZE_OPTIONS[0]
  return PAGE_SIZE_OPTIONS.includes(parsed)
    ? parsed
    : Math.min(MAX_ROWS_PER_PAGE, Math.max(PAGE_SIZE_OPTIONS[0], parsed))
}

export const getPageSizeOptions = () => PAGE_SIZE_OPTIONS

export const formatDateTime = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export const formatCurrency = (value) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

export const formatNumericFolio = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits || String(value ?? '')
}

let xlsxModulePromise = null

const loadXlsx = async () => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx')
  }

  return xlsxModulePromise
}

export const downloadReportAsExcel = async ({ filename, sheetName, columns, rows }) => {
  const XLSX = await loadXlsx()
  const headerRow = columns.map((column) => column.label)
  const dataRows = rows.map((row) => columns.map((column) => row[column.key] ?? ''))
  const worksheet = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows])

  worksheet['!cols'] = columns.map((column) => {
    const maxContentLength = Math.max(
      column.label.length,
      ...rows.map((row) => String(row[column.key] ?? '').length)
    )

    return {
      wch: Math.min(Math.max(maxContentLength + 2, 14), 30),
    }
  })

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, String(sheetName || 'Reporte').slice(0, 31))
  XLSX.writeFile(workbook, `${filename}.xlsx`)
}
