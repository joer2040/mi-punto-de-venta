import { formatCurrency } from '../lib/reportUtils'
import { colors, space, type, radius } from '../lib/designTokens'

// FUNDS-01D: saldo actual del fondo seleccionado. Solo presentación: sin proyección ni validación.
const FundBalanceContext = ({ fund, loading, cashError, ledgerError }) => {
  if (!fund) {
    return loading ? <div style={boxStyle}><span style={captionStyle}>Consultando saldo...</span></div> : null
  }

  const isCash = fund.code === '1101'
  const error = isCash ? cashError : ledgerError
  let message = null
  if (error || (!isCash && !fund.available)) message = 'Saldo no disponible'
  else if (isCash && !fund.hasOpenSession) message = 'No hay sesión de caja abierta'

  return (
    <div style={boxStyle}>
      <span style={nameStyle}>{fund.name}</span>
      {message ? (
        <span style={messageStyle}>{message}</span>
      ) : (
        <>
          <span style={{ ...valueStyle, color: fund.value < 0 ? colors.red700 : colors.gray900 }}>
            {formatCurrency(fund.value)}
          </span>
          <span style={captionStyle}>{isCash ? 'Efectivo esperado en sesión actual' : 'Saldo contable'}</span>
        </>
      )}
    </div>
  )
}

const boxStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  columnGap: space[3],
  rowGap: space[1],
  marginTop: space[3],
  padding: `${space[2]} ${space[4]}`,
  backgroundColor: colors.gray100,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.md,
}

const nameStyle = {
  color: colors.gray600,
  fontSize: type.sm,
  fontWeight: type.bold,
}

const valueStyle = {
  fontSize: type.md,
  fontWeight: type.black,
}

const captionStyle = {
  color: colors.gray500,
  fontSize: type.sm,
}

const messageStyle = {
  color: colors.gray600,
  fontSize: type.sm,
}

export default FundBalanceContext
