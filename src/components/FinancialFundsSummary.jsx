import { useFundBalances } from '../lib/useFundBalances'
import { formatCurrency } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

const ACCENT = colors.violet700

const FundCard = ({ name, value, caption, message }) => (
  <div style={cardStyle}>
    <div style={cardLabelStyle}>{name}</div>
    {message ? (
      <div style={messageStyle}>{message}</div>
    ) : (
      <>
        <div style={{ ...valueStyle, color: value < 0 ? colors.red700 : colors.gray900 }}>
          {formatCurrency(value)}
        </div>
        <div style={captionStyle}>{caption}</div>
      </>
    )}
  </div>
)

const ledgerCard = (fund, ledgerError) =>
  ledgerError || !fund.available
    ? { message: 'No disponible' }
    : { value: fund.value, caption: 'Saldo contable' }

const FinancialFundsSummary = () => {
  const { isMobile } = useResponsive()
  const { funds, loading, cashError, ledgerError, refresh } = useFundBalances()
  const cash = funds?.operatingCash

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div style={sectionLabelStyle}>Resumen de fondos</div>
        <button type="button" onClick={refresh} disabled={loading} style={getRefreshStyle(loading)}>
          {loading && funds ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {!funds ? (
        <div style={loadingStyle}>Cargando fondos...</div>
      ) : (
        <div style={getGridStyle(isMobile)}>
          <FundCard
            name="Caja operativa"
            {...(cashError
              ? { message: 'No disponible' }
              : cash.hasOpenSession
                ? { value: cash.value, caption: 'Efectivo esperado en sesión actual' }
                : { message: 'No hay sesión de caja abierta' })}
          />
          <FundCard name="Caja fuerte" {...ledgerCard(funds.safe, ledgerError)} />
          <FundCard name="Banco" {...ledgerCard(funds.bank, ledgerError)} />
        </div>
      )}
    </section>
  )
}

const sectionStyle = {
  marginTop: space[8],
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[4],
  marginBottom: space[6],
}

const sectionLabelStyle = {
  color: colors.gray500,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const getRefreshStyle = (disabled) => ({
  background: 'none',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
  padding: `${space[2]} ${space[4]}`,
  color: disabled ? colors.gray400 : ACCENT,
  fontWeight: type.bold,
  fontSize: type.sm,
  cursor: disabled ? 'default' : 'pointer',
})

const loadingStyle = {
  color: colors.gray500,
  fontSize: type.md,
}

const getGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: space[7],
})

const cardStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: `${space[7]} ${space[8]}`,
  border: `1px solid ${colors.gray200}`,
  borderTop: `5px solid ${ACCENT}`,
  boxShadow: shadow.md,
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
}

const cardLabelStyle = {
  color: ACCENT,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
}

const valueStyle = {
  fontWeight: type.black,
  fontSize: type['2xl'],
}

const captionStyle = {
  color: colors.gray500,
  fontSize: type.sm,
}

const messageStyle = {
  color: colors.gray600,
  fontSize: type.md,
  fontWeight: type.bold,
}

export default FinancialFundsSummary
