import { useCallback, useEffect, useMemo, useState } from 'react'
import ReportView from '../components/ReportView'
import { financialService } from '../api/financialService'
import { formatCurrency } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius } from '../lib/designTokens'

const ACCOUNT_TYPE_LABELS = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Capital',
  income: 'Ingreso',
  expense: 'Gasto',
}

const COLUMNS = [
  { key: 'code', label: 'Código' },
  { key: 'name', label: 'Cuenta' },
  { key: 'account_type', label: 'Tipo' },
  { key: 'total_debit', label: 'Débitos' },
  { key: 'total_credit', label: 'Créditos' },
  { key: 'balance', label: 'Saldo' },
]

const FinancesBalances = () => {
  const [balances, setBalances] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [asOfInput, setAsOfInput] = useState('')
  const { isMobile } = useResponsive()

  const loadBalances = useCallback(async (asOf) => {
    setLoading(true)
    setError(null)
    try {
      const result = await financialService.getAccountBalances(asOf || null)
      setBalances(result?.balances ?? [])
    } catch (err) {
      setError(err.message || 'Error al cargar saldos de cuentas.')
      setBalances([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadBalances(null)
  }, [loadBalances])

  const handleConsultar = () => loadBalances(asOfInput || null)
  const handleLimpiar = () => {
    setAsOfInput('')
    loadBalances(null)
  }
  const handleActualizar = () => loadBalances(asOfInput || null)

  const totalActivos = useMemo(
    () =>
      balances
        .filter((b) => b.account_type === 'asset')
        .reduce((sum, b) => sum + Number(b.balance || 0), 0),
    [balances]
  )

  const totalPasivoCapital = useMemo(
    () =>
      balances
        .filter((b) => ['liability', 'equity'].includes(b.account_type))
        .reduce((sum, b) => sum + Number(b.balance || 0), 0),
    [balances]
  )

  const totalIngresos = useMemo(
    () =>
      balances
        .filter((b) => b.account_type === 'income')
        .reduce((sum, b) => sum + Number(b.balance || 0), 0),
    [balances]
  )

  const totalGastos = useMemo(
    () =>
      balances
        .filter((b) => b.account_type === 'expense')
        .reduce((sum, b) => sum + Number(b.balance || 0), 0),
    [balances]
  )

  const totalPasivoCapitalResultado = totalPasivoCapital + totalIngresos - totalGastos

  const exportRows = balances.map((b) => ({
    code: b.code,
    name: b.name,
    account_type: ACCOUNT_TYPE_LABELS[b.account_type] ?? b.account_type,
    total_debit: formatCurrency(b.total_debit),
    total_credit: formatCurrency(b.total_credit),
    balance: formatCurrency(b.balance),
  }))

  if (error) {
    return (
      <div style={errorPageStyle}>
        <div style={errorBannerStyle}>{error}</div>
        <button type="button" onClick={() => loadBalances(asOfInput || null)} style={retryButtonStyle}>
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <ReportView
      title="Saldos de cuentas"
      isMobile={isMobile}
      filters={
        <div style={getFilterGridStyle(isMobile)}>
          <div>
            <label htmlFor="balances-as-of" style={filterLabelStyle}>
              Fecha de corte
            </label>
            <input
              id="balances-as-of"
              type="date"
              value={asOfInput}
              onChange={(e) => setAsOfInput(e.target.value)}
              style={filterInputStyle}
            />
          </div>
          <div style={filterButtonGroupStyle}>
            <button type="button" onClick={handleConsultar} style={primaryButtonStyle}>
              Consultar
            </button>
            <button
              type="button"
              onClick={handleLimpiar}
              style={secondaryButtonStyle}
              disabled={!asOfInput}
            >
              Limpiar fecha
            </button>
            <button type="button" onClick={handleActualizar} style={secondaryButtonStyle}>
              Actualizar
            </button>
          </div>
        </div>
      }
      rows={loading ? [] : balances}
      columns={COLUMNS}
      renderRow={(row) => (
        <tr key={row.account_id} style={rowStyle}>
          <td style={{ ...tdStyle, fontWeight: type.bold }}>{row.code}</td>
          <td style={tdStyle}>{row.name}</td>
          <td style={tdStyle}>{ACCOUNT_TYPE_LABELS[row.account_type] ?? row.account_type}</td>
          <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.total_debit)}</td>
          <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(row.total_credit)}</td>
          <td
            style={{
              ...tdStyle,
              textAlign: 'right',
              fontWeight: type.black,
              color: Number(row.balance) >= 0 ? colors.teal700 : colors.red600,
            }}
          >
            {formatCurrency(row.balance)}
          </td>
        </tr>
      )}
      exportColumns={COLUMNS}
      exportRows={exportRows}
      exportFileName="saldos-cuentas"
      summary={
        loading ? null : (
          <span>
            Activos: <strong>{formatCurrency(totalActivos)}</strong>
            {'  ·  '}
            Pasivo + Capital + Ingresos - Gastos:{' '}
            <strong>{formatCurrency(totalPasivoCapitalResultado)}</strong>
          </span>
        )
      }
      emptyText={loading ? 'Cargando saldos de cuentas...' : 'Sin cuentas activas con movimientos.'}
    />
  )
}

const getFilterGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr',
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
  border: `1px solid ${colors.red100}`,
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

export default FinancesBalances
