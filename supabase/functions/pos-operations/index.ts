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
const isWaiterRoleName = (value: string | null | undefined) => normalizeRoleName(value) === 'mesero'
const CUBETA_BUNDLE_TYPE = 'cubeta'
const CAGUAMITA_BUNDLE_TYPE = 'cubeta_caguamita'
const CUBETA_ALLOWED_SKUS = new Set([
  '75004132',
  '7501064115400',
  '7501064101410',
  '750106696971',
  '7501064101465',
])
const CAGUAMITA_ALLOWED_SKUS = new Set(['7503024416459'])
const CUBETA_REQUIRED_PIECES = 10
const CUBETA_FIXED_PRICE = 320
const CUBETA_FIXED_UNIT_PRICE = CUBETA_FIXED_PRICE / CUBETA_REQUIRED_PIECES
const CAGUAMITA_REQUIRED_PIECES = 5
const CAGUAMITA_FIXED_PRICE = 130
const CAGUAMITA_FIXED_UNIT_PRICE = CAGUAMITA_FIXED_PRICE / CAGUAMITA_REQUIRED_PIECES
const CASH_PAYMENT_METHOD = 'Efectivo'
const BUNDLE_RULES = {
  [CUBETA_BUNDLE_TYPE]: {
    label: 'Cubeta Mixta',
    allowedSkus: CUBETA_ALLOWED_SKUS,
    requiredPieces: CUBETA_REQUIRED_PIECES,
    fixedPrice: CUBETA_FIXED_PRICE,
    fixedUnitPrice: CUBETA_FIXED_UNIT_PRICE,
    requireSharedBasePrice: true,
  },
  [CAGUAMITA_BUNDLE_TYPE]: {
    label: 'Cubeta Caguamita',
    allowedSkus: CAGUAMITA_ALLOWED_SKUS,
    requiredPieces: CAGUAMITA_REQUIRED_PIECES,
    fixedPrice: CAGUAMITA_FIXED_PRICE,
    fixedUnitPrice: CAGUAMITA_FIXED_UNIT_PRICE,
    requireSharedBasePrice: false,
  },
}
const appError = (message: string, status = 400) => Object.assign(new Error(message), { status })

type RoleLinkRow = {
  role_id: string
  app_roles: { name: string | null } | { name: string | null }[] | null
}

type OrderItem = {
  material_id: string
  name: string
  quantity: number
  unit_price: number
  is_extra: boolean
  base_unit_price?: number
  bundle_id?: string
  bundle_type?: string
  bundle_label?: string
}

const readRoleName = (roleLink: RoleLinkRow) => {
  if (Array.isArray(roleLink.app_roles)) {
    return roleLink.app_roles[0]?.name ?? null
  }

  return roleLink.app_roles?.name ?? null
}

const readCategoryName = (categories: { name?: string | null } | { name?: string | null }[] | null) => {
  if (Array.isArray(categories)) {
    return categories[0]?.name ?? null
  }

  return categories?.name ?? null
}

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })

const resolveAuthenticatedUser = async (requestClient: ReturnType<typeof createClient>) => {
  const { data, error } = await requestClient.auth.getUser()

  if (error || !data?.user) {
    return { user: null, error: new Error('Sesion invalida o expirada.') }
  }

  return {
    user: data.user,
    error: null,
  }
}

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeItems = (items: unknown): OrderItem[] => {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => ({
      material_id: String(item?.material_id ?? '').trim(),
      name: String(item?.name ?? '').trim(),
      quantity: toNumber(item?.quantity, 0),
      unit_price: toNumber(item?.unit_price, 0),
      is_extra: Boolean(item?.is_extra),
      base_unit_price: toNumber(item?.base_unit_price, 0),
      bundle_id: String(item?.bundle_id ?? '').trim() || undefined,
      bundle_type: String(item?.bundle_type ?? '').trim() || undefined,
      bundle_label: String(item?.bundle_label ?? '').trim() || undefined,
    }))
    .filter((item) => item.material_id && item.name && item.quantity > 0)
}

const computeTotal = (items: OrderItem[]) =>
  items.reduce((acc, item) => acc + item.unit_price * item.quantity, 0)

const toQuantityMap = (items: OrderItem[]) =>
  items.reduce((map, item) => {
    map.set(item.material_id, (map.get(item.material_id) || 0) + item.quantity)
    return map
  }, new Map<string, number>())

const waiterCanModifyItems = (previousItems: OrderItem[], nextItems: OrderItem[]) => {
  const previousQuantities = toQuantityMap(previousItems)
  const nextQuantities = toQuantityMap(nextItems)

  for (const [materialId, previousQty] of previousQuantities.entries()) {
    const nextQty = nextQuantities.get(materialId) || 0
    if (nextQty < previousQty) return false
  }

  return true
}

const validateCubetaBundles = (
  items: OrderItem[],
  materialRows: Array<{ id: string; sku?: string | null; categories?: { name?: string | null } | { name?: string | null }[] | null }>
) => {
  const cubetaItems = items.filter((item) => Boolean(BUNDLE_RULES[normalizeRoleName(item.bundle_type)]))
  if (cubetaItems.length === 0) return

  const materialById = new Map(materialRows.map((row) => [row.id, row]))
  const bundleRows = cubetaItems.reduce((map, item) => {
    if (!item.bundle_id) {
      throw appError('Una cubeta no tiene identificador de bundle valido.', 400)
    }

    const currentRows = map.get(item.bundle_id) || []
    currentRows.push(item)
    map.set(item.bundle_id, currentRows)
    return map
  }, new Map<string, OrderItem[]>())

  for (const [bundleId, rows] of bundleRows.entries()) {
    const bundleType = normalizeRoleName(rows[0]?.bundle_type)
    const rule = BUNDLE_RULES[bundleType]
    if (!rule) {
      throw appError(`La cubeta ${bundleId} tiene un tipo de bundle no soportado.`, 400)
    }

    let totalQuantity = 0
    let effectiveTotal = 0
    let baseUnitPrice = 0

    for (const row of rows) {
      const material = materialById.get(row.material_id)
      const materialSku = String(material?.sku ?? '').trim()
      const categoryName = normalizeRoleName(readCategoryName(material?.categories ?? null))
      const candidateBaseUnitPrice = row.base_unit_price && row.base_unit_price > 0 ? row.base_unit_price : row.unit_price

      if (!material || !materialSku || !rule.allowedSkus.has(materialSku)) {
        throw appError(`${rule.label} ${bundleId} contiene un SKU no permitido.`, 400)
      }

      if (categoryName !== 'cerveza') {
        throw appError(`${rule.label} ${bundleId} contiene un producto fuera de la categoria Cerveza.`, 400)
      }

      if (rule.requireSharedBasePrice) {
        if (candidateBaseUnitPrice <= 0) {
          throw appError(`${rule.label} ${bundleId} no tiene precio base valido.`, 400)
        }

        if (baseUnitPrice === 0) {
          baseUnitPrice = candidateBaseUnitPrice
        } else if (Math.abs(baseUnitPrice - candidateBaseUnitPrice) > 0.01) {
          throw appError(`${rule.label} ${bundleId} requiere que todos los SKU compartan el mismo precio de venta.`, 400)
        }
      }

      totalQuantity += row.quantity
      effectiveTotal += row.unit_price * row.quantity

      if (Math.abs(row.unit_price - rule.fixedUnitPrice) > 0.01) {
        throw appError(`${rule.label} ${bundleId} debe registrar cada pieza a $${rule.fixedUnitPrice.toFixed(2)}.`, 400)
      }
    }

    if (totalQuantity !== rule.requiredPieces) {
      throw appError(`${rule.label} ${bundleId} debe contener exactamente ${rule.requiredPieces} piezas.`, 400)
    }

    if (Math.abs(effectiveTotal - rule.fixedPrice) > 0.01) {
      throw appError(`${rule.label} ${bundleId} debe sumar exactamente $${rule.fixedPrice.toFixed(2)}.`, 400)
    }
  }
}

const buildCanonicalSaleItems = (
  items: OrderItem[],
  materialRows: Array<{
    id: string
    name?: string | null
    sku?: string | null
    categories?: { name?: string | null } | { name?: string | null }[] | null
  }>,
  inventoryRows: Array<{ material_id: string; precio_venta?: number | string | null }>
) => {
  const materialById = new Map(materialRows.map((row) => [row.id, row]))
  const inventoryByMaterialId = new Map(inventoryRows.map((row) => [row.material_id, row]))

  return items.map((item) => {
    const material = materialById.get(item.material_id)
    const inventory = inventoryByMaterialId.get(item.material_id)
    const baseUnitPrice = Number(inventory?.precio_venta ?? 0)
    const bundleId = String(item.bundle_id ?? '').trim()
    const bundleType = normalizeRoleName(item.bundle_type)

    if (!material || !inventory || !Number.isFinite(baseUnitPrice) || baseUnitPrice <= 0) {
      throw appError('La venta contiene materiales sin precio de venta valido.', 400)
    }

    if (Boolean(bundleId) !== Boolean(bundleType)) {
      throw appError('Cada bundle debe incluir identificador y tipo.', 400)
    }

    if (bundleType && !BUNDLE_RULES[bundleType]) {
      throw appError('La venta contiene un tipo de bundle no soportado.', 400)
    }

    const bundleRule = bundleType ? BUNDLE_RULES[bundleType] : null

    return {
      ...item,
      name: String(material.name ?? item.name ?? '').trim(),
      base_unit_price: baseUnitPrice,
      unit_price: bundleRule?.fixedUnitPrice ?? baseUnitPrice,
      bundle_id: bundleId || undefined,
      bundle_type: bundleType || undefined,
      bundle_label: bundleRule?.label,
    }
  })
}

const loadCallerContext = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data: profile, error: profileError } = await adminClient
    .from('app_profiles')
    .select('id, is_superadmin, status')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || profile?.status !== 'active') {
    throw appError('No tienes permisos para operar punto de venta.', 403)
  }

  const { data: callerRoleLinks, error: callerRoleError } = await adminClient
    .from('app_user_roles')
    .select('role_id, app_roles(name)')
    .eq('user_id', userId)

  if (callerRoleError) throw callerRoleError

  const callerRoleNames = Array.from(
    new Set(((callerRoleLinks as RoleLinkRow[] | null) || []).map(readRoleName).filter(Boolean))
  )

  const isSuperadmin = Boolean(profile?.is_superadmin)
  const isManager = callerRoleNames.some((roleName) => isManagerRoleName(roleName))
  const isWaiter = callerRoleNames.some((roleName) => isWaiterRoleName(roleName))

  if (!isSuperadmin && !isManager && !isWaiter) {
    throw appError('No tienes permisos para operar punto de venta.', 403)
  }

  return {
    profile,
    isSuperadmin,
    isManager,
    isWaiter,
  }
}

const loadTableState = async (adminClient: ReturnType<typeof createClient>, tableId: string) => {
  const { data: table, error: tableError } = await adminClient
    .from('tables')
    .select('id, number, status, current_order_id')
    .eq('id', tableId)
    .maybeSingle()

  if (tableError) throw tableError
  if (!table) throw appError('Mesa no encontrada.', 404)

  let order = null
  if (table.current_order_id) {
    const { data: currentOrder, error: orderError } = await adminClient
      .from('table_orders')
      .select('id, table_id, items, total, waiter_edit_locked')
      .eq('id', table.current_order_id)
      .maybeSingle()

    if (orderError) throw orderError
    order = currentOrder
  }

  return { table, order }
}

const hasOpenCashSession = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient
    .from('cash_sessions')
    .select('id')
    .eq('status', 'open')
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return Boolean(data?.id)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const publishableKey =
      Deno.env.get('PROJECT_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      return json({ error: 'No se recibio token de autenticacion.' }, 401)
    }

    const requestClient = createClient(supabaseUrl, publishableKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { user, error: userError } = await resolveAuthenticatedUser(requestClient)

    if (userError || !user) {
      return json({ error: 'Sesion invalida o expirada.' }, 401)
    }

    const caller = await loadCallerContext(adminClient, user.id)

    const body = (await req.json()) as Record<string, unknown>
    const action = String(body?.action ?? '')

    if (action === 'get_cash_session_status') {
      return json({ cash_session_open: await hasOpenCashSession(adminClient) })
    }

    if (action === 'save_table_order') {
      const tableId = String(body.table_id ?? '')
      const items = normalizeItems(body.items)
      const lockWaiterEditing = Boolean(body.lock_waiter_editing)
      const hasExpectedOrderId = Object.prototype.hasOwnProperty.call(body, 'expected_order_id')
      const expectedOrderId = body.expected_order_id == null
        ? null
        : String(body.expected_order_id).trim() || null

      if (!tableId) return json({ error: 'Falta table_id.' }, 400)
      if (!hasExpectedOrderId) return json({ error: 'Falta expected_order_id.' }, 400)
      if (items.length > 0 && !(await hasOpenCashSession(adminClient))) {
        return json({
          error: 'No hay una caja abierta. Debes abrir caja antes de abrir mesas, barras o agregar productos.',
        }, 409)
      }

      const { table, order } = await loadTableState(adminClient, tableId)

      if (hasExpectedOrderId && (table.current_order_id ?? null) !== expectedOrderId) {
        return json({ error: 'El pedido activo de la mesa cambio antes de guardar.' }, 409)
      }

      if (table.current_order_id && !order) {
        return json({ error: 'El pedido activo de la mesa no existe.' }, 409)
      }

      if (caller.isWaiter && order?.waiter_edit_locked && !waiterCanModifyItems(order.items || [], items)) {
        return json({ error: 'Como mesero solo puedes agregar productos o aumentar cantidades en una mesa ya guardada.' }, 403)
      }

      if (items.length === 0) {
        let tableUpdate = adminClient
          .from('tables')
          .update({ status: 'libre', current_order_id: null })
          .eq('id', table.id)

        if (hasExpectedOrderId) {
          tableUpdate = expectedOrderId
            ? tableUpdate.eq('current_order_id', expectedOrderId)
            : tableUpdate.is('current_order_id', null)
        }

        const { data: updatedTable, error: tableError } = await tableUpdate
          .select('id, number, status, current_order_id')
          .maybeSingle()

        if (tableError) throw tableError
        if (!updatedTable) {
          return json({ error: 'El pedido activo de la mesa cambio antes de guardar.' }, 409)
        }

        if (table.current_order_id) {
          const { error: deleteError } = await adminClient
            .from('table_orders')
            .delete()
            .eq('id', table.current_order_id)

          if (deleteError) throw deleteError
        }

        return json({
          table: updatedTable,
          order: null,
        })
      }

      const total = computeTotal(items)
      let persistedOrder = order
      const nextWaiterLock = Boolean(order?.waiter_edit_locked) || (caller.isWaiter && lockWaiterEditing)

      if (order?.id) {
        const { data: updatedOrder, error: updateError } = await adminClient
          .from('table_orders')
          .update({
            items,
            total,
            waiter_edit_locked: nextWaiterLock,
          })
          .eq('id', order.id)
          .eq('table_id', table.id)
          .select('id, table_id, items, total, waiter_edit_locked')
          .maybeSingle()

        if (updateError) throw updateError
        if (!updatedOrder) {
          return json({ error: 'El pedido activo de la mesa cambio antes de guardar.' }, 409)
        }
        persistedOrder = updatedOrder
      } else {
        const { data: createdOrder, error: insertError } = await adminClient
          .from('table_orders')
          .insert([
            {
              table_id: table.id,
              items,
              total,
              waiter_edit_locked: caller.isWaiter && lockWaiterEditing,
            },
          ])
          .select('id, table_id, items, total, waiter_edit_locked')
          .single()

        if (insertError) throw insertError
        persistedOrder = createdOrder
      }

      let tableUpdate = adminClient
        .from('tables')
        .update({
          status: 'ocupada',
          current_order_id: persistedOrder.id,
        })
        .eq('id', table.id)

      if (order?.id) {
        tableUpdate = tableUpdate
          .eq('status', 'ocupada')
          .eq('current_order_id', order.id)
      } else if (hasExpectedOrderId) {
        tableUpdate = tableUpdate
          .eq('status', 'libre')
          .is('current_order_id', null)
      }

      const { data: updatedTable, error: tableUpdateError } = await tableUpdate
        .select('id, number, status, current_order_id')
        .maybeSingle()

      if (tableUpdateError) throw tableUpdateError
      if (!updatedTable) {
        if (!order?.id && persistedOrder?.id) {
          const { error: cleanupError } = await adminClient
            .from('table_orders')
            .delete()
            .eq('id', persistedOrder.id)
            .eq('table_id', table.id)

          if (cleanupError) throw cleanupError
        }

        return json({ error: 'El pedido activo de la mesa cambio antes de guardar.' }, 409)
      }

      return json({
        table: updatedTable,
        order: persistedOrder,
      })
    }

    if (action === 'finalize_sale') {
      const tableId = String(body.table_id ?? '')
      const items = normalizeItems(body.items)
      const paymentMethod = String(body.payment_method ?? CASH_PAYMENT_METHOD).trim()
      const hasExpectedOrderId = Object.prototype.hasOwnProperty.call(body, 'expected_order_id')
      const requestedOrderId = String(body.expected_order_id ?? '').trim()

      if (!tableId) return json({ error: 'Falta table_id.' }, 400)
      if (items.length === 0) return json({ error: 'La mesa no tiene productos para cobrar.' }, 400)
      if (!hasExpectedOrderId || !requestedOrderId) {
        return json({ error: 'Falta expected_order_id para finalizar la venta.' }, 400)
      }
      if (normalizeRoleName(paymentMethod) !== normalizeRoleName(CASH_PAYMENT_METHOD)) {
        return json({ error: 'Metodo de pago no soportado.' }, 400)
      }
      if (!(await hasOpenCashSession(adminClient))) {
        return json({ error: 'No hay una caja abierta. Debes abrir caja antes de finalizar ventas en efectivo.' }, 409)
      }

      const { table, order } = await loadTableState(adminClient, tableId)

      if (normalizeRoleName(table.status) !== 'ocupada' || !table.current_order_id || !order) {
        return json({ error: 'La mesa no tiene un pedido activo o la venta ya fue finalizada.' }, 409)
      }

      if (hasExpectedOrderId && requestedOrderId !== table.current_order_id) {
        return json({ error: 'El pedido activo de la mesa cambio antes de la finalizacion.' }, 409)
      }

      const expectedOrderId = requestedOrderId

      if (caller.isWaiter && order?.waiter_edit_locked && !waiterCanModifyItems(order.items || [], items)) {
        return json({ error: 'Como mesero solo puedes agregar productos o aumentar cantidades antes de cobrar.' }, 403)
      }

      const materialIds = Array.from(new Set(items.map((item) => item.material_id)))
      const { data: materialRows, error: materialError } = await adminClient
        .from('materials')
        .select('id, name, sku, categories:cat_id(name, is_inventoried)')
        .in('id', materialIds)

      if (materialError) throw materialError

      const { data: centerRows, error: centerError } = await adminClient
        .from('centers')
        .select('id, name')

      if (centerError) throw centerError

      const saleCenters = (centerRows || []).filter((center) => normalizeRoleName(center.name) === 'bar principal')
      if (saleCenters.length !== 1) {
        throw appError('No se pudo identificar un unico centro Bar Principal.', 400)
      }

      const { data: inventoryRows, error: inventoryError } = await adminClient
        .from('inventory')
        .select('material_id, precio_venta')
        .eq('center_id', saleCenters[0].id)
        .in('material_id', materialIds)

      if (inventoryError) throw inventoryError

      const canonicalItems = buildCanonicalSaleItems(items, materialRows || [], inventoryRows || [])
      validateCubetaBundles(canonicalItems, materialRows || [])

      const rpcItems = canonicalItems.map((item) => ({
        order_id: expectedOrderId,
        material_id: item.material_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        bundle_id: item.bundle_id ?? null,
        bundle_type: item.bundle_type ?? null,
      }))

      const { data: finalizedSale, error: finalizeError } = await adminClient.rpc('finalize_pos_sale', {
        p_table_id: table.id,
        p_items: rpcItems,
        p_payment_method: CASH_PAYMENT_METHOD,
        p_performed_by: user.id,
      })

      if (finalizeError) {
        const normalizedError = normalizeRoleName(finalizeError.message)
        const status = normalizedError.includes('pedido activo') || normalizedError.includes('ya fue finalizada')
          ? 409
          : 400
        throw appError(finalizeError.message, status)
      }

      const responseItems = Array.isArray(finalizedSale?.items) && finalizedSale.items.length > 0
        ? finalizedSale.items
        : canonicalItems.map((item) => ({
            material_id: item.material_id,
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            base_unit_price: item.base_unit_price,
            bundle_id: item.bundle_id ?? null,
            bundle_type: item.bundle_type ?? null,
            bundle_label: item.bundle_label ?? null,
          }))

      return json({
        sale: {
          ...(finalizedSale || {}),
          items: responseItems,
        },
      })
    }

    return json({ error: 'Accion no soportada.' }, 400)
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    const requiresOpenCashSession = message.includes('No hay una caja abierta')
    const status = requiresOpenCashSession
      ? 409
      : typeof error?.status === 'number'
        ? error.status
        : 500
    return json({ error: message }, status)
  }
})
