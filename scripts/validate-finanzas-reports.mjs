/**
 * Validacion PRD: reportes Finanzas post-ledger
 *
 * Uso (PowerShell):
 *   $env:SMOKE_USERNAME="<user>"; $env:SMOKE_PASSWORD="<pw>"; node scripts/validate-finanzas-reports.mjs
 *
 * Variables opcionales:
 *   SMOKE_URL      (default: https://lacarreta.mobi)
 *   SMOKE_HEADLESS (default: true; false = visible)
 */

import puppeteer from 'puppeteer'

const BASE_URL = process.env.SMOKE_URL      || 'https://lacarreta.mobi'
const USERNAME = process.env.SMOKE_USERNAME
const PASSWORD = process.env.SMOKE_PASSWORD
const HEADLESS = (process.env.SMOKE_HEADLESS ?? 'true') !== 'false'
const NAV_KEY  = 'mi-punto-de-venta.current-page'
const TIMEOUT  = 25_000

if (!USERNAME || !PASSWORD) {
  console.error('ERROR: define SMOKE_USERNAME y SMOKE_PASSWORD')
  process.exit(1)
}

const results = []
const note = (tag, msg) => { console.log(`✅ [${tag}] ${msg}`);   results.push({ tag, ok: true,  msg }) }
const fail = (tag, msg) => { console.error(`❌ [${tag}] ${msg}`); results.push({ tag, ok: false, msg }) }
const log  = (tag, msg) =>   console.log(`   [${tag}] ${msg}`)

const bodyText = (page) => page.evaluate(() => document.body.textContent || '')

const waitForText = async (page, text, timeout = TIMEOUT) => {
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
  await new Promise((r) => setTimeout(r, 1500))
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
    throw new Error(`Login fallido para "${username}"`)
  }
  log('login', `Sesion iniciada: ${username}`)
}

// ─── V0: bundle ───────────────────────────────────────────────────────────────

const v0Bundle = async (page) => {
  log('V0', 'Verificando bundles PRD...')
  const res  = await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
  const html = await res.text()

  const mainMatch = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)
  const mainBundle = mainMatch?.[1] ?? '(no encontrado)'

  const OLD_BUNDLES = ['index-CWbXX94K.js', 'index-CPT-jn05.js', 'index-D7pUPsoq.js']
  const stale = OLD_BUNDLES.find((b) => html.includes(b))
  if (stale) {
    fail('V0', `Bundle viejo detectado: ${stale}`)
    return null
  }

  note('V0', `Bundle principal: ${mainBundle}`)
  return { mainBundle }
}

// ─── V1: Saldos — ecuacion contable visual ────────────────────────────────────

const v1Balances = async (page) => {
  log('V1', 'Navegando a Finanzas Saldos...')
  await navTo(page, 'finances-balances')
  const txt = await bodyText(page)

  if (txt.includes('500') || txt.includes('Error inesperado') || txt.includes('sin acceso')) {
    fail('V1', `Error en Saldos: ${txt.slice(0, 200)}`)
    return false
  }

  // Check balance equation elements are visible
  const hasActivos  = txt.includes('Activos') || txt.includes('activos')
  const hasCapital  = txt.includes('Capital') || txt.includes('capital')
  const hasEcuacion = txt.includes('=') && (hasActivos || hasCapital)
  const hasMonto    = /\$[\d,]+\.[\d]{2}/.test(txt)

  if (!hasEcuacion || !hasMonto) {
    fail('V1', `Ecuacion contable no visible. Snippet: ${txt.slice(0, 300)}`)
    return false
  }

  // Verify PRD ledger active: should show non-zero balances
  const has1500 = txt.includes('1,500') || txt.includes('1500')
  const has24000 = txt.includes('24,000') || txt.includes('24000')
  if (has1500 && has24000) {
    note('V1', `Saldos iniciales PRD visibles: $1,500 y $24,000 detectados`)
  }

  note('V1', 'Ecuacion contable y saldos visibles en Saldos')
  return true
}

// ─── V2: Mayor — selector 11 cuentas, seleccionar 4101 ───────────────────────

const v2Ledger4101 = async (page) => {
  log('V2', 'Navegando a Finanzas Mayor...')
  await navTo(page, 'finances-ledger')
  const txt0 = await bodyText(page)

  if (txt0.includes('500') || txt0.includes('sin acceso')) {
    fail('V2', `Error al cargar Mayor: ${txt0.slice(0, 200)}`)
    return false
  }

  // Locate account selector (select element or custom component)
  await new Promise((r) => setTimeout(r, 1000))

  // Try native <select> first
  const selectExists = await page.$('select')
  let selected4101 = false

  if (selectExists) {
    // Check that 4101 option exists
    const has4101 = await page.evaluate(() => {
      const sel = document.querySelector('select')
      if (!sel) return false
      return Array.from(sel.options).some((o) => o.value === '4101' || o.text.includes('4101'))
    })

    if (!has4101) {
      fail('V2', 'Cuenta 4101 no encontrada en el selector')
      return false
    }

    // Select 4101
    await page.select('select', '4101')
    await new Promise((r) => setTimeout(r, 2000))
    selected4101 = true
    note('V2', 'Cuenta 4101 seleccionada en selector nativo')
  } else {
    // Try clicking a custom dropdown or button with "4101" text
    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, [role="option"], [role="listbox"] *'))
      const btn = all.find((el) => (el.textContent || '').includes('4101'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (!clicked) {
      fail('V2', 'No se encontró selector de cuenta (nativo ni custom)')
      return false
    }
    await new Promise((r) => setTimeout(r, 2000))
    selected4101 = true
    note('V2', 'Cuenta 4101 seleccionada (custom selector)')
  }

  if (!selected4101) return false

  // Wait for ledger data
  const txt1 = await bodyText(page)

  // Check for the expected entry
  const TARGET_ENTRY = 'JE-VTA-02092026014501'
  if (txt1.includes(TARGET_ENTRY)) {
    note('V2', `Póliza ${TARGET_ENTRY} visible en Mayor 4101`)
  } else {
    // Could be paginated or still loading — wait a bit more
    await new Promise((r) => setTimeout(r, 2000))
    const txt2 = await bodyText(page)
    if (txt2.includes(TARGET_ENTRY)) {
      note('V2', `Póliza ${TARGET_ENTRY} visible en Mayor 4101 (carga tardía)`)
    } else {
      // Check if at least the ledger loaded with some data
      const hasLedgerData = txt2.includes('JE-') || txt2.includes('Ingresos') || txt2.includes('Saldo')
      if (hasLedgerData) {
        fail('V2', `Mayor 4101 cargó pero ${TARGET_ENTRY} no visible. Snippet: ${txt2.slice(0, 400)}`)
      } else {
        fail('V2', `Mayor 4101 sin datos. Snippet: ${txt2.slice(0, 300)}`)
      }
      return false
    }
  }

  // Check no 500 errors
  const finalTxt = await bodyText(page)
  if (finalTxt.includes('Error inesperado') || finalTxt.includes('500')) {
    fail('V2', 'Error 500 detectado en Mayor')
    return false
  }

  return true
}

// ─── V3: Sesiones — sesión nocturna 2026-09-01 visible ───────────────────────

const v3Sessions = async (page) => {
  log('V3', 'Navegando a Finanzas Sesiones...')
  await navTo(page, 'finances-sessions')
  await new Promise((r) => setTimeout(r, 2000))

  const txt = await bodyText(page)

  if (txt.includes('500') || txt.includes('sin acceso')) {
    fail('V3', `Error al cargar Sesiones: ${txt.slice(0, 200)}`)
    return false
  }

  // Look for 2026-09-01 session (format depends on UI locale)
  // Could be: "01/09/2026", "Sep 1", "September 1", "2026-09-01", "01 sep"
  const DATE_PATTERNS = [
    '01/09/2026',
    '2026-09-01',
    '01 sep',
    'Sep 1',
    '1/9/2026',
    '09/01/2026',
  ]
  const lowerTxt = txt.toLowerCase()
  const foundDate = DATE_PATTERNS.some((p) => lowerTxt.includes(p.toLowerCase()))

  if (foundDate) {
    note('V3', 'Sesión del 01/09/2026 visible en Sesiones')
  } else {
    // Check if sessions are loading at all
    const hasSessions = txt.includes('Cerrado') || txt.includes('Abierto') || txt.includes('sesion') || txt.includes('caja')
    if (hasSessions) {
      fail('V3', `Sesiones cargaron pero fecha 01/09/2026 no visible. Snippet: ${txt.slice(0, 400)}`)
    } else {
      fail('V3', `Sesiones no cargaron correctamente. Snippet: ${txt.slice(0, 300)}`)
    }
    return false
  }

  // No 500 errors
  if (txt.includes('Error inesperado') || txt.includes('500')) {
    fail('V3', 'Error 500 en Sesiones')
    return false
  }

  note('V3', 'Sesiones cargaron sin errores 500')
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

  // Capture console errors
  const consoleErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })

  // V0: bundle check (no login needed)
  const bundleInfo = await v0Bundle(page)
  if (!bundleInfo) {
    console.log('\n❌ Bundle check fallido — abortando')
    process.exitCode = 1
    await browser.close()
    process.exit(1)
  }

  // Login
  log('auth', `Iniciando sesion como: ${USERNAME}`)
  await login(page, USERNAME, PASSWORD)

  // V1: Saldos — ecuacion contable
  await v1Balances(page)

  // V2: Mayor — cuenta 4101, poliza JE-VTA
  await v2Ledger4101(page)

  // V3: Sesiones — sesion nocturna 2026-09-01
  await v3Sessions(page)

  // Console error summary
  const appErrors = consoleErrors.filter(
    (e) => !e.includes('favicon') && !e.includes('service-worker') && !e.includes('net::ERR_')
  )
  if (appErrors.length > 0) {
    fail('CONSOLA', `${appErrors.length} errores en consola: ${appErrors.slice(0, 3).join(' | ')}`)
  } else {
    note('CONSOLA', '0 errores de aplicacion en consola')
  }

  // Summary
  console.log('\n─── RESULTADO ───────────────────────────────────────────────────')
  const passed = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  console.log(`Bundle:      ${bundleInfo.mainBundle}`)
  console.log(`Checks OK:   ${passed.length}`)
  console.log(`Checks FAIL: ${failed.length}`)
  if (failed.length > 0) {
    console.log('\nFallos:')
    failed.forEach((r) => console.log(`  ❌ [${r.tag}] ${r.msg}`))
  }
  console.log(`\nEstado final: ${failed.length === 0 ? '✅ APROBADO' : '❌ FALLIDO'}`)

  process.exitCode = failed.length === 0 ? 0 : 1
} finally {
  await browser.close()
}
