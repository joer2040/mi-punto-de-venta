import { useRef, useState } from 'react'
import { financialService } from '../api/financialService'
import { generateIdempotencyKey } from '../lib/financeIdempotency'
import { formatCurrency } from '../lib/reportUtils'
import FinanceAlert from './FinanceAlert'
import FinanceConfirm from './FinanceConfirm'
import { colors, space, type as typography, radius, shadow } from '../lib/designTokens'

const FUND_OPTIONS = [
  { code: '1101', name: 'Caja operativa' },
  { code: '1102', name: 'Caja fuerte' },
  { code: '1103', name: 'Banco' },
]
const FUND_NAMES = Object.fromEntries(FUND_OPTIONS.map((f) => [f.code, f.name]))

const INITIAL_FORM = {
  destinationCode: '1101',
  amount: '',
  description: 'Aportación del propietario',
}

const validateContribution = ({ destinationCode, amount }) => {
  const errors = {}
  if (!destinationCode) errors.destinationCode = 'Selecciona el fondo destino.'
  const parsed = parseFloat(amount)
  if (!amount || !isFinite(parsed) || parsed <= 0) {
    errors.amount = 'El importe debe ser mayor que 0.'
  } else if (!/^\d+(\.\d{1,2})?$/.test(String(amount).trim())) {
    errors.amount = 'El importe admite máximo 2 decimales.'
  }
  return errors
}

const FinancesOwnerContributionPanel = ({ onClose, onNavigate }) => {
  const [form, setForm] = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [confirmPending, setConfirmPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const idempotencyKeyRef = useRef(generateIdempotencyKey())

  const handleField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errors = validateContribution(form)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})
    setConfirmPending(true)
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    setResult(null)
    try {
      await financialService.recordOwnerContribution({
        destinationCode: form.destinationCode,
        amount: parseFloat(form.amount),
        description: form.description.trim() || null,
        idempotencyKey: idempotencyKeyRef.current,
      })
      setResult({
        type: 'success',
        title: 'Aportación registrada',
        message: `${formatCurrency(parseFloat(form.amount))} a ${FUND_NAMES[form.destinationCode]}.`,
      })
      setConfirmPending(false)
      idempotencyKeyRef.current = generateIdempotencyKey()
    } catch (err) {
      setResult({
        type: 'error',
        title: 'Error en la aportación',
        message: err.message || 'No se pudo registrar la aportación.',
      })
      setConfirmPending(false)
      idempotencyKeyRef.current = generateIdempotencyKey()
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setForm(INITIAL_FORM)
    setFieldErrors({})
    setConfirmPending(false)
    setResult(null)
    idempotencyKeyRef.current = generateIdempotencyKey()
  }

  const confirmLines = [
    `Destino: ${FUND_NAMES[form.destinationCode]}`,
    `Importe: ${formatCurrency(parseFloat(form.amount) || 0)}`,
    ...(form.description.trim() ? [`Descripción: ${form.description.trim()}`] : []),
  ]

  const succeeded = result?.type === 'success'

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Aportación del propietario</span>
        <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Cerrar formulario">
          ×
        </button>
      </div>

      {result && (
        <div style={{ marginBottom: space[7] }}>
          <FinanceAlert
            type={result.type}
            title={result.title}
            message={result.message}
            onDismiss={succeeded ? undefined : () => setResult(null)}
          />
          {succeeded && (
            <div style={successActionsStyle}>
              <button type="button" onClick={handleReset} style={primaryActionStyle}>
                Nueva operación
              </button>
              <button type="button" onClick={() => onNavigate('finances-journal')} style={secondaryActionStyle}>
                Ver pólizas
              </button>
            </div>
          )}
        </div>
      )}

      {confirmPending && !result && (
        <FinanceConfirm
          title="Confirmar aportación"
          lines={confirmLines}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmPending(false)}
          loading={submitting}
          confirmLabel="Confirmar aportación"
        />
      )}

      {!confirmPending && !succeeded && (
        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroupStyle}>
            <label htmlFor="contribution-destination" style={labelStyle}>
              Fondo destino <span style={requiredMarkStyle}>*</span>
            </label>
            <select
              id="contribution-destination"
              value={form.destinationCode}
              onChange={handleField('destinationCode')}
              style={{ ...selectStyle, ...(fieldErrors.destinationCode ? errorBorderStyle : null) }}
            >
              {FUND_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.code} — {opt.name}
                </option>
              ))}
            </select>
            {fieldErrors.destinationCode && (
              <div style={fieldErrorStyle}>{fieldErrors.destinationCode}</div>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="contribution-amount" style={labelStyle}>
              Importe <span style={requiredMarkStyle}>*</span>
            </label>
            <input
              id="contribution-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={handleField('amount')}
              placeholder="0.00"
              style={{ ...inputStyle, ...(fieldErrors.amount ? errorBorderStyle : null) }}
            />
            {fieldErrors.amount && <div style={fieldErrorStyle}>{fieldErrors.amount}</div>}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="contribution-description" style={labelStyle}>
              Descripción <span style={optionalMarkStyle}>(opcional)</span>
            </label>
            <input
              id="contribution-description"
              type="text"
              value={form.description}
              onChange={handleField('description')}
              maxLength={200}
              style={inputStyle}
            />
          </div>

          <div style={formActionsStyle}>
            <button type="button" onClick={onClose} style={cancelButtonStyle}>
              Cancelar
            </button>
            <button type="submit" style={submitButtonStyle}>
              Continuar →
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

const panelStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.lg,
  padding: space[8],
  boxShadow: shadow.md,
  border: `1px solid ${colors.gray200}`,
  borderTop: `5px solid ${colors.violet700}`,
}

const panelHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: space[8],
  paddingBottom: space[6],
  borderBottom: `1px solid ${colors.gray200}`,
}

const panelTitleStyle = {
  color: colors.gray900,
  fontWeight: typography.black,
  fontSize: typography['2xl'],
}

const closeButtonStyle = {
  background: 'none',
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.sm,
  cursor: 'pointer',
  color: colors.gray500,
  fontSize: typography.xl,
  lineHeight: 1,
  padding: `${space[2]} ${space[5]}`,
}

const fieldGroupStyle = {
  marginBottom: space[7],
}

const labelStyle = {
  display: 'block',
  marginBottom: space[3],
  color: colors.gray700,
  fontWeight: typography.bold,
  fontSize: typography.sm,
}

const requiredMarkStyle = {
  color: colors.red600,
}

const optionalMarkStyle = {
  color: colors.gray400,
  fontWeight: 400,
}

const selectStyle = {
  width: '100%',
  padding: `${space[5]} ${space[6]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray900,
  WebkitTextFillColor: colors.gray900,
  fontWeight: typography.bold,
  fontSize: typography.md,
  boxSizing: 'border-box',
}

const inputStyle = {
  width: '100%',
  padding: `${space[5]} ${space[6]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray900,
  WebkitTextFillColor: colors.gray900,
  fontSize: typography.md,
  boxSizing: 'border-box',
}

const errorBorderStyle = {
  border: `1px solid ${colors.red600}`,
  outline: `1px solid ${colors.red600}`,
}

const fieldErrorStyle = {
  marginTop: space[3],
  color: colors.red600,
  fontSize: typography.sm,
  fontWeight: typography.bold,
}

const formActionsStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: space[6],
  marginTop: space[9],
  paddingTop: space[7],
  borderTop: `1px solid ${colors.gray200}`,
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

const submitButtonStyle = {
  padding: `${space[5]} ${space[8]}`,
  borderRadius: radius.md,
  border: 'none',
  backgroundColor: colors.violet700,
  color: colors.white,
  fontWeight: typography.black,
  cursor: 'pointer',
}

const successActionsStyle = {
  display: 'flex',
  gap: space[6],
  marginTop: space[6],
  flexWrap: 'wrap',
}

const primaryActionStyle = {
  padding: `${space[4]} ${space[8]}`,
  borderRadius: radius.md,
  border: 'none',
  backgroundColor: colors.violet700,
  color: colors.white,
  fontWeight: typography.black,
  cursor: 'pointer',
}

const secondaryActionStyle = {
  padding: `${space[4]} ${space[8]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  backgroundColor: colors.white,
  color: colors.gray700,
  fontWeight: typography.bold,
  cursor: 'pointer',
}

export default FinancesOwnerContributionPanel
