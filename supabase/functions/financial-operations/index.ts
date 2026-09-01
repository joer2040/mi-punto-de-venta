// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createFinancialHandler } from './handler.js'

Deno.serve(
  createFinancialHandler({
    createAdminClient:   (url, key)       => createClient(url, key),
    createRequestClient: (url, key, opts) => createClient(url, key, opts),
    getEnv:              (key)            => Deno.env.get(key) ?? null,
  })
)
