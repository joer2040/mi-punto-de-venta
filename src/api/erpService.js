import { supabase } from '../lib/supabase'

const invokeErpOperation = async (action, payload) => {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('erp-operations', {
    body: {
      action,
      ...payload,
    },
    headers: session?.access_token
      ? {
          Authorization: `Bearer ${session.access_token}`,
        }
      : undefined,
  })

  if (error) {
    const response = error.context

    if (response) {
      try {
        const errorBody = await response.json()
        throw new Error(errorBody?.error || error.message)
      } catch {
        try {
          const errorText = await response.text()
          throw new Error(errorText || error.message)
        } catch {
          throw new Error(error.message)
        }
      }
    }

    throw new Error(error.message)
  }

  if (data?.error) throw new Error(data.error)
  return data
}

export const erpService = {
  async createProvider(providerData) {
    return invokeErpOperation('create_provider', {
      provider: providerData,
    })
  },

  async recordPurchase(purchaseHeader, items) {
    return invokeErpOperation('record_purchase', {
      purchase_header: purchaseHeader,
      items,
    })
  },

  async createMaterial(formData) {
    return invokeErpOperation('create_material', {
      material: formData,
    })
  },

  async updatePrice(materialId, centerId, newPrice) {
    return invokeErpOperation('update_price', {
      material_id: materialId,
      center_id: centerId,
      new_price: newPrice,
    })
  },

  async updateManualStock(materialId, centerId, newStock, options = {}) {
    return invokeErpOperation('update_manual_stock', {
      material_id: materialId,
      center_id: centerId,
      new_stock: newStock,
      options,
    })
  },

  async updateMaterialField(id, field, value) {
    return invokeErpOperation('update_material_field', {
      material_id: id,
      field,
      value,
    })
  },

  async checkMaterialMovement(payload) {
    return invokeErpOperation('check_material_movement', payload)
  },

  async postMaterialMovement(payload) {
    return invokeErpOperation('post_material_movement', payload)
  },
}
