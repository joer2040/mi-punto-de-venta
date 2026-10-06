// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const normalizeRoleName = (value: string | null | undefined) => (value || '').trim().toLowerCase()
const isManagerRoleName = (value: string | null | undefined) =>
  ['manager', 'administrador operativo'].includes(normalizeRoleName(value))
const CASH_CONTROL_SCREEN_KEY = 'cash_control'
const CASH_CONTROL_VIEW_KEY   = `${CASH_CONTROL_SCREEN_KEY}:view`
const CASH_CONTROL_MANAGE_KEY = `${CASH_CONTROL_SCREEN_KEY}:manage`
const appError = (message: string, status = 400) => Object.assign(new Error(message), { status })

type RoleLinkRow = {
  role_id: string
  app_roles: { name: string | null } | { name: string | null }[] | null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const resolveAuthenticatedUser = async (requestClient: ReturnType<typeof createClient>) => {
  const { data, error } = await requestClient.auth.getUser()
  if (error || !data?.user) {
    return { user: null, error: new Error('Sesion invalida o expirada.') }
  }
  return { user: data.user, error: null }
}

const readRoleName = (roleLink: RoleLinkRow) => {
  if (Array.isArray(roleLink.app_roles)) return roleLink.app_roles[0]?.name ?? null
  return roleLink.app_roles?.name ?? null
}

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const sortByMaterialName = (rows: Array<{ material_name: string }>) =>
  [...rows].sort((a, b) =>
    String(a.material_name || '').localeCompare(String(b.material_name || ''), 'es', {
      sensitivity: 'base',
    })
  )

const serializeSession = (session: Record<string, unknown> | null) => {
  if (!session) return null
  return {
    ...session,
    opening_amount:      toNumber(session.opening_amount),
    sales_cash_total:    toNumber(session.sales_cash_total),
    expected_cash_total: toNumber(session.expected_cash_total),
    closing_amount:      toNumber(session.closing_amount),
    profit_total:        toNumber(session.profit_total),
    first_counted_cash:  session.first_counted_cash != null ? toNumber(session.first_counted_cash) : null,
    final_counted_cash:  session.final_counted_cash  != null ? toNumber(session.final_counted_cash)  : null,
    difference_amount:   session.difference_amount   != null ? toNumber(session.difference_amount)   : null,
  }
}

const loadCallerContext = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data: profile, error: profileError } = await adminClient
    .from('app_profiles')
    .select('id, is_superadmin, status')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || profile?.status !== 'active') {
    throw appError('No tienes permisos para operar control de caja.', 403)
  }

  const { data: callerRoleLinks, error: callerRoleError } = await adminClient
    .from('app_user_roles')
    .select('role_id, app_roles(name)')
    .eq('user_id', userId)

  if (callerRoleError) throw callerRoleError

  const callerRoleNames = Array.from(
    new Set(((callerRoleLinks as RoleLinkRow[] | null) || []).map(readRoleName).filter(Boolean))
  )
  const callerRoleIds = Array.from(
    new Set(((callerRoleLinks as RoleLinkRow[] | null) || []).map((r) => r.role_id).filter(Boolean))
  )

  let permissionKeys: string[] = []
  if (callerRoleIds.length > 0) {
    const { data: rolePermissions, error: rpError } = await adminClient
      .from('app_role_permissions')
      .select('role_id, permission_id')
      .in('role_id', callerRoleIds)

    if (rpError) throw rpError

    const permissionIds = Array.from(
      new Set(
        ((rolePermissions || []) as Array<{ permission_id: string | null }>)
          .map((item) => item.permission_id)
          .filter(Boolean)
      )
    )

    if (permissionIds.length > 0) {
      const { data: permissions, error: pError } = await adminClient
        .from('app_permissions')
        .select('id, screen_key, action_key')
        .in('id', permissionIds)

      if (pError) throw pError

      permissionKeys = (
        (permissions || []) as Array<{ screen_key: string | null; action_key: string | null }>
      )
        .filter((p) => p.screen_key && p.action_key)
        .map((p) => `${p.screen_key}:${p.action_key}`)
    }
  }

  const isSuperadmin = Boolean(profile?.is_superadmin)
  const isManager = callerRoleNames.some((n) => isManagerRoleName(n))

  return { profile, isSuperadmin, isManager, permissionKeys }
}

const canViewCashControl = (ctx: { isSuperadmin: boolean; isManager: boolean; permissionKeys: string[] }) =>
  ctx.isSuperadmin ||
  ctx.isManager ||
  ctx.permissionKeys.includes(CASH_CONTROL_VIEW_KEY) ||
  ctx.permissionKeys.includes(CASH_CONTROL_MANAGE_KEY)

const canManageCashControl = (ctx: { isSuperadmin: boolean; isManager: boolean; permissionKeys: string[] }) =>
  ctx.isSuperadmin ||
  ctx.isManager ||
  ctx.permissionKeys.includes(CASH_CONTROL_MANAGE_KEY)

const loadOpenSession = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('cash_sessions')
    .select('*')
    .eq('status', 'open')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

const loadLatestSession = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('cash_sessions')
    .select('*')
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data
}

const loadSnapshotRows = async (
  adminClient: ReturnType<typeof createClient>,
  sessionId: string,
  snapshotType: 'opening' | 'closing'
) => {
  const { data, error } = await adminClient
    .from('cash_session_inventory_snapshots')
    .select('material_id, material_name, quantity, average_cost')
    .eq('cash_session_id', sessionId)
    .eq('snapshot_type', snapshotType)

  if (error) throw error

  return sortByMaterialName(
    (data || []).map((row) => ({
      material_id:   row.material_id,
      material_name: row.material_name,
      quantity:      toNumber(row.quantity),
      average_cost:  toNumber(row.average_cost),
    }))
  )
}

const loadSalesSummary = async (adminClient: ReturnType<typeof createClient>, sessionId: string) => {
  const { data: sales, error: salesError } = await adminClient
    .from('sales')
    .select('id, center_id, created_at, total_amount, payment_method, document_number')
    .eq('cash_session_id', sessionId)
    .eq('payment_method', 'Efectivo')
    .order('created_at', { ascending: true })

  if (salesError) throw salesError

  const normalizedSales = (sales || []).map((s) => ({
    id:              s.id,
    center_id:       s.center_id,
    created_at:      s.created_at,
    total_amount:    toNumber(s.total_amount),
    payment_method:  s.payment_method,
    document_number: s.document_number,
  }))

  const { data: profitTotal, error: profitError } = await adminClient.rpc(
    'get_cash_session_profit',
    { p_session_id: sessionId }
  )

  if (profitError) throw profitError

  return {
    sales: normalizedSales,
    profitTotal: toNumber(profitTotal),
  }
}

// Efectivo esperado: única fuente = RPC get_cash_session_expected (ledger 1101).
// Vivo para caja abierta sin conteo; snapshot congelado en cualquier otro caso.
const nullableNumber = (value: unknown) => (value == null ? null : toNumber(value))

const loadCashExpected = async (adminClient: ReturnType<typeof createClient>, sessionId: string) => {
  const { data, error } = await adminClient.rpc('get_cash_session_expected', {
    p_cash_session_id: sessionId,
  })

  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null

  return {
    opening_amount:      toNumber(row.opening_amount),
    sales_cash:          toNumber(row.sales_cash),
    purchases_cash:      nullableNumber(row.purchases_cash),
    transfers_net:       nullableNumber(row.transfers_net),
    contributions:       nullableNumber(row.contributions),
    other_net:           toNumber(row.other_net),
    net_movement:        toNumber(row.net_movement),
    expected_cash_total: toNumber(row.expected_cash_total),
    is_frozen:           Boolean(row.is_frozen),
  }
}

const loadActivePosOperationCount = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient.rpc('active_pos_operation_count')

  if (error) throw error
  return Number(data || 0)
}

const buildSessionOverview = async (adminClient: ReturnType<typeof createClient>) => {
  const openSession = await loadOpenSession(adminClient)
  if (openSession) {
    const [salesSummary, activeSalesCount, cashExpected] = await Promise.all([
      loadSalesSummary(adminClient, openSession.id),
      loadActivePosOperationCount(adminClient),
      loadCashExpected(adminClient, String(openSession.id)),
    ])
    return {
      session: {
        ...serializeSession({
          ...openSession,
          sales_cash_total:    cashExpected?.sales_cash ?? openSession.sales_cash_total,
          expected_cash_total: cashExpected?.expected_cash_total ?? openSession.expected_cash_total,
          closing_amount:      cashExpected?.expected_cash_total ?? openSession.closing_amount,
          profit_total:        salesSummary.profitTotal,
        }),
        cash_expected_breakdown: cashExpected,
      },
      active_sales_count: activeSalesCount,
    }
  }

  const latestSession = await loadLatestSession(adminClient)
  const latestExpected = latestSession ? await loadCashExpected(adminClient, String(latestSession.id)) : null
  return {
    session: latestSession
      ? { ...serializeSession(latestSession), cash_expected_breakdown: latestExpected }
      : null,
    active_sales_count: 0,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
    const publishableKey = Deno.env.get('PROJECT_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization  = req.headers.get('Authorization')

    if (!authorization) {
      return json({ error: 'No se recibio token de autenticacion.' }, 401)
    }

    const requestClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { user, error: userError } = await resolveAuthenticatedUser(requestClient)
    if (userError || !user) {
      return json({ error: 'Sesion invalida o expirada.' }, 401)
    }

    const callerContext = await loadCallerContext(adminClient, user.id)
    const body = (await req.json()) as Record<string, unknown>
    const action = String(body?.action ?? '')

    // ── get_session_overview ─────────────────────────────────────────────────
    if (action === 'get_session_overview') {
      if (!canViewCashControl(callerContext)) {
        return json({ error: 'No tienes permisos para consultar control de caja.' }, 403)
      }
      return json(await buildSessionOverview(adminClient))
    }

    // ── open_cash_session ────────────────────────────────────────────────────
    if (action === 'open_cash_session') {
      if (!canManageCashControl(callerContext)) {
        return json({ error: 'No tienes permisos para abrir caja.' }, 403)
      }

      const openingAmount = toNumber(body.opening_amount)
      if (openingAmount <= 0) {
        return json({ error: 'Debes ingresar un monto inicial mayor a 0.' }, 400)
      }

      const { data: rpcResult, error: rpcError } = await adminClient.rpc('open_cash_session_atomic', {
        p_opening_amount: openingAmount,
        p_opened_by:      user.id,
      })

      if (rpcError) throw rpcError

      if (!rpcResult?.ok) {
        return json({ error: rpcResult?.error ?? 'No se pudo abrir la caja.' }, 409)
      }

      return json({ session: serializeSession(rpcResult.session) })
    }

    // ── close_cash_session (primer conteo) ───────────────────────────────────
    if (action === 'close_cash_session') {
      if (!canManageCashControl(callerContext)) {
        return json({ error: 'No tienes permisos para cerrar caja.' }, 403)
      }

      const openSession = await loadOpenSession(adminClient)
      if (!openSession) {
        return json({ error: 'No existe una caja abierta para cerrar.' }, 409)
      }

      if (!Object.prototype.hasOwnProperty.call(body, 'counted_cash')) {
        return json({ error: 'Falta counted_cash. Ingresa el efectivo contado en caja.' }, 400)
      }

      const countedCash = toNumber(body.counted_cash, -1)
      if (countedCash < 0) {
        return json({ error: 'El efectivo contado no puede ser negativo.' }, 400)
      }

      const { data: rpcResult, error: rpcError } = await adminClient.rpc(
        'record_first_cash_count_atomic',
        {
          p_session_id:   openSession.id,
          p_counted_cash: countedCash,
          p_counted_by:   user.id,
        }
      )

      if (rpcError) throw rpcError

      if (!rpcResult?.ok) {
        return json({ error: rpcResult?.error ?? 'No se pudo registrar el primer conteo.' }, 409)
      }

      const rpcSession = rpcResult.session as Record<string, unknown> | null

      if (rpcResult.close_result === 'closed') {
        const [openingInventory, closingInventory, salesSummary] = await Promise.all([
          loadSnapshotRows(adminClient, String(openSession.id), 'opening'),
          loadSnapshotRows(adminClient, String(openSession.id), 'closing'),
          loadSalesSummary(adminClient, String(openSession.id)),
        ])
        return json({
          session:           serializeSession(rpcSession),
          close_result:      'closed',
          sales:             salesSummary.sales,
          opening_inventory: openingInventory,
          closing_inventory: closingInventory,
        })
      }

      // difference_detected — incluye caso idempotente already_first_counted
      const difference  = toNumber(rpcResult.difference    ?? rpcSession?.difference_amount)
      const expected    = toNumber(rpcResult.expected_cash  ?? rpcSession?.expected_cash_total)
      const counted     = toNumber(rpcResult.counted_cash   ?? rpcSession?.first_counted_cash)

      return json({
        session:       serializeSession(rpcSession),
        close_result:  'difference_detected',
        difference,
        expected_cash: expected,
        counted_cash:  counted,
      })
    }

    // ── submit_recount (segundo conteo) ──────────────────────────────────────
    if (action === 'submit_recount') {
      if (!canManageCashControl(callerContext)) {
        return json({ error: 'No tienes permisos para cerrar caja.' }, 403)
      }

      const openSession = await loadOpenSession(adminClient)
      if (!openSession) {
        return json({ error: 'No existe una caja abierta.' }, 409)
      }

      if (!Object.prototype.hasOwnProperty.call(body, 'second_counted_cash')) {
        return json({ error: 'Falta second_counted_cash.' }, 400)
      }

      const secondCount = toNumber(body.second_counted_cash, -1)
      if (secondCount < 0) {
        return json({ error: 'El segundo conteo no puede ser negativo.' }, 400)
      }

      const { data: rpcResult, error: rpcError } = await adminClient.rpc(
        'submit_cash_recount_atomic',
        {
          p_session_id:          openSession.id,
          p_second_counted_cash: secondCount,
          p_counted_by:          user.id,
        }
      )

      if (rpcError) throw rpcError

      if (!rpcResult?.ok) {
        return json({ error: rpcResult?.error ?? 'No se pudo registrar el segundo conteo.' }, 409)
      }

      const rpcSession   = rpcResult.session as Record<string, unknown> | null
      const sessionId    = String(rpcSession?.id ?? openSession.id)

      const [openingInventory, closingInventory, salesSummary] = await Promise.all([
        loadSnapshotRows(adminClient, sessionId, 'opening'),
        loadSnapshotRows(adminClient, sessionId, 'closing'),
        loadSalesSummary(adminClient, sessionId),
      ])

      const difference    = toNumber(rpcResult.difference          ?? rpcSession?.difference_amount)
      const expected      = toNumber(rpcResult.expected_cash        ?? rpcSession?.expected_cash_total)
      const secondCounted = toNumber(rpcResult.second_counted_cash  ?? rpcSession?.final_counted_cash)

      return json({
        session:              serializeSession(rpcSession),
        close_result:         rpcResult.close_result,
        difference,
        expected_cash:        expected,
        second_counted_cash:  secondCounted,
        sales:                salesSummary.sales,
        opening_inventory:    openingInventory,
        closing_inventory:    closingInventory,
      })
    }

    return json({ error: 'Accion no soportada.' }, 400)
  } catch (error) {
    console.error(error)
    const status = typeof error?.status === 'number' ? error.status : 500
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, status)
  }
})
