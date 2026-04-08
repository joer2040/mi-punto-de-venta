import { supabase } from '../lib/supabase'

export const materialService = {
  // Esta función trae la misma tabla que vimos en el SQL Editor
  async getAllMaterials() {
    const { data, error } = await supabase
      .from('mat_center')
      .select(`
        cost,
        price,
        stk_min,
        materials (
          id,
          sku,
          name,
          conv_fact,
          categories ( name, def_tax ),
          uom_buy:uoms!materials_buy_uom_fkey ( abbr ),
          uom_sell:uoms!materials_sell_uom_fkey ( abbr )
        ),
        centers ( name )
      `)
    
    if (error) throw error
    return data
  }
}