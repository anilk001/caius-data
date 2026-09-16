import type { CompanyRow } from '@/types/database'

/**
 * Collapse company rows into distinct buyers.
 *
 * A pack sold as "200 companies" has to contain 200 companies a customer can
 * count. The database does not give that for free: `companies.company_key` is
 * (name, city, state, hs4), so one buyer filing from three warehouses under two
 * headings is six rows. Charge for 200 and a buyer who sorts by name finds Old
 * Navy three times and asks for their money back — rightly.
 *
 * Merging here rather than in the schema keeps the underlying rows intact. The
 * locations are worth having; they just belong in one row of a pack instead of
 * three, where they read as extra detail rather than as padding.
 */

/**
 * Legal suffixes stripped before matching, so "Acme Inc" and "Acme LLC" are one
 * buyer. Mirrors `_SUFFIXES` in scripts/company_cleaning.py — the ingest and the
 * pack must agree on what counts as the same company, or the count we promise
 * and the count we deliver drift apart.
 */
const LEGAL_SUFFIXES = new Set([
  'incorporated', 'inc', 'corporation', 'corp', 'company', 'co',
  'limited', 'ltd', 'llc', 'lp', 'llp', 'plc', 'pllc',
  'holdings', 'holding', 'group', 'intl', 'international',
  'pvt', 'private', 'pte',
])

/**
 * "AZAZIE SG PTE. LTD/ AZAZIE INC." is one buyer filed under two names; the left
 * side is the contracting entity. Both sides must be substantial, or "MAERSK
 * A/S" would become a company called "Maersk A".
 */
const ALIAS_SLASH = /^([^/]{3,}?)\s*\/\s*(.{3,})$/

export function buyerKey(name: string | null | undefined): string {
  if (!name) return ''

  const alias = ALIAS_SLASH.exec(name.trim())
  const base = (alias ? alias[1] : name)
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .replace(/[^a-z0-9&\s-]/g, ' ')

  const tokens = base.split(/\s+/).filter(Boolean)
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  return tokens.join(' ')
}

export interface Buyer extends CompanyRow {
  /** Every "City, ST" this buyer files from, in the order first seen. */
  locations: string[]
  /** Every HS4 heading matched, for keyword packs that span more than one. */
  hs4Codes: string[]
  /** How many underlying rows merged into this one. */
  mergedRows: number
}

function locationOf(row: CompanyRow): string | null {
  const parts = [row.city, row.state].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a < b ? a : b
}

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/**
 * Merge rows into buyers, preserving the input order.
 *
 * Input is already ranked by shipment volume, and a buyer's rank is its best
 * row's rank. Re-sorting on the merged total would be defensible but would
 * reorder the preview a visitor saw before paying, and matching what was
 * previewed matters more than a marginally better ranking.
 */
export function mergeByBuyer(rows: CompanyRow[]): Buyer[] {
  const byKey = new Map<string, Buyer>()

  for (const row of rows) {
    const key = buyerKey(row.name) || `#${row.id}`
    const existing = byKey.get(key)

    if (!existing) {
      const location = locationOf(row)
      byKey.set(key, {
        ...row,
        locations: location ? [location] : [],
        hs4Codes: row.hs4_code ? [row.hs4_code] : [],
        mergedRows: 1,
      })
      continue
    }

    existing.mergedRows += 1
    existing.shipment_count = (existing.shipment_count ?? 0) + (row.shipment_count ?? 0)
    existing.first_seen = earliest(existing.first_seen, row.first_seen)
    existing.last_seen = latest(existing.last_seen, row.last_seen)

    const location = locationOf(row)
    if (location && !existing.locations.includes(location)) {
      existing.locations.push(location)
    }
    if (row.hs4_code && !existing.hs4Codes.includes(row.hs4_code)) {
      existing.hs4Codes.push(row.hs4_code)
    }

    // A field blank on one filing is filled from another rather than lost.
    existing.address ??= row.address
    existing.city ??= row.city
    existing.state ??= row.state
    existing.primary_port ??= row.primary_port
    existing.product_description ??= row.product_description

    // The fuller filing names the whole group, so it becomes the display name.
    if (row.name.length > existing.name.length) existing.name = row.name
  }

  return [...byKey.values()]
}

/**
 * Rows to request in order to end up with `wanted` distinct buyers.
 *
 * Merging and the forwarder filters both shrink the result, so asking for
 * exactly `wanted` guarantees a short pack. Over-fetching costs one larger
 * query and nothing else — the rows are already in Postgres, bought long ago.
 */
export function overFetch(wanted: number, max: number): number {
  return Math.min(Math.max(Math.ceil(wanted * 1.6), wanted + 25), max)
}
