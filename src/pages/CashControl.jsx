import React, { useEffect, useMemo, useState } from 'react'
import { cashControlService } from '../api/cashControlService'
import { useAuth } from '../contexts/AuthContext'
import { ACTION_KEYS, PAGE_PERMISSION_MAP } from '../lib/permissionConfig'
import { formatCurrency, formatDateTime, formatNumericFolio } from '../lib/reportUtils'
import { useResponsive } from '../lib/useResponsive'
import { colors, space, type, radius, shadow } from '../lib/designTokens'

let jsPdfModulePromise = null

const loadJsPdf = async () => {
  if (!jsPdfModulePromise) {
    jsPdfModulePromise = import('jspdf')
  }

  return jsPdfModulePromise
}

const formatDateOnly = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const formatTimeOnly = (value) => {
  if (!value) return ''
  return new Date(value).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const fitText = (pdf, value, maxWidth) => {
  const text = String(value ?? '')
  if (pdf.getTextWidth(text) <= maxWidth) return text

  let current = text
  while (current.length > 1 && pdf.getTextWidth(`${current}...`) > maxWidth) {
    current = current.slice(0, -1)
  }

  return `${current}...`
}

const buildCashClosurePdf = async ({ session, sales, openingInventory, closingInventory }) => {
  const { jsPDF } = await loadJsPdf()
  const salesRows = sales || []
  const openingRows = openingInventory || []
  const closingRows = closingInventory || []
  const pdf = new jsPDF({
    unit: 'mm',
    format: 'a4',
    orientation: 'landscape',
  })

  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12
  const contentWidth = pageWidth - margin * 2
  const pageBottom = pageHeight - margin
  const salesRowHeight = 6
  const inventoryRowHeight = 6
  let cursorY = margin

  const ensureSpace = (requiredHeight) => {
    if (cursorY + requiredHeight <= pageBottom) return
    pdf.addPage()
    cursorY = margin
  }

  const drawSectionTitle = (title) => {
    ensureSpace(10)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.text(title, margin, cursorY)
    cursorY += 5
  }

  const drawTableHeader = (columns) => {
    ensureSpace(8)
    pdf.setDrawColor(226, 232, 240)
    pdf.setFillColor(241, 245, 249)
    pdf.rect(margin, cursorY, contentWidth, 6, 'FD')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    columns.forEach((column) => {
      pdf.text(column.label, column.x, cursorY + 4, column.options || undefined)
    })
    cursorY += 6
  }

  const drawParallelInventoryTables = (leftRows, rightRows) => {
    const tableGap = 8
    const tableWidth = (contentWidth - tableGap) / 2
    const leftTableX = margin
    const rightTableX = margin + tableWidth + tableGap
    const headerHeight = 6
    const titleHeight = 6
    const rowHeight = inventoryRowHeight
    const rowCount = Math.max(leftRows.length, rightRows.length, 1)

    const drawInventoryHeaders = () => {
      ensureSpace(titleHeight + headerHeight + rowHeight + 2)

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.text('Inventario Inicial', leftTableX, cursorY + 4)
      pdf.text('Inventario Final', rightTableX, cursorY + 4)
      cursorY += titleHeight

      pdf.setFillColor(241, 245, 249)
      pdf.setDrawColor(226, 232, 240)
      pdf.rect(leftTableX, cursorY, tableWidth, headerHeight, 'FD')
      pdf.rect(rightTableX, cursorY, tableWidth, headerHeight, 'FD')

      pdf.setFontSize(7.5)
      pdf.text('Producto', leftTableX + 2, cursorY + 4)
      pdf.text('Cantidad', leftTableX + tableWidth - 34, cursorY + 4)
      pdf.text('Costo Promedio', leftTableX + tableWidth - 2, cursorY + 4, { align: 'right' })

      pdf.text('Producto', rightTableX + 2, cursorY + 4)
      pdf.text('Cantidad', rightTableX + tableWidth - 34, cursorY + 4)
      pdf.text('Costo Promedio', rightTableX + tableWidth - 2, cursorY + 4, { align: 'right' })

      cursorY += headerHeight
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8.5)
    }

    drawInventoryHeaders()

    for (let index = 0; index < rowCount; index += 1) {
      if (cursorY + rowHeight > pageBottom) {
        pdf.addPage()
        cursorY = margin
        drawInventoryHeaders()
      }

      const leftRow = leftRows[index]
      const rightRow = rightRows[index]

      if (leftRow) {
        pdf.text(fitText(pdf, leftRow.material_name, tableWidth - 62), leftTableX + 2, cursorY + 4)
        pdf.text(String(leftRow.quantity ?? 0), leftTableX + tableWidth - 34, cursorY + 4)
        pdf.text(formatCurrency(leftRow.average_cost), leftTableX + tableWidth - 2, cursorY + 4, { align: 'right' })
      }

      if (rightRow) {
        pdf.text(fitText(pdf, rightRow.material_name, tableWidth - 62), rightTableX + 2, cursorY + 4)
        pdf.text(String(rightRow.quantity ?? 0), rightTableX + tableWidth - 34, cursorY + 4)
        pdf.text(formatCurrency(rightRow.average_cost), rightTableX + tableWidth - 2, cursorY + 4, { align: 'right' })
      }

      cursorY += rowHeight
    }

    cursorY += 4
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('Control y corte de caja', margin, cursorY)
  cursorY += 7

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Sesion: ${session?.id?.slice(0, 8) || 'N/D'}`, margin, cursorY)
  pdf.text(`Estado: ${session?.status === 'closed' ? 'Cerrado' : 'Abierto'}`, margin + 70, cursorY)
  pdf.text(`Apertura: ${formatDateTime(session?.opened_at) || 'N/D'}`, margin + 130, cursorY)
  cursorY += 5
  pdf.text(`Cierre: ${formatDateTime(session?.closed_at) || 'N/D'}`, margin, cursorY)
  pdf.text(`Generado: ${formatDateTime(new Date().toISOString())}`, margin + 130, cursorY)
  cursorY += 8

  const summaryItems = [
    ['Fondo inicial', formatCurrency(session?.opening_amount)],
    ['Ventas registradas', formatCurrency(session?.sales_cash_total)],
    ['Monto esperado total', formatCurrency(session?.expected_cash_total)],
    ['Monto final de caja', formatCurrency(session?.closing_amount)],
    ['Ganancia actual', formatCurrency(session?.profit_total)],
  ]

  const summaryBoxWidth = (contentWidth - 8) / 2
  const summaryBoxHeight = 12
  summaryItems.forEach(([label, value], index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = margin + column * (summaryBoxWidth + 8)
    const y = cursorY + row * (summaryBoxHeight + 4)

    pdf.setDrawColor(203, 213, 225)
    pdf.roundedRect(x, y, summaryBoxWidth, summaryBoxHeight, 2, 2)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text(label, x + 3, y + 4)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(10)
    pdf.text(value, x + 3, y + 9)
  })

  cursorY += Math.ceil(summaryItems.length / 2) * (summaryBoxHeight + 4) + 4

  drawSectionTitle('Ventas de la sesion')
  drawTableHeader([
    { label: 'Hora', x: margin + 2 },
    { label: 'Folio', x: margin + 35 },
    { label: 'Monto', x: pageWidth - margin - 2, options: { align: 'right' } },
  ])

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  if (salesRows.length === 0) {
    ensureSpace(8)
    pdf.text('Sin ventas registradas en esta sesion.', margin + 2, cursorY + 4)
    cursorY += 7
  } else {
    salesRows.forEach((sale) => {
      ensureSpace(salesRowHeight + 2)
      pdf.text(formatTimeOnly(sale.created_at), margin + 2, cursorY + 4)
      pdf.text(formatNumericFolio(sale.document_number || sale.id), margin + 35, cursorY + 4)
      pdf.text(formatCurrency(sale.total_amount), pageWidth - margin - 2, cursorY + 4, { align: 'right' })
      cursorY += salesRowHeight
    })
  }

  cursorY += 5

  drawParallelInventoryTables(openingRows, closingRows)

  return pdf
}

const getSuggestedPdfName = (session) =>
  session?.report_pdf_metadata?.suggested_file_name ||
  `corte-caja-${session?.id?.slice(0, 8) || 'sesion'}.pdf`

const CashControl = () => {
  const { isMobile } = useResponsive()
  const { can } = useAuth()
  const canManageCash = can(PAGE_PERMISSION_MAP['cash-control'], ACTION_KEYS.MANAGE)
  const [overview, setOverview] = useState({ session: null })
  const [openingAmount, setOpeningAmount] = useState('')
  const [isChecked, setIsChecked] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState(null)

  const session = overview?.session || null
  const isOpen = session?.status === 'open'

  const loadOverview = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)

    try {
      const data = await cashControlService.getSessionOverview()
      setOverview(data || { session: null })
    } catch (error) {
      console.error('Error al cargar control de caja:', error)
      setNotice({ type: 'warning', message: error.message || 'No se pudo cargar la sesion de caja.' })
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined

    const timer = window.setInterval(() => {
      loadOverview({ silent: true })
    }, 30000)

    return () => window.clearInterval(timer)
  }, [isOpen])

  const statusLabel = isOpen ? 'Abierto' : 'Cerrado'
  const summaryCards = useMemo(
    () => [
      {
        label: 'Apertura de Caja (Fondo Inicial guardado)',
        value: formatCurrency(session?.opening_amount),
      },
      {
        label: 'Ventas Registradas del dia',
        value: formatCurrency(session?.sales_cash_total),
      },
      {
        label: 'Ganancia actual',
        value: formatCurrency(session?.profit_total),
      },
    ],
    [session?.opening_amount, session?.profit_total, session?.sales_cash_total]
  )

  const handleOpenSession = async () => {
    if (!canManageCash) return
    if (!isChecked) {
      setNotice({ type: 'warning', message: 'Debes confirmar el check antes de abrir caja.' })
      return
    }

    const amount = Number(openingAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice({ type: 'warning', message: 'Ingresa un monto inicial valido y mayor a 0.' })
      return
    }

    try {
      setSubmitting(true)
      setNotice(null)
      const data = await cashControlService.openCashSession(amount)
      setOverview({ session: data.session })
      setOpeningAmount('')
      setIsChecked(false)
      setNotice({ type: 'success', message: 'Caja abierta correctamente.' })
    } catch (error) {
      console.error('Error al abrir caja:', error)
      setNotice({ type: 'warning', message: error.message || 'No se pudo abrir la caja.' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCloseSession = async () => {
    if (!canManageCash) return

    try {
      setSubmitting(true)
      setNotice(null)
      const data = await cashControlService.closeCashSession()
      const pdf = await buildCashClosurePdf({
        session: data.session,
        sales: data.sales,
        openingInventory: data.opening_inventory,
        closingInventory: data.closing_inventory,
      })
      pdf.save(getSuggestedPdfName(data.session))
      setOverview({ session: data.session })
      setNotice({ type: 'success', message: 'Caja cerrada y reporte PDF generado.' })
    } catch (error) {
      console.error('Error al cerrar caja:', error)
      setNotice({ type: 'warning', message: error.message || 'No se pudo cerrar la caja.' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={loadingStyle}>Cargando control y corte de caja...</div>
  }

  return (
    <div style={getPageStyle(isMobile)}>
      <section style={heroStyle}>
        <div style={heroTextWrapStyle}>
          <div style={eyebrowStyle}>OPERACION DE CAJA</div>
          <h2 style={getTitleStyle(isMobile)}>Control y corte de caja</h2>
          <p style={subtitleStyle}>
            Administra la apertura, consulta el flujo de efectivo en tiempo real y genera el corte final con
            inventario inicial y final.
          </p>
        </div>

        <div style={statusPanelStyle}>
          <div style={sessionMetaStyle}>
            <span style={sessionMetaLabelStyle}>Sesion</span>
            <strong>{formatDateOnly(new Date().toISOString())}</strong>
            <span style={sessionMetaSmallStyle}>
              Hora de apertura: {session?.opened_at ? formatTimeOnly(session.opened_at) : 'Pendiente'}
            </span>
          </div>

          <div
            style={{
              ...statusBadgeStyle,
              ...(isOpen ? statusBadgeOpenStyle : statusBadgeClosedStyle),
            }}
          >
            Estado: {statusLabel}
          </div>
        </div>
      </section>

      {notice && (
        <div
          style={{
            ...noticeStyle,
            ...(notice.type === 'success' ? noticeSuccessStyle : noticeWarningStyle),
          }}
        >
          {notice.message}
        </div>
      )}

      <section style={getGridStyle(isMobile)}>
        <div style={cardStyle}>
          <div style={cardTitleStyle}>Control de efectivo (Flujo de caja)</div>
          {!isOpen && (
            <>
              <label htmlFor="cash-opening-amount" style={fieldLabelStyle}>Entrada Caja</label>
              <input
                id="cash-opening-amount"
                type="number"
                min="0"
                step="0.01"
                value={openingAmount}
                onChange={(event) => setOpeningAmount(event.target.value)}
                style={inputStyle}
                placeholder="0.00"
                disabled={!canManageCash || submitting}
              />

              <label style={checkWrapStyle}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(event) => setIsChecked(event.target.checked)}
                  disabled={!canManageCash || submitting}
                />
                <span>Check de confirmacion antes de ingresar monto inicial</span>
              </label>

              <button
                type="button"
                onClick={handleOpenSession}
                disabled={!canManageCash || !isChecked || submitting || Number(openingAmount) <= 0}
                style={{
                  ...primaryButtonStyle,
                  ...((!canManageCash || !isChecked || submitting || Number(openingAmount) <= 0) ? disabledButtonStyle : null),
                }}
              >
                {submitting ? 'Procesando...' : 'Ingresar monto inicial caja'}
              </button>
            </>
          )}

          {isOpen && (
            <>
              {summaryCards.map((item) => (
                <div key={item.label} style={metricCardStyle}>
                  <span style={metricLabelStyle}>{item.label}</span>
                  <strong style={metricValueStyle}>{item.value}</strong>
                </div>
              ))}

              <div style={expectedTotalCardStyle}>
                <span style={expectedTotalLabelStyle}>Monto Esperado Total</span>
                <strong style={expectedTotalValueStyle}>{formatCurrency(session?.expected_cash_total)}</strong>
              </div>

              <button
                type="button"
                onClick={handleCloseSession}
                disabled={!canManageCash || submitting}
                style={{
                  ...dangerButtonStyle,
                  ...((!canManageCash || submitting) ? disabledButtonStyle : null),
                }}
              >
                {submitting ? 'Cerrando caja...' : 'Cerrar caja'}
              </button>
            </>
          )}
        </div>

        <div style={cardStyle}>
          <div style={cardTitleStyle}>Resumen de sesion</div>
          <div style={sessionInfoListStyle}>
            <div style={sessionInfoRowStyle}>
              <span>Fecha de apertura</span>
              <strong>{session?.opened_at ? formatDateOnly(session.opened_at) : 'Sin sesion registrada'}</strong>
            </div>
            <div style={sessionInfoRowStyle}>
              <span>Hora de apertura</span>
              <strong>{session?.opened_at ? formatTimeOnly(session.opened_at) : 'Pendiente'}</strong>
            </div>
            <div style={sessionInfoRowStyle}>
              <span>Ultimo cierre</span>
              <strong>{session?.closed_at ? formatDateTime(session.closed_at) : 'No disponible'}</strong>
            </div>
            <div style={sessionInfoRowStyle}>
              <span>Monto final</span>
              <strong>{formatCurrency(session?.closing_amount)}</strong>
            </div>
          </div>

          {!isOpen && (
            <div style={frozenNoteStyle}>
              La informacion final queda congelada en estado cerrado hasta la proxima apertura.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const getPageStyle = (isMobile) => ({
  padding: isMobile ? space[6] : `${space[8]} ${space[10]} ${space[10]}`,
  backgroundColor: colors.gray100,
  minHeight: '100vh',
})

const heroStyle = {
  background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #ecfccb 100%)',
  borderRadius: radius.xl,
  boxShadow: shadow.lg,
  border: `1px solid rgba(191, 219, 254, 0.9)`,
  padding: space[10],
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: space[9],
  flexWrap: 'wrap',
}

const heroTextWrapStyle = {
  maxWidth: '720px',
}

const eyebrowStyle = {
  color: colors.teal700,
  fontWeight: type.black,
  fontSize: type.xs,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
}

const getTitleStyle = (isMobile) => ({
  margin: `${space[5]} 0 ${space[6]} 0`,
  color: colors.gray900,
  fontSize: isMobile ? type['2xl'] : type['3xl'],
  lineHeight: 1.05,
})

const subtitleStyle = {
  margin: 0,
  color: colors.gray600,
  fontSize: type.md,
  lineHeight: 1.6,
}

const statusPanelStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[6],
  minWidth: '200px',
}

const sessionMetaStyle = {
  backgroundColor: colors.white,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.xl,
  padding: `${space[7]} ${space[8]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  boxShadow: shadow.sm,
}

const sessionMetaLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: type.black,
}

const sessionMetaSmallStyle = {
  color: colors.gray600,
  fontSize: type.sm,
}

const statusBadgeStyle = {
  alignSelf: 'flex-start',
  padding: `${space[2]} ${space[8]}`,
  borderRadius: radius.full,
  fontWeight: type.black,
  fontSize: type.sm,
}

const statusBadgeOpenStyle = {
  backgroundColor: colors.green100,
  color: colors.green700,
}

const statusBadgeClosedStyle = {
  backgroundColor: colors.red100,
  color: colors.red700,
}

const noticeStyle = {
  marginTop: space[9],
  padding: `${space[5]} ${space[7]}`,
  borderRadius: radius.lg,
  fontWeight: type.bold,
}

const noticeSuccessStyle = {
  backgroundColor: colors.green50,
  color: '#047857',
}

const noticeWarningStyle = {
  backgroundColor: colors.amber50,
  color: '#c2410c',
}

const getGridStyle = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr',
  gap: space[7],
  marginTop: space[7],
})

const cardStyle = {
  backgroundColor: colors.white,
  borderRadius: radius.xl,
  padding: space[8],
  boxShadow: shadow.md,
  border: `1px solid ${colors.gray200}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[6],
}

const cardTitleStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type.xl,
}

const fieldLabelStyle = {
  display: 'block',
  color: colors.gray700,
  fontWeight: type.black,
  fontSize: type.sm,
}

const inputStyle = {
  width: '100%',
  padding: `${space[4]} ${space[5]}`,
  borderRadius: radius.md,
  border: `1px solid ${colors.gray300}`,
  boxSizing: 'border-box',
}

const checkWrapStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: space[5],
  color: colors.gray700,
  fontWeight: type.bold,
}

const primaryButtonStyle = {
  border: 'none',
  borderRadius: radius.md,
  backgroundColor: colors.teal700,
  color: colors.white,
  fontWeight: type.black,
  padding: `${space[4]} ${space[9]}`,
  cursor: 'pointer',
}

const dangerButtonStyle = {
  border: 'none',
  borderRadius: radius.md,
  backgroundColor: colors.red700,
  color: colors.white,
  fontWeight: type.black,
  padding: `${space[4]} ${space[9]}`,
  cursor: 'pointer',
}

const disabledButtonStyle = {
  backgroundColor: colors.gray400,
  cursor: 'not-allowed',
}

const metricCardStyle = {
  backgroundColor: colors.gray100,
  border: `1px solid ${colors.gray200}`,
  borderRadius: radius.lg,
  padding: `${space[4]} ${space[6]}`,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const metricLabelStyle = {
  color: colors.gray500,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: type.black,
}

const metricValueStyle = {
  color: colors.gray900,
  fontSize: type.xl,
  fontWeight: type.black,
}

const expectedTotalCardStyle = {
  background: 'linear-gradient(135deg, #dbeafe 0%, #ffffff 100%)',
  border: `1px solid ${colors.blue100}`,
  borderRadius: radius.lg,
  padding: space[7],
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
}

const expectedTotalLabelStyle = {
  color: colors.blue700,
  fontWeight: type.black,
  fontSize: type.xs,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const expectedTotalValueStyle = {
  color: colors.gray900,
  fontWeight: type.black,
  fontSize: type['4xl'],
}

const sessionInfoListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[6],
}

const sessionInfoRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: space[6],
  alignItems: 'center',
  paddingBottom: space[5],
  borderBottom: `1px solid ${colors.gray200}`,
  color: colors.gray700,
}

const frozenNoteStyle = {
  backgroundColor: colors.gray100,
  color: colors.gray600,
  borderRadius: radius.lg,
  padding: space[7],
  fontWeight: type.bold,
  lineHeight: 1.5,
}

const loadingStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: colors.gray900,
  fontWeight: type.black,
  background: colors.gray100,
}

export default CashControl
