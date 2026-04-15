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

const padDocumentSegment = (value: number, length = 2) => String(value).padStart(length, '0')

const buildSaleDocumentNumber = (date: Date, sequence: number) =>
  [
    padDocumentSegment(date.getDate()),
    padDocumentSegment(date.getMonth() + 1),
    date.getFullYear(),
    padDocumentSegment(date.getHours()),
    padDocumentSegment(date.getMinutes()),
    padDocumentSegment(sequence),
  ].join('')

const getDayBounds = (dateValue: string) => {
  const date = new Date(dateValue)
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0)

  return {
    dayStart: dayStart.toISOString(),
    nextDay: nextDay.toISOString(),
  }
}

const getDailySaleDocumentNumber = async (adminClient: ReturnType<typeof createClient>, saleId: string, createdAt: string) => {
  const { dayStart, nextDay } = getDayBounds(createdAt)

  const { data, error } = await adminClient
    .from('sales')
    .select('id, created_at')
    .gte('created_at', dayStart)
    .lt('created_at', nextDay)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error

  const saleDate = new Date(createdAt)
  const saleIndex = (data || []).findIndex((item) => item.id === saleId)
  const sequence = saleIndex >= 0 ? saleIndex + 1 : (data?.length || 0) + 1

  return buildSaleDocumentNumber(saleDate, sequence)
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      return json({ error: 'No se recibio token de autenticacion.' }, 401)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    })

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return json({ error: 'Sesion invalida o expirada.' }, 401)
    }

    const caller = await loadCallerContext(adminClient, user.id)

    const body = (await req.json()) as Record<string, unknown>
    const action = String(body?.action ?? '')

    if (action === 'save_table_order') {
      const tableId = String(body.table_id ?? '')
      const items = normalizeItems(body.items)
      const lockWaiterEditing = Boolean(body.lock_waiter_editing)

      if (!tableId) return json({ error: 'Falta table_id.' }, 400)

      const { table, order } = await loadTableState(adminClient, tableId)

      if (caller.isWaiter && order?.waiter_edit_locked && !waiterCanModifyItems(order.items || [], items)) {
        return json({ error: 'Como mesero solo puedes agregar productos o aumentar cantidades en una mesa ya guardada.' }, 403)
      }

      if (items.length === 0) {
        const { error: tableError } = await adminClient
          .from('tables')
          .update({ status: 'libre', current_order_id: null })
          .eq('id', table.id)

        if (tableError) throw tableError

        if (table.current_order_id) {
          const { error: deleteError } = await adminClient
            .from('table_orders')
            .delete()
            .eq('id', table.current_order_id)

          if (deleteError) throw deleteError
        }

        return json({
          table: {
            ...table,
            status: 'libre',
            current_order_id: null,
          },
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
          .select('id, table_id, items, total, waiter_edit_locked')
          .single()

        if (updateError) throw updateError
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

      const { data: updatedTable, error: tableUpdateError } = await adminClient
        .from('tables')
        .update({
          status: 'ocupada',
          current_order_id: persistedOrder.id,
        })
        .eq('id', table.id)
        .select('id, number, status, current_order_id')
        .single()

      if (tableUpdateError) throw tableUpdateError

      return json({
        table: updatedTable,
        order: persistedOrder,
      })
    }

    if (action === 'finalize_sale') {
      const tableId = String(body.table_id ?? '')
      const items = normalizeItems(body.items)
      const paymentMethod = String(body.payment_method ?? 'Efectivo')

      if (!tableId) return json({ error: 'Falta table_id.' }, 400)
      if (items.length === 0) return json({ error: 'La mesa no tiene productos para cobrar.' }, 400)

      const { table, order } = await loadTableState(adminClient, tableId)

      if (caller.isWaiter && order?.waiter_edit_locked && !waiterCanModifyItems(order.items || [], items)) {
        return json({ error: 'Como mesero solo puedes agregar productos o aumentar cantidades antes de cobrar.' }, 403)
      }

      const totalAmount = computeTotal(items)

      const { data: center, error: centerError } = await adminClient
        .from('centers')
        .select('id')
        .limit(1)
        .single()

      if (centerError || !center) {
        return json({ error: 'No se encontro un centro de inventario para procesar la venta.' }, 400)
      }

      const materialIds = Array.from(new Set(items.map((item) => item.material_id)))
      const [{ data: inventoryRows, error: inventoryError }, { data: materialRows, error: materialError }] =
        await Promise.all([
          adminClient
            .from('inventory')
            .select('material_id, stock_actual')
            .eq('center_id', center.id)
            .in('material_id', materialIds),
          adminClient
            .from('materials')
            .select('id, categories:cat_id(name)')
            .in('id', materialIds),
        ])

      if (inventoryError) throw inventoryError
      if (materialError) throw materialError

      const stockByMaterial = new Map((inventoryRows || []).map((row) => [row.material_id, toNumber(row.stock_actual)]))
      const isExtraByMaterial = new Map(
        (materialRows || []).map((row) => [row.id, normalizeRoleName(readCategoryName(row.categories)) === 'extras'])
      )

      const chargeableItems = items.filter((item) => !isExtraByMaterial.get(item.material_id))

      for (const item of chargeableItems) {
        const availableStock = stockByMaterial.get(item.material_id) || 0
        if (item.quantity > availableStock) {
          return json(
            {
              error: `No hay stock suficiente para ${item.name}. Disponible: ${availableStock}, solicitado: ${item.quantity}.`,
            },
            400
          )
        }
      }

      const { data: sale, error: saleError } = await adminClient
        .from('sales')
        .insert([
          {
            center_id: center.id,
            total_amount: totalAmount,
            payment_method: paymentMethod,
          },
        ])
        .select()
        .single()

      if (saleError || !sale) throw saleError

      const documentNumber = await getDailySaleDocumentNumber(adminClient, sale.id, sale.created_at)

      const { data: updatedSale, error: documentError } = await adminClient
        .from('sales')
        .update({ document_number: documentNumber })
        .eq('id', sale.id)
        .select()
        .single()

      if (documentError || !updatedSale) throw documentError

      const saleItems = chargeableItems.map((item) => ({
        sale_id: updatedSale.id,
        material_id: item.material_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
      }))

      if (saleItems.length > 0) {
        const { error: saleItemsError } = await adminClient.from('sale_items').insert(saleItems)
        if (saleItemsError) throw saleItemsError
      }

      const movementRows = saleItems.map((item) => {
        const afterStock = stockByMaterial.get(item.material_id) || 0
        const beforeStock = afterStock + item.quantity

        return {
          center_id: center.id,
          material_id: item.material_id,
          movement_type: 'sale',
          direction: 'out',
          quantity: item.quantity,
          before_stock: beforeStock,
          after_stock: afterStock,
          unit_cost: null,
          unit_price: item.unit_price,
          reference_table: 'sales',
          reference_id: updatedSale.id,
          reference_number: documentNumber,
          reason_code: 'sale_ticket',
          notes: 'Salida de inventario por venta',
          performed_by: user.id,
        }
      })

      if (movementRows.length > 0) {
        const { error: movementError } = await adminClient.from('inventory_movements').insert(movementRows)
        if (movementError) {
          console.warn('No se pudo registrar inventory_movements:', movementError)
        }
      }

      const { error: freeTableError } = await adminClient
        .from('tables')
        .update({
          status: 'libre',
          current_order_id: null,
        })
        .eq('id', table.id)

      if (freeTableError) throw freeTableError

      if (table.current_order_id) {
        const { error: deleteOrderError } = await adminClient
          .from('table_orders')
          .delete()
          .eq('id', table.current_order_id)

        if (deleteOrderError) throw deleteOrderError
      }

      return json({
        sale: {
          ...updatedSale,
          document_number: documentNumber,
        },
      })
    }

    return json({ error: 'Accion no soportada.' }, 400)
  } catch (error) {
    console.error(error)
    const status = typeof error?.status === 'number' ? error.status : 500
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, status)
  }
})
