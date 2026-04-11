import { supabase } from '../lib/supabase'

const padDocumentSegment = (value, length = 2) => String(value).padStart(length, '0')

const buildSaleDocumentNumber = (date, sequence) =>
  [
    padDocumentSegment(date.getDate()),
    padDocumentSegment(date.getMonth() + 1),
    date.getFullYear(),
    padDocumentSegment(date.getHours()),
    padDocumentSegment(date.getMinutes()),
    padDocumentSegment(sequence),
  ].join('')

const getDayBounds = (dateValue) => {
  const date = new Date(dateValue)
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
  const nextDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0)

  return {
    dayStart: dayStart.toISOString(),
    nextDay: nextDay.toISOString(),
  }
}

const logAuditEvent = async ({
  entityType,
  entityId,
  eventType,
  oldValues = {},
  newValues = {},
  notes = null,
  performedBy = 'system',
}) => {
  try {
    const { error } = await supabase.from('audit_log').insert([
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
  } catch (error) {
    console.warn('No se pudo registrar audit_log:', error)
  }
}

const logInventoryMovement = async (movement) => {
  try {
    const { error } = await supabase.from('inventory_movements').insert([movement])
    if (error) throw error
  } catch (error) {
    console.warn('No se pudo registrar inventory_movements:', error)
  }
}

const createInventoryAdjustment = async (adjustment) => {
  try {
    const { data, error } = await supabase
      .from('inventory_adjustments')
      .insert([adjustment])
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.warn('No se pudo registrar inventory_adjustments:', error)
    return null
  }
}

const getInventorySnapshot = async (materialId, centerId) => {
  const { data, error } = await supabase
    .from('inventory')
    .select('material_id, center_id, stock_actual, costo_promedio, precio_venta')
    .eq('material_id', materialId)
    .eq('center_id', centerId)
    .single()

  if (error) throw error
  return data
}

const getMaterialSnapshot = async (id) => {
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

const getDailySaleDocumentNumber = async (sale) => {
  const chargedAt = sale?.created_at || new Date().toISOString()
  const { dayStart, nextDay } = getDayBounds(chargedAt)

  const { data, error } = await supabase
    .from('sales')
    .select('id, created_at')
    .gte('created_at', dayStart)
    .lt('created_at', nextDay)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error

  const saleDate = new Date(chargedAt)
  const saleIndex = (data || []).findIndex((item) => item.id === sale.id)
  const sequence = saleIndex >= 0 ? saleIndex + 1 : (data?.length || 0) + 1

  return buildSaleDocumentNumber(saleDate, sequence)
}

const getPurchaseItemsTotals = async () => {
  const { data, error } = await supabase
    .from('purchase_items')
    .select('purchase_id, quantity, unit_cost')

  if (error) throw error

  return (data || []).reduce((totals, item) => {
    const subtotal = parseFloat(item.quantity) * parseFloat(item.unit_cost)
    totals[item.purchase_id] = (totals[item.purchase_id] || 0) + subtotal
    return totals
  }, {})
}

export const materialService = {
  async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data
  },

  async getUoms() {
    const { data, error } = await supabase
      .from('uoms')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data
  },

  async getAllMaterials() {
    const { data, error } = await supabase
      .from('inventory')
      .select(`
        stock_actual,
        costo_promedio,
        precio_venta,
        materials (
          id,
          sku,
          name,
          cat_id,
          uoms:buy_uom_id (
            abbr
          ),
          categories:cat_id (
            id,
            name,
            is_for_sale,
            is_inventoried
          )
        ),
        centers ( id, name )
      `)

    if (error) {
      console.error('Error en getAllMaterials:', error)
      throw error
    }

    return data
  },

  async getInventoryMovements() {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('material_id, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  },

  async createMaterial(formData) {
    const { data: material, error: materialError } = await supabase
      .from('materials')
      .insert([formData])
      .select()
      .single()

    if (materialError) throw materialError

    const { data: center, error: centerError } = await supabase
      .from('centers')
      .select('id')
      .limit(1)
      .single()

    if (centerError) throw centerError

    if (center) {
      const { error: inventoryError } = await supabase
        .from('inventory')
        .insert([
          {
            material_id: material.id,
            center_id: center.id,
            stock_actual: 0,
            costo_promedio: 0,
            precio_venta: 0,
          },
        ])

      if (inventoryError) {
        console.error('Error al crear registro de inventario:', inventoryError)
      }
    }

    await logAuditEvent({
      entityType: 'material',
      entityId: material.id,
      eventType: 'material_created',
      newValues: material,
      notes: 'Alta de material desde el maestro de materiales',
      performedBy: 'material_form',
    })

    return material
  },

  async recordPurchase(purchaseHeader, items) {
    const normalizedPurchaseHeader = {
      center_id: purchaseHeader.center_id,
      provider_id: purchaseHeader.provider_id,
      invoice_ref: purchaseHeader.invoice_ref,
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('purchases')
      .insert([normalizedPurchaseHeader])
      .select()
      .single()

    if (purchaseError) throw purchaseError

    const itemsWithId = items.map((item) => ({
      material_id: item.material_id,
      quantity: parseFloat(item.quantity),
      unit_cost: parseFloat(item.unit_cost),
      purchase_id: purchase.id,
    }))

    if (itemsWithId.length > 0) {
      const { error: itemsError } = await supabase
        .from('purchase_items')
        .insert(itemsWithId)

      if (itemsError) throw itemsError
    }

    await Promise.all(
      itemsWithId.map(async (item) => {
        try {
          const inventorySnapshot = await getInventorySnapshot(item.material_id, purchase.center_id)
          const afterStock = parseFloat(inventorySnapshot.stock_actual)
          const beforeStock = afterStock - parseFloat(item.quantity)

          await logInventoryMovement({
            center_id: purchase.center_id,
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
            reference_number: purchase.invoice_ref || purchaseHeader.invoice_ref || null,
            reason_code: 'purchase_invoice',
            notes: 'Entrada de inventario por compra',
            performed_by: 'purchase_entry',
          })
        } catch (error) {
          console.warn('No se pudo registrar movimiento de compra:', error)
        }
      })
    )

    return purchase
  },

  async updatePrice(materialId, centerId, newPrice) {
    const inventorySnapshot = await getInventorySnapshot(materialId, centerId)
    const parsedPrice = parseFloat(newPrice)

    const { data, error } = await supabase
      .from('inventory')
      .update({ precio_venta: parsedPrice })
      .eq('material_id', materialId)
      .eq('center_id', centerId)

    if (error) throw error

    await logAuditEvent({
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
      performedBy: 'inventory_admin',
    })

    return data
  },

  async recordSale(saleHeader, items) {
    const draftSale = {
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }
    const documentNumber = saleHeader.document_number || (await getDailySaleDocumentNumber(draftSale))

    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert([
        {
          center_id: saleHeader.center_id,
          total_amount: parseFloat(saleHeader.total_amount),
          payment_method: saleHeader.payment_method,
          document_number: documentNumber,
        },
      ])
      .select()
      .single()

    if (saleError) throw saleError

    const chargeableItems = items.filter((item) => !item.is_extra)
    const itemsWithId = chargeableItems.map((item) => ({
      sale_id: sale.id,
      material_id: item.material_id,
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price),
    }))

    if (itemsWithId.length > 0) {
      const { error: itemsError } = await supabase
        .from('sale_items')
        .insert(itemsWithId)

      if (itemsError) throw itemsError
    }

    await Promise.all(
      itemsWithId.map(async (item) => {
        try {
          const inventorySnapshot = await getInventorySnapshot(item.material_id, sale.center_id)
          const afterStock = parseFloat(inventorySnapshot.stock_actual)
          const beforeStock = afterStock + parseFloat(item.quantity)

          await logInventoryMovement({
            center_id: sale.center_id,
            material_id: item.material_id,
            movement_type: 'sale',
            direction: 'out',
            quantity: parseFloat(item.quantity),
            before_stock: beforeStock,
            after_stock: afterStock,
            unit_cost: null,
            unit_price: parseFloat(item.unit_price),
            reference_table: 'sales',
            reference_id: sale.id,
            reference_number: documentNumber,
            reason_code: 'sale_ticket',
            notes: 'Salida de inventario por venta',
            performed_by: 'pos',
          })
        } catch (error) {
          console.warn('No se pudo registrar movimiento de venta:', error)
        }
      })
    )

    return {
      ...sale,
      document_number: documentNumber,
    }
  },

  async getSalesReport() {
    const { data, error } = await supabase
      .from('sales')
      .select('id, created_at, total_amount, document_number')
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map((sale) => ({
      id: sale.id,
      created_at: sale.created_at,
      total_amount: parseFloat(sale.total_amount || 0),
      document_number: sale.document_number || sale.id,
    }))
  },

  async getPurchasesReport() {
    const [{ data: purchases, error: purchasesError }, purchaseTotals, { data: providers, error: providersError }] = await Promise.all([
      supabase
        .from('purchases')
        .select('id, created_at, provider_id, invoice_ref')
        .order('created_at', { ascending: false }),
      getPurchaseItemsTotals(),
      supabase.from('providers').select('id, name'),
    ])

    if (purchasesError) throw purchasesError
    if (providersError) throw providersError

    const providerMap = new Map((providers || []).map((provider) => [provider.id, provider.name]))

    return (purchases || []).map((purchase) => ({
      id: purchase.id,
      created_at: purchase.created_at,
      provider_name: providerMap.get(purchase.provider_id) || 'Proveedor no identificado',
      invoice_ref: purchase.invoice_ref || 'Sin folio',
      total_amount: parseFloat(purchaseTotals[purchase.id] || 0),
    }))
  },

  async updateManualStock(materialId, centerId, newStock, options = {}) {
    const inventorySnapshot = await getInventorySnapshot(materialId, centerId)
    const previousStock = parseFloat(inventorySnapshot.stock_actual)
    const parsedNewStock = parseFloat(newStock)
    const differenceQty = parsedNewStock - previousStock

    const adjustment = await createInventoryAdjustment({
      center_id: centerId,
      material_id: materialId,
      previous_stock: previousStock,
      new_stock: parsedNewStock,
      difference_qty: differenceQty,
      reason_code: options.reason_code || 'manual_count',
      notes: options.notes || 'Ajuste manual desde el maestro de materiales',
      authorization_code: options.authorization_code || 'PIN-LOCAL',
      performed_by: options.performed_by || 'inventory_admin',
    })

    const { data, error } = await supabase
      .from('inventory')
      .update({
        stock_actual: parsedNewStock,
      })
      .eq('material_id', materialId)
      .eq('center_id', centerId)

    if (error) {
      console.error('Error en Supabase:', error)
      throw error
    }

    await logInventoryMovement({
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
      reason_code: options.reason_code || 'manual_count',
      notes: options.notes || 'Ajuste manual desde el maestro de materiales',
      performed_by: options.performed_by || 'inventory_admin',
    })

    return data
  },

  async updateMaterialField(id, field, value) {
    const materialSnapshot = await getMaterialSnapshot(id)

    const { data, error } = await supabase
      .from('materials')
      .update({ [field]: value })
      .eq('id', id)

    if (error) throw error

    await logAuditEvent({
      entityType: 'material',
      entityId: id,
      eventType: 'material_updated',
      oldValues: { [field]: materialSnapshot[field] },
      newValues: { [field]: value },
      notes: `Actualizacion del campo ${field}`,
      performedBy: 'inventory_admin',
    })

    return data
  },
}
