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

    if (response && typeof response.clone === 'function') {
      const jsonResponse = response.clone()
      const textResponse = response.clone()

      let parsedJson = null
      try {
        parsedJson = await jsonResponse.json()
      } catch {
        // Response may be plain text.
      }

      if (parsedJson?.error) {
        throw new Error(parsedJson.error)
      }

      let errorText = ''
      try {
        errorText = await textResponse.text()
      } catch {
        // Fall through to the original Supabase error.
      }

      if (errorText) {
        throw new Error(errorText)
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

  async recordPurchase(purchaseHeader, items, payment, idempotencyKey, purchaseType) {
    return invokeErpOperation('record_purchase', {
      purchase_header: purchaseHeader,
      items,
      purchase_type: purchaseType,
      ...(payment ? { payment } : {}),
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
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
