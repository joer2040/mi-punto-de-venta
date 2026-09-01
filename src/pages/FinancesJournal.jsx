import { useCallback, useEffect, useMemo, useState } from 'react'
import ReportView from '../components/ReportView'
import { financialService } from '../api/financialService'
import { formatCurrency, formatDateTime } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius } from '../lib/designTokens'

const ENTRY_TYPE_LABELS = {
  ledger_activation: 'Apertura',
  transfer: 'Traspaso',
  owner_contribution: 'Aportación',
  owner_withdrawal: 'Retiro del propietario',
  cash_discrepancy: 'Diferencia de caja',
  reversal: 'Reversa',
  sale: 'Venta',
  purchase: 'Compra',
}

const COLUMNS = [
  { key: 'fecha', label: 'Fecha' },
  { key: 'poliza', label: 'Póliza' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'cuenta', label: 'Cuenta' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'debe', label: 'Debe' },
  { key: 'haber', label: 'Haber' },
]

const toLocalDateString = (d) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toUtcDateString = (d) => d.toISOString().slice(0, 10)

const validate = (from, to) => {
  if (!from || !to) return 'Ingresa fecha inicial y final antes de consultar.'
  if (from > to) return 'La fecha inicial no puede ser posterior a la fecha final.'
  return null
}

const FinancesJournal = () => {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateError, setDateError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { isMobile } = useResponsive()

  const loadEntries = useCallback(async (from, to) => {
    const validError = validate(from, to)
    if (validError) {
      setDateError(validError)
      return
    }
    setDateError(null)
    setLoading(true)
    setLoadError(null)
    try {
      const result = await financialService.getJournalReport(from, to)
      setEntries(result?.entries ?? [])
    } catch (err) {
      setLoadError(err.message || 'Error al cargar pólizas.')
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const today = new Date()
    const from = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1))
    const to = toUtcDateString(today)
    setFromDate(from)
    setToDate(to)
    loadEntries(from, to)
  }, [loadEntries])

  const handleConsultar = () => loadEntries(fromDate, toDate)
  const handleActualizar = () => loadEntries(fromDate, toDate)
  const handleLimpiar = () => {
    const today = new Date()
    const from = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1))
    const to = toUtcDateString(today)
    setFromDate(from)
    setToDate(to)
    setDateError(null)
    loadEntries(from, to)
  }

  const processedEntries = useMemo(() => {
    let lastEntryId = null
    let isEven = false
    return entries.map((row) => {
      if (row.entry_id !== lastEntryId) {
        lastEntryId = row.entry_id
        isEven = !isEven
      }
      return { ...row, _rowEven: isEven }
    })
  }, [entries])

  const totalDebe = useMemo(
    () => entries.reduce((sum, e) => sum + Number(e.debit || 0), 0),
    [entries]
  )
  const totalHaber = useMemo(
    () => entries.reduce((sum, e) => sum + Number(e.credit || 0), 0),
    [entries]
  )

  const exportRows = entries.map((e) => ({
    fecha: formatDateTime(e.occurred_at),
    poliza: e.entry_number,
    tipo: ENTRY_TYPE_LABELS[e.entry_type] ?? e.entry_type,
    cuenta: `${e.account_code} - ${e.account_name}`,
    descripcion: e.line_desc || '',
    debe: Number(e.debit) > 0 ? formatCurrency(e.debit) : '',
    haber: Number(e.credit) > 0 ? formatCurrency(e.credit) : '',
  }))

  if (loading) {
    return <div style={loadingStyle}>Cargando pólizas...</div>
  }

  if (loadError) {
    return (
      <div style={errorPageStyle}>
        <div style={errorBannerStyle}>{loadError}</div>
        <button type="button" onClick={() => loadEntries(fromDate, toDate)} style={retryButtonStyle}>
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <ReportView
      title="Pólizas / Asientos contables"
      isMobile={isMobile}
      filters={
        <div>
          <div style={getFilterGridStyle(isMobile)}>
            <div>
              <label htmlFor="journal-from-date" style={filterLabelStyle}>
                Fecha inicial
              </label>
              <input
                id="journal-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={filterInputStyle}
              />
            </div>
            <div>
              <label htmlFor="journal-to-date" style={filterLabelStyle}>
                Fecha final
              </label>
              <input
                id="journal-to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                style={filterInputStyle}
              />
            </div>
            <div style={filterButtonGroupStyle}>
              <button type="button" onClick={handleConsultar} style={primaryButtonStyle}>
                Consultar
              </button>
              <button type="button" onClick={handleActualizar} style={secondaryButtonStyle}>
                Actualizar
              </button>
              <button type="button" onClick={handleLimpiar} style={secondaryButtonStyle}>
                Limpiar filtros
              </button>
            </div>
          </div>
          {dateError && <div style={dateErrorStyle}>{dateError}</div>}
        </div>
      }
      rows={processedEntries}
      columns={COLUMNS}
      renderRow={(row) => (
        <tr key={row.line_id} style={row._rowEven ? evenRowStyle : rowStyle}>
          <td style={tdStyle}>{formatDateTime(row.occurred_at)}</td>
          <td style={{ ...tdStyle, fontWeight: type.bold }}>
            {row.entry_number}
            {row.entry_status === 'reversed' && (
              <span style={reversedTagStyle}>REVERSADA</span>
            )}
          </td>
          <td style={tdStyle}>{ENTRY_TYPE_LABELS[row.entry_type] ?? row.entry_type}</td>
          <td style={tdStyle}>
            <span style={accountCodeStyle}>{row.account_code}</span>
            {' '}
            {row.account_name}
          </td>
          <td style={{ ...tdStyle, color: colors.gray500 }}>{row.line_desc || '—'}</td>
          <td style={{ ...tdStyle, textAlign: 'right', color: colors.blue700, fontWeight: type.bold }}>
            {Number(row.debit) > 0 ? formatCurrency(row.debit) : ''}
          </td>
          <td style={{ ...tdStyle, textAlign: 'right', color: colors.teal700, fontWeight: type.bold }}>
            {Number(row.credit) > 0 ? formatCurrency(row.credit) : ''}
          </td>
        </tr>
      )}
      exportColumns={COLUMNS}
      exportRows={exportRows}
      exportFileName="polizas-contables"
      summary={
        <span>
          Total Debe: <strong>{formatCurrency(totalDebe)}</strong>
          {'  ·  '}
          Total Haber: <strong>{formatCurrency(totalHaber)}</strong>
        </span>
      }
      emptyText="Sin pólizas para el rango de fechas seleccionado."
    />
  )
}

const getFilterGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'auto auto 1fr',
  gap: space[6],
  alignItems: 'end',
})

const filterLabelStyle = {
  display: 'block',
  marginBottom: space[2],
  color: colors.gray600,
  fontWeight: type.bold,
  fontSize: type.sm,
}

const filterInputStyle = {
  padding: `${space[4]} ${space[5]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray900,
  WebkitTextFillColor: colors.gray900,
}

const filterButtonGroupStyle = {
  display: 'flex',
  gap: space[5],
  flexWrap: 'wrap',
  alignItems: 'center',
}

const primaryButtonStyle = {
  padding: `${space[4]} ${space[7]}`,
  borderRadius: radius.md,
  border: 'none',
  backgroundColor: colors.blue700,
  color: colors.white,
  fontWeight: type.black,
  cursor: 'pointer',
}

const secondaryButtonStyle = {
  padding: `${space[4]} ${space[7]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray700,
  fontWeight: type.bold,
  cursor: 'pointer',
}

const dateErrorStyle = {
  marginTop: space[5],
  padding: `${space[4]} ${space[6]}`,
  borderRadius: radius.md,
  backgroundColor: colors.amber50,
  color: colors.amber700,
  fontWeight: type.bold,
  fontSize: type.sm,
}

const loadingStyle = { padding: '50px', textAlign: 'center' }

const errorPageStyle = {
  padding: '40px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[6],
}

const errorBannerStyle = {
  padding: `${space[5]} ${space[7]}`,
  borderRadius: radius.md,
  backgroundColor: colors.red100,
  color: colors.red700,
  fontWeight: type.bold,
}

const retryButtonStyle = {
  padding: `${space[4]} ${space[7]}`,
  borderRadius: radius.md,
  border: 'none',
  backgroundColor: colors.blue700,
  color: colors.white,
  fontWeight: type.black,
  cursor: 'pointer',
}

const rowStyle = { borderBottom: `1px solid ${colors.gray200}` }
const evenRowStyle = { borderBottom: `1px solid ${colors.gray200}`, backgroundColor: colors.gray150 }
const tdStyle = { padding: '8px 12px', fontSize: type.md, color: colors.gray600 }
const accountCodeStyle = {
  display: 'inline-block',
  padding: `1px ${space[3]}`,
  borderRadius: radius.sm,
  backgroundColor: colors.gray200,
  color: colors.gray700,
  fontWeight: type.bold,
  fontSize: type.sm,
}

const reversedTagStyle = {
  display: 'inline-block',
  marginLeft: space[3],
  padding: `1px ${space[3]}`,
  borderRadius: radius.sm,
  backgroundColor: colors.red50,
  color: colors.red600,
  fontWeight: type.bold,
  fontSize: type.xs,
  letterSpacing: '0.03em',
}

export default FinancesJournal
