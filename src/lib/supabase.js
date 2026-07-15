import { createClient } from '@supabase/supabase-js'

const resolveSupabaseConfig = () => {
  const isDev = import.meta.env.DEV
  const appEnv = import.meta.env.VITE_APP_ENV || (isDev ? 'development' : 'production')
  const backendEnv = import.meta.env.VITE_BACKEND_ENV || (isDev ? 'development' : 'production')

  if (!['development', 'production'].includes(backendEnv)) {
    throw new Error('VITE_BACKEND_ENV debe ser development o production.')
  }

  const candidates = backendEnv === 'development'
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

  const isProductionApp = appEnv === 'production'
  const isProductionBackend = backendEnv === 'production'
  const allowProdBackendInLocalDev =
    isDev && import.meta.env.VITE_ALLOW_PROD_BACKEND_IN_DEV === 'true'

  if (isProductionApp && !isProductionBackend) {
    throw new Error('VITE_APP_ENV=production requiere VITE_BACKEND_ENV=production.')
  }

  if (!isProductionApp && isProductionBackend && !allowProdBackendInLocalDev) {
    throw new Error(
      'Una aplicacion no productiva no puede usar el backend de produccion sin autorizacion local explicita.'
    )
  }

  if (!selected.url || !selected.key) {
    throw new Error(
      `Faltan variables de entorno ${backendEnv} para Supabase.`
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
