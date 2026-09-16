/**
 * Buyer packs. One-time purchase, no subscription — that is the whole pitch.
 *
 * `id` is what travels through Stripe metadata, so these keys are effectively
 * permanent. Change a price by editing `amountCents`; historical orders keep
 * the amount they were charged because it is snapshotted on the order row.
 */

export interface Pack {
  id: string
  name: string
  recordCount: number
  amountCents: number
  blurb: string
  highlight?: boolean
}

export const PACKS: Pack[] = [
  {
    id: 'starter-200',
    name: 'Starter',
    recordCount: 200,
    amountCents: 1900,
    blurb: 'Top 200 US importers for your HS code, ranked by shipment volume.',
  },
  {
    id: 'growth-350',
    name: 'Growth',
    recordCount: 350,
    amountCents: 2900,
    blurb: 'Widen the net to 350 buyers — enough for a full outreach quarter.',
    highlight: true,
  },
  {
    id: 'pro-500',
    name: 'Pro',
    recordCount: 500,
    amountCents: 4900,
    blurb: 'Every matching importer we hold, up to 500 companies.',
  },
]

export const DEFAULT_PACK_ID = 'starter-200'

export function getPack(id: string | null | undefined): Pack | undefined {
  if (!id) return undefined
  return PACKS.find((pack) => pack.id === id)
}

export const FREE_SAMPLE_ROWS = 3

/**
 * The smallest sale worth making, in cents.
 *
 * Stripe's own floor is 50 cents, but a $2 pack is not a business. Every sale
 * costs the same to support whatever it earned — the same refund risk, the same
 * inbox, the same chargeback exposure — and a tiny file sets an expectation of
 * what a Caius pack contains that the next buyer inherits. Below this we do not
 * sell at all rather than sell something thin.
 */
export const MIN_SALE_CENTS = 900

/**
 * What to charge when a niche holds fewer companies than the pack advertises.
 *
 * A pack is priced per company, so 120 of 200 costs 120/200 of the price. The
 * alternative — full price for a short file — is what a buyer notices on their
 * first purchase and never forgives, and the pack picker has always promised
 * that you are never charged for empty rows.
 *
 * Integer arithmetic, floored, so rounding can only ever go the buyer's way.
 */
export function proratedAmountCents(pack: Pack, deliverable: number): number {
  if (deliverable >= pack.recordCount) return pack.amountCents
  if (deliverable <= 0) return 0
  return Math.floor((pack.amountCents * deliverable) / pack.recordCount)
}

/** True when a short pack is not worth selling. */
export function isTooSmallToSell(pack: Pack, deliverable: number): boolean {
  return proratedAmountCents(pack, deliverable) < MIN_SALE_CENTS
}

/**
 * Fewest companies this pack can be sold with.
 *
 * Derived from MIN_SALE_CENTS rather than fixed, so changing the floor or a
 * pack's price moves this with it. Ceiling, because the pro-rata price floors:
 * one company short of this rounds down under the minimum.
 */
export function minCompaniesFor(pack: Pack): number {
  return Math.min(
    pack.recordCount,
    Math.ceil((MIN_SALE_CENTS * pack.recordCount) / pack.amountCents),
  )
}
