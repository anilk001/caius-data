import { NextResponse, type NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { requireEnv } from '@/lib/env'
import { fulfillCheckoutSession } from '@/lib/fulfillment'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Stripe webhook receiver.
 *
 * Signature verification needs the exact bytes Stripe signed, so the body is
 * read with `request.text()` before anything parses it.
 */
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature.' }, { status: 400 })
  }

  const body = await request.text()

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(
      body,
      signature,
      requireEnv('STRIPE_WEBHOOK_SECRET'),
    )
  } catch (error) {
    console.error('[webhooks/stripe] signature verification failed', error)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        // `payment_status` guards against async payment methods that complete
        // the session before the money actually lands.
        if (session.payment_status === 'paid') {
          const result = await fulfillCheckoutSession(session)
          console.info('[webhooks/stripe] fulfilled', event.id, result)
        } else {
          console.info(
            '[webhooks/stripe] session completed but unpaid, waiting',
            session.id,
          )
        }
        break
      }

      case 'checkout.session.async_payment_succeeded': {
        const result = await fulfillCheckoutSession(event.data.object)
        console.info('[webhooks/stripe] async fulfilled', event.id, result)
        break
      }

      default:
        // Acknowledged and ignored — Stripe stops retrying on a 2xx.
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[webhooks/stripe] handler failed', event.id, event.type, error)
    // 500 makes Stripe retry with backoff, which is what we want: fulfilment is
    // idempotent, so a transient Supabase or Resend blip self-heals.
    return NextResponse.json({ error: 'Fulfilment failed.' }, { status: 500 })
  }
}
