import 'server-only'

import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchCompanies } from '@/lib/search'
import { csvFilename, toCsv, withBom } from '@/lib/csv'
import { PACK_COLUMNS } from '@/lib/export-columns'
import { getPack } from '@/lib/packs'
import { sendPackDeliveryEmail } from '@/lib/email'
import { EXPORT_BUCKET } from '@/lib/env'
import type { CompanyRow } from '@/types/database'

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7

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
  const packId = metadata.pack_id || 'starter-200'
  const pack = getPack(packId)
  const recordCount = Number.parseInt(
    metadata.record_count || String(pack?.recordCount ?? 200),
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
    .select('id, status')
    .eq('stripe_session_id', sessionId)
    .maybeSingle()

  if (lookupError) {
    throw new Error(`Order lookup failed: ${lookupError.message}`)
  }

  if (existing && (existing.status === 'fulfilled' || existing.status === 'delivered')) {
    return { orderId: existing.id, alreadyFulfilled: true as const }
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
        amount_cents: session.amount_total ?? pack?.amountCents ?? 0,
        status: 'pending',
        query_params: { pack_id: packId, ...filters },
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
        amount_cents: session.amount_total ?? pack?.amountCents ?? 0,
      })
      .eq('id', orderId)
  }

  // --- 2. Assemble the records ---------------------------------------------
  const { rows } = await searchCompanies(admin, {
    ...filters,
    limit: recordCount,
  })

  if (rows.length === 0) {
    await admin.from('orders').update({ status: 'failed' }).eq('id', orderId)
    throw new Error(
      `Order ${orderId} matched zero companies — refund required for ${email}`,
    )
  }

  // searchCompanies returns the public projection; the paid CSV needs the
  // withheld columns too, so re-read the full rows by id in rank order.
  const ids = rows.map((r) => r.id)
  const { data: fullRows, error: fullError } = await admin
    .from('companies')
    .select('*')
    .in('id', ids)

  if (fullError) throw new Error(`Pack assembly failed: ${fullError.message}`)

  const byId = new Map((fullRows ?? []).map((r) => [r.id, r as CompanyRow]))
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is CompanyRow => Boolean(r))

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

  const { data: signed, error: signError } = await admin.storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(storagePath, SEVEN_DAYS_SECONDS, { download: filename })

  if (signError || !signed?.signedUrl) {
    throw new Error(`Signed URL failed: ${signError?.message ?? 'no url returned'}`)
  }

  const expiresAt = new Date(Date.now() + SEVEN_DAYS_SECONDS * 1000)

  await admin
    .from('orders')
    .update({
      status: 'fulfilled',
      record_count: ordered.length,
      csv_storage_path: storagePath,
      download_expires_at: expiresAt.toISOString(),
      fulfilled_at: new Date().toISOString(),
    })
    .eq('id', orderId)

  // --- 4. Deliver -----------------------------------------------------------
  // The pack is already built and stored at this point. If email fails the
  // order stays `fulfilled`, and /success still serves the download — so a
  // Resend outage delays the receipt, it does not lose the purchase.
  await sendPackDeliveryEmail({
    to: email,
    downloadUrl: signed.signedUrl,
    expiresAt,
    hs4: filters.hs4 || 'all',
    keyword: filters.keyword,
    recordCount: ordered.length,
    amountCents: session.amount_total ?? pack?.amountCents ?? 0,
    packName: pack?.name ?? 'Buyer',
  })

  await admin
    .from('orders')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', orderId)

  return { orderId, alreadyFulfilled: false as const, recordCount: ordered.length }
}
