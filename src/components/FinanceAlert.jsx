import { colors, space, type as typography, radius } from '../lib/designTokens'

const TYPE_CONFIG = {
  success: {
    bg: colors.green50,
    border: colors.green100,
    text: colors.green700,
    icon: '✓',
  },
  error: {
    bg: colors.red50,
    border: colors.red100,
    text: colors.red700,
    icon: '✕',
  },
  warning: {
    bg: colors.amber50,
    border: '#fde68a',
    text: colors.amber700,
    icon: '⚠',
  },
  info: {
    bg: colors.blue50,
    border: colors.blue100,
    text: colors.blue700,
    icon: 'ℹ',
  },
}

const FinanceAlert = ({ type = 'info', title, message, onDismiss }) => {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.info

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: space[6],
        padding: `${space[6]} ${space[7]}`,
        borderRadius: radius.md,
        border: `1px solid ${config.border}`,
        backgroundColor: config.bg,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          color: config.text,
          fontWeight: typography.black,
          fontSize: typography.lg,
          lineHeight: 1,
          flexShrink: 0,
          marginTop: '1px',
        }}
      >
        {config.icon}
      </span>

      <div style={{ flex: 1 }}>
        {title && (
          <div
            style={{
              color: config.text,
              fontWeight: typography.black,
              marginBottom: message ? space[3] : 0,
              fontSize: typography.md,
            }}
          >
            {title}
          </div>
        )}
        {message && (
          <div style={{ color: config.text, fontSize: typography.sm, lineHeight: 1.55 }}>
            {message}
          </div>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar alerta"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: config.text,
            fontSize: typography.xl,
            lineHeight: 1,
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export default FinanceAlert
