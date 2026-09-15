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
