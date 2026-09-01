import { useRef, useState } from 'react'
import { financialService } from '../api/financialService'
import { generateIdempotencyKey } from '../lib/financeIdempotency'
import { formatCurrency } from '../lib/reportUtils'
import FinanceAlert from './FinanceAlert'
import FinanceConfirm from './FinanceConfirm'
import { colors, space, type as typography, radius, shadow } from '../lib/designTokens'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const RESOLUTION_OPTIONS = [
  { value: 'sobrante', label: 'Sobrante' },
  { value: 'faltante', label: 'Faltante' },
]

const INITIAL_FORM = {
  cashSessionId: '',
  resolutionType: 'sobrante',
  amount: '',
  motive: '',
}

const validateDiscrepancy = ({ cashSessionId, resolutionType, amount, motive }) => {
  const errors = {}
  if (!cashSessionId.trim()) {
    errors.cashSessionId = 'El ID de sesión es obligatorio.'
  } else if (!UUID_RE.test(cashSessionId.trim())) {
    errors.cashSessionId = 'El ID de sesión debe ser un UUID válido.'
  }
  if (!resolutionType) errors.resolutionType = 'Selecciona el tipo de resolución.'
  const parsed = parseFloat(amount)
  if (!amount || !isFinite(parsed) || parsed <= 0) {
    errors.amount = 'El importe debe ser mayor que 0.'
  } else if (!/^\d+(\.\d{1,2})?$/.test(String(amount).trim())) {
    errors.amount = 'El importe admite máximo 2 decimales.'
  }
  if (!motive.trim()) errors.motive = 'El motivo es obligatorio.'
  return errors
}

const FinancesDiscrepancyPanel = ({ onClose, onNavigate }) => {
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
    const errors = validateDiscrepancy(form)
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
      await financialService.resolveDiscrepancy({
        cashSessionId: form.cashSessionId.trim(),
        resolutionType: form.resolutionType,
        amount: parseFloat(form.amount),
        motive: form.motive.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      })
      const typeLabel = form.resolutionType === 'sobrante' ? 'Sobrante' : 'Faltante'
      setResult({
        type: 'success',
        title: 'Diferencia resuelta',
        message: `${typeLabel} de ${formatCurrency(parseFloat(form.amount))} registrado en sesión ${form.cashSessionId.trim().slice(0, 8)}…`,
      })
      setConfirmPending(false)
      idempotencyKeyRef.current = generateIdempotencyKey()
    } catch (err) {
      setResult({
        type: 'error',
        title: 'Error al resolver diferencia',
        message: err.message || 'No se pudo registrar la resolución.',
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

  const typeLabel =
    form.resolutionType === 'sobrante'
      ? 'Sobrante'
      : form.resolutionType === 'faltante'
        ? 'Faltante'
        : ''

  const confirmLines = [
    `Sesión: ${form.cashSessionId.trim() || '—'}`,
    `Tipo: ${typeLabel}`,
    `Importe: ${formatCurrency(parseFloat(form.amount) || 0)}`,
    `Motivo: ${form.motive.trim()}`,
  ]

  const succeeded = result?.type === 'success'

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Resolución de diferencia</span>
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
          title="Confirmar resolución de diferencia"
          lines={confirmLines}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmPending(false)}
          loading={submitting}
          confirmLabel="Confirmar resolución"
        />
      )}

      {!confirmPending && !succeeded && (
        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroupStyle}>
            <label htmlFor="discrepancy-session" style={labelStyle}>
              ID de sesión de caja <span style={requiredMarkStyle}>*</span>
            </label>
            <input
              id="discrepancy-session"
              type="text"
              value={form.cashSessionId}
              onChange={handleField('cashSessionId')}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              style={{ ...inputStyle, ...(fieldErrors.cashSessionId ? errorBorderStyle : null) }}
            />
            {fieldErrors.cashSessionId && (
              <div style={fieldErrorStyle}>{fieldErrors.cashSessionId}</div>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="discrepancy-type" style={labelStyle}>
              Tipo de resolución <span style={requiredMarkStyle}>*</span>
            </label>
            <select
              id="discrepancy-type"
              value={form.resolutionType}
              onChange={handleField('resolutionType')}
              style={{ ...selectStyle, ...(fieldErrors.resolutionType ? errorBorderStyle : null) }}
            >
              {RESOLUTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {fieldErrors.resolutionType && (
              <div style={fieldErrorStyle}>{fieldErrors.resolutionType}</div>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="discrepancy-amount" style={labelStyle}>
              Importe <span style={requiredMarkStyle}>*</span>
            </label>
            <input
              id="discrepancy-amount"
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
            <label htmlFor="discrepancy-motive" style={labelStyle}>
              Motivo <span style={requiredMarkStyle}>*</span>
            </label>
            <textarea
              id="discrepancy-motive"
              value={form.motive}
              onChange={handleField('motive')}
              rows={3}
              style={{ ...textareaStyle, ...(fieldErrors.motive ? errorBorderStyle : null) }}
            />
            {fieldErrors.motive && <div style={fieldErrorStyle}>{fieldErrors.motive}</div>}
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

const baseInputStyle = {
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

const inputStyle = baseInputStyle

const selectStyle = {
  ...baseInputStyle,
  fontWeight: typography.bold,
}

const textareaStyle = {
  ...baseInputStyle,
  resize: 'vertical',
  minHeight: '80px',
  fontFamily: 'inherit',
  lineHeight: 1.5,
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

export default FinancesDiscrepancyPanel
