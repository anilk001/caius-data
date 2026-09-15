import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchCompanies } from '@/lib/search'
import { csvFilename, toCsv, withBom } from '@/lib/csv'
import { SAMPLE_COLUMNS } from '@/lib/export-columns'
import { FREE_SAMPLE_ROWS } from '@/lib/packs'
import { filtersFromSearchParams } from '@/lib/validation'

export const dynamic = 'force-dynamic'

/**
 * "Download 3 free sample rows".
 *
 * No email wall, no account. The point is to let an exporter in Tiruppur prove
 * the file opens in their spreadsheet before they spend a rupee. Every field
 * here is already visible on the search page; the paid columns are stubbed with
 * a marker so the buyer can see the shape of what they get.
 */
export async function GET(request: NextRequest) {
  const filters = filtersFromSearchParams(request.nextUrl.searchParams)

  try {
    const supabase = await createClient()
    const { rows } = await searchCompanies(supabase, {
      ...filters,
      limit: FREE_SAMPLE_ROWS,
    })

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'No companies match those filters yet.' },
        { status: 404 },
      )
    }

    const csv = withBom(toCsv(rows, SAMPLE_COLUMNS))
    const filename = csvFilename([
      'caius-data-sample',
      filters.hs4,
      filters.keyword,
    ])

    return new NextResponse(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    console.error('[api/sample-csv]', error)
    return NextResponse.json(
      { error: 'Could not build your sample file. Please try again.' },
      { status: 500 },
    )
  }
}
