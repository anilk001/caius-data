import { NextResponse } from 'next/server'
import { getConfigStatus } from '@/lib/config-status'

export const dynamic = 'force-dynamic'

/**
 * Railway healthcheck target, and a one-glance view of what is actually wired.
 *
 * Deliberately does not touch the database: a Supabase blip should not make
 * Railway cycle the container. It reports only whether variables are present,
 * never their values.
 *
 * Always returns 200, even when integrations are missing. A misconfigured
 * deploy is still a running deploy, and failing the healthcheck would roll it
 * back rather than let you see what is wrong.
 */
export function GET() {
  const config = getConfigStatus()

  return NextResponse.json(
    {
      ok: true,
      service: 'caius-data',
      canTakeOrders: config.canTakeOrders,
      integrations: {
        database: config.database,
        payments: config.payments,
        email: config.email,
        site: config.site,
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
