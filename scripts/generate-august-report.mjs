/**
 * Reporte Ejecutivo de Operaciones — Agosto 2026
 * La Carreta POS — Base de Producción
 *
 * Uso:
 *   SUPABASE_DB_URL="postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres" \
 *     node scripts/generate-august-report.mjs
 *
 * O con Supabase CLI vinculado al proyecto PRD:
 *   supabase link --project-ref cxpouhmrpcpiohrueuwk
 *   node scripts/generate-august-report.mjs --linked
 */

import { execSync } from 'child_process'
import { readFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const QUERIES_DIR = resolve(__dirname, 'queries')
const OUTPUT_DIR = resolve(ROOT, 'analisis_la_carreta_pos')
const OUTPUT_PDF = resolve(OUTPUT_DIR, 'agosto-2026-reporte-ejecutivo.pdf')

const useLinked = process.argv.includes('--linked')
const dbUrl = process.env.SUPABASE_DB_URL

if (!useLinked && !dbUrl) {
  console.error(
    'ERROR: Proporciona --linked (CLI vinculado a PRD) o la variable SUPABASE_DB_URL.'
  )
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Query runner
// ---------------------------------------------------------------------------
function runQuery(filename) {
  const file = resolve(QUERIES_DIR, filename)
  const flag = useLinked ? '--linked' : `--db-url "${dbUrl}"`
  const cmd = `npx supabase db query -f "${file}" -o json ${flag}`

  try {
    const raw = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    const parsed = JSON.parse(raw.trim())
    // --linked wraps output: { boundary, rows: [...], warning }
    // --db-url returns a plain array
    const rows = parsed?.rows ?? (Array.isArray(parsed) ? parsed : [parsed])
    return rows
  } catch (err) {
    const stderr = err.stderr?.toString() || ''
    console.error(`Query failed [${filename}]:`, stderr || err.message)
    process.exit(1)
  }
}

// ---------------------------------------------------------------------------
// Fetch all data
// ---------------------------------------------------------------------------
console.log('Consultando base de datos de producción...')

const [ventas]        = runQuery('q_ventas.sql')
const [compras]       = runQuery('q_compras.sql')
const gastosRows      = runQuery('q_gastos_tipo.sql')
const semanasRows     = runQuery('q_ventas_semana.sql')
const [diaPico]       = runQuery('q_dia_pico.sql')
const [caja]          = runQuery('q_caja.sql')
const [inventario]    = runQuery('q_inventario.sql')

console.log('Datos obtenidos. Generando reporte...')

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------
const totalVentas  = parseFloat(ventas.total_ventas  || 0)
const totalCompras = parseFloat(compras.total_compras || 0)
const margenOp     = totalVentas - totalCompras

const semanasData = semanasRows.map((r) => ({
  semana: new Date(r.semana),
  total:  parseFloat(r.total_semana || 0),
  count:  parseInt(r.num_ventas || 0, 10),
}))

const semanaRecord = semanasData.reduce(
  (max, s) => (s.total > max.total ? s : max),
  semanasData[0] || { total: 0, semana: new Date() }
)

const pctRecord = totalVentas > 0
  ? ((semanaRecord.total / totalVentas) * 100).toFixed(1)
  : '0.0'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
const mxn = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(Number(n) || 0)

const fmtDate = (d) => {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

const fmtWeek = (d) => {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  const end = new Date(date)
  end.setDate(end.getDate() + 6)
  return `${date.getDate()} – ${end.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

// ---------------------------------------------------------------------------
// Anomaly detection
// ---------------------------------------------------------------------------
const anomalias = []
if (margenOp < 0) anomalias.push('Margen operativo negativo: egresos superan las ventas del mes.')
if (parseFloat(ventas.num_ventas || 0) === 0) anomalias.push('Sin ventas registradas en agosto.')
if (parseFloat(caja.num_sesiones || 0) === 0) anomalias.push('Sin sesiones de caja en agosto.')

const gastoPorTipo = gastosRows.reduce((sum, r) => sum + parseFloat(r.total || 0), 0)
if (totalCompras > 0 && Math.abs(gastoPorTipo - totalCompras) > 1) {
  anomalias.push('Discrepancia entre suma de compras por tipo y total de compras.')
}

if (anomalias.length === 0) anomalias.push('Sin anomalías detectadas en los registros de agosto.')

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------
const today = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })

const gastosHtml = gastosRows.length === 0
  ? '<tr><td colspan="3" style="text-align:center;color:#64748b;">Sin compras registradas</td></tr>'
  : gastosRows.map((r) => `
      <tr>
        <td>${r.tipo || '—'}</td>
        <td style="text-align:center;">${r.num_compras}</td>
        <td style="text-align:right;">${mxn(r.total)}</td>
      </tr>`).join('')

const semanasHtml = semanasData.length === 0
  ? '<tr><td colspan="3" style="text-align:center;color:#64748b;">Sin datos</td></tr>'
  : semanasData.map((r) => {
      const pct = totalVentas > 0 ? ((r.total / totalVentas) * 100).toFixed(1) : '0.0'
      const isRecord = r.semana.getTime() === semanaRecord.semana?.getTime()
      return `
      <tr ${isRecord ? 'style="background:#f0fdf4;"' : ''}>
        <td>${fmtWeek(r.semana)}${isRecord ? ' ⭐' : ''}</td>
        <td style="text-align:center;">${r.count}</td>
        <td style="text-align:right;">${mxn(r.total)}</td>
        <td style="text-align:center;">${pct}%</td>
      </tr>`
    }).join('')

const anomaliasHtml = anomalias
  .map((a) => `<li style="margin-bottom:4px;">${a}</li>`)
  .join('')

const resumenPuntos = [
  `Ventas acumuladas de agosto: <strong>${mxn(totalVentas)}</strong> en <strong>${ventas.num_ventas}</strong> transacciones.`,
  `Compras totales del mes: <strong>${mxn(totalCompras)}</strong>.`,
  `Margen Operativo Simple: <strong style="color:${margenOp >= 0 ? '#16a34a' : '#dc2626'}">${mxn(margenOp)}</strong>.`,
  `Capital inmovilizado en inventario (hoy): <strong>${mxn(inventario.capital_inventario)}</strong>.`,
  `Sesiones de caja en agosto: <strong>${caja.num_sesiones}</strong> — apertura promedio ${mxn(caja.promedio_apertura)}.`,
]

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    color: #0f172a;
    background: #fff;
    padding: 0;
  }
  .page { padding: 28px 36px; }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    border-bottom: 2px solid #0f172a;
    padding-bottom: 12px;
    margin-bottom: 20px;
  }
  .brand { font-size: 20pt; font-weight: 900; color: #0f172a; }
  .report-meta { text-align: right; color: #475569; font-size: 9pt; }
  .report-meta .title { font-size: 12pt; font-weight: 700; color: #0f172a; }

  /* Sections */
  .section { margin-bottom: 24px; }
  .section-title {
    font-size: 11pt;
    font-weight: 800;
    color: #1e3a5f;
    border-left: 4px solid #1e3a5f;
    padding-left: 8px;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* KPI cards */
  .kpi-row { display: flex; gap: 12px; margin-bottom: 16px; }
  .kpi {
    flex: 1;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 14px;
    background: #f8fafc;
  }
  .kpi-label { font-size: 8pt; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .kpi-value { font-size: 14pt; font-weight: 900; color: #0f172a; margin-top: 2px; }
  .kpi-sub { font-size: 8pt; color: #64748b; margin-top: 2px; }
  .kpi.green .kpi-value { color: #16a34a; }
  .kpi.red .kpi-value { color: #dc2626; }

  /* Tables */
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th {
    background: #0f172a;
    color: #fff;
    text-align: left;
    padding: 6px 10px;
    font-weight: 700;
    font-size: 8.5pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  td { padding: 6px 10px; border-bottom: 1px solid #f1f5f9; }
  tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: #f8fafc; }

  /* Summary bullets */
  .summary ul { list-style: none; padding: 0; }
  .summary li {
    padding: 5px 0 5px 16px;
    border-bottom: 1px solid #f1f5f9;
    position: relative;
    font-size: 9.5pt;
  }
  .summary li::before {
    content: '▸';
    position: absolute;
    left: 0;
    color: #1e3a5f;
  }

  /* Alerts */
  .alerts {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 6px;
    padding: 10px 14px;
    margin-top: 10px;
  }
  .alerts-label { font-size: 8pt; font-weight: 700; color: #92400e; text-transform: uppercase; margin-bottom: 4px; }
  .alerts ul { list-style: none; padding: 0; font-size: 9pt; color: #78350f; }

  /* Footer */
  .footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #e2e8f0;
    font-size: 7.5pt;
    color: #94a3b8;
  }
  .footer strong { color: #64748b; }

  /* Divider */
  .divider { border: none; border-top: 1px solid #e2e8f0; margin: 18px 0; }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">La Carreta</div>
      <div style="color:#64748b;font-size:9pt;margin-top:2px;">Punto de Venta — Sistema Operativo</div>
    </div>
    <div class="report-meta">
      <div class="title">Reporte Ejecutivo de Operaciones</div>
      <div>Periodo: Agosto 2026</div>
      <div>Generado: ${today}</div>
      <div>Fuente: Base de Datos de Producción (PRD)</div>
    </div>
  </div>

  <!-- ================================================================== -->
  <!-- 1. RESUMEN EJECUTIVO -->
  <!-- ================================================================== -->
  <div class="section">
    <div class="section-title">1. Resumen Ejecutivo</div>

    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Total Ventas</div>
        <div class="kpi-value">${mxn(totalVentas)}</div>
        <div class="kpi-sub">${ventas.num_ventas} transacciones</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Total Compras</div>
        <div class="kpi-value">${mxn(totalCompras)}</div>
        <div class="kpi-sub">${compras.num_compras} órdenes</div>
      </div>
      <div class="kpi ${margenOp >= 0 ? 'green' : 'red'}">
        <div class="kpi-label">Margen Operativo Simple</div>
        <div class="kpi-value">${mxn(margenOp)}</div>
        <div class="kpi-sub">Ventas − Compras</div>
      </div>
    </div>

    <div class="summary">
      <ul>
        ${resumenPuntos.map((p) => `<li>${p}</li>`).join('')}
      </ul>
    </div>

    <div class="alerts">
      <div class="alerts-label">⚠ Alertas y Anomalías</div>
      <ul>${anomaliasHtml}</ul>
    </div>
  </div>

  <hr class="divider"/>

  <!-- ================================================================== -->
  <!-- 2. BALANCE OPERATIVO -->
  <!-- ================================================================== -->
  <div class="section">
    <div class="section-title">2. Balance Operativo de Agosto</div>

    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Ventas Totales</div>
        <div class="kpi-value">${mxn(totalVentas)}</div>
        <div class="kpi-sub">Ticket promedio: ${mxn(ventas.ticket_promedio)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Compras Totales</div>
        <div class="kpi-value">${mxn(totalCompras)}</div>
        <div class="kpi-sub">${compras.num_compras} órdenes de compra</div>
      </div>
      <div class="kpi ${margenOp >= 0 ? 'green' : 'red'}">
        <div class="kpi-label">Resultado Operativo Neto</div>
        <div class="kpi-value">${mxn(margenOp)}</div>
        <div class="kpi-sub">Ventas − Compras</div>
      </div>
    </div>

    <div style="margin-top:12px;">
      <div style="font-size:9pt;font-weight:700;color:#334155;margin-bottom:6px;">
        Gastos por Tipo de Proveedor
      </div>
      <table>
        <thead>
          <tr>
            <th>Tipo de Proveedor</th>
            <th style="text-align:center;">N.º Compras</th>
            <th style="text-align:right;">Total Egresado</th>
          </tr>
        </thead>
        <tbody>
          ${gastosHtml}
        </tbody>
      </table>
    </div>
  </div>

  <hr class="divider"/>

  <!-- ================================================================== -->
  <!-- 3. COMPORTAMIENTO TEMPORAL DE VENTAS -->
  <!-- ================================================================== -->
  <div class="section">
    <div class="section-title">3. Comportamiento Temporal de Ventas</div>

    <div class="kpi-row" style="margin-bottom:12px;">
      <div class="kpi">
        <div class="kpi-label">Semana Récord</div>
        <div class="kpi-value" style="font-size:11pt;">${fmtWeek(semanaRecord.semana)}</div>
        <div class="kpi-sub">${mxn(semanaRecord.total)} — ${pctRecord}% del mes</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Día Pico</div>
        <div class="kpi-value" style="font-size:11pt;">${fmtDate(diaPico?.fecha)}</div>
        <div class="kpi-sub">${mxn(diaPico?.total_dia)} — ${diaPico?.num_ventas || 0} ventas</div>
      </div>
    </div>

    <div style="font-size:9pt;font-weight:700;color:#334155;margin-bottom:6px;">Desglose Semanal</div>
    <table>
      <thead>
        <tr>
          <th>Semana</th>
          <th style="text-align:center;">N.º Ventas</th>
          <th style="text-align:right;">Total</th>
          <th style="text-align:center;">% del Mes</th>
        </tr>
      </thead>
      <tbody>
        ${semanasHtml}
      </tbody>
    </table>
  </div>

  <hr class="divider"/>

  <!-- ================================================================== -->
  <!-- 4. LIQUIDEZ DE CAJA Y CAPITAL DE TRABAJO -->
  <!-- ================================================================== -->
  <div class="section">
    <div class="section-title">4. Liquidez de Caja y Capital de Trabajo</div>

    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-label">Sesiones de Caja (Agosto)</div>
        <div class="kpi-value">${caja.num_sesiones}</div>
        <div class="kpi-sub">sesiones registradas</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Caja Inicial Promedio</div>
        <div class="kpi-value">${mxn(caja.promedio_apertura)}</div>
        <div class="kpi-sub">Rango: ${mxn(caja.min_apertura)} — ${mxn(caja.max_apertura)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Ventas Efectivo (Caja)</div>
        <div class="kpi-value">${mxn(caja.total_ventas_efectivo)}</div>
        <div class="kpi-sub">Registrado en cortes de caja</div>
      </div>
    </div>

    <div class="kpi-row" style="margin-top:0;">
      <div class="kpi" style="flex:2;">
        <div class="kpi-label">Capital en Inventario (hoy)</div>
        <div class="kpi-value" style="font-size:16pt;">${mxn(inventario.capital_inventario)}</div>
        <div class="kpi-sub">
          ${inventario.num_items} materiales con stock &gt; 0 ·
          Calculado: stock_actual × costo_promedio
        </div>
      </div>
    </div>
  </div>

  <!-- Footer técnico -->
  <div class="footer">
    <strong>Nota Técnica — Trazabilidad de Datos (PRD)</strong><br/>
    Tablas consultadas: <code>public.sales</code> · <code>public.purchases</code> ·
    <code>public.providers</code> · <code>public.cash_sessions</code> ·
    <code>public.inventory</code> · <code>public.materials</code><br/>
    Archivos de consulta: <code>scripts/queries/q_ventas.sql</code> ·
    <code>q_compras.sql</code> · <code>q_gastos_tipo.sql</code> ·
    <code>q_ventas_semana.sql</code> · <code>q_dia_pico.sql</code> ·
    <code>q_caja.sql</code> · <code>q_inventario.sql</code><br/>
    Zona horaria: America/Mexico_City · Moneda: MXN · Herramienta: Supabase CLI + Puppeteer
  </div>

</div>
</body>
</html>`

// ---------------------------------------------------------------------------
// Generate PDF with Puppeteer
// ---------------------------------------------------------------------------
let puppeteer
try {
  puppeteer = await import('puppeteer')
  puppeteer = puppeteer.default
} catch {
  console.error(
    'Puppeteer no encontrado. Instálalo con: npm install puppeteer\n' +
    'O ejecuta primero: npm install --save-dev puppeteer'
  )
  process.exit(1)
}

if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

const browser = await puppeteer.launch({ headless: 'new' })
const page = await browser.newPage()
await page.setContent(html, { waitUntil: 'networkidle0' })
await page.pdf({
  path: OUTPUT_PDF,
  format: 'A4',
  printBackground: true,
  margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' },
})
await browser.close()

console.log(`✓ PDF generado: ${OUTPUT_PDF}`)
