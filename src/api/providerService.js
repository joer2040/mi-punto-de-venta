import { supabase } from '../lib/supabase'

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
    console.warn('No se pudo registrar audit_log para proveedores:', error)
  }
}

export const providerService = {
  async getProviders() {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .order('name', { ascending: true })

    if (error) throw error
    return data
  },

  async createProvider(providerData) {
    const { data, error } = await supabase
      .from('providers')
      .insert([providerData])
      .select()
      .single()

    if (error) throw error

    await logAuditEvent({
      entityType: 'provider',
      entityId: data.id,
      eventType: 'provider_created',
      newValues: data,
      notes: 'Alta de proveedor desde el maestro de proveedores',
      performedBy: 'provider_master',
    })

    return data
  },
}
