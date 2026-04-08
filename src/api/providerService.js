import { supabase } from '../lib/supabase';

export const providerService = {
  async getProviders() {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data;
  },

  async createProvider(providerData) {
    const { data, error } = await supabase
      .from('providers')
      .insert([providerData])
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
