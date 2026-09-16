import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import {
  getPack,
  isTooSmallToSell,
  proratedAmountCents,
} from '@/lib/packs'
import { searchCompanies } from '@/lib/search'
import { mergeByBuyer, overFetch } from '@/lib/buyers'
import { MAX_SEARCH_LIMIT } from '@/lib/search-limits'
import type { CompanyRow } from '@/types/database'
import { checkoutSchema } from '@/lib/validation'
import { siteUrl } from '@/lib/env'
import { formatUsd } from '@/lib/utils'
import { getConfigStatus } from '@/lib/config-status'

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

  // Fail before Stripe rather than inside it. Without this the missing-key
  // error surfaces as an opaque 500 the buyer cannot act on, and which takes
  // a trip through the server logs to diagnose.
  const config = getConfigStatus()
  if (!config.canTakeOrders) {
    console.error(
      '[api/checkout] refusing checkout, service not configured:',
      [...config.database.missing, ...config.payments.missing].join(', '),
    )
    return NextResponse.json(
      {
        error:
          'Checkout is temporarily unavailable and you have not been charged. ' +
          'Please try again shortly, or email support@caiusdata.com.',
        code: 'not_configured',
      },
      { status: 503 },
    )
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
    //
    // This asks "is there at least one?", not "how many?". An estimated count
    // falls back to the query planner, whose statistics are stale immediately
    // after a bulk ingest — so a freshly loaded table can report zero and make
    // us refuse a sale we could perfectly well fulfil. Fetching one row is both
    // cheaper and exact.
    //
    // It also asks how many DISTINCT buyers there are, not how many rows. One
    // buyer filing from three warehouses is three rows and one company, and the
    // pack is sold by companies. Charging for 200 and delivering 183 is a
    // refund and a chargeback, so the shortfall is priced before payment, not
    // discovered after it.
    const anon = await createClient()
    const { rows: available } = await searchCompanies(anon, {
      ...filters,
      limit: overFetch(pack.recordCount, MAX_SEARCH_LIMIT),
    })

    if (available.length === 0) {
      return NextResponse.json(
        { error: 'No companies match those filters, so there is nothing to sell you.' },
        { status: 409 },
      )
    }

    // mergeByBuyer wants full rows; the public projection carries every field it
    // reads, so the cast is safe and avoids handing the anon client '*'.
    const buyers = mergeByBuyer(available as unknown as CompanyRow[])
    const deliverable = Math.min(buyers.length, pack.recordCount)

    // Short niche, pro-rata price. 120 of 200 companies costs 120/200 of the
    // pack, never the full price for a short file.
    const amountCents = proratedAmountCents(pack, deliverable)

    if (isTooSmallToSell(pack, deliverable)) {
      return NextResponse.json(
        {
          error:
            `Only ${deliverable} ${deliverable === 1 ? 'company matches' : 'companies match'} ` +
            `those filters — too few to be worth selling. Try a broader HS code or drop a filter.`,
        },
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
            unit_amount: amountCents,
            product_data: {
              name: `Caius Data — ${pack.name} pack (${deliverable} companies)`,
              description: `${nicheLabel}. One-time purchase, delivered as CSV. No subscription.`,
            },
          },
        },
      ],
      // Everything fulfilment needs, so the webhook is self-contained.
      metadata: {
        pack_id: pack.id,
        record_count: String(deliverable),
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
      record_count: deliverable,
      amount_cents: amountCents,
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
    // A short reference the buyer can quote and we can grep the logs for.
    // Without it a support email says only "it didn't work".
    const reference = Math.random().toString(36).slice(2, 8).toUpperCase()
    console.error(`[api/checkout] ref=${reference}`, error)

    return NextResponse.json(
      {
        error:
          `Something went wrong starting checkout for the ${formatUsd(pack.amountCents)} pack. ` +
          `You have not been charged. Quote reference ${reference} if you email support@caiusdata.com.`,
        reference,
      },
      { status: 500 },
    )
  }
}
