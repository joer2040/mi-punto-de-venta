// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const appError = (message: string, status = 400) => Object.assign(new Error(message), { status })
const normalizeRoleName = (value: string | null | undefined) => (value || '').trim().toLowerCase()
const normalizeText = (value: unknown) => String(value ?? '').trim().toLowerCase()
const isManagerRoleName = (value: string | null | undefined) =>
  ['manager', 'administrador operativo'].includes(normalizeRoleName(value))
const isExtrasCategoryName = (value: string | null | undefined) => normalizeRoleName(value) === 'extras'
const GENERAL_PROVIDER_NAME = 'Proveedor General'
const PURCHASE_DUPLICATE_WINDOW_SECONDS = 120
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildPurchaseItemFingerprint = (item: {
  material_id: string | null
  item_description: string
  quantity: number
  unit_cost: number
}) =>
  JSON.stringify({
    material_id: item.material_id ?? null,
    item_description: String(item.item_description ?? '').trim().toLowerCase(),
    quantity: Number(item.quantity ?? 0),
    unit_cost: Number(item.unit_cost ?? 0),
  })

const buildPurchaseFingerprint = (
  items: Array<{
    material_id: string | null
    item_description: string
    quantity: number
    unit_cost: number
  }>
) =>
  items
    .map(buildPurchaseItemFingerprint)
    .sort()
    .join('|')

type RoleLinkRow = {
  role_id: string
  app_roles: { name: string | null } | { name: string | null }[] | null
}

const MATERIAL_MOVEMENT_DEFINITIONS = {
  '101': {
    label: 'Entradas (mov 101)',
    direction: 'in',
    options: {
      opening_balance: {
        label: 'Inventario Inicial',
        movementType: 'initial_stock',
        reasonCode: 'opening_balance',
        notes: 'Entrada por inventario inicial',
      },
      adjustment_in: {
        label: 'Ajuste de inventario (ingreso)',
        movementType: 'manual_adjustment',
        reasonCode: 'adjustment_in',
        notes: 'Entrada por ajuste manual de inventario',
      },
    },
  },
  '261': {
    label: 'Salida (mov 261)',
    direction: 'out',
    options: {
      promo_gift: {
        label: 'Promo/Regalo',
        movementType: 'manual_adjustment',
        reasonCode: 'promo_gift',
        notes: 'Salida por promocion o regalo',
      },
      internal_use: {
        label: 'Consumo propio',
        movementType: 'manual_adjustment',
        reasonCode: 'internal_use',
        notes: 'Salida por consumo propio',
      },
      waste: {
        label: 'Desperdicio',
        movementType: 'manual_adjustment',
        reasonCode: 'waste',
        notes: 'Salida por desperdicio',
      },
      adjustment_out: {
        label: 'Ajuste de inventario (salida)',
        movementType: 'manual_adjustment',
        reasonCode: 'adjustment_out',
        notes: 'Salida por ajuste manual de inventario',
      },
    },
  },
  invoice_adjustment: {
    label: 'Ajuste Factura',
    direction: 'adjust',
    options: {
      invoice_adjustment: {
        label: 'Ajuste Factura',
        movementType: 'manual_adjustment',
        reasonCode: 'invoice_adjustment',
        notes: 'Ajuste de inventario asociado a factura de compra',
      },
    },
  },
} as const

const readRoleName = (roleLink: RoleLinkRow) => {
  if (Array.isArray(roleLink.app_roles)) {
    return roleLink.app_roles[0]?.name ?? null
  }

  return roleLink.app_roles?.name ?? null
}

const logAuditEvent = async (adminClient: ReturnType<typeof createClient>, {
  entityType,
  entityId,
  eventType,
  oldValues = {},
  newValues = {},
  notes = null,
  performedBy = 'system',
}) => {
  const { error } = await adminClient.from('audit_log').insert([
    {
      entity_type: entityType,
      entity_id: entityId,
      event_type: eventType,
      old_values: oldValues,
      new_values: newValues,
      notes,
      performed_by: performedBy,
    },
  ])

  if (error) throw error
}

const logInventoryMovement = async (adminClient: ReturnType<typeof createClient>, movement: Record<string, unknown>) => {
  const { error } = await adminClient.from('inventory_movements').insert([movement])
  if (error) throw error
}

const createInventoryAdjustment = async (adminClient: ReturnType<typeof createClient>, adjustment: Record<string, unknown>) => {
  const { data, error } = await adminClient
    .from('inventory_adjustments')
    .insert([adjustment])
    .select()
    .single()

  if (error) throw error
  return data
}

const getInventorySnapshot = async (adminClient: ReturnType<typeof createClient>, materialId: string, centerId: string) => {
  const { data, error } = await adminClient
    .from('inventory')
    .select('material_id, center_id, stock_actual, costo_promedio, precio_venta')
    .eq('material_id', materialId)
    .eq('center_id', centerId)
    .single()

  if (error) throw error
  return data
}

const getMaterialSnapshot = async (adminClient: ReturnType<typeof createClient>, id: string) => {
  const { data, error } = await adminClient
    .from('materials')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

const getMaterialMovementDefinition = (movementCode: string, movementOption: string) => {
  const movementGroup = MATERIAL_MOVEMENT_DEFINITIONS[movementCode as keyof typeof MATERIAL_MOVEMENT_DEFINITIONS]
  const movementOptionDefinition = movementGroup?.options?.[movementOption as keyof typeof movementGroup.options]

  if (!movementGroup || !movementOptionDefinition) {
    throw appError('El tipo de movimiento seleccionado no es valido.', 400)
  }

  return {
    movementCode,
    movementOption,
    movementLabel: movementGroup.label,
    optionLabel: movementOptionDefinition.label,
    direction: movementGroup.direction,
    movementType: movementOptionDefinition.movementType,
    reasonCode: movementOptionDefinition.reasonCode,
    notes: movementOptionDefinition.notes,
  }
}

const getNextInventoryMovementDocumentNumber = async (adminClient: ReturnType<typeof createClient>) => {
  const { data, error } = await adminClient.rpc('next_inventory_movement_document_number')

  if (error) throw error

  const documentNumber = String(data ?? '').trim()
  if (!documentNumber) {
    throw appError('No se pudo generar el numero de documento del movimiento.', 500)
  }

  return documentNumber
}

const validateMaterialMovement = async (
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>
) => {
  const materialId = String(payload.material_id ?? '').trim()
  const centerId = String(payload.center_id ?? '').trim()
  const movementCode = String(payload.movement_code ?? '').trim()
  const movementOption = String(payload.movement_option ?? '').trim() || (movementCode === 'invoice_adjustment' ? 'invoice_adjustment' : '')
  const quantity = toNumber(payload.quantity, NaN)

  if (!materialId || !centerId || !movementCode || !movementOption || Number.isNaN(quantity) || quantity <= 0) {
    throw appError('Debes completar tipo, opcion, producto y cantidad valida.', 400)
  }

  const movementDefinition = getMaterialMovementDefinition(movementCode, movementOption)

  if (movementCode === 'invoice_adjustment') {
    const purchaseItemId = String(payload.purchase_item_id ?? '').trim()
    const invoiceRef = String(payload.invoice_ref ?? '').trim()

    if (!purchaseItemId || !invoiceRef) {
      throw appError('Debes seleccionar una factura y un producto valido para el ajuste.', 400)
    }

    const { data: purchaseItemRow, error: purchaseItemError } = await adminClient
      .from('purchase_items')
      .select(`
        id,
        purchase_id,
        material_id,
        quantity,
        unit_cost,
        purchases!inner (
          id,
          center_id,
          invoice_ref,
          created_at,
          providers:provider_id (
            id,
            name
          )
        ),
        materials!inner (
          id,
          sku,
          name,
          categories:cat_id (
            name,
            is_inventoried
          ),
          uoms:buy_uom_id (
            abbr
          )
        )
      `)
      .eq('id', purchaseItemId)
      .eq('material_id', materialId)
      .single()

    if (purchaseItemError || !purchaseItemRow) {
      throw appError('No se encontro el producto seleccionado dentro de la factura.', 404)
    }

    if (String(purchaseItemRow.purchases?.invoice_ref ?? '').trim() !== invoiceRef) {
      throw appError('La factura seleccionada ya no coincide con el producto elegido.', 400)
    }

    if (String(purchaseItemRow.purchases?.center_id ?? '').trim() !== centerId) {
      throw appError('La factura seleccionada no pertenece al centro de inventario indicado.', 400)
    }

    if (purchaseItemRow.materials?.categories?.is_inventoried !== true) {
      throw appError('Solo puedes ajustar facturas de materiales inventariables.', 400)
    }

    const inventorySnapshot = await getInventorySnapshot(adminClient, materialId, centerId)
    const currentStock = Number(inventorySnapshot.stock_actual ?? 0)
    const originalQuantity = Number(purchaseItemRow.quantity ?? 0)
    const differenceQty = quantity - originalQuantity

    if (differenceQty === 0) {
      throw appError('La nueva cantidad es igual a la cantidad original de la factura.', 400)
    }

    const projectedStock = currentStock + differenceQty
    const valid = projectedStock >= 0
    const message = valid
      ? 'Verificacion correcta. El ajuste de factura puede postearse.'
      : 'Stock insuficiente. El ajuste de factura no puede dejar inventario negativo.'

    return {
      valid,
      message,
      materialId,
      centerId,
      quantity: Math.abs(differenceQty),
      requestedQuantity: quantity,
      originalQuantity,
      differenceQty,
      currentStock,
      projectedStock,
      costoPromedio: Number(inventorySnapshot.costo_promedio ?? 0),
      precioVenta: Number(inventorySnapshot.precio_venta ?? 0),
      productName: purchaseItemRow.materials?.name || 'Producto',
      productSku: purchaseItemRow.materials?.sku || '',
      unitAbbr: purchaseItemRow.materials?.uoms?.abbr || 'pz',
      direction: differenceQty > 0 ? 'in' : 'out',
      movementType: movementDefinition.movementType,
      reasonCode: movementDefinition.reasonCode,
      movementCode: movementDefinition.movementCode,
      movementOption: movementDefinition.movementOption,
      movementLabel: movementDefinition.movementLabel,
      optionLabel: movementDefinition.optionLabel,
      notes: movementDefinition.notes,
      purchaseId: purchaseItemRow.purchase_id,
      purchaseItemId,
      invoiceRef,
      providerName: purchaseItemRow.purchases?.providers?.name || 'Proveedor no identificado',
      purchaseCreatedAt: purchaseItemRow.purchases?.created_at || null,
      unitCost: Number(purchaseItemRow.unit_cost ?? 0),
      previousLineTotal: originalQuantity * Number(purchaseItemRow.unit_cost ?? 0),
      nextLineTotal: quantity * Number(purchaseItemRow.unit_cost ?? 0),
    }
  }

  const { data: inventoryRow, error: inventoryError } = await adminClient
    .from('inventory')
    .select(`
      material_id,
      center_id,
      stock_actual,
      costo_promedio,
      precio_venta,
      materials!inner (
        id,
        sku,
        name,
        categories:cat_id (
          name,
          is_inventoried
        ),
        uoms:buy_uom_id (
          abbr
        )
      )
    `)
    .eq('material_id', materialId)
    .eq('center_id', centerId)
    .single()

  if (inventoryError || !inventoryRow) {
    throw appError('No se encontro inventario para el producto seleccionado.', 404)
  }

  if (inventoryRow.materials?.categories?.is_inventoried !== true) {
    throw appError('Solo puedes mover materiales inventariables.', 400)
  }

  const currentStock = Number(inventoryRow.stock_actual ?? 0)
  const projectedStock =
    movementDefinition.direction === 'in'
      ? currentStock + quantity
      : currentStock - quantity

  const valid = projectedStock >= 0
  const message = valid
    ? 'Verificacion correcta. El movimiento puede postearse.'
    : 'Stock insuficiente. El movimiento no puede dejar inventario negativo.'

  return {
    valid,
    message,
    materialId,
    centerId,
    quantity,
    currentStock,
    projectedStock,
    costoPromedio: Number(inventoryRow.costo_promedio ?? 0),
    precioVenta: Number(inventoryRow.precio_venta ?? 0),
    productName: inventoryRow.materials?.name || 'Producto',
    productSku: inventoryRow.materials?.sku || '',
    unitAbbr: inventoryRow.materials?.uoms?.abbr || 'pz',
    direction: movementDefinition.direction,
    movementType: movementDefinition.movementType,
    reasonCode: movementDefinition.reasonCode,
    movementCode: movementDefinition.movementCode,
    movementOption: movementDefinition.movementOption,
    movementLabel: movementDefinition.movementLabel,
    optionLabel: movementDefinition.optionLabel,
    notes: movementDefinition.notes,
  }
}

const loadCallerContext = async (adminClient: ReturnType<typeof createClient>, userId: string) => {
  const { data: profile, error: profileError } = await adminClient
    .from('app_profiles')
    .select('id, username, is_superadmin, status')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || profile?.status !== 'active') {
    throw appError('No tienes permisos para operar este modulo.', 403)
  }

  const { data: callerRoleLinks, error: callerRoleError } = await adminClient
    .from('app_user_roles')
    .select('role_id, app_roles(name)')
    .eq('user_id', userId)

  if (callerRoleError) throw callerRoleError

  const roleNames = Array.from(
    new Set(((callerRoleLinks as RoleLinkRow[] | null) || []).map(readRoleName).filter(Boolean))
  )

  const isSuperadmin = Boolean(profile?.is_superadmin)
  const isManager = roleNames.some((roleName) => isManagerRoleName(roleName))

  if (!isSuperadmin && !isManager) {
    throw appError('No tienes permisos para operar este modulo.', 403)
  }

  return {
    profile,
    isSuperadmin,
    isManager,
    performedBy: profile?.username || userId,
  }
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

    if (action === 'create_provider') {
      const provider = (body.provider || {}) as Record<string, unknown>
      const name = String(provider.name ?? '').trim()
      const rfc = String(provider.rfc ?? '').trim()
      const phone = String(provider.phone ?? '').trim()
      const email = String(provider.email ?? '').trim()

      if (!name || !rfc) return json({ error: 'Nombre y RFC son obligatorios.' }, 400)

      const { data, error } = await adminClient
        .from('providers')
        .insert([{ name, rfc, phone: phone || null, email: email || null }])
        .select()
        .single()

      if (error) throw error

      await logAuditEvent(adminClient, {
        entityType: 'provider',
        entityId: data.id,
        eventType: 'provider_created',
        newValues: data,
        notes: 'Alta de proveedor desde el maestro de proveedores',
        performedBy: caller.performedBy,
      })

      return json({ provider: data })
    }

    if (action === 'record_purchase') {
      const purchaseHeader = (body.purchase_header || {}) as Record<string, unknown>
      const rawItems = Array.isArray(body.items) ? body.items : []
      const centerId = String(purchaseHeader.center_id ?? '').trim()
      const providerId = String(purchaseHeader.provider_id ?? '').trim()
      const invoiceRef = String(purchaseHeader.invoice_ref ?? '').trim()

      if (!centerId || !providerId || rawItems.length === 0) {
        return json({ error: 'La compra debe incluir centro, proveedor y al menos un item.' }, 400)
      }

      const { data: providerSnapshot, error: providerError } = await adminClient
        .from('providers')
        .select('id, name, rfc')
        .eq('id', providerId)
        .maybeSingle()

      if (providerError) throw providerError
      if (!providerSnapshot) {
        return json({ error: 'El proveedor seleccionado no existe.' }, 400)
      }

      const isGeneralProviderPurchase = normalizeText(providerSnapshot.name) === normalizeText(GENERAL_PROVIDER_NAME)
      const items = rawItems.map((item, index) => {
        const materialId = String(item?.material_id ?? '').trim()
        const itemDescription = String(item?.item_description ?? '').trim()
        const quantity = toNumber(item?.quantity, NaN)
        const unitCost = toNumber(item?.unit_cost, NaN)

        if (Number.isNaN(quantity) || quantity <= 0) {
          throw appError(`El item ${index + 1} debe incluir una cantidad valida.`, 400)
        }

        if (Number.isNaN(unitCost) || unitCost < 0) {
          throw appError(`El item ${index + 1} debe incluir un costo valido.`, 400)
        }

        if (isGeneralProviderPurchase) {
          if (materialId) {
            throw appError('Proveedor General solo acepta renglones libres sin material asociado.', 400)
          }

          if (!itemDescription) {
            throw appError(`El item ${index + 1} debe incluir una descripcion libre.`, 400)
          }

          return {
            material_id: null,
            item_description: itemDescription,
            quantity,
            unit_cost: unitCost,
          }
        }

        if (!materialId) {
          throw appError(`El item ${index + 1} debe incluir un material valido.`, 400)
        }

        return {
          material_id: materialId,
          item_description: '',
          quantity,
          unit_cost: unitCost,
        }
      })

      const totalAmount = items.reduce(
        (sum, item) => sum + (Number(item.quantity ?? 0) * Number(item.unit_cost ?? 0)),
        0
      )

      const recentDuplicateThreshold = new Date(
        Date.now() - PURCHASE_DUPLICATE_WINDOW_SECONDS * 1000
      ).toISOString()
      const currentPurchaseFingerprint = buildPurchaseFingerprint(items)

      const { data: recentPurchases, error: duplicateLookupError } = await adminClient
        .from('purchases')
        .select(`
          id,
          center_id,
          provider_id,
          invoice_ref,
          total_amount,
          created_at,
          purchase_items (
            material_id,
            item_description,
            quantity,
            unit_cost
          )
        `)
        .eq('center_id', centerId)
        .eq('provider_id', providerId)
        .gte('created_at', recentDuplicateThreshold)
        .order('created_at', { ascending: false })
        .limit(10)

      if (duplicateLookupError) throw duplicateLookupError

      const normalizedInvoiceRef = invoiceRef || null
      const duplicatedPurchase = (recentPurchases || []).find((candidate) => {
        const candidateInvoiceRef = String(candidate.invoice_ref ?? '').trim() || null
        const candidateTotal = Number(candidate.total_amount ?? 0)
        const candidateFingerprint = buildPurchaseFingerprint(
          (candidate.purchase_items || []).map((item) => ({
            material_id: item.material_id ?? null,
            item_description: String(item.item_description ?? ''),
            quantity: Number(item.quantity ?? 0),
            unit_cost: Number(item.unit_cost ?? 0),
          }))
        )

        return (
          candidateInvoiceRef === normalizedInvoiceRef &&
          Math.abs(candidateTotal - totalAmount) < 0.0001 &&
          candidateFingerprint === currentPurchaseFingerprint
        )
      })

      if (duplicatedPurchase) {
        throw appError(
          `Parece que esta compra ya fue registrada hace unos instantes (folio ${duplicatedPurchase.invoice_ref || 'sin folio'}). Evitamos duplicarla por seguridad.`,
          409
        )
      }

      const { data: purchase, error: purchaseError } = await adminClient
        .from('purchases')
        .insert([
          {
            center_id: centerId,
            provider_id: providerId,
            invoice_ref: invoiceRef || null,
            total_amount: totalAmount,
          },
        ])
        .select()
        .single()

      if (purchaseError) throw purchaseError

      const itemsWithId = items.map((item) => ({
        material_id: item.material_id,
        item_description: item.item_description,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        purchase_id: purchase.id,
      }))

      const { error: itemsError } = await adminClient.from('purchase_items').insert(itemsWithId)
      if (itemsError) throw itemsError

      for (const item of itemsWithId.filter((row) => row.material_id)) {
        const inventorySnapshot = await getInventorySnapshot(adminClient, item.material_id, centerId)
        const afterStock = parseFloat(inventorySnapshot.stock_actual)
        const beforeStock = afterStock - parseFloat(item.quantity)

        await logInventoryMovement(adminClient, {
          center_id: centerId,
          material_id: item.material_id,
          movement_type: 'purchase',
          direction: 'in',
          quantity: parseFloat(item.quantity),
          before_stock: beforeStock,
          after_stock: afterStock,
          unit_cost: parseFloat(item.unit_cost),
          unit_price: null,
          reference_table: 'purchases',
          reference_id: purchase.id,
          reference_number: purchase.invoice_ref || invoiceRef || null,
          reason_code: 'purchase_invoice',
          notes: 'Entrada de inventario por compra',
          performed_by: caller.performedBy,
        })
      }

      await logAuditEvent(adminClient, {
        entityType: 'purchase',
        entityId: purchase.id,
        eventType: 'purchase_created',
        newValues: {
          center_id: centerId,
          provider_id: providerId,
          provider_name: providerSnapshot.name,
          provider_mode: isGeneralProviderPurchase ? 'general' : 'standard',
          invoice_ref: invoiceRef || null,
          total_amount: totalAmount,
          freeform_item_count: itemsWithId.filter((item) => !item.material_id).length,
          items: itemsWithId,
        },
        notes: 'Compra registrada desde entradas por compra',
        performedBy: caller.performedBy,
      })

      return json({ purchase })
    }

    if (action === 'create_material') {
      const material = (body.material || {}) as Record<string, unknown>
      const sku = String(material.sku ?? '').trim()
      const name = String(material.name ?? '').trim()
      const providerId = String(material.provider_id ?? '').trim()
      const catId = String(material.cat_id ?? '').trim()
      const buyUomId = String(material.buy_uom_id ?? '').trim()
      const sellUomId = String(material.sell_uom_id ?? '').trim()
      const conversionFactor = toNumber(material.conversion_factor, 1)

      if (!sku || !name || !catId || !buyUomId || !sellUomId) {
        return json({ error: 'Todos los campos del material son obligatorios.' }, 400)
      }

      const { data: categorySnapshot, error: categoryError } = await adminClient
        .from('categories')
        .select('id, name')
        .eq('id', catId)
        .maybeSingle()

      if (categoryError) throw categoryError
      if (!categorySnapshot) {
        return json({ error: 'La categoria seleccionada no existe.' }, 400)
      }

      const isExtraCategory = isExtrasCategoryName(categorySnapshot.name)

      if (!isExtraCategory) {
        if (!providerId) {
          return json({ error: 'Debes seleccionar un proveedor para este material.' }, 400)
        }

        const { data: providerSnapshot, error: providerError } = await adminClient
          .from('providers')
          .select('id')
          .eq('id', providerId)
          .maybeSingle()

        if (providerError) throw providerError
        if (!providerSnapshot) {
          return json({ error: 'El proveedor seleccionado no existe.' }, 400)
        }
      }

      const { data: createdMaterial, error: materialError } = await adminClient
        .from('materials')
        .insert([
          {
            sku,
            name,
            provider_id: isExtraCategory ? null : providerId,
            cat_id: catId,
            buy_uom_id: buyUomId,
            sell_uom_id: sellUomId,
            conversion_factor: conversionFactor,
          },
        ])
        .select()
        .single()

      if (materialError) throw materialError

      const { data: center, error: centerError } = await adminClient
        .from('centers')
        .select('id')
        .limit(1)
        .single()

      if (centerError) throw centerError

      if (center) {
        const { error: inventoryError } = await adminClient.from('inventory').upsert(
          [
            {
              material_id: createdMaterial.id,
              center_id: center.id,
              stock_actual: 0,
              costo_promedio: 0,
              precio_venta: 0,
            },
          ],
          {
            onConflict: 'material_id,center_id',
            ignoreDuplicates: true,
          }
        )

        if (inventoryError) throw inventoryError
      }

      await logAuditEvent(adminClient, {
        entityType: 'material',
        entityId: createdMaterial.id,
        eventType: 'material_created',
        newValues: createdMaterial,
        notes: 'Alta de material desde el maestro de materiales',
        performedBy: caller.performedBy,
      })

      return json({ material: createdMaterial })
    }

    if (action === 'check_material_movement') {
      const validation = await validateMaterialMovement(adminClient, body)
      return json({
        validation: {
          valid: validation.valid,
          message: validation.message,
          movement_label: `${validation.movementLabel} / ${validation.optionLabel}`,
          current_stock: validation.currentStock,
          projected_stock: validation.projectedStock,
          quantity: validation.quantity,
          direction: validation.direction,
          unit_abbr: validation.unitAbbr,
          product_name: validation.productName,
          product_sku: validation.productSku,
          original_quantity: validation.originalQuantity ?? null,
          requested_quantity: validation.requestedQuantity ?? null,
          invoice_ref: validation.invoiceRef ?? null,
          provider_name: validation.providerName ?? null,
          purchase_created_at: validation.purchaseCreatedAt ?? null,
          previous_line_total: validation.previousLineTotal ?? null,
          next_line_total: validation.nextLineTotal ?? null,
        },
      })
    }

    if (action === 'post_material_movement') {
      const validation = await validateMaterialMovement(adminClient, body)

      if (!validation.valid) {
        return json({ error: validation.message }, 400)
      }

      const documentNumber = await getNextInventoryMovementDocumentNumber(adminClient)

      if (validation.purchaseItemId) {
        const { error: purchaseItemUpdateError } = await adminClient
          .from('purchase_items')
          .update({
            quantity: validation.requestedQuantity,
          })
          .eq('id', validation.purchaseItemId)

        if (purchaseItemUpdateError) throw purchaseItemUpdateError
      }

      const { data: inventory, error: inventoryError } = await adminClient
        .from('inventory')
        .update({
          stock_actual: validation.projectedStock,
        })
        .eq('material_id', validation.materialId)
        .eq('center_id', validation.centerId)
        .select()
        .single()

      if (inventoryError) throw inventoryError

      await logInventoryMovement(adminClient, {
        center_id: validation.centerId,
        material_id: validation.materialId,
        movement_type: validation.movementType,
        direction: validation.direction,
        quantity: validation.quantity,
        before_stock: validation.currentStock,
        after_stock: validation.projectedStock,
        unit_cost: validation.costoPromedio,
        unit_price: validation.precioVenta,
        reference_table: 'material_movements',
        reference_id: null,
        reference_number: documentNumber,
        reason_code: validation.reasonCode,
        notes: validation.notes,
        performed_by: caller.performedBy,
      })

      await logAuditEvent(adminClient, {
        entityType: 'material',
        entityId: validation.materialId,
        eventType: 'inventory_adjusted',
        oldValues: {
          center_id: validation.centerId,
          stock_actual: validation.currentStock,
        },
        newValues: {
          center_id: validation.centerId,
          stock_actual: validation.projectedStock,
          quantity: validation.quantity,
          requested_quantity: validation.requestedQuantity ?? validation.quantity,
          original_quantity: validation.originalQuantity ?? null,
          movement_code: validation.movementCode,
          movement_option: validation.movementOption,
          reason_code: validation.reasonCode,
          document_number: documentNumber,
          invoice_ref: validation.invoiceRef ?? null,
          purchase_id: validation.purchaseId ?? null,
          purchase_item_id: validation.purchaseItemId ?? null,
        },
        notes: `Movimiento de materiales ${validation.optionLabel}`,
        performedBy: caller.performedBy,
      })

      return json({
        document_number: documentNumber,
        inventory,
        movement: {
          product_name: validation.productName,
          product_sku: validation.productSku,
          movement_label: `${validation.movementLabel} / ${validation.optionLabel}`,
          quantity: validation.quantity,
          current_stock: validation.currentStock,
          projected_stock: validation.projectedStock,
          unit_abbr: validation.unitAbbr,
          original_quantity: validation.originalQuantity ?? null,
          requested_quantity: validation.requestedQuantity ?? null,
          invoice_ref: validation.invoiceRef ?? null,
        },
      })
    }

    if (action === 'update_price') {
      const materialId = String(body.material_id ?? '').trim()
      const centerId = String(body.center_id ?? '').trim()
      const parsedPrice = toNumber(body.new_price, NaN)

      if (!materialId || !centerId || Number.isNaN(parsedPrice)) {
        return json({ error: 'Faltan datos para actualizar el precio.' }, 400)
      }

      const inventorySnapshot = await getInventorySnapshot(adminClient, materialId, centerId)

      const { data, error } = await adminClient
        .from('inventory')
        .update({ precio_venta: parsedPrice })
        .eq('material_id', materialId)
        .eq('center_id', centerId)
        .select()
        .single()

      if (error) throw error

      await logAuditEvent(adminClient, {
        entityType: 'material',
        entityId: materialId,
        eventType: 'price_updated',
        oldValues: {
          center_id: centerId,
          precio_venta: inventorySnapshot.precio_venta,
        },
        newValues: {
          center_id: centerId,
          precio_venta: parsedPrice,
        },
        notes: 'Actualizacion manual de precio de venta',
        performedBy: caller.performedBy,
      })

      return json({ inventory: data })
    }

    if (action === 'update_manual_stock') {
      const materialId = String(body.material_id ?? '').trim()
      const centerId = String(body.center_id ?? '').trim()
      const parsedNewStock = toNumber(body.new_stock, NaN)
      const options = (body.options || {}) as Record<string, unknown>

      if (!materialId || !centerId || Number.isNaN(parsedNewStock)) {
        return json({ error: 'Faltan datos para actualizar el stock.' }, 400)
      }

      const inventorySnapshot = await getInventorySnapshot(adminClient, materialId, centerId)
      const previousStock = parseFloat(inventorySnapshot.stock_actual)
      const differenceQty = parsedNewStock - previousStock

      const adjustment = await createInventoryAdjustment(adminClient, {
        center_id: centerId,
        material_id: materialId,
        previous_stock: previousStock,
        new_stock: parsedNewStock,
        difference_qty: differenceQty,
        reason_code: String(options.reason_code ?? 'manual_count'),
        notes: String(options.notes ?? 'Ajuste manual desde el maestro de materiales'),
        authorization_code: String(options.authorization_code ?? 'PIN-LOCAL'),
        performed_by: caller.performedBy,
      })

      const { data, error } = await adminClient
        .from('inventory')
        .update({
          stock_actual: parsedNewStock,
        })
        .eq('material_id', materialId)
        .eq('center_id', centerId)
        .select()
        .single()

      if (error) throw error

      await logInventoryMovement(adminClient, {
        center_id: centerId,
        material_id: materialId,
        movement_type: 'manual_adjustment',
        direction: 'adjust',
        quantity: Math.abs(differenceQty),
        before_stock: previousStock,
        after_stock: parsedNewStock,
        unit_cost: null,
        unit_price: null,
        reference_table: 'inventory_adjustments',
        reference_id: adjustment?.id || null,
        reference_number: adjustment?.id || null,
        reason_code: String(options.reason_code ?? 'manual_count'),
        notes: String(options.notes ?? 'Ajuste manual desde el maestro de materiales'),
        performed_by: caller.performedBy,
      })

      await logAuditEvent(adminClient, {
        entityType: 'material',
        entityId: materialId,
        eventType: 'inventory_adjusted',
        oldValues: {
          center_id: centerId,
          stock_actual: previousStock,
        },
        newValues: {
          center_id: centerId,
          stock_actual: parsedNewStock,
        },
        notes: 'Ajuste manual de inventario',
        performedBy: caller.performedBy,
      })

      return json({ inventory: data, adjustment })
    }

    if (action === 'update_material_field') {
      const materialId = String(body.material_id ?? '').trim()
      const field = String(body.field ?? '').trim()
      const value = body.value
      const allowedFields = new Set(['sku', 'name', 'provider_id'])

      if (!materialId || !allowedFields.has(field)) {
        return json({ error: 'Actualizacion de material no permitida.' }, 400)
      }

      const materialSnapshot = await getMaterialSnapshot(adminClient, materialId)

      if (field === 'provider_id') {
        const providerId = String(value ?? '').trim()
        const { data: categorySnapshot, error: categoryError } = await adminClient
          .from('categories')
          .select('id, name')
          .eq('id', String(materialSnapshot.cat_id ?? '').trim())
          .maybeSingle()

        if (categoryError) throw categoryError

        const isExtraCategory = isExtrasCategoryName(categorySnapshot?.name)

        if (!providerId && !isExtraCategory) {
          return json({ error: 'Debes seleccionar un proveedor valido.' }, 400)
        }

        if (providerId) {
          const { data: providerSnapshot, error: providerError } = await adminClient
            .from('providers')
            .select('id')
            .eq('id', providerId)
            .maybeSingle()

          if (providerError) throw providerError
          if (!providerSnapshot) {
            return json({ error: 'El proveedor seleccionado no existe.' }, 400)
          }
        }
      }

      const { data, error } = await adminClient
        .from('materials')
        .update({ [field]: field === 'provider_id' && String(value ?? '').trim() === '' ? null : value })
        .eq('id', materialId)
        .select()
        .single()

      if (error) throw error

      await logAuditEvent(adminClient, {
        entityType: 'material',
        entityId: materialId,
        eventType: 'material_updated',
        oldValues: { [field]: materialSnapshot[field] },
        newValues: { [field]: value },
        notes: `Actualizacion del campo ${field}`,
        performedBy: caller.performedBy,
      })

      return json({ material: data })
    }

    return json({ error: 'Accion no soportada.' }, 400)
  } catch (error) {
    console.error(error)
    const status = typeof error?.status === 'number' ? error.status : 500
    return json({ error: error instanceof Error ? error.message : 'Error inesperado.' }, status)
  }
})
