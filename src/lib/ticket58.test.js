import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import {
  TICKET58_PRINT_FRAME_CLEANUP_MS,
  TICKET_CAPTURE_NOTICES,
  buildOpenAccountTicket58Html,
  buildTicket58Html,
  canPrintOpenAccountTicket58,
  captureTicketAfterConfirmedSale,
  classifyTicketCapture,
  formatTicket58DateTime,
  getOpenAccountTicket58Problem,
  getTicket58Problem,
  isTicket58Expired,
  printOpenAccountTicket58,
  printTicket58,
  saleTicketErrorMessage,
  ticket58FromStoredTicket,
} from './ticket58.js'

// 27-oct-2026 14:05 in America/Monterrey (UTC-6, no DST).
const chargedAt = '2026-10-27T20:05:00.000Z'

const cubeta = (overrides = {}) => ({
  kind: 'bundle',
  bundleId: 'cubeta-1',
  bundleType: 'cubeta',
  bundleLabel: 'Cubeta Mixta',
  name: 'Cubeta Mixta',
  quantity: 1,
  unitPrice: 180,
  subtotal: 180,
  ...overrides,
})

const confirmedTicket = () => ({
  items: [
    { kind: 'material', bundleId: null, name: 'Cerveza Modelo Especial 355 ml', quantity: 2, unitPrice: 35, subtotal: 70 },
    cubeta(),
  ],
  total: 250,
  paymentMethod: 'Efectivo',
  confirmed: { chargedAt, total: 250, hasItems: true },
})

test('formats the confirmation date in America/Monterrey', () => {
  assert.equal(formatTicket58DateTime(chargedAt), 'octubre 27, 2026 02:05 p.m.')
  // Same instant, other offset: output must not depend on the device time zone.
  assert.equal(formatTicket58DateTime('2026-10-27T15:05:00-05:00'), 'octubre 27, 2026 02:05 p.m.')
})

test('accepts a fully confirmed ticket', () => {
  assert.equal(getTicket58Problem(confirmedTicket()), null)
})

test('rejects tickets missing server-confirmed data', () => {
  const noDate = confirmedTicket()
  noDate.confirmed.chargedAt = null
  assert.match(getTicket58Problem(noDate), /fecha/)

  const noTotal = confirmedTicket()
  noTotal.confirmed.total = null
  assert.match(getTicket58Problem(noTotal), /total/)

  const localItems = confirmedTicket()
  localItems.confirmed.hasItems = false
  assert.match(getTicket58Problem(localItems), /artículos/)

  const noName = confirmedTicket()
  noName.items[0].name = ' '
  assert.match(getTicket58Problem(noName), /sin nombre/)
})

test('rejects an invalid confirmation timestamp', () => {
  const invalid = confirmedTicket()
  invalid.confirmed.chargedAt = 'not-a-date'
  assert.equal(formatTicket58DateTime('not-a-date'), null)
  assert.match(getTicket58Problem(invalid), /fecha .*no es válida/)
})

test('rejects lines that do not add up to the confirmed total', () => {
  const mismatch = confirmedTicket()
  mismatch.confirmed.total = 249.99
  assert.match(getTicket58Problem(mismatch), /no coinciden/)
})

test('names a bundle without label from its known type', () => {
  const ticket = confirmedTicket()
  ticket.items[1] = cubeta({ bundleType: 'cubeta_caguamita', bundleLabel: null, name: 'Cubeta Mixta' })
  assert.equal(getTicket58Problem(ticket), null)
  const html = buildTicket58Html({ ticket, logoUrl: 'logo.png' })
  assert.match(html, /1 Cubeta Caguamita/)
  assert.doesNotMatch(html, /Cubeta Mixta/)
})

test('blocks a bundle without verifiable identity', () => {
  const unknownType = confirmedTicket()
  unknownType.items[1] = cubeta({ bundleType: 'promo_x', bundleLabel: null })
  assert.match(getTicket58Problem(unknownType), /sin nombre confirmado/)

  const loose = confirmedTicket()
  loose.items[1] = { kind: 'material', bundleId: 'b-9', name: 'Cerveza', quantity: 1, unitPrice: 180, subtotal: 180 }
  assert.match(getTicket58Problem(loose), /un solo concepto/)
})

test('renders only the allowed sections, one line per bundle', () => {
  const html = buildTicket58Html({ ticket: confirmedTicket(), logoUrl: 'https://example.test/logo.png' })

  assert.match(html, /src="https:\/\/example.test\/logo.png"/)
  assert.match(html, /octubre 27, 2026 02:05 p\.m\./)
  assert.match(html, /2 Cerveza Modelo Especial 355 ml/)
  assert.match(html, /\$35\.00[\s\S]*\$70\.00/)
  assert.equal(html.match(/class="item"/g).length, 2)
  assert.match(html, /TOTAL A PAGAR[\s\S]*\$250\.00/)
  assert.match(html, /¡Gracias por su visita!/)
  assert.doesNotMatch(html, /Efectivo|Subtotal|Recibido|Cambio|Descuento|PRUEBA/i)
})

test('uses print CSS compatible with a 58 mm roll', () => {
  const html = buildTicket58Html({ ticket: confirmedTicket(), logoUrl: 'logo.png' })

  assert.match(html, /@page \{ margin: 0; \}/)
  assert.doesNotMatch(html, /@page[^}]*size/)
  assert.doesNotMatch(html, /[^-]height:/)
  // 48 mm content centered in the driver's printable page, shifted by the calibration offset.
  assert.match(html, /left: -1mm;/)
  assert.match(html, /width: 48mm;/)
  assert.match(html, /margin: 0 auto;/)
  assert.match(html, /padding: 3mm 0 6mm;/)
  assert.match(html, /overflow-wrap: anywhere/)
})

test('escapes product names', () => {
  const ticket = confirmedTicket()
  ticket.items[0].name = '<b>Tequila & Sal</b>'
  const html = buildTicket58Html({ ticket, logoUrl: 'logo.png' })
  assert.match(html, /&lt;b&gt;Tequila &amp; Sal&lt;\/b&gt;/)
})

// --- Reprint and capture (Paso 2H): ticket-operations POS58-v1, fictitious data and mocks ---

const SALE_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_SALE_ID = '22222222-2222-2222-2222-222222222222'
const DAY = 24 * 60 * 60 * 1000
const chargedMs = new Date(chargedAt).getTime()

// Same shape ticket-operations returns from get/capture (makeTicket + expiresAt).
const storedTicket = (overrides = {}) => ({
  saleId: SALE_ID,
  chargedAt,
  items: [
    { name: 'Cerveza Modelo Especial 355 ml', quantity: 2, unitPrice: '35.00', subtotal: '70.00' },
    { name: 'Cubeta Mixta', quantity: 1, unitPrice: '320.00', subtotal: '320.00' },
  ],
  total: '390.00',
  version: 'POS58-v1',
  expiresAt: new Date(chargedMs + 15 * DAY).toISOString(),
  ...overrides,
})

test('stored ticket keeps original names and amounts; bundle stays one line', () => {
  const { ticket, problem } = ticket58FromStoredTicket(storedTicket(), SALE_ID, chargedMs)

  assert.equal(problem, undefined)
  assert.equal(getTicket58Problem(ticket), null)
  assert.deepEqual(
    ticket.items.map((item) => [item.name, item.quantity, item.unitPrice, item.subtotal]),
    [['Cerveza Modelo Especial 355 ml', 2, 35, 70], ['Cubeta Mixta', 1, 320, 320]]
  )
  assert.deepEqual(ticket.confirmed, { chargedAt, total: 390, hasItems: true })

  // Approved POS-58 generator, unchanged: one line per concept, only the allowed sections.
  const html = buildTicket58Html({ ticket, logoUrl: 'logo.png' })
  assert.equal(html.match(/class="item"/g).length, 2)
  assert.match(html, /1 Cubeta Mixta[\s\S]*\$320\.00[\s\S]*\$320\.00/)
  assert.match(html, /TOTAL A PAGAR[\s\S]*\$390\.00/)
  assert.match(html, /octubre 27, 2026 02:05 p\.m\./)
})

test('stored ticket of another sale, missing or expired is refused', () => {
  assert.match(ticket58FromStoredTicket(null, SALE_ID, chargedMs).problem, /No existe un ticket/)
  assert.match(ticket58FromStoredTicket(storedTicket(), OTHER_SALE_ID, chargedMs).problem, /no corresponde/)
  assert.match(ticket58FromStoredTicket(storedTicket({ saleId: OTHER_SALE_ID }), SALE_ID, chargedMs).problem, /no corresponde/)

  assert.equal(ticket58FromStoredTicket(storedTicket(), SALE_ID, chargedMs + 15 * DAY - 1).problem, undefined)
  assert.match(ticket58FromStoredTicket(storedTicket(), SALE_ID, chargedMs + 15 * DAY).problem, /vencio/)
  // expiresAt from the server is also honored.
  const early = storedTicket({ expiresAt: new Date(chargedMs + DAY).toISOString() })
  assert.match(ticket58FromStoredTicket(early, SALE_ID, chargedMs + DAY).problem, /vencio/)
  assert.equal(isTicket58Expired(chargedAt, chargedMs + 14 * DAY), false)
})

test('stored ticket with invalid amounts or totals is never printed', () => {
  const cases = [
    storedTicket({ total: '390' + '.001' }),
    storedTicket({ total: 390.5 + 0.004 }),
    storedTicket({ chargedAt: 'not-a-date' }),
    storedTicket({ items: [] }),
    storedTicket({ items: [{ name: ' ', quantity: 1, unitPrice: '390.00', subtotal: '390.00' }] }),
    storedTicket({ items: [{ name: 'Cubeta Mixta', quantity: 1, unitPrice: '-390.00', subtotal: '390.00' }] }),
    storedTicket({ items: [{ name: 'Cubeta Mixta', quantity: 1, unitPrice: '320.00', subtotal: '390.00' }] }),
  ]
  for (const stored of cases) {
    assert.match(ticket58FromStoredTicket(stored, SALE_ID, chargedMs).problem, /incompleto|no validos/)
  }
  assert.match(ticket58FromStoredTicket(storedTicket({ total: '389.99' }), SALE_ID, chargedMs).problem, /no coinciden/)
})

test('maps ticket-operations HTTP errors to clear messages', () => {
  assert.match(saleTicketErrorMessage({ status: 401 }), /sesion/)
  assert.match(saleTicketErrorMessage({ status: 403 }), /permiso/)
  assert.match(saleTicketErrorMessage({ status: 404 }), /no esta disponible o ya vencio/)
  assert.match(saleTicketErrorMessage({ status: 409 }), /No se pudo comprobar/)
  assert.match(saleTicketErrorMessage({ status: 410 }), /vencio/)
  assert.match(saleTicketErrorMessage({ status: null }), /Intenta de nuevo/)
  assert.match(saleTicketErrorMessage(new Error('network')), /Intenta de nuevo/)
})

test('capture outcome distinguishes saved, failed and unknown', () => {
  assert.equal(classifyTicketCapture({ data: { ticket: storedTicket() } }, SALE_ID), 'saved')
  assert.equal(classifyTicketCapture({ data: { ticket: storedTicket({ saleId: OTHER_SALE_ID }) } }, SALE_ID), 'unknown')
  assert.equal(classifyTicketCapture({ data: {} }, SALE_ID), 'unknown')
  for (const status of [400, 401, 403, 404, 409, 410]) {
    assert.equal(classifyTicketCapture({ error: { status } }, SALE_ID), 'failed')
  }
  assert.equal(classifyTicketCapture({ error: { status: 500 } }, SALE_ID), 'unknown')
  assert.equal(classifyTicketCapture({ error: { status: null } }, SALE_ID), 'unknown')
})

test('capture after a confirmed sale: one request, no retries, notices only when not saved', async () => {
  const run = async (capture) => {
    const calls = []
    const notices = []
    const outcome = await captureTicketAfterConfirmedSale({
      saleId: SALE_ID,
      idempotencyKey: 'key-1',
      capture: async (payload) => {
        calls.push(payload)
        return capture()
      },
      notify: (message) => notices.push(message),
    })
    return { outcome, calls, notices }
  }

  const saved = await run(() => ({ ticket: storedTicket() }))
  assert.equal(saved.outcome, 'saved')
  assert.deepEqual(saved.calls, [{ sale_id: SALE_ID, idempotency_key: 'key-1' }])
  assert.deepEqual(saved.notices, [])

  const failed = await run(() => { throw Object.assign(new Error('forbidden'), { status: 403 }) })
  assert.equal(failed.outcome, 'failed')
  assert.equal(failed.calls.length, 1)
  assert.deepEqual(failed.notices, [TICKET_CAPTURE_NOTICES.failed])
  assert.match(failed.notices[0], /^Venta registrada\./)

  const unknown = await run(() => { throw Object.assign(new Error('network'), { status: null }) })
  assert.equal(unknown.outcome, 'unknown')
  assert.equal(unknown.calls.length, 1)
  assert.deepEqual(unknown.notices, [TICKET_CAPTURE_NOTICES.unknown])
  assert.match(unknown.notices[0], /No se confirmo/)
})

test('capture is not requested without the confirmed sale id or its key', async () => {
  for (const args of [{ saleId: null, idempotencyKey: 'key-1' }, { saleId: SALE_ID, idempotencyKey: null }]) {
    let calls = 0
    const notices = []
    const outcome = await captureTicketAfterConfirmedSale({
      ...args,
      capture: async () => { calls += 1 },
      notify: (message) => notices.push(message),
    })
    assert.equal(outcome, 'unknown')
    assert.equal(calls, 0)
    assert.deepEqual(notices, [TICKET_CAPTURE_NOTICES.unknown])
  }
})

test('POS captures only after finalizeSale resolves, with the same key, inside the success path', () => {
  const pos = readFileSync(new URL('../pages/POS.jsx', import.meta.url), 'utf8')
  const finalizeAt = pos.indexOf('await posService.finalizeSale(')
  const captureAt = pos.indexOf('captureTicketAfterConfirmedSale({')
  const successNoticeAt = pos.indexOf("showNotice('Venta realizada con exito', 'success')")
  const catchAt = pos.indexOf('} catch (error) {', finalizeAt)

  assert.equal(pos.split('captureTicketAfterConfirmedSale({').length - 1, 1)
  assert.ok(finalizeAt > 0 && successNoticeAt > finalizeAt && captureAt > successNoticeAt && captureAt < catchAt)
  assert.match(pos.slice(captureAt, catchAt), /idempotencyKey,/)
  assert.doesNotMatch(pos.slice(captureAt, catchAt), /randomUUID|await captureTicketAfterConfirmedSale/)
})

test('ticket paths are read-only: no charge functions, no local storage', () => {
  const service = readFileSync(new URL('../api/materialService.js', import.meta.url), 'utf8')
  const sources = [
    readFileSync(new URL('../pages/SalesReport.jsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./ticket58.js', import.meta.url), 'utf8'),
    service.slice(service.indexOf('const invokeTicketOperation'), service.indexOf('const getPurchaseItemsSummary')),
    service.slice(service.indexOf('async getSaleTicketSnapshot'), service.indexOf('async getPurchasesReport')),
  ]
  for (const source of sources) {
    assert.ok(source.length > 0)
    assert.doesNotMatch(source, /finalizeSale|finalize_pos_sale|posService|\.insert\(|\.update\(|\.delete\(|localStorage/)
  }
  assert.match(sources[2], /functions\.invoke\('ticket-operations'/)
  assert.match(sources[3], /invokeTicketOperation\('get', \{ sale_id: saleId \}\)/)
  assert.match(sources[3], /invokeTicketOperation\('capture', \{ sale_id, idempotency_key \}\)/)
})

// --- printTicket58 via off-screen iframe (Paso 3H): fake DOM, no real printing ---

// Minimal DOM stand-in: just what printTicket58 touches.
const createFakeDom = ({ logoComplete = true, hasLogo = true, printThrows = false } = {}) => {
  const listeners = (target) => (type, handler) => {
    target.handlers[type] = [...(target.handlers[type] || []), handler]
  }
  const fire = (target, type) => {
    const handlers = target.handlers[type] || []
    target.handlers[type] = []
    handlers.forEach((handler) => handler())
  }
  const logo = { complete: logoComplete, handlers: {} }
  logo.addEventListener = listeners(logo)
  const printWindow = { handlers: {}, printCalls: 0, focusCalls: 0 }
  printWindow.addEventListener = listeners(printWindow)
  printWindow.focus = () => { printWindow.focusCalls += 1 }
  printWindow.print = () => {
    printWindow.printCalls += 1
    if (printThrows) throw new Error('print failed')
  }
  const frames = []
  const appended = []
  const dom = {
    frames,
    appended,
    logo,
    printWindow,
    fire,
    document: {
      body: { appendChild: (node) => { appended.push(node) } },
      createElement: (tag) => {
        assert.equal(tag, 'iframe')
        const frame = {
          tag,
          attributes: {},
          style: {},
          handlers: {},
          removed: 0,
          srcdoc: '',
          contentWindow: printWindow,
          contentDocument: { querySelector: (selector) => (selector === 'img' && hasLogo ? logo : null) },
          setAttribute(name, value) { this.attributes[name] = value },
          remove() { this.removed += 1 },
        }
        frame.addEventListener = listeners(frame)
        frames.push(frame)
        return frame
      },
    },
  }
  return dom
}

const printableTicket = () => ({
  items: [{ kind: 'material', bundleId: null, name: 'Producto de prueba', quantity: 2, unitPrice: 35, subtotal: 70 }],
  confirmed: { chargedAt, total: 70, hasItems: true },
})

const withDom = async (dom, run) => {
  const previous = globalThis.document
  globalThis.document = dom.document
  try {
    return await run()
  } finally {
    globalThis.document = previous
  }
}

test('printTicket58 rejects an invalid ticket without touching the page', async () => {
  const dom = createFakeDom()
  const result = await withDom(dom, () => printTicket58({ ticket: { items: [], confirmed: {} }, logoUrl: 'logo.png' }))
  assert.match(result, /^No se puede imprimir un ticket confiable:/)
  assert.equal(dom.frames.length, 0)
})

test('printTicket58 uses an off-screen iframe with the same ticket HTML, not window.open', async () => {
  const dom = createFakeDom()
  const ticket = printableTicket()
  const result = await withDom(dom, () => printTicket58({ ticket, logoUrl: 'logo.png' }))

  assert.equal(result, null)
  assert.equal(dom.frames.length, 1)
  const [frame] = dom.frames
  assert.deepEqual(dom.appended, [frame])
  assert.equal(frame.srcdoc, buildTicket58Html({ ticket, logoUrl: 'logo.png' }))
  assert.match(frame.style.cssText, /left:-10000px/)
  assert.doesNotMatch(frame.style.cssText, /display:\s*none/)
  assert.equal(frame.attributes['aria-hidden'], 'true')

  const source = readFileSync(new URL('./ticket58.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /window\.open\(/)
})

test('printTicket58 prints once, only after the frame loads', async () => {
  const dom = createFakeDom()
  await withDom(dom, () => printTicket58({ ticket: printableTicket(), logoUrl: 'logo.png' }))
  const [frame] = dom.frames

  assert.equal(dom.printWindow.printCalls, 0)
  dom.fire(frame, 'load')
  assert.equal(dom.printWindow.printCalls, 1)
  dom.fire(frame, 'load')
  assert.equal(dom.printWindow.printCalls, 1)
})

test('printTicket58 waits for the logo and prints once even if load and error both fire', async () => {
  const dom = createFakeDom({ logoComplete: false })
  await withDom(dom, () => printTicket58({ ticket: printableTicket(), logoUrl: 'logo.png' }))
  const [frame] = dom.frames

  dom.fire(frame, 'load')
  assert.equal(dom.printWindow.printCalls, 0)
  const logoHandlers = { ...dom.logo.handlers }
  logoHandlers.load.forEach((handler) => handler())
  logoHandlers.error.forEach((handler) => handler())
  assert.equal(dom.printWindow.printCalls, 1)
})

test('printTicket58 removes the iframe after afterprint, with a single backup removal', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dom = createFakeDom()
  await withDom(dom, () => printTicket58({ ticket: printableTicket(), logoUrl: 'logo.png' }))
  const [frame] = dom.frames

  dom.fire(frame, 'load')
  assert.equal(frame.removed, 0)
  dom.fire(dom.printWindow, 'afterprint')
  t.mock.timers.tick(999)
  assert.equal(frame.removed, 0)
  t.mock.timers.tick(1)
  assert.equal(frame.removed, 1)
  t.mock.timers.tick(TICKET58_PRINT_FRAME_CLEANUP_MS)
  assert.equal(frame.removed, 1)
})

test('printTicket58 falls back to the backup removal when afterprint never fires', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dom = createFakeDom()
  await withDom(dom, () => printTicket58({ ticket: printableTicket(), logoUrl: 'logo.png' }))
  const [frame] = dom.frames

  dom.fire(frame, 'load')
  t.mock.timers.tick(TICKET58_PRINT_FRAME_CLEANUP_MS - 1)
  assert.equal(frame.removed, 0)
  t.mock.timers.tick(1)
  assert.equal(frame.removed, 1)
})

test('printTicket58 contains print and setup errors without retrying', async (t) => {
  const consoleError = t.mock.method(console, 'error', () => {})

  const failing = createFakeDom({ printThrows: true })
  assert.equal(await withDom(failing, () => printTicket58({ ticket: printableTicket(), logoUrl: 'logo.png' })), null)
  assert.doesNotThrow(() => failing.fire(failing.frames[0], 'load'))
  assert.equal(failing.printWindow.printCalls, 1)
  assert.equal(failing.frames[0].removed, 1)

  const broken = createFakeDom()
  broken.document.body.appendChild = () => { throw new Error('no body') }
  const result = await withDom(broken, () => printTicket58({ ticket: printableTicket(), logoUrl: 'logo.png' }))
  assert.equal(result, 'No se pudo preparar la impresion del ticket.')
  assert.equal(broken.frames[0].removed, 1)
  assert.equal(consoleError.mock.callCount(), 2)
})

// --- Open account ticket (Paso 4M): visible cart before any sale, fictitious data, fake DOM ---

// 3-nov-2026 09:30 in America/Monterrey: the print time, never a sale date.
const printedAt = '2026-11-03T15:30:00.000Z'

// Same shape POS builds with buildTicketDisplayItems(cart, { includeBundleDetails: false }).
const beer = (quantity = 3) => ({
  kind: 'material', bundleId: null, bundleType: null, bundleLabel: null,
  name: 'Cerveza Modelo Especial 355 ml', quantity, unitPrice: 35, subtotal: quantity * 35, details: [],
})
const openAccount = (items = [beer()]) => ({
  items,
  total: items.reduce((acc, item) => acc + item.subtotal, 0),
  printedAt,
  logoUrl: 'logo.png',
})

const deepFreeze = (value) => {
  if (value && typeof value === 'object') Object.values(Object.freeze(value)).forEach(deepFreeze)
  return value
}

// Fails the test on any network request made while printing.
const withNoNetwork = async (t, run) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('network not allowed') })
  const result = await run()
  assert.equal(fetchMock.mock.callCount(), 0)
  return result
}

test('K: confirmed ticket HTML is byte-identical to the validated a1429d6 template', () => {
  const html = buildTicket58Html({ ticket: confirmedTicket(), logoUrl: 'logo.png' })
  // sha256 of the same fixture rendered by src/lib/ticket58.js at a1429d6, before the refactor.
  assert.equal(createHash('sha256').update(html).digest('hex'), 'e1472e2bafdbae8d0f31ad7ec1a3bab5b90121c460054c0d66f622cd37260a15')
})

test('K: open account and confirmed sale share one template, only the date source differs', () => {
  const ticket = confirmedTicket()
  const confirmedHtml = buildTicket58Html({ ticket, logoUrl: 'logo.png' })
  const openHtml = buildOpenAccountTicket58Html({ items: ticket.items, total: 250, printedAt: chargedAt, logoUrl: 'logo.png' })
  assert.equal(openHtml, confirmedHtml)
})

test('A: open account prints quantities, prices, total, logo and thanks', async (t) => {
  const dom = createFakeDom()
  const account = openAccount([beer(3), { ...beer(1), name: 'Papas fritas', unitPrice: 45.5, subtotal: 45.5 }])
  const result = await withNoNetwork(t, () => withDom(dom, () => printOpenAccountTicket58(account)))

  assert.equal(result, null)
  const html = dom.frames[0].srcdoc
  assert.match(html, /src="logo\.png"/)
  assert.match(html, /3 Cerveza Modelo Especial 355 ml[\s\S]*\$35\.00[\s\S]*\$105\.00/)
  assert.match(html, /1 Papas fritas[\s\S]*\$45\.50[\s\S]*\$45\.50/)
  assert.match(html, /TOTAL A PAGAR[\s\S]*\$150\.50/)
  assert.match(html, /¡Gracias por su visita!/)
  assert.equal(html.match(/class="item"/g).length, 2)
})

test('B/C: every print uses the items it receives (new product, changed quantity), nothing cached', async () => {
  const dom = createFakeDom()
  await withDom(dom, () => printOpenAccountTicket58(openAccount([beer(2)])))
  await withDom(dom, () => printOpenAccountTicket58(openAccount([beer(5), { ...beer(1), name: 'Refresco', unitPrice: 20, subtotal: 20 }])))

  const [before, after] = dom.frames.map((frame) => frame.srcdoc)
  assert.match(before, /2 Cerveza[\s\S]*\$70\.00/)
  assert.doesNotMatch(before, /Refresco/)
  assert.match(after, /5 Cerveza[\s\S]*\$175\.00/)
  assert.match(after, /1 Refresco/)
  assert.match(after, /TOTAL A PAGAR[\s\S]*\$195\.00/)
})

test('C: a float total from the visible cart (3 x $10.10) still matches in cents', () => {
  const item = { ...beer(3), unitPrice: 10.1, subtotal: 3 * 10.1 }
  assert.equal(getOpenAccountTicket58Problem({ items: [item], total: 3 * 10.1, printedAt }), null)
})

test('D/J: repeated prints make no requests, never mutate the cart lines and print once per frame', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dom = createFakeDom()
  const account = deepFreeze(openAccount())
  await withNoNetwork(t, () => withDom(dom, () => {
    assert.equal(printOpenAccountTicket58(account), null)
    assert.equal(printOpenAccountTicket58(account), null)
  }))

  assert.equal(dom.frames.length, 2)
  dom.frames.forEach((frame) => dom.fire(frame, 'load'))
  dom.frames.forEach((frame) => dom.fire(frame, 'load'))
  assert.equal(dom.printWindow.printCalls, 2)
  assert.equal(dom.frames[0].srcdoc, dom.frames[1].srcdoc)
})

test('D: POS open-account handler never saves, waits for autosave, dispatches or charges', () => {
  // Complements the functional tests above: the React handler itself cannot run under node --test.
  const pos = readFileSync(new URL('../pages/POS.jsx', import.meta.url), 'utf8')
  const start = pos.indexOf('const handlePrintOpenAccount = () => {')
  const end = pos.indexOf('const handleOpenCubetaBuilder', start)
  const handler = pos.slice(start, end)

  assert.ok(start > 0 && end > start)
  assert.match(handler, /buildTicketDisplayItems\(cart, \{ includeBundleDetails: false \}\)/)
  assert.match(handler, /printedAt: new Date\(\)\.toISOString\(\)/)
  assert.match(handler, /\btotal,/)
  assert.doesNotMatch(handler, /await|dispatch\(|queueTableOrderSave|persistTableOrder|tableOrderSaveQueueRef|posService|materialService|supabase|captureSaleTicket|captureTicketAfterConfirmedSale|finalizeSale\(|idempotency/)
})

test('E: an empty account cannot be printed', async () => {
  const dom = createFakeDom()
  const result = await withDom(dom, () => printOpenAccountTicket58(openAccount([])))
  assert.match(result, /^No se puede imprimir un ticket confiable: la cuenta no tiene productos\.$/)
  assert.equal(dom.frames.length, 0)
  assert.equal(canPrintOpenAccountTicket58({ itemCount: 0, isHydrating: false, isFinalizing: false }), false)
})

test('F: each bundle prints as one line with its amount counted once', async () => {
  const dom = createFakeDom()
  const account = openAccount([cubeta({ unitPrice: 320, subtotal: 320 }), beer(2)])
  assert.equal(await withDom(dom, () => printOpenAccountTicket58(account)), null)

  const html = dom.frames[0].srcdoc
  assert.equal(html.match(/Cubeta Mixta/g).length, 1)
  assert.match(html, /1 Cubeta Mixta[\s\S]*\$320\.00[\s\S]*\$320\.00/)
  assert.match(html, /TOTAL A PAGAR[\s\S]*\$390\.00/)

  const loose = openAccount([{ ...beer(1), bundleId: 'cubeta-9' }])
  assert.match(getOpenAccountTicket58Problem(loose), /un solo concepto/)
  const unnamed = openAccount([cubeta({ bundleType: 'promo_x', bundleLabel: null })])
  assert.match(getOpenAccountTicket58Problem(unnamed), /sin nombre/)
})

test('G: the printed date is printedAt; no confirmed sale data is needed or invented', async () => {
  const dom = createFakeDom()
  const account = openAccount()
  await withDom(dom, () => printOpenAccountTicket58(account))

  const html = dom.frames[0].srcdoc
  assert.match(html, /noviembre 3, 2026 09:30 a\.m\./)
  assert.doesNotMatch(html, /octubre 27/)
  assert.equal('confirmed' in account, false)
  assert.doesNotMatch(html, /Folio|Efectivo|Tarjeta|venta/i)

  for (const bad of [null, 'not-a-date']) {
    assert.match(getOpenAccountTicket58Problem({ ...account, printedAt: bad }), /fecha de impresión/)
  }
})

test('H: inconsistent amounts are refused without printing', async () => {
  const dom = createFakeDom()
  const mismatch = { ...openAccount(), total: 104.99 }
  const result = await withDom(dom, () => printOpenAccountTicket58(mismatch))
  assert.match(result, /no coinciden con el total de la cuenta/)
  assert.equal(dom.frames.length, 0)

  assert.match(getOpenAccountTicket58Problem({ ...openAccount(), total: Number.NaN }), /total de la cuenta/)
  assert.match(getOpenAccountTicket58Problem({ ...openAccount([{ ...beer(1), subtotal: Number.NaN }]), total: 35 }), /importe/)
  assert.match(getOpenAccountTicket58Problem(openAccount([{ ...beer(1), quantity: 0, subtotal: 0 }])), /cantidad/)
})

test('I: no new open-account print while the table loads or a checkout is in progress', () => {
  assert.equal(canPrintOpenAccountTicket58({ itemCount: 2, isHydrating: false, isFinalizing: false }), true)
  assert.equal(canPrintOpenAccountTicket58({ itemCount: 2, isHydrating: false, isFinalizing: true }), false)
  assert.equal(canPrintOpenAccountTicket58({ itemCount: 2, isHydrating: true, isFinalizing: false }), false)
})

test('open account reuses the same iframe mechanism: logo wait, one print, afterprint cleanup', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const dom = createFakeDom({ logoComplete: false })
  await withDom(dom, () => printOpenAccountTicket58(openAccount()))
  const [frame] = dom.frames

  assert.match(frame.style.cssText, /left:-10000px/)
  dom.fire(frame, 'load')
  assert.equal(dom.printWindow.printCalls, 0)
  const logoHandlers = { ...dom.logo.handlers }
  logoHandlers.load.forEach((handler) => handler())
  logoHandlers.error.forEach((handler) => handler())
  assert.equal(dom.printWindow.printCalls, 1)
  dom.fire(dom.printWindow, 'afterprint')
  t.mock.timers.tick(1000)
  assert.equal(frame.removed, 1)
})
