// IMPRESORA-01: print-only 58 mm output. Does not invoke any economic operation.
import logoUrl from '../assets/la_carreta_sin_fondo.png'

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]))
const money = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n.toFixed(2) : '0.00'
}

export const printPos58Ticket = (ticket, existingWindow = null) => {
  if (!ticket?.chargedAt || !Array.isArray(ticket?.items) || !ticket.items.length ||
    ticket.total == null || !Number.isFinite(Number(ticket.total))) {
    throw new Error('No hay datos completos de una venta confirmada para imprimir.')
  }
  if (ticket.expiresAt && Date.now() >= new Date(ticket.expiresAt).getTime()) {
    throw new Error('El ticket ya venció.')
  }
  const date = new Date(ticket.chargedAt)
  if (Number.isNaN(date.getTime())) throw new Error('Fecha original de venta inválida.')
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const pieces = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Monterrey', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const part = (type) => pieces.find((x) => x.type === type)?.value
  const dateLabel = months[Number(part('month')) - 1] + ' ' + Number(part('day')) + ', ' + part('year')
  const timeLabel = part('hour') + ':' + part('minute')
  const rows = ticket.items.map((item) => {
    const qty = Number(item.quantity)
    const unit = Number(item.unitPrice ?? item.unit_price)
    const total = Number(item.subtotal)
    if (!item.name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || !Number.isFinite(total)) {
      throw new Error('El ticket contiene un artículo incompleto.')
    }
    return '<section class="item"><div class="name">' + escapeHtml(qty) + ' x ' +
      escapeHtml(item.name) + '</div><div class="amount"><span>$' + money(unit) +
      ' c/u</span><strong>$' + money(total) + '</strong></div></section>'
  }).join('')
  const win = existingWindow || window.open('', '_blank', 'width=420,height=720')
  if (!win) throw new Error('Permite las ventanas emergentes para imprimir.')
  win.document.write('<!doctype html><html lang="es"><head><meta charset="UTF-8"><title>Ticket POS-58</title><style>' +
    '@page{size:58mm auto;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:58mm;' +
    'font:10px Arial,sans-serif;color:#000;background:#fff}.sheet{width:58mm;padding:3mm;}' +
    '.logo{display:block;max-width:34mm;max-height:30mm;margin:0 auto 3mm;object-fit:contain}' +
    '.date{text-align:center;font-size:10px;margin:1mm 0 3mm}.item{padding:2mm 0;border-bottom:1px dashed #999}' +
    '.name{white-space:normal;overflow-wrap:anywhere;font-weight:bold;font-size:10px}' +
    '.amount{display:flex;justify-content:space-between;margin-top:1mm;font-size:10px;gap:2mm}' +
    '.sum{display:flex;justify-content:space-between;border-top:1px solid #111;padding-top:3mm;' +
    'margin-top:3mm;font-weight:bold;font-size:11px}.footer{text-align:center;margin-top:5mm;' +
    'font-size:10px}@media print{html,body,.sheet{width:58mm}}' +
    '</style></head><body><div class="sheet"><img class="logo" src="' + escapeHtml(logoUrl) +
    '" alt=""><div class="date">' + escapeHtml(dateLabel) + ' ' + escapeHtml(timeLabel) +
    '</div>' + rows + '<div class="sum"><span>TOTAL A PAGAR</span><span>$' + money(ticket.total) +
    '</span></div><div class="footer">¡Gracias por su visita!</div></div></body></html>')
  win.document.close()
  const img = win.document.querySelector('img')
  const performPrint = () => { win.focus(); win.print() }
  if (img && !img.complete) {
    img.addEventListener('load', performPrint, { once: true })
    img.addEventListener('error', performPrint, { once: true })
  } else {
    win.addEventListener('load', performPrint, { once: true })
  }
}
