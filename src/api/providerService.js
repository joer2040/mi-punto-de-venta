import { supabase } from '../lib/supabase'
import { erpService } from './erpService'

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
    const response = await erpService.createProvider(providerData)
    return response.provider
  },
}
