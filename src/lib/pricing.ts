/**
 * Pay for the companies you get.
 *
 * Fixed packs forced two bad choices: charge full price for a short file, or
 * refuse a niche that holds 120 companies when the pack says 200. Pricing per
 * company removes the question — there is no pack size left to fall short of.
 *
 * The rate tapers. A flat per-company price looks fair and is not: at 15,916
 * companies, fifteen cents each comes to $2,389, which is dearer than the
 * annual subscriptions this product exists to undercut. It also ignores what
 * the buyer is getting — the 5,000th company on a lane ships a fraction of what
 * the 50th does, and nobody will ever email it. So the price per company falls
 * as the list deepens.
 *
 * There is no cap. The taper alone keeps even the largest realistic lane below
 * the market: the whole of HS 6204 across every origin, 15,916 companies, comes
 * to $867 against Volza's $1,500 a year. A list would have to exceed 28,500
 * companies before this pricing met the cheapest annual subscription.
 */

/** Included in the base price. Below this, no sale — see MIN_RECORDS. */
export const BASE_RECORDS = 50
export const BASE_CENTS = 900

/**
 * Cents per company beyond the base, by band. `upTo` is inclusive and the
 * final band is open-ended.
 */
export const RATE_BANDS: ReadonlyArray<{ upTo: number | null; cents: number }> = [
  { upTo: 500, cents: 15 },
  { upTo: 1000, cents: 9 },
  { upTo: null, cents: 5 },
]

/** The fewest companies worth selling. Below this we do not sell at all. */
export const MIN_RECORDS = BASE_RECORDS

/**
 * Price for `records` companies, in cents.
 *
 * Returns null when there are too few to sell, so a caller cannot mistake an
 * unsellable list for a free one.
 */
export function priceCents(records: number): number | null {
  if (!Number.isFinite(records) || records < MIN_RECORDS) return null

  let cents = BASE_CENTS
  let counted = BASE_RECORDS

  for (const band of RATE_BANDS) {
    const limit = band.upTo === null ? records : Math.min(records, band.upTo)
    if (limit > counted) {
      cents += (limit - counted) * band.cents
      counted = limit
    }
  }

  return cents
}

/**
 * Price per company at a given size, in cents. For showing the rate a buyer is
 * actually getting, which is the argument for taking the bigger list.
 */
export function perCompanyCents(records: number): number | null {
  const total = priceCents(records)
  return total === null ? null : total / records
}
