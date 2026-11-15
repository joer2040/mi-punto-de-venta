// Real-browser layout check of the POS-58 ticket: every box must stay inside the safe content width.
// Skipped when Chrome/Edge is not installed. It proves CSS geometry only, not the printer's physical margins.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import process from 'node:process'
import { chromium } from 'playwright-core'
import {
  TICKET58_CONTENT_MM,
  buildOpenAccountTicket58Html,
  buildTicket58Html,
  ticket58FromStoredTicket,
} from './ticket58.js'

const MM_TO_PX = 96 / 25.4
const PAPER_MM = 58
const TOLERANCE_PX = 0.5
const LOGO = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]
const executablePath = process.env.CHROME_PATH || BROWSERS.find((path) => existsSync(path))

const LONG_NAME = 'Cerveza Artesanal Edición Limitada Barril Añejado 1.2 L'
const items = [
  { kind: 'material', bundleId: null, name: 'Agua', quantity: 1, unitPrice: 15, subtotal: 15 },
  { kind: 'material', bundleId: null, name: LONG_NAME, quantity: 12, unitPrice: 1234.5, subtotal: 14814 },
  { kind: 'material', bundleId: null, name: 'X'.repeat(80), quantity: 100, unitPrice: 99.99, subtotal: 9999 },
  { kind: 'bundle', bundleId: 'c-1', bundleType: 'cubeta', bundleLabel: 'Cubeta Caguamita', name: 'Cubeta Caguamita', quantity: 1, unitPrice: 180, subtotal: 180 },
]
const total = 15 + 14814 + 9999 + 180
const chargedAt = '2026-10-27T20:05:00.000Z'

const stored = {
  saleId: 'sale-1',
  chargedAt,
  expiresAt: '2026-11-11T20:05:00.000Z',
  total: total.toFixed(2),
  items: items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    unitPrice: item.unitPrice.toFixed(2),
    subtotal: item.subtotal.toFixed(2),
  })),
}

const templates = {
  'confirmed sale': () => buildTicket58Html({
    ticket: { items, confirmed: { chargedAt, total, hasItems: true } },
    logoUrl: LOGO,
  }),
  'open account': () => buildOpenAccountTicket58Html({ items, total, printedAt: chargedAt, logoUrl: LOGO }),
  reprint: () => buildTicket58Html({
    ticket: ticket58FromStoredTicket(stored, 'sale-1', Date.parse(chargedAt) + 1000).ticket,
    logoUrl: LOGO,
  }),
}

// Page widths: the full 58 mm roll, and a narrower driver-printable area.
const PAGE_WIDTHS_MM = [PAPER_MM, 48]

test('POS-58 ticket boxes never leave the safe width', { skip: !executablePath && 'no Chrome/Edge found' }, async () => {
  const browser = await chromium.launch({ executablePath })
  try {
    for (const [name, build] of Object.entries(templates)) {
      for (const pageMm of PAGE_WIDTHS_MM) {
        const page = await browser.newPage({ viewport: { width: Math.round(pageMm * MM_TO_PX), height: 800 } })
        await page.setContent(build())
        const report = await page.evaluate(() => {
          const sheet = document.querySelector('.sheet').getBoundingClientRect()
          const outside = [...document.querySelectorAll('.sheet *')]
            .map((el) => ({ cls: el.className || el.tagName, r: el.getBoundingClientRect() }))
            .filter(({ r }) => r.width > 0)
            .filter(({ r }) => r.left < sheet.left - 0.5 || r.right > sheet.right + 0.5)
            .map(({ cls, r }) => `${cls} [${r.left.toFixed(1)}, ${r.right.toFixed(1)}]`)
          return {
            sheetLeft: sheet.left,
            sheetRight: sheet.right,
            sheetWidth: sheet.width,
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
            outside,
            totalRight: document.querySelector('.total-amount').getBoundingClientRect().right,
            totalScrollOverflow: document.querySelector('.total-amount').scrollWidth - document.querySelector('.total-amount').clientWidth,
          }
        })
        const label = `${name} @ ${pageMm} mm page`

        assert.deepEqual(report.outside, [], `${label}: boxes outside the sheet`)
        assert.ok(report.docScrollWidth <= report.docClientWidth + TOLERANCE_PX, `${label}: horizontal overflow`)
        assert.ok(report.sheetWidth <= TICKET58_CONTENT_MM * MM_TO_PX + TOLERANCE_PX, `${label}: sheet wider than ${TICKET58_CONTENT_MM} mm`)
        assert.ok(report.sheetLeft >= -TOLERANCE_PX, `${label}: sheet starts left of the page`)
        assert.ok(report.totalRight <= report.sheetRight + TOLERANCE_PX, `${label}: total amount outside the sheet`)
        assert.ok(report.totalScrollOverflow <= 0, `${label}: total amount clipped`)
        if (pageMm === PAPER_MM) {
          // Centered by symmetric margins: same free space on both sides.
          assert.ok(Math.abs(report.sheetLeft - (report.docClientWidth - report.sheetRight)) <= 1, `${label}: not centered`)
        }
        await page.close()
      }
    }
  } finally {
    await browser.close()
  }
})
