import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PublicCompany } from '@/types/database'
import { PUBLIC_COMPANY_COLUMNS } from '@/types/database'
import { isHs4, normalizeHs4 } from '@/lib/hs4'

export { normalizeHs4 }

export const MAX_SEARCH_LIMIT = 500

export interface SearchFilters {
  keyword?: string | null
  hs4?: string | null
  port?: string | null
  state?: string | null
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
  const limit = Math.min(Math.max(options.limit ?? 50, 1), MAX_SEARCH_LIMIT)
  const offset = Math.max(options.offset ?? 0, 0)

  let query = supabase
    .from('companies')
    .select(PUBLIC_COMPANY_COLUMNS.join(','), {
      count: options.withCount ? 'estimated' : undefined,
    })

  const hs4 = normalizeHs4(options.hs4)
  if (hs4) {
    query = query.eq('hs4_code', hs4)
  }

  const keyword = options.keyword ? sanitizeKeyword(options.keyword) : ''
  if (keyword) {
    // A bare 4-digit keyword is almost always someone typing an HS code into
    // the wrong box; treat it as one rather than returning nothing.
    const asHs4 = normalizeHs4(keyword)
    if (!hs4 && asHs4 && isHs4(keyword)) {
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

  const { data, error, count } = await query
    .order('shipment_count', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    throw new Error(`Company search failed: ${error.message}`)
  }

  return {
    rows: (data ?? []) as unknown as PublicCompany[],
    total: count ?? null,
  }
}
