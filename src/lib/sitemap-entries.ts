/**
 * What the sitemap lists, and when each URL really changed.
 *
 * Pure, so the rules are tested without a database:
 *
 * - No `?hs4=` URLs. /search renders its rows in the browser, so those URLs
 *   were empty pages; a heading is listed through its /buyers page instead.
 * - A /buyers page is listed only while it is live (MIN_RECORDS buyers or
 *   more), with its own data date.
 * - Drafts are not listed: noindexed comparison pages and guide outlines.
 * - `lastModified` is a real date — the newest data load or the content
 *   date — never the time of the request. Where no real date is known it is
 *   left out rather than invented.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

import { absoluteUrl } from './seo.ts'

export interface SitemapEntry {
  url: string
  lastModified?: string
  changeFrequency: 'weekly' | 'monthly' | 'yearly'
  priority: number
}

export interface SitemapInputs {
  /** Live /buyers pages with their data date. */
  buyers: { path: string; updatedAt: string | null }[]
  /** Published comparison pages. */
  comparisons: { path: string }[]
  comparisonsUpdated: string
  /** Published guides. */
  guides: { path: string; updated: string }[]
  aboutUpdated: string
  legal: { path: string; updated: string }[]
}

function latest(values: (string | null | undefined)[]): string | undefined {
  return values.reduce<string | undefined>((hi, v) => (v && (!hi || v > hi) ? v : hi), undefined)
}

/**
 * Postgres timestamps arrive as "2026-10-06 10:00:55.836852+00", with
 * microseconds. Timestamps go out as plain ISO; a bare date stays a date.
 */
function w3cDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toISOString()
}

export function sitemapEntries(input: SitemapInputs): SitemapEntry[] {
  // The home page, /packs and /search show counts read from the data, so
  // they change when the data does.
  const data = latest(input.buyers.map((b) => b.updatedAt))
  const entry = (
    path: string,
    lastModified: string | null | undefined,
    changeFrequency: SitemapEntry['changeFrequency'],
    priority: number,
  ): SitemapEntry => ({
    url: absoluteUrl(path),
    ...(lastModified ? { lastModified: w3cDate(lastModified) } : {}),
    changeFrequency,
    priority,
  })

  return [
    entry('/', data, 'weekly', 1),
    entry('/packs', data, 'weekly', 0.8),
    entry('/search', data, 'weekly', 0.6),
    entry('/about', input.aboutUpdated, 'monthly', 0.5),
    ...input.buyers.map((b) => entry(b.path, b.updatedAt, 'weekly', 0.9)),
    ...input.comparisons.map((c) => entry(c.path, input.comparisonsUpdated, 'monthly', 0.6)),
    ...(input.guides.length
      ? [
          entry('/guides', latest(input.guides.map((g) => g.updated)), 'monthly', 0.5),
          ...input.guides.map((g) => entry(g.path, g.updated, 'monthly', 0.6)),
        ]
      : []),
    ...input.legal.map((l) => entry(l.path, l.updated, 'yearly', 0.2)),
  ]
}
