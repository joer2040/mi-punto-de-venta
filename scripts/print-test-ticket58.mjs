// IMPRESORA-01: physical POS-58 print test with fictitious data. No sale, no Supabase, no network.
// Usage: node scripts/print-test-ticket58.mjs  -> writes an HTML file to the OS temp dir and prints its path.
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildTicket58Html, getTicket58Problem } from '../src/lib/ticket58.js'

const TEST_BANNER = 'PRUEBA — SIN VENTA'

const ticket = {
  items: [
    { kind: 'material', bundleId: null, name: 'Refresco', quantity: 2, unitPrice: 25, subtotal: 50 },
    {
      kind: 'bundle',
      bundleId: 'prueba-cubeta',
      bundleType: 'cubeta',
      bundleLabel: 'Cubeta Mixta',
      name: 'Cubeta Mixta',
      quantity: 1,
      unitPrice: 320,
      subtotal: 320,
    },
  ],
  // 27-oct-2026 14:05 America/Monterrey.
  confirmed: { chargedAt: '2026-10-27T20:05:00.000Z', total: 370, hasItems: true },
}

const problem = getTicket58Problem(ticket)
if (problem) throw new Error(`Ticket de prueba invalido: ${problem}`)

const logo = readFileSync(new URL('../src/assets/la_carreta_sin_fondo.png', import.meta.url))
const logoUrl = `data:image/png;base64,${logo.toString('base64')}`

const banner = `<div style="text-align:center;font-weight:800;border:1px solid #000;padding:1mm;margin:2mm 0;">${TEST_BANNER}</div>`
const html = buildTicket58Html({ ticket, logoUrl })
  .replace('<title>Ticket</title>', `<title>${TEST_BANNER}</title>`)
  .replace('<div class="sheet">', `<div class="sheet">${banner}`)
  .replace('<div class="footer">¡Gracias por su visita!</div>', (footer) => `${footer}${banner}`)

const outFile = join(tmpdir(), 'la-carreta-ticket58-prueba.html')
writeFileSync(outFile, html, 'utf8')
console.log(outFile)
