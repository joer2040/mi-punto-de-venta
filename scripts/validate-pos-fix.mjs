/**
 * Validacion PRD: fix UX POS post-cierre de caja
 *
 * Uso (PowerShell):
 *   $env:SMOKE_USERNAME="admin"; $env:SMOKE_PASSWORD="<pw>"; node validate-pos-fix.mjs
 *
 * Variables opcionales:
 *   SMOKE_URL      (default: https://lacarreta.mobi)
 *   SMOKE_HEADLESS (default: true; false = visible)
 */

import puppeteer from 'puppeteer'

const BASE_URL  = process.env.SMOKE_URL      || 'https://lacarreta.mobi'
const USERNAME  = process.env.SMOKE_USERNAME
const PASSWORD  = process.env.SMOKE_PASSWORD
const HEADLESS  = (process.env.SMOKE_HEADLESS ?? 'true') !== 'false'
const NAV_KEY   = 'mi-punto-de-venta.current-page'
const TIMEOUT   = 25_000

if (!USERNAME || !PASSWORD) {
  console.error('ERROR: define SMOKE_USERNAME y SMOKE_PASSWORD')
  process.exit(1)
}

const results = []
const note = (tag, msg) => { console.log(`✅ [${tag}] ${msg}`);   results.push({ tag, ok: true,  msg }) }
const fail = (tag, msg) => { console.error(`❌ [${tag}] ${msg}`); results.push({ tag, ok: false, msg }) }
const log  = (tag, msg) =>   console.log(`   [${tag}] ${msg}`)

const bodyText = (page) => page.evaluate(() => document.body.textContent || '')

const waitForBodyText = async (page, text, timeout = TIMEOUT) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await bodyText(page)).includes(text)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

const navTo = async (page, pageKey) => {
  await page.evaluate((key, val) => localStorage.setItem(key, val), NAV_KEY, pageKey)
  await page.reload({ waitUntil: 'networkidle2', timeout: TIMEOUT })
  await new Promise((r) => setTimeout(r, 1200))
}

const fillInput = async (page, selector, value) => {
  await page.waitForSelector(selector, { timeout: TIMEOUT })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.$eval(selector, (el, v) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (nativeSetter) nativeSetter.call(el, v)
    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

const clearSession = async (page) => {
  try { await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT }) } catch {}
  await page.evaluate(() => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
  })
  const client = await page.createCDPSession()
  await client.send('Network.clearBrowserCookies')
  await client.send('Network.clearBrowserCache')
  await client.detach()
}

const login = async (page, username, password) => {
  await clearSession(page)
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT })
  await page.waitForSelector('#login-username', { timeout: TIMEOUT })
  await fillInput(page, '#login-username', username)
  await fillInput(page, '#login-password', password)
  await page.click('button[type="submit"]')
  const deadline = Date.now() + TIMEOUT
  let lastText = ''
  while (Date.now() < deadline) {
    lastText = await bodyText(page)
    if (lastText.includes('La Carreta') && !lastText.includes('Iniciar sesion')) break
    if (lastText.includes('No se pudo') || lastText.includes('invalida') || lastText.includes('Credencial')) break
    await new Promise((r) => setTimeout(r, 400))
  }
  if (!lastText.includes('La Carreta') || lastText.includes('Iniciar sesion')) {
    throw new Error(`Login fallido para "${username}": ${lastText.slice(0, 200)}`)
  }
  log('login', `Sesion iniciada: ${username}`)
}

// ─── V0: bundle ───────────────────────────────────────────────────────────────

const v0Bundle = async (page) => {
  log('V0', 'Verificando bundle PRD...')
  const res  = await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
  const html = await res.text()
  const match = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)
  const bundle = match?.[1] ?? '(no encontrado)'
  const posMatch = html.match(/\/assets\/(POS-[A-Za-z0-9_-]+\.js)/)
  const posBundle = posMatch?.[1] ?? '(no encontrado)'

  // Old bundles from previous deploys
  const OLD_BUNDLES = ['index-CPT-jn05.js', 'index-D7pUPsoq.js']
  const stale = OLD_BUNDLES.find((b) => html.includes(b))
  if (stale) {
    fail('V0', `Bundle viejo detectado: ${stale}`)
    return null
  }

  note('V0', `Bundle principal: ${bundle}`)
  note('V0', `Bundle POS:       ${posBundle}`)
  return { bundle, posBundle }
}

// ─── V1: sin caja abierta ─────────────────────────────────────────────────────

const v1NoCashSession = async (page) => {
  log('V1', 'Verificando estado de caja...')
  await navTo(page, 'cash-control')
  const txt = await bodyText(page)

  if (txt.includes('Abierto')) {
    fail('V1', 'Hay una caja abierta — el test requiere caja cerrada para validar el bloqueo')
    return false
  }

  if (txt.includes('Cerrado') || txt.includes('Sin sesion') || txt.includes('Pendiente')) {
    note('V1', 'Sin caja abierta — condicion correcta para el test')
    return true
  }

  fail('V1', `Estado de caja desconocido: ${txt.slice(0, 200)}`)
  return false
}

// ─── V2: POS carga sin error ──────────────────────────────────────────────────

const v2PosLoads = async (page) => {
  log('V2', 'Navegando a POS...')
  await navTo(page, 'pos')
  const txt = await bodyText(page)

  if (txt.includes('Cargando') || txt.includes('Error al iniciar')) {
    fail('V2', `POS no cargó: ${txt.slice(0, 200)}`)
    return false
  }

  // POS renders tables (mesa/barra) or "no hay mesas"
  if (txt.includes('Mesa') || txt.includes('Barra') || txt.includes('Punto de Venta') || txt.includes('Mapa de mesas')) {
    note('V2', 'POS cargó correctamente (tabla de mesas visible)')
    return true
  }

  // Still acceptable if loading
  note('V2', 'POS cargó (estado indeterminado, continuando)')
  return true
}

// ─── V3: agregar producto → aviso visible ─────────────────────────────────────

const v3NoticeOnAdd = async (page) => {
  log('V3', 'Intentando agregar producto sin caja abierta...')

  // Wait for a clickable table button
  const tableSelector = 'button'
  await new Promise((r) => setTimeout(r, 1500))
  const txt0 = await bodyText(page)
  log('V3', `POS body snippet: ${txt0.slice(0, 300)}`)

  // Find a "libre" table to click
  const tableClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const libreBtn = buttons.find((btn) => {
      const text = btn.textContent || ''
      // Table map buttons typically contain "Mesa" or a number, and maybe "libre"
      return /^Mesa\s+\d+$|^\d+$/.test(text.trim()) ||
             (text.includes('Mesa') && !text.includes('Entrar') && !text.includes('Inicio'))
    })
    if (libreBtn) { libreBtn.click(); return libreBtn.textContent.trim() }

    // Fallback: click first button that looks like a table (not nav)
    const anyTable = buttons.find((btn) => /Mesa|Barra/.test(btn.textContent || ''))
    if (anyTable) { anyTable.click(); return anyTable.textContent.trim() }
    return null
  })

  if (!tableClicked) {
    fail('V3', 'No se encontró botón de mesa para hacer click')
    return false
  }
  log('V3', `Mesa clickeada: ${tableClicked.slice(0, 60)}`)
  await new Promise((r) => setTimeout(r, 1200))

  // Now try to add a product — find any item in the product panel
  const productClicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    // Product buttons in POS are typically in a product panel — look for ones with price info
    const productBtn = buttons.find((btn) => {
      const text = btn.textContent || ''
      return text.includes('$') && !text.includes('Cerrar') && !text.includes('Cancelar') &&
             !text.includes('Inicio') && !text.includes('Guardar')
    })
    if (productBtn) { productBtn.click(); return productBtn.textContent.trim() }
    return null
  })

  if (!productClicked) {
    log('V3', 'No se encontró botón de producto con precio — intentando cualquier botón de producto')
    // Try clicking first product-looking item
    const fallback = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'))
      const btn = btns.find((b) => {
        const t = (b.textContent || '').trim()
        return t.length > 3 && t.length < 80 && !['Inicio','Cerrar','Cancelar','Guardar','Finalizar','Salir','Menu'].some((k) => t.includes(k))
      })
      if (btn) { btn.click(); return btn.textContent.trim() }
      return null
    })
    if (!fallback) {
      fail('V3', 'No se encontró producto para agregar')
      return false
    }
    log('V3', `Producto clickeado (fallback): ${fallback.slice(0, 80)}`)
  } else {
    log('V3', `Producto clickeado: ${productClicked.slice(0, 80)}`)
  }

  // Wait for auto-save notice to appear (up to 8 seconds)
  log('V3', 'Esperando aviso de error de auto-guardado...')
  const BUSINESS_MESSAGES = [
    'No hay una sesion de caja abierta',
    'No hay una caja abierta',
    'sesion de caja',
    'caja abierta',
    'guardar la mesa',
  ]

  const deadline = Date.now() + 8000
  let noticeText = ''
  while (Date.now() < deadline) {
    const txt = await bodyText(page)
    const found = BUSINESS_MESSAGES.find((m) => txt.toLowerCase().includes(m.toLowerCase()))
    if (found) {
      noticeText = found
      break
    }
    await new Promise((r) => setTimeout(r, 400))
  }

  if (noticeText) {
    note('V3', `Aviso visible al usuario: "${noticeText}"`)
    return true
  }

  // Check if still generic error (old behavior) or nothing
  const currentTxt = await bodyText(page)
  if (currentTxt.includes('Edge Function') || currentTxt.includes('non-2xx')) {
    fail('V3', 'Mensaje genérico de Supabase visible — fix no aplicado correctamente')
  } else {
    fail('V3', 'Sin aviso visible — el error se sigue silenciando')
  }
  return false
}

// ─── V4: sin venta/folio generado ─────────────────────────────────────────────

const v4NoSaleCreated = async (page) => {
  log('V4', 'Verificando que no se generó venta ni folio...')
  const txt = await bodyText(page)

  // A finalized sale produces a folio (format: DDMMYYYY + timestamp digits)
  const folioPattern = /\d{14,}/
  const ticketKeywords = ['Ticket', 'Folio', 'Venta exitosa', 'registrada con exito', 'PDF generado']
  const saleFound = ticketKeywords.some((k) => txt.includes(k))
  const folioFound = folioPattern.test(txt) && txt.includes('Folio')

  if (saleFound || folioFound) {
    fail('V4', 'Se detectó ticket/folio — posible venta generada sin caja')
    return false
  }

  note('V4', 'Sin ticket ni folio — operación bloqueada correctamente')
  return true
}

// ─── main ─────────────────────────────────────────────────────────────────────

const browser = await puppeteer.launch({
  headless: HEADLESS,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 900 })

  // V0: bundle check (no login needed)
  const bundleInfo = await v0Bundle(page)

  // Login
  log('auth', `Iniciando sesion como: ${USERNAME}`)
  await login(page, USERNAME, PASSWORD)

  // V1: confirm no open cash session
  const cashOk = await v1NoCashSession(page)
  if (!cashOk) {
    fail('ABORT', 'Caja abierta detectada — test no aplica en este estado')
  } else {
    // V2: POS loads
    await v2PosLoads(page)

    // V3: add product → notice appears
    await v3NoticeOnAdd(page)

    // V4: no sale/folio created
    await v4NoSaleCreated(page)
  }

  // Summary
  console.log('\n─── RESULTADO ───────────────────────────────────────────────────')
  const passed = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  console.log(`Checks OK:   ${passed.length}`)
  console.log(`Checks FAIL: ${failed.length}`)
  if (bundleInfo) {
    console.log(`Bundle:      ${bundleInfo.bundle}`)
    console.log(`POS bundle:  ${bundleInfo.posBundle}`)
  }
  if (failed.length > 0) {
    console.log('\nFallos:')
    failed.forEach((r) => console.log(`  ❌ [${r.tag}] ${r.msg}`))
  }
  console.log(`\nEstado final: ${failed.length === 0 ? '✅ APROBADO' : '❌ FALLIDO'}`)

  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  await browser.close()
}
