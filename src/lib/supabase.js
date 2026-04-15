import { createClient } from '@supabase/supabase-js'

// Estas variables ya las configuramos en tu .env.local
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("⚠️ ¡Faltan las llaves de Supabase en el archivo .env!")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)