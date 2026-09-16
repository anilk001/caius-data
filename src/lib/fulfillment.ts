import 'server-only'

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchCompaniesFull } from '@/lib/search'
import { csvFilename, toCsv, withBom } from '@/lib/csv'
import { PACK_COLUMNS } from '@/lib/export-columns'
import { mergeByBuyer, overFetch } from '@/lib/buyers'
import { MIN_RECORDS } from '@/lib/pricing'
import { MAX_SEARCH_LIMIT } from '@/lib/search-limits'
import { sendPackDeliveryEmail } from '@/lib/email'
import { EXPORT_BUCKET } from '@/lib/env'

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7

interface DeliveryContext {
  email: string
  filters: { keyword: string | null; hs4: string | null; port: string | null; state: string | null }
  recordCount: number
  session: Stripe.Checkout.Session
}

/**
 * Sign the stored pack, email it, and mark the order delivered.
 *
 * Shared by a first-time fulfilment and by a retry resuming after the email
 * failed, so a resumed order takes exactly the same path rather than a
 * near-copy that can drift.
 */
async function deliverExistingPack(
  orderId: string,
  storagePath: string,
  ctx: DeliveryContext,
) {
  const admin = createAdminClient()

  const filename = storagePath.split('/').pop() ?? 'caius-data.csv'
  const { data: signed, error: signError } = await admin.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(storagePath, SEVEN_DAYS_SECONDS, { download: filename })

  if (signError || !signed?.signedUrl) {
    throw new Error(`Signed URL failed: ${signError?.message ?? 'no url returned'}`)
  }

  const expiresAt = new Date(Date.now() + SEVEN_DAYS_SECONDS * 1000)

  await sendPackDeliveryEmail({
    to: ctx.email,
    downloadUrl: signed.signedUrl,
    expiresAt,
    hs4: ctx.filters.hs4 || 'all',
    keyword: ctx.filters.keyword,
    recordCount: ctx.recordCount,
    amountCents: ctx.session.amount_total ?? 0,
    packName: 'Buyer',
  })

  await admin
    .from('orders')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      download_expires_at: expiresAt.toISOString(),
    })
    .eq('id', orderId)

  return { emailed: true as const }
}

/**
 * Turn a completed Checkout session into a delivered buyer pack.
 *
 * Idempotent by design: Stripe retries webhooks for up to three days, and a
 * duplicate delivery means the buyer gets two emails and we pay twice for the
 * storage. The `orders.stripe_session_id` unique index plus the status check
 * below make a replay a no-op.
 */
export async function fulfillCheckoutSession(session: Stripe.Checkout.Session) {
  const admin = createAdminClient()
  const sessionId = session.id

  const metadata = session.metadata ?? {}
  const recordCount = Number.parseInt(
    metadata.record_count || String(MIN_RECORDS),
    10,
  )

  const filters = {
    keyword: metadata.keyword || null,
    hs4: metadata.hs4 || null,
    port: metadata.port || null,
    state: metadata.state || null,
  }

  const email =
    session.customer_details?.email ||
    session.customer_email ||
    null

  if (!email) {
    throw new Error(`Checkout session ${sessionId} completed with no email address`)
  }

  // --- 1. Claim the order ---------------------------------------------------
  const { data: existing, error: lookupError } = await admin
    .from('orders')
    .select('id, status, csv_storage_path, record_count')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Order lookup failed: ${lookupError.message}`)
  }

  // Only `delivered` is terminal. `fulfilled` means the CSV exists but the
  // email did not go out, which is exactly the state a Resend failure leaves
  // behind — and Stripe is retrying precisely because we returned a 500.
  // Short-circuiting on `fulfilled` would make those retries no-ops and strand
  // the order forever, so it resumes at the delivery step instead of rebuilding
  // a file that is already in storage.
  if (existing?.status === 'delivered') {
    return { orderId: existing.id, alreadyDelivered: true as const }
  }

  if (existing?.status === 'fulfilled' && existing.csv_storage_path) {
    const redelivered = await deliverExistingPack(
      existing.id,
      existing.csv_storage_path,
      {
        email,
        filters,
        // The count of rows ACTUALLY in the stored file, not the number
        // ordered. A list ordered at 200 whose filters matched 43 companies
        // delivers 43, and the email must say 43 — the metadata figure is
        // what was ordered, not what was sent.
        recordCount: existing.record_count ?? recordCount,
        session,
      },
    )
    return { orderId: existing.id, resumedDelivery: true as const, ...redelivered }
  }

  let orderId = existing?.id
  if (!orderId) {
    // Checkout's pending insert failed, or this session was created elsewhere.
    const { data: created, error: insertError } = await admin
      .from('orders')
      .insert({
        stripe_session_id: sessionId,
        customer_email: email,
        hs4_code: filters.hs4 ?? '0000',
        record_count: recordCount,
        amount_cents: session.amount_total ?? 0,
        status: 'pending',
        query_params: { records: recordCount, ...filters },
      })
      .select('id')
      .single()

    if (insertError) throw new Error(`Order insert failed: ${insertError.message}`)
    orderId = created.id
  } else {
    // Stripe has the verified email; the pending row may only have a placeholder.
    await admin
      .from('orders')
      .update({
        customer_email: email,
        amount_cents: session.amount_total ?? 0,
      })
      .eq('id', orderId)
  }

  // --- 2. Assemble the records ---------------------------------------------
  // One query, every column, already ranked by volume. The withheld columns
  // (street address, port, first/last seen) are what the buyer is paying for.
  //
  // Over-fetch, then merge: a list sold as N companies must contain N companies
  // a buyer can count, and one buyer filing from several warehouses is several
  // rows in `companies`. Asking for exactly N and merging afterwards would
  // deliver fewer than N every time a buyer has two addresses.
  const { rows: matched } = await searchCompaniesFull(admin, {
    ...filters,
    limit: overFetch(recordCount, MAX_SEARCH_LIMIT),
  })

  const ordered = mergeByBuyer(matched).slice(0, recordCount)

  if (ordered.length === 0) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', orderId)
    throw new Error(
      `Order ${orderId} matched zero companies — refund required for ${email}`,
    )
  }

  // The order row carries what was actually delivered, not what was ordered.
  // The delivery email reads its count from here, so a short pack says so
  // rather than claiming a number the file does not contain.
  //
  // Checkout already priced the list on the count it saw, so a
  // shortfall here means the two counts disagreed — the data changed between
  // payment and fulfilment. That is an overcharge, and it is recorded on the
  // order and logged rather than left for the buyer to notice.
  if (ordered.length !== recordCount) {
    const overcharged = ordered.length < recordCount
    if (overcharged) {
      console.error(
        `Order ${orderId}: paid for ${recordCount} companies, delivered ` +
          `${ordered.length}. Refund the difference to ${email}.`,
      )
    }
    await admin
      .from('orders')
      .update({
        record_count: ordered.length,
        query_params: {
          records: recordCount,
          ...filters,
          ...(overcharged
            ? { paid_for: recordCount, refund_owed_for: recordCount - ordered.length }
            : {}),
        },
      })
      .eq('id', orderId)
  }

  const csv = withBom(toCsv(ordered, PACK_COLUMNS))

  // --- 3. Upload to private storage ----------------------------------------
  const filename = csvFilename([
    'caius-data',
    filters.hs4,
    filters.keyword,
    `${ordered.length}-importers`,
  ])
  const storagePath = `${orderId}/${filename}`

  const { error: uploadError } = await admin.storage
    .from(EXPORT_BUCKET)
    .upload(storagePath, new Blob([csv], { type: 'text/csv' }), {
      contentType: 'text/csv',
      upsert: true,
    })

  if (uploadError) throw new Error(`CSV upload failed: ${uploadError.message}`)

  // Mark fulfilled before attempting delivery. The signed URL is minted inside
  // deliverExistingPack, so a retry that resumes there gets a fresh 7-day link
  // rather than inheriting one that started expiring on the first attempt.
  await admin
    .from('orders')
    .update({
      status: 'fulfilled',
      record_count: ordered.length,
      csv_storage_path: storagePath,
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // --- 4. Deliver -----------------------------------------------------------
  // The pack is stored and the order marked `fulfilled` before this point, so
  // a Resend outage delays the receipt without losing the purchase — /success
  // still serves the download. The 500 this throws makes Stripe retry, and the
  // retry resumes here rather than rebuilding the file.
  await deliverExistingPack(orderId, storagePath, {
    email,
    filters,
    recordCount: ordered.length,
    session,
  })

  return { orderId, recordCount: ordered.length, emailed: true as const }
}
