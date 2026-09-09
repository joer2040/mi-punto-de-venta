import { colors, space, type as typography, radius, shadow } from '../lib/designTokens'

// Inline confirmation step for destructive financial operations.
// Renders in place of (or below) the form when the user initiates an action.
//
// Usage pattern in operation forms:
//   {confirmPending ? (
//     <FinanceConfirm
//       title="Confirmar traspaso"
//       lines={['De: Caja operativa', 'A: Banco', 'Monto: $500.00']}
//       onConfirm={handleExecute}
//       onCancel={() => setConfirmPending(false)}
//       loading={submitting}
//     />
//   ) : (
//     <form>...</form>
//   )}
const FinanceConfirm = ({
  title,
  lines = [],
  onConfirm,
  onCancel,
  loading = false,
  confirmLabel = 'Confirmar operación',
}) => (
  <div style={containerStyle}>
    <div style={headerStyle}>
      <span aria-hidden="true" style={iconStyle}>⚠</span>
      <span style={titleStyle}>{title}</span>
    </div>

    {lines.length > 0 && (
      <ul style={linesStyle}>
        {lines.map((line, i) => (
          <li key={i} style={lineItemStyle}>{line}</li>
        ))}
      </ul>
    )}

    <div style={actionsStyle}>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        style={{
          ...cancelButtonStyle,
          ...(loading ? disabledStyle : null),
        }}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={loading}
        style={{
          ...confirmButtonStyle,
          ...(loading ? disabledStyle : null),
        }}
      >
        {loading ? 'Procesando…' : confirmLabel}
      </button>
    </div>
  </div>
)

const containerStyle = {
  backgroundColor: colors.amber50,
  border: `1px solid #fde68a`,
  borderRadius: radius.lg,
  padding: space[8],
  boxShadow: shadow.sm,
}

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[5],
  marginBottom: space[6],
}

const iconStyle = {
  color: colors.amber700,
  fontSize: typography.xl,
  lineHeight: 1,
  flexShrink: 0,
}

const titleStyle = {
  color: colors.amber700,
  fontWeight: typography.black,
  fontSize: typography.lg,
}

const linesStyle = {
  margin: `0 0 ${space[8]} 0`,
  padding: `0 0 0 ${space[8]}`,
  listStyle: 'disc',
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
}

const lineItemStyle = {
  color: colors.gray700,
  fontSize: typography.md,
}

const actionsStyle = {
  display: 'flex',
  gap: space[6],
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
}

const cancelButtonStyle = {
  padding: `${space[5]} ${space[8]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray700,
  fontWeight: typography.bold,
  cursor: 'pointer',
}

const confirmButtonStyle = {
  padding: `${space[5]} ${space[8]}`,
  borderRadius: radius.md,
  border: 'none',
  backgroundColor: colors.amber700,
  color: colors.white,
  fontWeight: typography.black,
  cursor: 'pointer',
}

const disabledStyle = {
  opacity: 0.55,
  cursor: 'not-allowed',
}

export default FinanceConfirm
