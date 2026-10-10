/**
 * The figures a /buyers/[slug] page states, from the merged buyers of one
 * heading.
 *
 * Pure, so the arithmetic is tested over fixtures rather than through a mocked
 * database. Input is the output of mergeByBuyer: one entry per company, in the
 * order search ranks them, which is the order checkout delivers them.
 */

export interface StatsBuyer {
  name: string
  city: string | null
  state: string | null
  primary_port: string | null
  product_description: string | null
  shipment_count: number | null
  first_seen: string | null
  last_seen: string | null
  updated_at?: string | null
}

export interface Ranked {
  name: string
  buyers: number
}

export interface HeadingStats<T extends StatsBuyer = StatsBuyer> {
  /** Distinct buyers — the number checkout would charge for. */
  buyers: number
  topStates: Ranked[]
  topPorts: Ranked[]
  firstSeen: string | null
  lastSeen: string | null
  /** When the heading's rows were last written, for "Data updated: Month YYYY". */
  updatedAt: string | null
  /** The highest-ranked buyers, for the sample table. */
  sample: T[]
}

/**
 * Rank values by how many buyers carry them, ties broken alphabetically so
 * the page is stable between renders. Blank values are skipped rather than
 * counted as a place called "".
 */
export function topBy<T>(items: T[], pick: (item: T) => string | null, limit = 5): Ranked[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = pick(item)?.trim()
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, buyers]) => ({ name, buyers }))
}

function minIso(values: (string | null | undefined)[]): string | null {
  return values.reduce<string | null>((lo, v) => (v && (!lo || v < lo) ? v : lo), null)
}

function maxIso(values: (string | null | undefined)[]): string | null {
  return values.reduce<string | null>((hi, v) => (v && (!hi || v > hi) ? v : hi), null)
}

export function summariseHeading<T extends StatsBuyer>(buyers: T[], sampleSize = 10): HeadingStats<T> {
  return {
    buyers: buyers.length,
    topStates: topBy(buyers, (b) => b.state?.toUpperCase() ?? null),
    topPorts: topBy(buyers, (b) => b.primary_port),
    firstSeen: minIso(buyers.map((b) => b.first_seen)),
    lastSeen: maxIso(buyers.map((b) => b.last_seen)),
    updatedAt: maxIso(buyers.map((b) => b.updated_at)),
    sample: buyers.slice(0, sampleSize),
  }
}

/** "October 2026", for the "Data updated" line. */
export function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
