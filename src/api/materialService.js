import { supabase } from '../lib/supabase'

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

    return purchase
  },

  async updatePrice(materialId, centerId, newPrice) {
    const { data, error } = await supabase
      .from('inventory')
      .update({ precio_venta: newPrice })
      .eq('material_id', materialId)
      .eq('center_id', centerId)

    if (error) throw error
    return data
  },

  async recordSale(saleHeader, items) {
    const { data: sale, error: saleError } = await supabase
      .from('sales')
      .insert([
        {
          center_id: saleHeader.center_id,
          total_amount: parseFloat(saleHeader.total_amount),
          payment_method: saleHeader.payment_method,
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

    return sale
  },

  async updateManualStock(materialId, centerId, newStock) {
    const { data, error } = await supabase
      .from('inventory')
      .update({
        stock_actual: parseFloat(newStock),
      })
      .eq('material_id', materialId)
      .eq('center_id', centerId)

    if (error) {
      console.error('Error en Supabase:', error)
      throw error
    }

    return data
  },

  async updateMaterialField(id, field, value) {
    const { data, error } = await supabase
      .from('materials')
      .update({ [field]: value })
      .eq('id', id)

    if (error) throw error
    return data
  },
}
