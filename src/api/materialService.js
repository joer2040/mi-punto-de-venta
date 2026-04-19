import { supabase } from '../lib/supabase'
import { erpService } from './erpService'

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
  invoice_adjustment: {
    movement_type_label: 'Ajuste Factura',
    movement_option_label: 'Ajuste Factura',
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

  async getPurchaseInvoiceDetails(invoiceRef) {
    const normalizedInvoiceRef = String(invoiceRef || '').trim()
    if (!normalizedInvoiceRef) return null

    const { data, error } = await supabase
      .from('purchases')
      .select(`
        id,
        created_at,
        invoice_ref,
        center_id,
        providers:provider_id (
          id,
          name,
          rfc
        ),
        purchase_items (
          id,
          material_id,
          item_description,
          quantity,
          unit_cost,
          materials (
            id,
            sku,
            name,
            uoms:buy_uom_id (
              abbr
            )
          )
        )
      `)
      .eq('invoice_ref', normalizedInvoiceRef)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    if (!data) return null

    return {
      id: data.id,
      created_at: data.created_at,
      invoice_ref: data.invoice_ref || normalizedInvoiceRef,
      center_id: data.center_id,
      provider_name: data.providers?.name || 'Proveedor no identificado',
      provider_rfc: data.providers?.rfc || '',
      items: (data.purchase_items || []).map((item, index) => ({
        rowKey: `${item.id || item.material_id || index}`,
        purchase_item_id: item.id,
        material_id: item.material_id,
        item_description: item.item_description || '',
        quantity: Number(item.quantity || 0),
        unit_cost: Number(item.unit_cost || 0),
        total_cost: Number(item.quantity || 0) * Number(item.unit_cost || 0),
        material_name: item.materials?.name || item.item_description || 'Material no identificado',
        material_sku: item.materials?.sku || '',
        unit_abbr: item.materials?.uoms?.abbr || 'pz',
        displayLabel: item.materials
          ? `${item.materials?.name || 'Producto'} (${item.materials?.sku || 'Sin SKU'})`
          : item.item_description || 'Concepto libre',
      })),
    }
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

