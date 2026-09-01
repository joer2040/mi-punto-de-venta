// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'
import { countActiveSales } from './cashRules.js'

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

const readCategoryValue = (
  categories: { is_inventoried?: boolean | null } | { is_inventoried?: boolean | null }[] | null
) => {
  if (Array.isArray(categories)) return categories[0]?.is_inventoried ?? null
  return categories?.is_inventoried ?? null
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

const getSuggestedFileName = (session: { opened_at?: string | null; id?: string | null }) => {
  const openedAt = session?.opened_at ? new Date(session.opened_at) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const shortId = String(session?.id || '').slice(0, 8)
  return [
    'corte-caja',
    `${openedAt.getFullYear()}${pad(openedAt.getMonth() + 1)}${pad(openedAt.getDate())}`,
    `${pad(openedAt.getHours())}${pad(openedAt.getMinutes())}`,
    shortId,
  ]
    .filter(Boolean)
    .join('-') + '.pdf'
}

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

const loadActiveSaleCount = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient.from('tables').select('status, current_order_id')
  if (error) throw error
  return countActiveSales(data || [])
}

const loadInventoriableInventory = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient.from('inventory').select(`
    material_id,
    stock_actual,
    costo_promedio,
    materials:material_id (
      id,
      name,
      categories:cat_id (
        is_inventoried
      )
    )
  `)

  if (error) throw error

  return sortByMaterialName(
    (data || [])
      .filter((row) => {
        const materialName = row.materials?.name
        const isInventoried = readCategoryValue(row.materials?.categories)
        return Boolean(materialName) && isInventoried !== false
      })
      .map((row) => ({
        material_id:  row.material_id,
        material_name: row.materials?.name || 'Material no identificado',
        quantity:      toNumber(row.stock_actual),
        average_cost:  toNumber(row.costo_promedio),
      }))
  )
}

const createInventorySnapshot = async (
  adminClient: ReturnType<typeof createClient>,
  sessionId: string,
  snapshotType: 'opening' | 'closing'
) => {
  const inventoryRows = await loadInventoriableInventory(adminClient)

  if (inventoryRows.length > 0) {
    const { error } = await adminClient.from('cash_session_inventory_snapshots').insert(
      inventoryRows.map((row) => ({
        cash_session_id: sessionId,
        snapshot_type:   snapshotType,
        material_id:     row.material_id,
        material_name:   row.material_name,
        quantity:        row.quantity,
        average_cost:    row.average_cost,
      }))
    )
    if (error) throw error
  }

  return inventoryRows
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

  if (normalizedSales.length === 0) {
    return { sales: [], salesCashTotal: 0, profitTotal: 0 }
  }

  const saleIds = normalizedSales.map((s) => s.id)
  const { data: saleItems, error: saleItemsError } = await adminClient
    .from('sale_items')
    .select('sale_id, material_id, quantity, unit_price')
    .in('sale_id', saleIds)

  if (saleItemsError) throw saleItemsError

  const centerBySaleId = new Map(normalizedSales.map((s) => [s.id, s.center_id]))
  const materialIds = Array.from(new Set((saleItems || []).map((i) => i.material_id).filter(Boolean)))
  const centerIds   = Array.from(new Set(normalizedSales.map((s) => s.center_id).filter(Boolean)))

  let inventoryCosts: Array<{ material_id: string; center_id: string; costo_promedio: number }> = []
  if (materialIds.length > 0 && centerIds.length > 0) {
    const { data: invRows, error: invError } = await adminClient
      .from('inventory')
      .select('material_id, center_id, costo_promedio')
      .in('material_id', materialIds)
      .in('center_id', centerIds)

    if (invError) throw invError
    inventoryCosts = (invRows || []).map((r) => ({
      material_id:   r.material_id,
      center_id:     r.center_id,
      costo_promedio: toNumber(r.costo_promedio),
    }))
  }

  const costMap = new Map(
    inventoryCosts.map((r) => [`${r.center_id}:${r.material_id}`, r.costo_promedio])
  )

  const profitTotal = (saleItems || []).reduce((acc, item) => {
    const centerId   = centerBySaleId.get(item.sale_id)
    const avgCost    = costMap.get(`${centerId}:${item.material_id}`) || 0
    return acc + toNumber(item.quantity) * (toNumber(item.unit_price) - avgCost)
  }, 0)

  return {
    sales: normalizedSales,
    salesCashTotal: normalizedSales.reduce((acc, s) => acc + s.total_amount, 0),
    profitTotal,
  }
}

const computeExpectedCash = (openingAmount: number, salesCashTotal: number) =>
  openingAmount + salesCashTotal

const buildSessionOverview = async (adminClient: ReturnType<typeof createClient>) => {
  const openSession = await loadOpenSession(adminClient)
  if (openSession) {
    const salesSummary  = await loadSalesSummary(adminClient, openSession.id)
    const openingAmount = toNumber(openSession.opening_amount)
    const expected      = computeExpectedCash(openingAmount, salesSummary.salesCashTotal)
    return {
      session: serializeSession({
        ...openSession,
        sales_cash_total:    salesSummary.salesCashTotal,
        expected_cash_total: expected,
        closing_amount:      expected,
        profit_total:        salesSummary.profitTotal,
      }),
    }
  }

  const latestSession = await loadLatestSession(adminClient)
  return { session: serializeSession(latestSession) }
}

// ── Perform the actual close write ────────────────────────────────────────────
const performClose = async (
  adminClient: ReturnType<typeof createClient>,
  openSession: Record<string, unknown>,
  userId: string,
  countedCash: number,
  salesSummary: { sales: unknown[]; salesCashTotal: number; profitTotal: number },
  closingStatus: 'closed' | 'closed_with_pending_difference',
  isFirstCount: boolean
) => {
  const openingAmount = toNumber(openSession.opening_amount)
  const expected      = computeExpectedCash(openingAmount, salesSummary.salesCashTotal)
  const difference    = countedCash - expected

  const openingInventory = await loadSnapshotRows(adminClient, String(openSession.id), 'opening')
  const closingInventory = await createInventorySnapshot(adminClient, String(openSession.id), 'closing')

  const reportPdfMetadata = {
    generated_at:        new Date().toISOString(),
    suggested_file_name: getSuggestedFileName(openSession),
  }

  const updatePayload: Record<string, unknown> = {
    status:              closingStatus,
    closed_at:           new Date().toISOString(),
    closed_by:           userId,
    sales_cash_total:    salesSummary.salesCashTotal,
    expected_cash_total: expected,
    closing_amount:      countedCash,
    profit_total:        salesSummary.profitTotal,
    difference_amount:   difference,
    report_pdf_metadata: reportPdfMetadata,
  }

  if (isFirstCount) {
    updatePayload.first_counted_cash = countedCash
  } else {
    updatePayload.final_counted_cash = countedCash
  }

  const { data: closedSession, error: closeError } = await adminClient
    .from('cash_sessions')
    .update(updatePayload)
    .eq('id', openSession.id)
    .eq('status', 'open')
    .select('*')
    .single()

  if (closeError || !closedSession) throw closeError

  return { closedSession, openingInventory, closingInventory }
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

      const currentOpenSession = await loadOpenSession(adminClient)
      if (currentOpenSession) {
        return json(
          { error: 'Ya existe una caja abierta. Debes cerrarla antes de abrir una nueva.' },
          409
        )
      }

      const { data: createdSession, error: createError } = await adminClient
        .from('cash_sessions')
        .insert([{
          status:              'open',
          opening_amount:      openingAmount,
          sales_cash_total:    0,
          expected_cash_total: openingAmount,
          closing_amount:      openingAmount,
          profit_total:        0,
          opened_by:           user.id,
        }])
        .select('*')
        .single()

      if (createError || !createdSession) throw createError

      await createInventorySnapshot(adminClient, createdSession.id, 'opening')

      return json({ session: serializeSession(createdSession) })
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

      // Si ya hay primer conteo → usar submit_recount
      if (openSession.first_counted_cash != null) {
        return json(
          { error: 'Ya existe un primer conteo registrado. Usa submit_recount para el segundo conteo.' },
          409
        )
      }

      if (!Object.prototype.hasOwnProperty.call(body, 'counted_cash')) {
        return json({ error: 'Falta counted_cash. Ingresa el efectivo contado en caja.' }, 400)
      }

      const countedCash = toNumber(body.counted_cash, -1)
      if (countedCash < 0) {
        return json({ error: 'El efectivo contado no puede ser negativo.' }, 400)
      }

      const activeSaleCount = await loadActiveSaleCount(adminClient)
      if (activeSaleCount > 0) {
        return json(
          {
            error:              'No puedes cerrar la caja mientras haya ventas activas.',
            active_sales_count: activeSaleCount,
          },
          409
        )
      }

      const salesSummary  = await loadSalesSummary(adminClient, String(openSession.id))
      const openingAmount = toNumber(openSession.opening_amount)
      const expected      = computeExpectedCash(openingAmount, salesSummary.salesCashTotal)
      const difference    = Number((countedCash - expected).toFixed(2))

      if (difference === 0) {
        // Sin diferencia → cerrar normalmente
        const { closedSession, openingInventory, closingInventory } = await performClose(
          adminClient, openSession, user.id, countedCash, salesSummary, 'closed', true
        )
        return json({
          session:           serializeSession(closedSession),
          close_result:      'closed',
          sales:             salesSummary.sales,
          opening_inventory: openingInventory,
          closing_inventory: closingInventory,
        })
      }

      // Con diferencia → guardar primer conteo, mantener sesión abierta
      const { data: updatedSession, error: updateError } = await adminClient
        .from('cash_sessions')
        .update({
          first_counted_cash: countedCash,
          difference_amount:  difference,
        })
        .eq('id', openSession.id)
        .eq('status', 'open')
        .select('*')
        .single()

      if (updateError || !updatedSession) throw updateError

      return json({
        session:          serializeSession({
          ...updatedSession,
          sales_cash_total:    salesSummary.salesCashTotal,
          expected_cash_total: expected,
        }),
        close_result:     'difference_detected',
        difference,
        expected_cash:    expected,
        counted_cash:     countedCash,
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

      if (openSession.first_counted_cash == null) {
        return json(
          { error: 'No hay un primer conteo registrado. Usa close_cash_session primero.' },
          409
        )
      }

      if (!Object.prototype.hasOwnProperty.call(body, 'second_counted_cash')) {
        return json({ error: 'Falta second_counted_cash.' }, 400)
      }

      const secondCount = toNumber(body.second_counted_cash, -1)
      if (secondCount < 0) {
        return json({ error: 'El segundo conteo no puede ser negativo.' }, 400)
      }

      const activeSaleCount = await loadActiveSaleCount(adminClient)
      if (activeSaleCount > 0) {
        return json(
          {
            error:              'No puedes cerrar la caja mientras haya ventas activas.',
            active_sales_count: activeSaleCount,
          },
          409
        )
      }

      // Recalcular expected al momento del segundo conteo
      const salesSummary  = await loadSalesSummary(adminClient, String(openSession.id))
      const openingAmount = toNumber(openSession.opening_amount)
      const expected      = computeExpectedCash(openingAmount, salesSummary.salesCashTotal)
      const difference    = Number((secondCount - expected).toFixed(2))

      const closingStatus = difference === 0 ? 'closed' : 'closed_with_pending_difference'

      const { closedSession, openingInventory, closingInventory } = await performClose(
        adminClient, openSession, user.id, secondCount, salesSummary, closingStatus, false
      )

      return json({
        session:           serializeSession(closedSession),
        close_result:      closingStatus,
        difference,
        expected_cash:     expected,
        second_counted_cash: secondCount,
        sales:             salesSummary.sales,
        opening_inventory: openingInventory,
        closing_inventory: closingInventory,
      })
    }

    return json({ error: 'Accion no soportada.' }, 400)
  } catch (error) {
    console.error(error)
    const status = typeof error?.status === 'number' ? error.status : 500
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, status)
  }
})
