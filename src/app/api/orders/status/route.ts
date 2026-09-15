import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPORT_BUCKET } from '@/lib/env'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7

/**
 * Backs the /success page. The buyer lands there before Stripe's webhook has
 * necessarily arrived, so the page polls this until the pack is ready and then
 * offers the download directly — no waiting on email.
 *
 * Only the Stripe session id (which the buyer just came back with in the URL)
 * unlocks the order, and the response never includes anything beyond that one
 * order's own state.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id')?.trim()

  if (!sessionId || !sessionId.startsWith('cs_')) {
    return NextResponse.json({ error: 'Invalid session id.' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const { data: order, error } = await admin
      .from('orders')
      .select('status, record_count, hs4_code, customer_email, csv_storage_path')
      .eq('stripe_session_id', sessionId)
      .maybeSingle()

    if (error) throw new Error(error.message)

    if (!order) {
      return NextResponse.json({ status: 'unknown' }, { status: 404 })
    }

    let downloadUrl: string | null = null
    if (order.csv_storage_path) {
      const { data: signed } = await admin.storage
        .from(EXPORT_BUCKET)
        .createSignedUrl(order.csv_storage_path, SEVEN_DAYS_SECONDS, {
          download: true,
        })
      downloadUrl = signed?.signedUrl ?? null
    }

    return NextResponse.json({
      status: order.status,
      recordCount: order.record_count,
      hs4: order.hs4_code,
      // Masked — enough for the buyer to confirm where the pack was sent.
      email: maskEmail(order.customer_email),
      downloadUrl,
    })
  } catch (error) {
    console.error('[api/orders/status]', error)
    return NextResponse.json({ error: 'Could not load your order.' }, { status: 500 })
  }
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return '•••'
  const head = local.slice(0, 2)
  return `${head}${'•'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}
