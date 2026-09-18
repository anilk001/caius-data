import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { requireEnv } from '@/lib/env'

/**
 * Service-role client. Bypasses Row-Level Security, so it is the only way to
 * reach `shipments` and `orders`.
 *
 * `server-only` makes importing this from a Client Component a build error —
 * the service key must never reach a browser bundle.
 */
export function createAdminClient() {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-caius-client': 'server' } },
    },
  )
}

/**
 * Anon client with no cookies, for pages that are the same for everyone.
 *
 * `createClient` in ./server.ts reads cookies, which makes any route that
 * touches it dynamic — a cached, cacheable page like /packs then cannot render
 * at build time or hold a `revalidate` window. This reaches exactly what the
 * browser client reaches (RLS gives anon `companies` and nothing else), so
 * dropping the cookie jar costs no access and no safety.
 */
export function createPublicClient() {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-caius-client': 'public' } },
    },
  )
}
