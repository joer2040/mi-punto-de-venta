import { useCallback, useEffect, useState } from 'react'
import ReportView from '../components/ReportView'
import { financialService } from '../api/financialService'
import { formatCurrency, formatDateTime } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius } from '../lib/designTokens'

const STATUS_LABELS = {
  open: 'Abierta',
  closed: 'Cerrada',
}

const RESOLUTION_LABELS = {
  sobrante: 'Sobrante',
  faltante: 'Faltante',
}

const COLUMNS = [
  { key: 'session_id', label: 'Sesión ID' },
  { key: 'apertura', label: 'Apertura' },
  { key: 'cierre', label: 'Cierre' },
  { key: 'estado', label: 'Estado' },
  { key: 'fondo_inicio', label: 'Fondo inicio' },
  { key: 'esperado', label: 'Esperado' },
  { key: 'contado', label: 'Contado' },
  { key: 'diferencia', label: 'Diferencia' },
  { key: 'resolucion', label: 'Resolución' },
  { key: 'poliza', label: 'Póliza' },
]

const toLocalDateString = (d) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toUtcBoundaryDateString = (value, endOfDay = false) => {
  const [year, month, day] = value.split('-').map(Number)
  const boundary = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  )
  return boundary.toISOString().slice(0, 10)
}

const isSessionWithinLocalRange = (session, from, to) => {
  const openedDate = toLocalDateString(new Date(session.opened_at))
  return (!from || openedDate >= from) && (!to || openedDate <= to)
}

const validate = (from, to) => {
  if (from && to && from > to) return 'La fecha inicial no puede ser posterior a la fecha final.'
  return null
}

const getSessionId = (session) => session.session_id || ''

const formatSessionId = (sessionId) => {
  if (!sessionId) return '—'
  return `${sessionId.slice(0, 8)}...${sessionId.slice(-4)}`
}

const FinancesCashSessions = () => {
  const [sessions, setSessions] = useState([])
  const [copiedSessionId, setCopiedSessionId] = useState('')
  const [loading, setLoading] = useState(true)
  const [dateError, setDateError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const { isMobile } = useResponsive()

  const loadSessions = useCallback(async (from, to) => {
    const validError = validate(from, to)
    if (validError) {
      setDateError(validError)
      return
    }
    setDateError(null)
    setLoading(true)
    setLoadError(null)
    try {
      // The RPC applies UTC date boundaries; expand the query and trim results by local date.
      const queryFrom = from ? toUtcBoundaryDateString(from) : null
      const queryTo = to ? toUtcBoundaryDateString(to, true) : null
      const result = await financialService.getCashSessionsReport(queryFrom, queryTo)
      const receivedSessions = result?.sessions ?? []
      setSessions(receivedSessions.filter((session) => isSessionWithinLocalRange(session, from, to)))
    } catch (err) {
      setLoadError(err.message || 'Error al cargar sesiones de caja.')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const today = new Date()
    const from = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1))
    const to = toLocalDateString(today)
    setFromDate(from)
    setToDate(to)
    loadSessions(from, to)
  }, [loadSessions])

  const handleConsultar = () => loadSessions(fromDate, toDate)
  const handleActualizar = () => loadSessions(fromDate, toDate)
  const handleLimpiar = () => {
    const today = new Date()
    const from = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1))
    const to = toLocalDateString(today)
    setFromDate(from)
    setToDate(to)
    setDateError(null)
    loadSessions(from, to)
  }

  const handleCopySessionId = async (sessionId) => {
    if (!sessionId || !navigator.clipboard?.writeText) return
    await navigator.clipboard.writeText(sessionId)
    setCopiedSessionId(sessionId)
    window.setTimeout(() => {
      setCopiedSessionId((current) => (current === sessionId ? '' : current))
    }, 1800)
  }

  const exportRows = sessions.map((s) => ({
    session_id: getSessionId(s),
    apertura: formatDateTime(s.opened_at),
    cierre: s.closed_at ? formatDateTime(s.closed_at) : '',
    estado: STATUS_LABELS[s.status] ?? s.status,
    fondo_inicio: formatCurrency(s.opening_amount),
    esperado: formatCurrency(s.expected_cash),
    contado: (s.final_counted_cash ?? s.first_counted_cash) != null ? formatCurrency(s.final_counted_cash ?? s.first_counted_cash) : '',
    diferencia: s.difference_amount != null ? formatCurrency(s.difference_amount) : '',
    resolucion: s.resolution_type ? (RESOLUTION_LABELS[s.resolution_type] ?? s.resolution_type) : '',
    poliza: s.resolution_entry || '',
  }))

  if (loading) {
    return <div style={loadingStyle}>Cargando sesiones de caja...</div>
  }

  if (loadError) {
    return (
      <div style={errorPageStyle}>
        <div style={errorBannerStyle}>{loadError}</div>
        <button type="button" onClick={() => loadSessions(fromDate, toDate)} style={retryButtonStyle}>
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <ReportView
      title="Sesiones de caja"
      isMobile={isMobile}
      filters={
        <div>
          <div style={getFilterGridStyle(isMobile)}>
            <div>
              <label htmlFor="sessions-from-date" style={filterLabelStyle}>
                Fecha inicial
              </label>
              <input
                id="sessions-from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                style={filterInputStyle}
              />
            </div>
            <div>
              <label htmlFor="sessions-to-date" style={filterLabelStyle}>
                Fecha final
              </label>
              <input
                id="sessions-to-date"
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
      rows={sessions}
      columns={COLUMNS}
      renderRow={(row) => {
        const diffColor =
          row.resolution_type === 'sobrante'
            ? colors.teal700
            : row.resolution_type === 'faltante'
              ? colors.red600
              : colors.gray600

        return (
          <tr key={row.session_id} style={rowStyle}>
            <td style={tdStyle}>
              {getSessionId(row) ? (
                <div style={sessionIdWrapStyle}>
                  <code style={sessionIdCodeStyle} title={getSessionId(row)}>
                    {formatSessionId(getSessionId(row))}
                  </code>
                  <button
                    type="button"
                    onClick={() => handleCopySessionId(getSessionId(row))}
                    style={copyButtonStyle}
                    aria-label={`Copiar sesión ${getSessionId(row)}`}
                  >
                    {copiedSessionId === getSessionId(row) ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              ) : (
                '—'
              )}
            </td>
            <td style={tdStyle}>{formatDateTime(row.opened_at)}</td>
            <td style={tdStyle}>{row.closed_at ? formatDateTime(row.closed_at) : '—'}</td>
            <td style={tdStyle}>
              <span
                style={{
                  ...statusBadgeStyle,
                  backgroundColor: row.status === 'open' ? colors.green100 : colors.gray200,
                  color: row.status === 'open' ? colors.green700 : colors.gray700,
                }}
              >
                {STATUS_LABELS[row.status] ?? row.status}
              </span>
            </td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.opening_amount)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.expected_cash)}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {(row.final_counted_cash ?? row.first_counted_cash) != null
                ? formatCurrency(row.final_counted_cash ?? row.first_counted_cash)
                : '—'}
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: type.bold, color: diffColor }}>
              {row.difference_amount != null ? formatCurrency(row.difference_amount) : '—'}
            </td>
            <td style={{ ...tdStyle, color: diffColor, fontWeight: type.bold }}>
              {row.resolution_type ? (RESOLUTION_LABELS[row.resolution_type] ?? row.resolution_type) : '—'}
            </td>
            <td style={{ ...tdStyle, fontWeight: type.bold }}>
              {row.resolution_entry || '—'}
            </td>
          </tr>
        )
      }}
      exportColumns={COLUMNS}
      exportRows={exportRows}
      exportFileName="sesiones-caja"
      summary={`${sessions.length} sesión${sessions.length === 1 ? '' : 'es'} encontrada${sessions.length === 1 ? '' : 's'}.`}
      emptyText="Sin sesiones de caja para el rango de fechas seleccionado."
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
const tdStyle = { padding: '8px 12px', fontSize: type.md, color: colors.gray600 }
const sessionIdWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  whiteSpace: 'nowrap',
}
const sessionIdCodeStyle = {
  color: colors.gray700,
  fontSize: type.sm,
  fontFamily: 'monospace',
}
const copyButtonStyle = {
  padding: `${space[1]} ${space[4]}`,
  borderRadius: radius.sm,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.blue700,
  fontWeight: type.bold,
  cursor: 'pointer',
}
const statusBadgeStyle = {
  display: 'inline-block',
  padding: `2px ${space[5]}`,
  borderRadius: radius.full,
  fontWeight: type.bold,
  fontSize: type.sm,
}

export default FinancesCashSessions
