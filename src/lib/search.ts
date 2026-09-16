import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyRow, Database, PublicCompany } from '@/types/database'
import { PUBLIC_COMPANY_COLUMNS } from '@/types/database'
import { isHs4, normalizeHs4, parseHs4List } from '@/lib/hs4'
import { MAX_PACK_RECORDS, MAX_SEARCH_LIMIT, PAGE_SIZE } from '@/lib/search-limits'
import { collectPaged, countPaged } from '@/lib/paging'

export { normalizeHs4, MAX_SEARCH_LIMIT, MAX_PACK_RECORDS }


/**
 * The country every pack is sold as, and the only one search returns.
 *
 * The vendor's `country_imp` says US on shipments unladen in Brampton,
 * Ontario — the feed is US-facing, not a statement about where the buyer sits.
 * Gap (Canada) Inc, Old Navy (Canada) Inc, PVH Canada, SML Canada Acquisition
 * and American Eagle Outfitters Canada all arrived that way on real HS 620442
 * records. They are genuine buyers of Indian apparel and they are not American,
 * and every page on this site says US importers.
 *
 * The rows stay in the database with their real country, so a Canadian lane can
 * be sold later off data already paid for. They are filtered here, once, on the
 * only path that reads companies — public search, pack assembly and the buyer
 * count all go through runCompanyQuery, so the rows a customer previews are the
 * rows they are charged for and the rows they receive.
 */
export const PACK_COUNTRY = 'US'

export interface SearchFilters {
  keyword?: string | null
  /** One or many HS4 headings. More headings, more buyers — and a bigger sale. */
  hs4?: string[] | string | null
  port?: string | null
  state?: string | null
  /**
   * Overrides PACK_COUNTRY. Nothing in the storefront sets it; it exists so a
   * second lane can be assembled without editing this file.
   */
  country?: string | null
}

export interface SearchOptions extends SearchFilters {
  limit?: number
  offset?: number
  /** Ask PostgREST for an exact count. Off for paged reads, on for the preview. */
  withCount?: boolean
}

export interface SearchResult {
  rows: PublicCompany[]
  total: number | null
}

/**
 * Escape a user keyword for `websearch_to_tsquery`. PostgREST passes the string
 * straight through, so quotes and backslashes are the things that can break the
 * query — everything else `websearch_to_tsquery` already treats as literal.
 */
function sanitizeKeyword(raw: string): string {
  return raw.replace(/["\\]/g, ' ').trim().slice(0, 120)
}

/**
 * Query the public `companies` table.
 *
 * Runs against whichever client is passed in: the anon client for visitor-facing
 * search, the service-role client for order fulfilment. Both see the same rows —
 * `companies` is world-readable — so results stay identical to what the buyer
 * previewed before paying.
 */
export async function searchCompanies(
  supabase: SupabaseClient<Database>,
  options: SearchOptions,
): Promise<SearchResult> {
  const { data, error, count } = await runCompanyQuery(
    supabase,
    PUBLIC_COMPANY_COLUMNS.join(','),
    { ...options, limit: Math.min(options.limit ?? 50, MAX_SEARCH_LIMIT) },
  )

  if (error) {
    throw new Error(`Company search failed: ${error.message}`)
  }

  return {
    rows: (data ?? []) as unknown as PublicCompany[],
    total: count ?? null,
  }
}

/**
 * The same query with every column, for order fulfilment.
 *
 * Fulfilment used to call searchCompanies and then re-read the full rows by id.
 * That second query put up to 500 UUIDs into a PostgREST `in.(...)` filter —
 * about 18 KB of URL, past the gateway's request-line limit. The 500-record
 * pack would have failed *after* the buyer paid.
 *
 * Pages rather than issuing one capped query, because pricing has no ceiling:
 * a buyer may take a whole lane, and the largest seen is 15,916 companies
 * against a single-request limit of 500. A capped query would have charged for
 * the lane and delivered the first 500 rows of it.
 *
 * Only ever call this with a service-role client: it returns the withheld
 * columns (street address, port, date range) that paid packs are made of.
 */
export async function searchCompaniesFull(
  supabase: SupabaseClient<Database>,
  options: SearchOptions,
): Promise<{ rows: CompanyRow[] }> {
  const rows = await collectPages<CompanyRow>(supabase, '*', options)
  return { rows }
}

/**
 * Read up to `options.limit` rows, a page at a time.
 *
 * The paging arithmetic lives in src/lib/paging.ts, where it can be tested
 * without a database behind it.
 */
async function collectPages<T>(
  supabase: SupabaseClient<Database>,
  columns: string,
  options: SearchOptions,
): Promise<T[]> {
  return collectPaged<T>(
    async (offset, size) => {
      const { data, error } = await runCompanyQuery(supabase, columns, {
        ...options,
        limit: size,
        offset: offset + Math.max(options.offset ?? 0, 0),
        withCount: false,
      })
      if (error) throw new Error(`Pack assembly failed: ${error.message}`)
      return (data ?? []) as unknown as T[]
    },
    { wanted: options.limit ?? 50, pageSize: PAGE_SIZE, ceiling: MAX_PACK_RECORDS },
  )
}

/**
 * Count distinct buyers a filter can supply, up to `wanted`.
 *
 * Checkout needs this before it can price anything, and a row count is not it:
 * one buyer filing from three warehouses is three rows.
 */
export async function countBuyers(
  supabase: SupabaseClient<Database>,
  options: SearchOptions,
  wanted: number,
  merge: (rows: PublicCompany[]) => { length: number },
): Promise<number> {
  return countPaged<PublicCompany>(
    async (offset, size) => {
      const { data, error } = await runCompanyQuery(
        supabase,
        PUBLIC_COMPANY_COLUMNS.join(','),
        { ...options, limit: size, offset, withCount: false },
      )
      if (error) throw new Error(`Company search failed: ${error.message}`)
      return (data ?? []) as unknown as PublicCompany[]
    },
    { wanted, pageSize: PAGE_SIZE, ceiling: MAX_PACK_RECORDS },
    merge,
  )
}

/** Shared filter, ordering and pagination logic for both projections. */
function runCompanyQuery(
  supabase: SupabaseClient<Database>,
  columns: string,
  options: SearchOptions,
) {
  // Public search stays capped; the paid path pages instead and passes its own
  // page size, which is never larger than PAGE_SIZE.
  const limit = Math.min(Math.max(options.limit ?? 50, 1), Math.max(MAX_SEARCH_LIMIT, PAGE_SIZE))
  const offset = Math.max(options.offset ?? 0, 0)

  let query = supabase.from('companies').select(columns, {
    count: options.withCount ? 'estimated' : undefined,
  })

  // Country is normalised to an ISO code by scripts/company_cleaning.py before
  // it is ever written, so this is an equality test and not a list of
  // spellings that has to stay in step with the vendor's.
  query = query.eq('country', (options.country ?? PACK_COUNTRY).trim().toUpperCase())

  const hs4Codes = parseHs4List(options.hs4)
  if (hs4Codes.length === 1) {
    query = query.eq('hs4_code', hs4Codes[0])
  } else if (hs4Codes.length > 1) {
    // A buyer importing under two of the chosen headings still comes back as
    // one row: mergeByBuyer collapses them and lists both codes.
    query = query.in('hs4_code', hs4Codes)
  }

  const keyword = options.keyword ? sanitizeKeyword(options.keyword) : ''
  if (keyword) {
    // A bare 4-digit keyword is almost always someone typing an HS code into
    // the wrong box; treat it as one rather than returning nothing.
    const asHs4 = normalizeHs4(keyword)
    if (hs4Codes.length === 0 && asHs4 && isHs4(keyword)) {
      query = query.eq('hs4_code', asHs4)
    } else {
      query = query.textSearch('search_tsv', keyword, {
        type: 'websearch',
        config: 'english',
      })
    }
  }

  if (options.port) {
    query = query.ilike('primary_port', `%${options.port.trim()}%`)
  }

  if (options.state) {
    query = query.ilike('state', options.state.trim())
  }

  // `name` breaks ties so the ranking is deterministic — a buyer who previews
  // a pack and then buys it gets the same rows in the same order. `id` breaks
  // the remaining ties, which matters now that lists are paged: two rows with
  // the same count and name would otherwise sort arbitrarily, and a row could
  // appear on two pages or on none.
  return query
    .order('shipment_count', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)
}
