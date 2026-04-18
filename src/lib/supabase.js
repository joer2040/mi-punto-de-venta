import { createClient } from '@supabase/supabase-js'

const resolveSupabaseConfig = () => {
  const isDev = import.meta.env.DEV
  const appEnv = import.meta.env.VITE_APP_ENV || (isDev ? 'development' : 'production')
  const backendEnv = import.meta.env.VITE_BACKEND_ENV || 'unknown'

  const candidates = isDev
    ? [
        {
          url: import.meta.env.VITE_SUPABASE_URL_DEV,
          key: import.meta.env.VITE_SUPABASE_ANON_KEY_DEV,
        },
        {
          url: import.meta.env.VITE_SUPABASE_URL_DEVELOPMENT,
          key: import.meta.env.VITE_SUPABASE_ANON_KEY_DEVELOPMENT,
        },
      ]
    : [
        {
          url: import.meta.env.VITE_SUPABASE_URL_PROD,
          key: import.meta.env.VITE_SUPABASE_ANON_KEY_PROD,
        },
        {
          url: import.meta.env.VITE_SUPABASE_URL_PRODUCTION,
          key: import.meta.env.VITE_SUPABASE_ANON_KEY_PRODUCTION,
        },
        {
          url: import.meta.env.VITE_SUPABASE_URL,
          key: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      ]

  const selected =
    candidates.find((candidate) => candidate.url && candidate.key) || {
      url: undefined,
      key: undefined,
    }

  const isProdBackendInDev = isDev && backendEnv === 'production'
  const allowProdBackendInDev = import.meta.env.VITE_ALLOW_PROD_BACKEND_IN_DEV === 'true'

  if (isDev && (!selected.url || !selected.key)) {
    throw new Error(
      'Faltan variables de entorno DEV para Supabase. Crea .env.development.local con VITE_SUPABASE_URL_DEV y VITE_SUPABASE_ANON_KEY_DEV.'
    )
  }

  if (isProdBackendInDev && !allowProdBackendInDev) {
    throw new Error(
      'Localhost esta intentando usar un backend de produccion. Configura variables DEV separadas o define VITE_ALLOW_PROD_BACKEND_IN_DEV=true de forma temporal.'
    )
  }

  return {
    supabaseUrl: selected.url,
    supabaseAnonKey: selected.key,
    appEnv,
    backendEnv,
  }
}

const { supabaseUrl, supabaseAnonKey, appEnv, backendEnv } = resolveSupabaseConfig()

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Faltan las llaves de Supabase para el ambiente activo.')
}

console.info(`Supabase client initialized for app=${appEnv} backend=${backendEnv}`)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
