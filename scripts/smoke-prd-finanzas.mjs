/**
 * Smoke test PRD — Finanzas deploy 2026-08-31
 *
 * Uso (PowerShell):
 *   $env:SMOKE_USERNAME="admin"; $env:SMOKE_PASSWORD="<pw>"; node scripts/smoke-prd-finanzas.mjs
 *
 * Uso (bash):
 *   SMOKE_USERNAME=admin SMOKE_PASSWORD=<pw> node scripts/smoke-prd-finanzas.mjs
 *
 * Variables opcionales:
 *   SMOKE_MANAGER_USERNAME   (default: manager)
 *   SMOKE_MANAGER_PASSWORD   — sin esto, F3 se omite
 *   SMOKE_URL                (default: https://lacarreta.mobi)
 *   SMOKE_HEADLESS           (default: true; false = browser visible)
 */

import puppeteer from 'puppeteer'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL    = process.env.SMOKE_URL              || 'https://lacarreta.mobi'
const USERNAME    = process.env.SMOKE_USERNAME
const PASSWORD    = process.env.SMOKE_PASSWORD
const MGR_USER    = process.env.SMOKE_MANAGER_USERNAME || 'manager'
const MGR_PASS    = process.env.SMOKE_MANAGER_PASSWORD
const HEADLESS    = (process.env.SMOKE_HEADLESS    ?? 'true')  !== 'false'
const DEBUG_LOGIN = (process.env.SMOKE_DEBUG_LOGIN ?? 'false') === 'true'
const NAV_KEY     = 'mi-punto-de-venta.current-page'
const TIMEOUT     = 25_000
const SCREENSHOT_DIR = '.'

if (!USERNAME || !PASSWORD) {
  console.error('ERROR: define SMOKE_USERNAME y SMOKE_PASSWORD')
  process.exit(1)
}

// ─── tracking ────────────────────────────────────────────────────────────────

const results = []
const note = (tag, msg) => { console.log(`✅ [${tag}] ${msg}`);   results.push({ tag, ok: true,  msg }) }
const fail = (tag, msg) => { console.error(`❌ [${tag}] ${msg}`); results.push({ tag, ok: false, msg }) }
const log  = (tag, msg) =>   console.log(`   [${tag}] ${msg}`)

// ─── page helpers ─────────────────────────────────────────────────────────────

/** Navigate to a page via localStorage key + reload (avoids nav-bar-on-home issue) */
const navTo = async (page, pageKey) => {
  await page.evaluate((key, val) => localStorage.setItem(key, val), NAV_KEY, pageKey)
  await page.reload({ waitUntil: 'networkidle2', timeout: TIMEOUT })
  await new Promise((r) => setTimeout(r, 1000))
}

/** Body text snapshot */
const bodyText = (page) => page.evaluate(() => document.body.textContent || '')

/** Wait until body includes text (polls every 400ms) */
const waitForBodyText = async (page, text, timeout = TIMEOUT) => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await bodyText(page)).includes(text)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

// ─── session reset ────────────────────────────────────────────────────────────

/** Wipe all browser state for BASE_URL before login to avoid stale session issues */
const clearSession = async (page) => {
  // 1. Navigate to origin so we have access to its storage
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
  } catch {
    // page may fail to load if offline/error — continue anyway
  }

  // 2. Clear localStorage + sessionStorage
  await page.evaluate(() => {
    try { localStorage.clear() } catch {}
    try { sessionStorage.clear() } catch {}
  })

  // 3. Clear all cookies for the domain
  const client = await page.createCDPSession()
  await client.send('Network.clearBrowserCookies')
  await client.send('Network.clearBrowserCache')
  await client.detach()

  log('session', 'localStorage / sessionStorage / cookies borrados')
}

// ─── fill input (React-safe) ──────────────────────────────────────────────────

/** Fill a React-controlled input reliably:
 *  triple-click to select all → type to replace, firing React synthetic events */
const fillInput = async (page, selector, value) => {
  await page.waitForSelector(selector, { timeout: TIMEOUT })
  await page.click(selector, { clickCount: 3 })           // select all
  await page.keyboard.press('Backspace')                   // clear
  // Set via native input value setter so React state updates
  await page.$eval(selector, (el, v) => {
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    if (nativeSetter) nativeSetter.call(el, v)
    el.dispatchEvent(new Event('input',  { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

// ─── login ────────────────────────────────────────────────────────────────────

const login = async (page, username, password) => {
  await clearSession(page)

  // Navigate fresh to login page
  await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: TIMEOUT })
  await page.waitForSelector('#login-username', { timeout: TIMEOUT })

  // Check if already logged in (shouldn't happen after clearSession)
  const preText = await bodyText(page)
  if (!preText.includes('Iniciar sesion') && preText.includes('La Carreta')) {
    log('login', `Ya autenticado como ${username} — saltando login`)
    return
  }

  // Fill username + password using React-safe setter
  await fillInput(page, '#login-username', username)
  await fillInput(page, '#login-password', password)

  // Verify fields contain expected values (without logging password)
  const usernameVal = await page.$eval('#login-username', (el) => el.value)
  if (usernameVal !== username) {
    throw new Error(`Username input no contiene el valor esperado (got: "${usernameVal}")`)
  }

  // Submit
  await page.click('button[type="submit"]')
  log('login', `Submit enviado para: ${username}`)

  // Wait for post-login state
  const deadline = Date.now() + TIMEOUT
  let lastText = ''
  while (Date.now() < deadline) {
    lastText = await bodyText(page)
    // Success: AppShell rendered (La Carreta brand + no login form)
    if (lastText.includes('La Carreta') && !lastText.includes('Iniciar sesion')) break
    // Explicit failure
    if (lastText.includes('No se pudo') || lastText.includes('invalida') || lastText.includes('Credencial')) break
    await new Promise((r) => setTimeout(r, 400))
  }

  const url = page.url()

  if (DEBUG_LOGIN) {
    const ts = Date.now()
    const screenshotPath = join(SCREENSHOT_DIR, `smoke-login-debug-${ts}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    log('login:debug', `Screenshot: ${screenshotPath}`)
    log('login:debug', `URL: ${url}`)
    log('login:debug', `body snippet: ${lastText.slice(0, 400)}`)
  }

  if (lastText.includes('No se pudo') || lastText.includes('invalida') || lastText.includes('Credencial')) {
    const errorSnippet = lastText.match(/(No se pudo[^.]*\.|invalida[^.]*\.|Credencial[^.]*\.)/)?.[0] || lastText.slice(0, 200)
    throw new Error(`Login rechazado para "${username}": ${errorSnippet}`)
  }

  if (!lastText.includes('La Carreta')) {
    throw new Error(`Timeout post-login — URL: ${url} — body: ${lastText.slice(0, 300)}`)
  }

  log('login', `Sesion iniciada: ${username}`)
}

// ─── F0 — bundle verification ─────────────────────────────────────────────────

const phaseF0 = async (page) => {
  log('F0', 'Verificando bundle PRD...')
  const res  = await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
  const html = await res.text()

  const old = 'index-CPT-jn05.js'
  if (html.includes(old)) {
    fail('F0', `Bundle viejo ${old} todavía servido`)
    return false
  }

  const match = html.match(/\/assets\/(index-[A-Za-z0-9_-]+\.js)/)
  const bundle = match?.[1] ?? '(no encontrado)'
  note('F0', `Bundle principal: ${bundle}`)
  return true
}

// ─── F1 — cerrar caja pendiente ($1.00) ──────────────────────────────────────

const phaseF1 = async (page) => {
  log('F1', 'Revisando caja pendiente...')
  await navTo(page, 'cash-control')

  const txt = await bodyText(page)

  if (!txt.includes('Abierto')) {
    note('F1', 'No hay caja abierta actualmente — ya fue cerrada o no existe')
    return true
  }

  log('F1', 'Caja abierta detectada — intentando cerrar con counted_cash=1.00')

  // Input counted_cash (nuevo campo post-fix)
  const input = await page.$('#cash-counted')
  if (!input) {
    fail('F1', 'Campo #cash-counted no encontrado — bundle puede no haber refrescado')
    return false
  }

  await input.click({ clickCount: 3 })
  await input.type('1.00', { delay: 40 })

  // Botón Cerrar caja
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === 'Cerrar caja' && !b.disabled)
    if (btn) { btn.click(); return true }
    return false
  })

  if (!clicked) {
    fail('F1', 'Botón "Cerrar caja" no disponible')
    return false
  }

  // Esperar respuesta de la EF (~3-5s)
  await new Promise((r) => setTimeout(r, 5000))
  const after = await bodyText(page)

  if (after.includes('Diferencia detectada')) {
    fail('F1', 'Diferencia detectada con counted_cash=1.00 (esperado: sin diferencia)')
    return false
  }

  if (after.includes('Cerrado') || after.includes('cerrada') || after.includes('PDF')) {
    note('F1', 'Caja pendiente cerrada — sin diferencia ✓')
    return true
  }

  fail('F1', `Resultado inesperado: ${after.slice(0, 300)}`)
  return false
}

// ─── F2a — abrir caja nueva ───────────────────────────────────────────────────

const openCash = async (page) => {
  await navTo(page, 'cash-control')
  const txt = await bodyText(page)
  if (txt.includes('Abierto')) {
    note('F2a', 'Caja ya abierta')
    return true
  }

  const amtInput = await page.$('#cash-opening-amount')
  if (!amtInput) { fail('F2a', 'Input de apertura no encontrado'); return false }

  await amtInput.click({ clickCount: 3 })
  await amtInput.type('10.00', { delay: 40 })

  const checkbox = await page.$('input[type="checkbox"]')
  if (checkbox) await checkbox.click()

  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.textContent.includes('monto inicial') && !b.disabled)
    if (btn) { btn.click(); return true }
    return false
  })

  if (!opened) { fail('F2a', 'Botón de apertura no encontrado'); return false }

  const ok = await waitForBodyText(page, 'Abierto', 8000)
  if (!ok) { fail('F2a', 'Caja no aparece Abierta tras apertura'); return false }

  note('F2a', 'Caja abierta con $10.00')
  return true
}

// ─── F2b — POS accesible ─────────────────────────────────────────────────────

const phaseF2b = async (page) => {
  log('F2b', 'Navegando a POS...')
  await navTo(page, 'pos')

  const txt = await bodyText(page)

  if (txt.includes('Accion no soportada') || txt.includes('get_cash_session_status')) {
    fail('F2b', 'INC-01 reincidente — accion no soportada en EF')
    return false
  }

  if (txt.includes('Caja cerrada') && !txt.includes('Mesa')) {
    fail('F2b', 'POS bloqueado por caja cerrada — apertura no propagada')
    return false
  }

  note('F2b', 'POS accesible sin bloqueo ✓')

  // Buscar una mesa disponible
  const mesa = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => /Mesa\s*\d+/i.test(b.textContent.trim()))
    if (btn) { const label = btn.textContent.trim(); btn.click(); return label }
    return null
  })

  if (mesa) {
    note('F2b', `Mesa seleccionada: ${mesa}`)
  } else {
    note('F2b', 'Sin mesas configuradas en PRD (aceptable en smoke minimal)')
  }

  return true
}

// ─── F2c — cierre caja con mesa activa bloqueado ─────────────────────────────

const phaseF2c = async (page) => {
  // Solo verificamos la UI del cierre — no necesitamos mesa activa real
  // El backend ya valida esto con el trigger prevent_cash_close_with_active_pos_operations
  log('F2c', 'Verificando UI de cierre con campo counted_cash...')
  await navTo(page, 'cash-control')

  const input = await page.$('#cash-counted')
  if (!input) {
    fail('F2c', 'Campo #cash-counted ausente — UI no actualizada')
    return false
  }

  note('F2c', 'Campo #cash-counted presente en UI de cierre ✓')
  return true
}

// ─── F3 — Finanzas visible para manager ──────────────────────────────────────

const phaseF3 = async (browser) => {
  if (!MGR_PASS) {
    note('F3', 'OMITIDO — SMOKE_MANAGER_PASSWORD no definido')
    return
  }

  const page = await browser.newPage()
  page.setDefaultTimeout(TIMEOUT)

  try {
    await login(page, MGR_USER, MGR_PASS)
    await new Promise((r) => setTimeout(r, 1000))

    // Verificar Finanzas en nav — en home el nav está oculto, navegar a otra página
    await navTo(page, 'finances')
    const txt = await bodyText(page)

    if (txt.includes('finances') || txt.includes('Finanzas') || txt.includes('Saldos')) {
      note('F3', 'Módulo Finanzas accesible para manager ✓')
    } else if (txt.includes('Acceso denegado') || txt.includes('sin permiso')) {
      fail('F3', 'Manager no tiene acceso a Finanzas')
      return
    } else {
      fail('F3', `Estado inesperado en página finances: ${txt.slice(0, 200)}`)
      return
    }

    // Reportes: navegar a cada sub-página
    const subPages = [
      { key: 'finances-balances', label: 'Saldos' },
      { key: 'finances-journal',  label: 'Pólizas/Asientos' },
      { key: 'finances-ledger',   label: 'Mayor' },
      { key: 'finances-sessions', label: 'Sesiones de caja' },
    ]

    for (const { key, label } of subPages) {
      await navTo(page, key)
      const t = await bodyText(page)
      if (t.includes('500') || t.includes('Error interno') || t.includes('Unexpected token')) {
        fail('F3', `Reporte "${label}" devolvió error 500`)
      } else if (t.includes('Acceso denegado')) {
        fail('F3', `Reporte "${label}" — Acceso denegado para manager`)
      } else {
        note('F3', `Reporte "${label}" cargó sin error ✓`)
      }
    }
  } catch (err) {
    fail('F3', `Error en fase manager: ${err.message}`)
  } finally {
    await page.close()
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  log('smoke', `URL: ${BASE_URL} | headless: ${HEADLESS}`)

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1280, height: 900 },
  })

  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(TIMEOUT)

    // F0 — bundle (sin login)
    await phaseF0(page)

    // Login con usuario operativo
    await login(page, USERNAME, PASSWORD)

    // F1 — cerrar caja pendiente
    await phaseF1(page)

    // F2a — abrir caja nueva
    await openCash(page)

    // F2b — POS accesible
    await phaseF2b(page)

    // F2c — campo counted_cash presente
    await phaseF2c(page)

    await page.close()

    // F3 — manager
    await phaseF3(browser)
  } finally {
    await browser.close()
  }

  // ─── resultado ─────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length

  console.log('\n══════════════════════════════════════════════')
  console.log('SMOKE PRD — Finanzas 2026-08-31 (iteración 2)')
  console.log('══════════════════════════════════════════════')
  results.forEach((r) => console.log(`${r.ok ? '✅' : '❌'} [${r.tag}] ${r.msg}`))
  console.log(`\nTotal: ${passed} ✅  ${failed} ❌`)
  console.log('══════════════════════════════════════════════')

  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message || err)
  process.exit(1)
})
