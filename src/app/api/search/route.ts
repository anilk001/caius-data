import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchCompanies } from '@/lib/search'
import { filtersFromSearchParams, hasAnyFilter } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const MAX_PAGE = 20

/**
 * Public company search. Runs on the anon key, so it can only ever return rows
 * the RLS policy already makes world-readable — there is no privileged data to
 * leak here even if the filters are abused.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const filters = filtersFromSearchParams(params)

  const page = Math.min(
    Math.max(Number.parseInt(params.get('page') ?? '1', 10) || 1, 1),
    MAX_PAGE,
  )

  try {
    const supabase = await createClient()
    const { rows, total } = await searchCompanies(supabase, {
      ...filters,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
      withCount: true,
    })

    return NextResponse.json(
      {
        rows,
        total,
        page,
        pageSize: PAGE_SIZE,
        hasMore: rows.length === PAGE_SIZE && page < MAX_PAGE,
        filtered: hasAnyFilter(filters),
      },
      { headers: { 'cache-control': 'public, max-age=30, s-maxage=60' } },
    )
  } catch (error) {
    console.error('[api/search]', error)
    return NextResponse.json(
      { error: 'Search is temporarily unavailable. Please try again.' },
      { status: 500 },
    )
  }
}
