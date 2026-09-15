import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { getPack } from '@/lib/packs'
import { searchCompanies } from '@/lib/search'
import { checkoutSchema } from '@/lib/validation'
import { siteUrl } from '@/lib/env'
import { formatUsd } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Create a Stripe Checkout session for a buyer pack.
 *
 * Price comes from the server-side PACKS table, never from the request body —
 * the client only names a pack id. A pending `orders` row is written before the
 * redirect so the webhook has something to reconcile against even if the buyer
 * closes the tab mid-payment.
 */
export async function POST(request: NextRequest) {
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const parsed = checkoutSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid checkout request.', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { packId, email, ...filters } = parsed.data
  const pack = getPack(packId)
  if (!pack) {
    return NextResponse.json({ error: 'Unknown pack.' }, { status: 400 })
  }

  if (!filters.hs4 && !filters.keyword) {
    return NextResponse.json(
      { error: 'Choose an HS code or keyword before buying a pack.' },
      { status: 400 },
    )
  }

  try {
    // Refuse to sell an empty pack. Checking against the same anon-visible rows
    // the buyer previewed keeps the promise on the button honest.
    const anon = await createClient()
    const { total } = await searchCompanies(anon, {
      ...filters,
      limit: 1,
      withCount: true,
    })

    if (total !== null && total === 0) {
      return NextResponse.json(
        { error: 'No companies match those filters, so there is nothing to sell you.' },
        { status: 409 },
      )
    }

    const origin = siteUrl()
    const nicheLabel = [filters.keyword, filters.hs4 ? `HS ${filters.hs4}` : null]
      .filter(Boolean)
      .join(' · ')

    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Stripe collects and verifies the email; it is the delivery address for
      // the pack, so we never take it on trust from the browser.
      ...(email ? { customer_email: email } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: pack.amountCents,
            product_data: {
              name: `Caius Data — ${pack.name} pack (${pack.recordCount} US importers)`,
              description: `${nicheLabel}. One-time purchase, delivered as CSV. No subscription.`,
            },
          },
        },
      ],
      // Everything fulfilment needs, so the webhook is self-contained.
      metadata: {
        pack_id: pack.id,
        record_count: String(pack.recordCount),
        hs4: filters.hs4 ?? '',
        keyword: filters.keyword ?? '',
        port: filters.port ?? '',
        state: filters.state ?? '',
      },
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/search?${new URLSearchParams(
        Object.entries(filters).filter(([, v]) => Boolean(v)) as [string, string][],
      ).toString()}`,
      // Buyers are outside the US; let Stripe collect what tax rules need.
      billing_address_collection: 'auto',
      allow_promotion_codes: true,
    })

    // Pending row. `stripe_session_id` is UNIQUE, which is what makes the
    // webhook safe to replay.
    const admin = createAdminClient()
    const { error } = await admin.from('orders').insert({
      stripe_session_id: session.id,
      customer_email: email ?? 'pending@checkout.invalid',
      hs4_code: filters.hs4 ?? '0000',
      record_count: pack.recordCount,
      amount_cents: pack.amountCents,
      status: 'pending',
      query_params: {
        pack_id: pack.id,
        keyword: filters.keyword ?? null,
        hs4: filters.hs4 ?? null,
        port: filters.port ?? null,
        state: filters.state ?? null,
      },
    })

    if (error) {
      // Don't strand the buyer — the webhook creates the row if it is missing.
      console.error('[api/checkout] pending order insert failed', error)
    }

    return NextResponse.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    console.error('[api/checkout]', error)
    return NextResponse.json(
      { error: `Could not start checkout for the ${formatUsd(pack.amountCents)} pack.` },
      { status: 500 },
    )
  }
}
