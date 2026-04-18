import { supabase } from '../lib/supabase'
import { erpService } from './erpService'

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

const logInventoryMovement = async (movement) => {
  try {
    const { error } = await supabase.from('inventory_movements').insert([movement])
    if (error) throw error
  } catch (error) {
    console.warn('No se pudo registrar inventory_movements:', error)
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

const MATERIAL_MOVEMENT_REASON_LABELS = {
  opening_balance: {
    movement_type_label: 'Entradas (mov 101)',
    movement_option_label: 'Inventario Inicial',
  },
  adjustment_in: {
    movement_type_label: 'Entradas (mov 101)',
    movement_option_label: 'Ajuste de inventario (ingreso)',
  },
  promo_gift: {
    movement_type_label: 'Salida (mov 261)',
    movement_option_label: 'Promo/Regalo',
  },
  internal_use: {
    movement_type_label: 'Salida (mov 261)',
    movement_option_label: 'Consumo propio',
  },
  waste: {
    movement_type_label: 'Salida (mov 261)',
    movement_option_label: 'Desperdicio',
  },
  adjustment_out: {
    movement_type_label: 'Salida (mov 261)',
    movement_option_label: 'Ajuste de inventario (salida)',
  },
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
          provider_id,
          cat_id,
          providers:provider_id (
            id,
            name,
            rfc
          ),
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
    const response = await erpService.createMaterial(formData)
    return response.material
  },

  async recordPurchase(purchaseHeader, items) {
    const response = await erpService.recordPurchase(purchaseHeader, items)
    return response.purchase
  },

  async updatePrice(materialId, centerId, newPrice) {
    const response = await erpService.updatePrice(materialId, centerId, newPrice)
    return response.inventory
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

  async getMaterialMovementsReport() {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select(`
        id,
        created_at,
        quantity,
        reference_number,
        reason_code,
        materials:material_id (
          id,
          sku,
          name,
          uoms:buy_uom_id (
            abbr
          )
        )
      `)
      .eq('reference_table', 'material_movements')
      .order('created_at', { ascending: false })

    if (error) throw error

    return (data || []).map((movement) => {
      const labels = MATERIAL_MOVEMENT_REASON_LABELS[movement.reason_code] || {
        movement_type_label: 'Movimiento de materiales',
        movement_option_label: movement.reason_code || 'Sin opcion',
      }

      return {
        id: movement.id,
        created_at: movement.created_at,
        document_number: movement.reference_number || '',
        material_name: movement.materials?.name || 'Material no identificado',
        material_sku: movement.materials?.sku || '',
        movement_type_label: labels.movement_type_label,
        movement_option_label: labels.movement_option_label,
        quantity: Number(movement.quantity || 0),
        unit_abbr: movement.materials?.uoms?.abbr || 'pz',
      }
    })
  },

  async updateManualStock(materialId, centerId, newStock, options = {}) {
    const response = await erpService.updateManualStock(materialId, centerId, newStock, options)
    return response.inventory
  },

  async updateMaterialField(id, field, value) {
    const response = await erpService.updateMaterialField(id, field, value)
    return response.material
  },
}

