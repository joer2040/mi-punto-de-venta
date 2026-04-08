// Mantenemos tu ruta de importación que ya verificamos que funciona
import { supabase } from '../lib/supabase'

export const materialService = {
  // --- MÓDULO DE MAESTROS (Lo que ya tenías) ---
  
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
      console.error("Error en getAllMaterials:", error)
      throw error
    }
    return data
  },

  async createMaterial(formData) {
    // 1. Insertar el material
    const { data: material, error: mError } = await supabase
      .from('materials')
      .insert([formData])
      .select()
      .single()

    if (mError) throw mError

    // 2. Crear un registro inicial en el inventario para el centro principal
    const { data: center } = await supabase
      .from('centers')
      .select('id')
      .limit(1)
      .single()

    if (center) {
      const { error: iError } = await supabase
        .from('inventory')
        .insert([{
          material_id: material.id,
          center_id: center.id,
          stock_actual: 0,
          costo_promedio: 0,
          precio_venta: 0
        }])

      if (iError) console.error("Error al crear registro de inventario:", iError)
    }

    return material
  },

  // --- NUEVO: MÓDULO DE COMPRAS e INVENTARIO ---

  // Traer proveedores para el formulario de compra
  async getSuppliers() {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('name', { ascending: true })
    if (error) throw error
    return data
  },

  // Función maestra para registrar una compra (Transacción completa)
  async recordPurchase(purchaseHeader, items) {
    // 1. Insertar la cabecera de la compra (quién, dónde, cuánto total)
    const normalizedPurchaseHeader = {
      center_id: purchaseHeader.center_id,
      provider_id: purchaseHeader.provider_id ?? purchaseHeader.supplier_id,
      invoice_ref: purchaseHeader.invoice_ref ?? purchaseHeader.reference_note
    }

    const { data: purchase, error: pError } = await supabase
      .from('purchases')
      .insert([normalizedPurchaseHeader])
      .select()
      .single()

    if (pError) throw pError

    // 2. Preparar los artículos vinculándolos al ID de la compra creada
    const chargeableItems = items.filter(item => !item.is_extra)
    const itemsWithId = chargeableItems.map(item => ({
      material_id: item.material_id,
      quantity: parseFloat(item.quantity),
      unit_cost: parseFloat(item.unit_cost),
      purchase_id: purchase.id
    }))

    // 3. Insertar los detalles (Aquí es donde el Trigger de Supabase saltará)
    const { error: iError } = await supabase
      .from('purchase_items')
      .insert(itemsWithId)

    if (iError) throw iError
    return purchase
  },

  // Actualizar solo el precio de venta en el inventario
    async updatePrice(materialId, centerId, newPrice) {
        const { data, error } = await supabase
        .from('inventory')
        .update({ precio_venta: newPrice })
        .eq('material_id', materialId)
        .eq('center_id', centerId);

        if (error) throw error;
        return data;    
    },

  // Función para registrar una venta completa
  async recordSale(saleHeader, items) {
    // 1. Insertar la cabecera
    const { data: sale, error: sError } = await supabase
      .from('sales')
      .insert([{
        center_id: saleHeader.center_id,
        total_amount: parseFloat(saleHeader.total_amount),
        payment_method: saleHeader.payment_method
      }])
      .select()
      .single()

    if (sError) throw sError

    // 2. Solo los productos inventariables deben insertarse en sale_items
    const chargeableItems = items.filter(item => !item.is_extra)
    const itemsWithId = chargeableItems.map(item => ({
      sale_id: sale.id,
      material_id: item.material_id, // El ID del producto
      quantity: parseFloat(item.quantity),
      unit_price: parseFloat(item.unit_price)
      // NOTA: Aquí quitamos el campo 'name', porque la tabla no lo tiene
    }))

    // 3. Insertar detalles
    if (itemsWithId.length > 0) {
      const { error: iError } = await supabase
        .from('sale_items')
        .insert(itemsWithId)

      if (iError) throw iError
    }
    return sale
  },

  // Actualizar stock de forma manual (Requiere permiso)
  async updateManualStock(materialId, centerId, newStock) {
    const { data, error } = await supabase
      .from('inventory')
      .update({
        stock_actual: parseFloat(newStock)
      })
      .eq('material_id', materialId)
      .eq('center_id', centerId)

    if (error) {
      console.error("Error en Supabase:", error)
      throw error
    }
    return data
  },

  // Función maestra para actualizar cualquier campo de un material
  async updateMaterialField(id, field, value) {
    const { data, error } = await supabase
      .from('materials')
      .update({ [field]: value })
      .eq('id', id)

    if (error) throw error
    return data
  }

    
    

    
    


  
}
