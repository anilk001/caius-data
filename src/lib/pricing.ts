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
 * as the list deepens, and stops entirely at the cap.
 */

/** Included in the base price. Below this, no sale — see MIN_RECORDS. */
export const BASE_RECORDS = 50
export const BASE_CENTS = 900

/**
 * Cents per company beyond the base, by band. `upTo` is inclusive and the
 * final band is open-ended.
 */
export const RATE_BANDS: ReadonlyArray<{ upTo: number | null; cents: number }> = [
  { upTo: 250, cents: 15 },
  { upTo: 1000, cents: 8 },
  { upTo: null, cents: 4 },
]

/**
 * Nothing costs more than this, however deep the lane.
 *
 * It is what makes a whole lane sellable: "every US buyer of HS 6204 sourcing
 * from Vietnam, 7,592 companies, $199" is a headline. The same list at an
 * untapered rate would be $1,140 and nobody would click it.
 */
export const CAP_CENTS = 19_900

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

  return Math.min(cents, CAP_CENTS)
}

/** Companies at which the cap takes over, so the UI can say "everything above". */
export function recordsAtCap(): number {
  let records = MIN_RECORDS
  // Walk the bands rather than inverting them: the arithmetic stays correct if
  // a rate or a band edge is edited, which is the point of keeping it in data.
  let cents = BASE_CENTS
  for (const band of RATE_BANDS) {
    const span = band.upTo === null ? Infinity : band.upTo - records
    const affordable = Math.floor((CAP_CENTS - cents) / band.cents)
    if (affordable <= span) return records + affordable
    cents += span * band.cents
    records = band.upTo as number
  }
  return records
}
