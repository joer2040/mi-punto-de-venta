// IMPRESORA-01: POS-58 thermal ticket (58 mm paper). Built only from server-confirmed sale data.

// Printable width of common POS-58 printers (58 mm roll). Tune here if a printer clips the edges.
export const TICKET58_CONTENT_MM = 48
// Horizontal calibration: negative moves the printed content left, positive right (mm).
export const TICKET58_OFFSET_X_MM = -1
export const TICKET58_TIME_ZONE = 'America/Monterrey'

// Same labels as BUNDLE_RULES in pos-operations; used only when the server omits bundle_label.
const BUNDLE_LABELS_BY_TYPE = {
  cubeta: 'Cubeta Mixta',
  cubeta_caguamita: 'Cubeta Caguamita',
}

const toCents = (value) => Math.round(Number(value) * 100)

const formatMoney = (value) => `$${Number(value).toFixed(2)}`

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const dateTimeFormat = new Intl.DateTimeFormat('es-MX', {
  timeZone: TICKET58_TIME_ZONE,
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

// "octubre 27, 2026 02:05 p.m." in America/Monterrey, or null for a missing/invalid timestamp.
export const formatTicket58DateTime = (isoDate) => {
  if (!isoDate) return null
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return null

  const parts = Object.fromEntries(
    dateTimeFormat.formatToParts(date).map((part) => [part.type, part.value])
  )
  return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod}`
}

// Printed name for a line, or null when a bundle has no verifiable identity.
export const getTicket58ItemName = (item) => {
  if (item?.kind !== 'bundle') return String(item?.name ?? '').trim() || null
  const label = String(item.bundleLabel ?? '').trim()
  if (label) return label
  return BUNDLE_LABELS_BY_TYPE[String(item.bundleType ?? '').trim().toLowerCase()] ?? null
}

// Returns a user-facing reason when the ticket cannot be printed reliably, or null when it can.
export const getTicket58Problem = (ticket) => {
  const confirmed = ticket?.confirmed

  if (!formatTicket58DateTime(confirmed?.chargedAt)) {
    return 'falta la fecha de confirmación de la venta o no es válida.'
  }
  if (!Number.isFinite(confirmed.total)) {
    return 'falta el total confirmado por el servidor.'
  }
  if (!confirmed.hasItems || !Array.isArray(ticket.items) || ticket.items.length === 0) {
    return 'faltan los artículos confirmados por el servidor.'
  }

  // A bundle must print as one line; loose rows of a bundle mean it was not recognized.
  if (ticket.items.some((item) => item?.bundleId && item.kind !== 'bundle')) {
    return 'hay un paquete (cubeta) que no se pudo agrupar como un solo concepto.'
  }
  if (ticket.items.some((item) => item?.kind === 'bundle' && !getTicket58ItemName(item))) {
    return 'hay un paquete (cubeta) sin nombre confirmado.'
  }

  const itemsAreComplete = ticket.items.every((item) =>
    getTicket58ItemName(item) &&
    Number(item.quantity) > 0 &&
    Number.isFinite(item.unitPrice) &&
    Number.isFinite(item.subtotal)
  )
  if (!itemsAreComplete) {
    return 'hay artículos sin nombre, cantidad o importe.'
  }

  // Lines must add up to the confirmed total; no discount lines exist yet.
  const itemsCents = ticket.items.reduce((acc, item) => acc + toCents(item.subtotal), 0)
  if (itemsCents !== toCents(confirmed.total)) {
    return 'los importes de los artículos no coinciden con el total confirmado.'
  }

  return null
}

export const buildTicket58Html = ({ ticket, logoUrl }) => {
  const itemsMarkup = ticket.items
    .map(
      (item) => `
        <div class="item">
          <div class="item-name">${escapeHtml(item.quantity)} ${escapeHtml(getTicket58ItemName(item))}</div>
          <div class="item-amounts">
            <span>${formatMoney(item.unitPrice)}</span>
            <span class="item-amount">${formatMoney(item.subtotal)}</span>
          </div>
        </div>
      `
    )
    .join('')

  // No @page size: paper (58 mm roll) comes from the printer driver, so long tickets are never cut.
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Ticket</title>
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; line-height: 1.3; }
      .sheet {
        position: relative;
        left: ${TICKET58_OFFSET_X_MM}mm;
        width: ${TICKET58_CONTENT_MM}mm;
        margin: 0 auto;
        padding: 3mm 0 6mm;
      }
      .logo { display: block; width: 32mm; max-width: 100%; margin: 0 auto 2mm; }
      .date { text-align: center; margin-bottom: 2mm; }
      .items { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 1mm 0; }
      .item { padding: 1mm 0; break-inside: avoid; }
      .item-name { font-weight: 700; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
      .item-amounts { display: flex; justify-content: flex-end; gap: 4mm; white-space: nowrap; }
      .item-amount { min-width: 16mm; text-align: right; }
      .total { display: flex; justify-content: space-between; gap: 2mm; margin-top: 2mm; font-size: 14px; font-weight: 800; }
      .footer { text-align: center; margin-top: 4mm; }
    </style>
  </head>
  <body>
    <div class="sheet">
      <img src="${escapeHtml(logoUrl)}" alt="La Carreta" class="logo" />
      <div class="date">${escapeHtml(formatTicket58DateTime(ticket.confirmed.chargedAt))}</div>
      <div class="items">${itemsMarkup}</div>
      <div class="total">
        <span>TOTAL A PAGAR</span>
        <span>${formatMoney(ticket.confirmed.total)}</span>
      </div>
      <div class="footer">¡Gracias por su visita!</div>
    </div>
  </body>
</html>`
}

// Backup removal when the browser never fires afterprint.
export const TICKET58_PRINT_FRAME_CLEANUP_MS = 60 * 1000

// Prints a confirmed ticket from an off-screen iframe in the current page (no popup). With Chrome
// --kiosk-printing it goes straight to the default printer; otherwise the usual print dialog opens.
// Returns an error message, or null when printing was requested (not a physical confirmation).
export const printTicket58 = ({ ticket, logoUrl }) => {
  const problem = getTicket58Problem(ticket)
  if (problem) return `No se puede imprimir un ticket confiable: ${problem}`

  let frame = null
  try {
    frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    // Off-screen but rendered: display:none can prevent printing.
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:58mm;height:200mm;border:0;'

    let printed = false
    let removed = false
    const remove = () => {
      if (removed) return
      removed = true
      frame.remove()
    }

    // One print request per call, whichever of load / logo load / logo error comes first.
    const print = () => {
      if (printed) return
      printed = true
      try {
        const printWindow = frame.contentWindow
        printWindow.addEventListener('afterprint', () => setTimeout(remove, 1000), { once: true })
        setTimeout(remove, TICKET58_PRINT_FRAME_CLEANUP_MS)
        printWindow.focus()
        printWindow.print()
      } catch (error) {
        console.error('No se pudo imprimir el ticket:', error)
        remove()
      }
    }

    // The frame load event fires after its images; the logo check is a guard for that ordering.
    frame.addEventListener('load', () => {
      const logo = frame.contentDocument?.querySelector('img')
      if (!logo || logo.complete) {
        print()
      } else {
        logo.addEventListener('load', print, { once: true })
        logo.addEventListener('error', print, { once: true })
      }
    }, { once: true })

    frame.srcdoc = buildTicket58Html({ ticket, logoUrl })
    document.body.appendChild(frame)
  } catch (error) {
    console.error('No se pudo preparar la impresion del ticket:', error)
    frame?.remove()
    return 'No se pudo preparar la impresion del ticket.'
  }
  return null
}


// --- Reprint (IMPRESORA-01 Paso 2H): ticket stored by the ticket-operations Edge Function ---

export const TICKET58_RETENTION_DAYS = 15
const DAY_MS = 24 * 60 * 60 * 1000

export const isTicket58Expired = (chargedAt, now = Date.now()) =>
  now - new Date(chargedAt).getTime() >= TICKET58_RETENTION_DAYS * DAY_MS

const EXPIRED_MESSAGE = `El ticket vencio: solo se puede reimprimir durante ${TICKET58_RETENTION_DAYS} dias despues de la venta.`
const INCOMPLETE_MESSAGE = 'El ticket guardado esta incompleto o tiene importes no validos.'

const MONEY_RE = /^\d+(\.\d{1,2})?$/

// "123", "123.4" or "123.45" (string or number) to integer cents; null when not an exact amount.
const exactCents = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const raw = String(value).trim()
  if (!MONEY_RE.test(raw)) return null
  const [units, decimals = ''] = raw.split('.')
  const cents = Number(units) * 100 + Number(decimals.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}

// Stored ticket returned by ticket-operations/get (version POS58-v1) for saleId -> { ticket } | { problem }.
// Amounts are checked in integer cents and passed through unchanged; nothing comes from the catalog.
export const ticket58FromStoredTicket = (stored, saleId, now = Date.now()) => {
  if (!stored) return { problem: 'No existe un ticket guardado para esta venta.' }
  if (!saleId || stored.saleId !== saleId) {
    return { problem: 'El ticket recibido no corresponde a la venta seleccionada.' }
  }
  if (!formatTicket58DateTime(stored.chargedAt)) return { problem: INCOMPLETE_MESSAGE }

  const expiresAt = new Date(stored.expiresAt).getTime()
  if (isTicket58Expired(stored.chargedAt, now) || (Number.isFinite(expiresAt) && expiresAt <= now)) {
    return { problem: EXPIRED_MESSAGE }
  }

  const totalCents = exactCents(stored.total)
  const rows = Array.isArray(stored.items) ? stored.items : []
  if (totalCents === null || rows.length === 0) return { problem: INCOMPLETE_MESSAGE }

  const items = []
  let itemsCents = 0
  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    const quantity = Number(row?.quantity)
    const unitCents = exactCents(row?.unitPrice)
    const subtotalCents = exactCents(row?.subtotal)
    if (
      !name ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      unitCents === null ||
      subtotalCents === null ||
      Math.round(quantity * unitCents) !== subtotalCents
    ) {
      return { problem: INCOMPLETE_MESSAGE }
    }
    itemsCents += subtotalCents
    // Bundles arrive already grouped by the Edge Function: one line, quantity 1.
    items.push({ kind: 'material', bundleId: null, name, quantity, unitPrice: unitCents / 100, subtotal: subtotalCents / 100 })
  }

  if (itemsCents !== totalCents) {
    return { problem: 'Los importes del ticket no coinciden con el total confirmado.' }
  }

  return { ticket: { items, confirmed: { chargedAt: stored.chargedAt, total: totalCents / 100, hasItems: true } } }
}

// Message for a failed ticket-operations call; error.status is the HTTP status (null when unknown).
export const saleTicketErrorMessage = (error) => {
  switch (error?.status) {
    case 401: return 'Tu sesion expiro. Inicia sesion de nuevo para reimprimir.'
    case 403: return 'No tienes permiso para consultar este ticket.'
    case 404: return 'El ticket no esta disponible o ya vencio.'
    case 409: return 'No se pudo comprobar el ticket original de esta venta.'
    case 410: return EXPIRED_MESSAGE
    default: return 'No se pudo recuperar el ticket. Intenta de nuevo.'
  }
}

// --- Capture after a confirmed sale (Alternativa B: a ticket failure never touches the sale) ---

export const TICKET_CAPTURE_NOTICES = {
  failed: 'Venta registrada. El ticket no se guardo y podria no estar disponible para reimpresion.',
  unknown: 'Venta registrada. No se confirmo si el ticket quedo guardado para reimpresion.',
}

// 'saved' only when the server returned the stored ticket of this sale; a 4xx is a definitive
// 'failed'; no response, 5xx or anything else is 'unknown' (never reported as saved).
export const classifyTicketCapture = ({ data, error }, saleId) => {
  if (error) return error.status >= 400 && error.status < 500 ? 'failed' : 'unknown'
  return data?.ticket?.saleId === saleId ? 'saved' : 'unknown'
}

// Call only after the server confirmed the sale. One request, no retries, no economic calls.
export const captureTicketAfterConfirmedSale = async ({ saleId, idempotencyKey, capture, notify }) => {
  let outcome = 'unknown'
  if (saleId && idempotencyKey) {
    try {
      outcome = classifyTicketCapture({ data: await capture({ sale_id: saleId, idempotency_key: idempotencyKey }) }, saleId)
    } catch (error) {
      outcome = classifyTicketCapture({ error }, saleId)
    }
  }
  if (outcome !== 'saved') notify(TICKET_CAPTURE_NOTICES[outcome])
  return outcome
}
