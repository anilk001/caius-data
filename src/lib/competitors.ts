/**
 * The comparison pages: /importgenius-alternative, /volza-alternative,
 * /panjiva-alternative.
 *
 * Every fact about a competitor lives here, each with a `verified` flag, and
 * nothing about them is written into the page. Their prices change and are
 * often quote-only, and a comparison page that misstates a rival's price is a
 * false-advertising complaint, not a marketing asset. So:
 *
 * - An unverified fact renders as "Not yet verified", never as a guess.
 * - A page with any unverified fact is `noindex` and stays out of the sitemap
 *   (`isPublished`). Filling in the facts and setting `verified: true` is the
 *   whole of publishing it.
 *
 * TODO(Anil): verify each value below against the competitor's current public
 * pricing page, note the date checked in `checkedOn`, then set
 * `verified: true`. Do not copy a number from a review site or a forum.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

export interface Fact {
  value: string
  verified: boolean
}

export interface Competitor {
  slug: 'importgenius' | 'volza' | 'panjiva'
  name: string
  /** What the product is, in neutral terms — for the intro. */
  what: string
  pricingModel: Fact
  minimumSpend: Fact
  exportLimits: Fact
  accountNeeded: Fact
  /** ISO date the facts were last checked against the competitor's site. */
  checkedOn: string | null
}

const UNVERIFIED: Fact = { value: '', verified: false }

export const COMPETITORS: Competitor[] = [
  {
    slug: 'importgenius',
    name: 'ImportGenius',
    what: 'a trade-data platform built on US Customs and other countries’ shipment records',
    // TODO(Anil): verify against ImportGenius's own public pricing page.
    pricingModel: UNVERIFIED,
    minimumSpend: UNVERIFIED,
    exportLimits: UNVERIFIED,
    accountNeeded: UNVERIFIED,
    checkedOn: null,
  },
  {
    slug: 'volza',
    name: 'Volza',
    what: 'a global import-export data platform covering many countries’ customs records',
    // TODO(Anil): verify against Volza's own public pricing page.
    pricingModel: UNVERIFIED,
    minimumSpend: UNVERIFIED,
    exportLimits: UNVERIFIED,
    accountNeeded: UNVERIFIED,
    checkedOn: null,
  },
  {
    slug: 'panjiva',
    name: 'Panjiva',
    what: 'a supply-chain intelligence platform from S&P Global Market Intelligence',
    // TODO(Anil): Panjiva pricing is usually quote-only; record what the
    // public site says, or "Quote on request", and the date checked.
    pricingModel: UNVERIFIED,
    minimumSpend: UNVERIFIED,
    exportLimits: UNVERIFIED,
    accountNeeded: UNVERIFIED,
    checkedOn: null,
  },
]

export function findCompetitor(slug: string): Competitor | null {
  return COMPETITORS.find((c) => c.slug === slug) ?? null
}

export function competitorPath(c: Competitor): string {
  return `/${c.slug}-alternative`
}

export function competitorFacts(c: Competitor): Fact[] {
  return [c.pricingModel, c.minimumSpend, c.exportLimits, c.accountNeeded]
}

/** Indexable only once every fact about the competitor has been checked. */
export function isPublished(c: Competitor): boolean {
  return c.checkedOn !== null && competitorFacts(c).every((f) => f.verified && f.value.trim() !== '')
}

export function comparisonHeading(c: Competitor): string {
  return `${c.name} Alternative for Small Exporters — Pay per List, Not per Year`
}
