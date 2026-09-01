import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { financialService } from '../api/financialService'
import { securityService } from '../api/securityService'
import { generateIdempotencyKey } from '../lib/financeIdempotency'
import FinanceAlert from './FinanceAlert'
import FinanceConfirm from './FinanceConfirm'
import { colors, space, type as typography, radius, shadow } from '../lib/designTokens'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const INITIAL_FORM = {
  entryNumber: '',
  authorizedBy: '',
  justification: '',
}

const toLocalDateString = (d) => {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toUtcDateString = (d) => d.toISOString().slice(0, 10)

const findJournalEntryId = async (entryNumberOrId) => {
  const trimmed = entryNumberOrId.trim()
  if (UUID_RE.test(trimmed)) return trimmed

  const today = new Date()
  const fromDate = toLocalDateString(new Date(today.getFullYear(), today.getMonth(), 1))
  const toDate = toUtcDateString(today)
  const result = await financialService.getJournalReport(fromDate, toDate)
  const match = (result?.entries ?? []).find(
    (entry) => String(entry.entry_number ?? '').trim().toUpperCase() === trimmed.toUpperCase()
  )

  if (!match?.entry_id) {
    throw new Error(`No se encontro la poliza ${trimmed} en el reporte del mes actual.`)
  }

  return match.entry_id
}

const validateReversal = ({ entryNumber, authorizedBy, justification }, currentUserId) => {
  const errors = {}
  if (!entryNumber.trim()) errors.entryNumber = 'El numero de poliza es obligatorio.'
  const trimmedAuth = authorizedBy.trim()
  if (!trimmedAuth) {
    errors.authorizedBy = 'Selecciona el autorizador.'
  } else if (!UUID_RE.test(trimmedAuth)) {
    errors.authorizedBy = 'El autorizador seleccionado no es valido.'
  } else if (currentUserId && trimmedAuth.toLowerCase() === currentUserId.toLowerCase()) {
    errors.authorizedBy = 'El autorizador debe ser distinto al solicitante.'
  }
  if (!justification.trim()) errors.justification = 'El motivo es obligatorio.'
  return errors
}

const FinancesJournalReversalPanel = ({ onClose, onNavigate }) => {
  const { user } = useAuth()
  const [form, setForm] = useState(INITIAL_FORM)
  const [fieldErrors, setFieldErrors] = useState({})
  const [confirmPending, setConfirmPending] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const idempotencyKeyRef = useRef(generateIdempotencyKey())
  const [otherUsers, setOtherUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)

  useEffect(() => {
    securityService
      .getUsers()
      .then((users) => {
        setOtherUsers(users.filter((u) => u.status === 'active' && u.id !== user?.id))
      })
      .catch(() => setOtherUsers([]))
      .finally(() => setUsersLoading(false))
  }, [user?.id])

  const handleField = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const errors = validateReversal(form, user?.id)
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
      const journalEntryId = await findJournalEntryId(form.entryNumber)
      const response = await financialService.reverseJournalEntry({
        journalEntryId,
        authorizedBy: form.authorizedBy.trim(),
        justification: form.justification.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      })
      const reversalNumber = response?.reversal?.entry_number
      setResult({
        type: 'success',
        title: 'Reversa registrada',
        message: [
          `Poliza ${form.entryNumber.trim()} reversada exitosamente.`,
          reversalNumber ? `Reversa: ${reversalNumber}.` : null,
        ].filter(Boolean).join(' '),
      })
      setConfirmPending(false)
      idempotencyKeyRef.current = generateIdempotencyKey()
    } catch (err) {
      setResult({
        type: 'error',
        title: 'Error en la reversa',
        message: err.message || 'No se pudo registrar la reversa.',
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

  const authorizedUser = otherUsers.find((u) => u.id === form.authorizedBy)
  const authorizedLabel = authorizedUser
    ? `${authorizedUser.full_name} (${authorizedUser.username})`
    : form.authorizedBy.trim()

  const confirmLines = [
    `Poliza: ${form.entryNumber.trim()}`,
    `Autorizado por: ${authorizedLabel}`,
    `Motivo: ${form.justification.trim()}`,
  ]

  const succeeded = result?.type === 'success'

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <span style={panelTitleStyle}>Reversa de poliza</span>
        <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Cerrar formulario">
          x
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
                Nueva operacion
              </button>
              <button type="button" onClick={() => onNavigate('finances-journal')} style={secondaryActionStyle}>
                Ver polizas
              </button>
            </div>
          )}
        </div>
      )}

      {confirmPending && !result && (
        <FinanceConfirm
          title="Confirmar reversa de poliza"
          lines={confirmLines}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmPending(false)}
          loading={submitting}
          confirmLabel="Confirmar reversa"
        />
      )}

      {!confirmPending && !succeeded && (
        <form onSubmit={handleSubmit} noValidate>
          <div style={fieldGroupStyle}>
            <label htmlFor="reversal-entry" style={labelStyle}>
              Numero de poliza <span style={requiredMarkStyle}>*</span>
            </label>
            <input
              id="reversal-entry"
              type="text"
              value={form.entryNumber}
              onChange={handleField('entryNumber')}
              placeholder="JE-XXX-XXXXXXXX"
              style={{ ...inputStyle, ...(fieldErrors.entryNumber ? errorBorderStyle : null) }}
            />
            {fieldErrors.entryNumber && (
              <div style={fieldErrorStyle}>{fieldErrors.entryNumber}</div>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="reversal-authorized-by" style={labelStyle}>
              Autorizado por <span style={requiredMarkStyle}>*</span>
            </label>
            <select
              id="reversal-authorized-by"
              value={form.authorizedBy}
              onChange={handleField('authorizedBy')}
              disabled={usersLoading}
              style={{ ...selectStyle, ...(fieldErrors.authorizedBy ? errorBorderStyle : null) }}
            >
              <option value="">
                {usersLoading ? 'Cargando usuarios...' : 'Selecciona el autorizador'}
              </option>
              {otherUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.username})
                </option>
              ))}
            </select>
            {fieldErrors.authorizedBy && (
              <div style={fieldErrorStyle}>{fieldErrors.authorizedBy}</div>
            )}
          </div>

          <div style={fieldGroupStyle}>
            <label htmlFor="reversal-justification" style={labelStyle}>
              Motivo <span style={requiredMarkStyle}>*</span>
            </label>
            <textarea
              id="reversal-justification"
              value={form.justification}
              onChange={handleField('justification')}
              rows={3}
              style={{ ...textareaStyle, ...(fieldErrors.justification ? errorBorderStyle : null) }}
            />
            {fieldErrors.justification && (
              <div style={fieldErrorStyle}>{fieldErrors.justification}</div>
            )}
          </div>

          <div style={formActionsStyle}>
            <button type="button" onClick={onClose} style={cancelButtonStyle}>
              Cancelar
            </button>
            <button type="submit" style={submitButtonStyle}>
              Continuar
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

export default FinancesJournalReversalPanel
