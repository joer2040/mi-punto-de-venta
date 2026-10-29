// IMPRESORA-01: receipt-only operations. No calls to finalize_pos_sale or ledger.
// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const reply = (value: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DAY_15 = 15 * 24 * 60 * 60 * 1000
const safeText = (value: unknown, max = 180) => String(value ?? '').trim().slice(0, max)
const amountCents = (value: unknown) => {
  const raw = String(value ?? '')
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null
  const [a, b = ''] = raw.split('.')
  const cents = Number(a) * 100 + Number(b.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : null
}
const fixedMoney = (cents: number) => (cents / 100).toFixed(2)

const getPermissionKeys = async (db: ReturnType<typeof createClient>, userId: string) => {
  const { data: profile, error } = await db.from('app_profiles')
    .select('status,is_superadmin').eq('id', userId).maybeSingle()
  if (error || profile?.status !== 'active') throw new Error('FORBIDDEN')
  if (profile.is_superadmin) return new Set(['pos:create', 'pos:edit', 'report_sales:view'])
  const { data: links, error: linkError } = await db.from('app_user_roles')
    .select('role_id').eq('user_id', userId)
  if (linkError) throw linkError
  const roleIds = [...new Set((links || []).map((x: any) => x.role_id))]
  if (!roleIds.length) return new Set()
  const { data: assigned, error: assignedError } = await db.from('app_role_permissions')
    .select('permission_id').in('role_id', roleIds)
  if (assignedError) throw assignedError
  const ids = [...new Set((assigned || []).map((x: any) => x.permission_id))]
  if (!ids.length) return new Set()
  const { data: permissions, error: permissionError } = await db.from('app_permissions')
    .select('screen_key,action_key').in('id', ids)
  if (permissionError) throw permissionError
  return new Set((permissions || []).map((p: any) => p.screen_key + ':' + p.action_key))
}

const makeTicket = (sale: any, source: any) => {
  if (!source || source.id !== sale.id || !Array.isArray(source.items) || !source.items.length) return null
  const verifiedTotal = amountCents(sale.total_amount)
  if (verifiedTotal === null || amountCents(source.total_amount) !== verifiedTotal) return null
  const groups = new Map<string, any>()
  const items: any[] = []
  let runningTotal = 0
  for (const row of source.items) {
    const name = safeText(row.name)
    const quantity = Number(row.quantity)
    const unit = amountCents(row.unit_price)
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || unit === null) return null
    const cents = Math.round(quantity * unit)
    if (!Number.isSafeInteger(cents)) return null
    runningTotal += cents
    const bundleId = safeText(row.bundle_id, 120)
    if (bundleId) {
      const bundleType = safeText(row.bundle_type, 70)
      if (!bundleType) return null
      const existing = groups.get(bundleId)
      if (existing) {
        if (existing.bundleType !== bundleType) return null
        existing.subtotalCents += cents
      } else {
        const group = {
          bundleType,
          name: safeText(row.bundle_label) || (bundleType === 'cubeta_caguamita' ? 'Cubeta Caguamita' : 'Cubeta Mixta'),
          subtotalCents: cents,
        }
        groups.set(bundleId, group)
        items.push({ __bundle: bundleId })
      }
    } else {
      items.push({ name, quantity, unitPrice: fixedMoney(unit), subtotal: fixedMoney(cents) })
    }
  }
  if (runningTotal !== verifiedTotal) return null
  const displayItems = items.map((item) => {
    if (!item.__bundle) return item
    const group = groups.get(item.__bundle)
    return { name: group.name, quantity: 1, unitPrice: fixedMoney(group.subtotalCents), subtotal: fixedMoney(group.subtotalCents) }
  })
  return {
    saleId: sale.id,
    chargedAt: sale.created_at,
    items: displayItems,
    total: fixedMoney(verifiedTotal),
    version: 'POS58-v1',
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405)
  try {
    const authorization = req.headers.get('authorization')
    if (!authorization) return reply({ error: 'Sesión requerida.' }, 401)
    const url = Deno.env.get('SUPABASE_URL')
    const publicKey = Deno.env.get('PROJECT_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !publicKey || !serviceKey) return reply({ error: 'Servicio no configurado.' }, 503)
    const authClient = createClient(url, publicKey, { global: { headers: { Authorization: authorization } } })
    const db = createClient(url, serviceKey)
    const { data: auth, error: authError } = await authClient.auth.getUser()
    if (authError || !auth?.user) return reply({ error: 'Sesión inválida.' }, 401)
    const keys = await getPermissionKeys(db, auth.user.id)
    const body = await req.json()
    const action = String(body?.action ?? '')
    const saleId = String(body?.sale_id ?? '')
    if (!UUID.test(saleId)) return reply({ error: 'Venta inválida.' }, 400)

    if (action === 'get') {
      if (!keys.has('report_sales:view')) return reply({ error: 'Acceso denegado.' }, 403)
      const { data, error } = await db.from('sale_print_tickets')
        .select('ticket_json,expires_at').eq('sale_id', saleId)
        .gt('expires_at', new Date().toISOString()).maybeSingle()
      if (error) throw error
      if (!data) return reply({ error: 'El ticket no está disponible o venció.' }, 404)
      return reply({ ticket: { ...data.ticket_json, expiresAt: data.expires_at } })
    }

    if (action === 'capture') {
      if (!keys.has('pos:create') && !keys.has('pos:edit')) return reply({ error: 'Acceso denegado.' }, 403)
      const key = String(body?.idempotency_key ?? '')
      if (!key || key.length > 128) return reply({ error: 'Clave de venta requerida.' }, 400)

      const { data: sale, error: saleError } = await db.from('sales')
        .select('id,created_at,total_amount,financial_operation_id')
        .eq('id', saleId).maybeSingle()
      if (saleError) throw saleError
      if (!sale) return reply({ error: 'Venta no confirmada.' }, 404)
      const expiresAt = new Date(new Date(sale.created_at).getTime() + DAY_15)
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        return reply({ error: 'El ticket venció.' }, 410)
      }

      const { data: idem, error: idemError } = await db.from('idempotency_requests')
        .select('actor_id,status,response_json').eq('scope', 'sale')
        .eq('idempotency_key', key).maybeSingle()
      if (idemError) throw idemError
      if (idem?.status !== 'completed' || !idem?.response_json || idem.response_json.id !== sale.id) {
        return reply({ error: 'No se pudo comprobar la venta original.' }, 409)
      }

      // The operation key is correlation, never authorization. Prove caller's authorship.
      let belongsToCaller = Boolean(idem.actor_id && idem.actor_id === auth.user.id)
      if (!belongsToCaller && !idem.actor_id && sale.financial_operation_id) {
        const { data: op, error: opError } = await db.from('financial_operations')
          .select('performed_by').eq('id', sale.financial_operation_id).maybeSingle()
        if (opError) throw opError
        belongsToCaller = op?.performed_by === auth.user.id
      }
      if (!belongsToCaller) return reply({ error: 'No se puede verificar la autoría de esta venta.' }, 403)

      const snapshot = makeTicket(sale, idem.response_json)
      if (!snapshot) return reply({ error: 'No se dispone de datos canónicos completos para el ticket.' }, 409)

      const { error: insertError } = await db.from('sale_print_tickets').insert({
        sale_id: sale.id,
        confirmed_at: sale.created_at,
        expires_at: expiresAt.toISOString(),
        ticket_json: snapshot,
      })
      if (insertError && insertError.code !== '23505') throw insertError

      const { data: stored, error: storedError } = await db.from('sale_print_tickets')
        .select('ticket_json,expires_at').eq('sale_id', sale.id)
        .gt('expires_at', new Date().toISOString()).maybeSingle()
      if (storedError) throw storedError
      if (!stored) return reply({ error: 'Ticket no disponible.' }, 404)
      return reply({ ticket: { ...stored.ticket_json, expiresAt: stored.expires_at } })
    }

    return reply({ error: 'Acción no soportada.' }, 400)
  } catch (error) {
    console.error('ticket-operations:', error instanceof Error ? error.message : 'unexpected')
    if (error instanceof Error && error.message === 'FORBIDDEN') return reply({ error: 'Acceso denegado.' }, 403)
    return reply({ error: 'No se pudo consultar el comprobante.' }, 500)
  }
})
