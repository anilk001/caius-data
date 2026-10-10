import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SearchDashboard } from '@/components/search/search-dashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { FREE_SAMPLE_ROWS } from '@/lib/packs'
import { MIN_RECORDS, priceCents } from '@/lib/pricing'
import { formatUsd } from '@/lib/utils'
import { pageMetadata } from '@/lib/seo'
import { buyerPageForHs4, buyerPageHref } from '@/lib/buyer-pages'
import { filtersFromSearchParams } from '@/lib/validation'
import { createPublicClient } from '@/lib/supabase/admin'
import { countBuyers } from '@/lib/search'
import { mergeByBuyer } from '@/lib/buyers'
import type { CompanyRow } from '@/types/database'

// "Packs from $19" sat here, typed by hand, long after the rate card started
// at $9. The price comes from the rate card or it is not stated.
const FROM = formatUsd(priceCents(MIN_RECORDS)!)

const BASE = {
  title: 'Search US importers by HS code',
  description:
    `Search US importers by HS code or product. Free to search, ${FREE_SAMPLE_ROWS} free sample rows, buyer lists from ${FROM}. No subscription.`,
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Every filtered view of /search is the same page to a crawler — the rows
 * arrive in the browser — so none of them is canonical in its own right.
 *
 * - One heading with a landing page that is live: canonical is that page,
 *   which carries the rows in its HTML.
 * - Anything else: canonical is /search.
 * - A heading or keyword that matches no company at all: `noindex, follow`.
 *   An empty result is a soft 404, and Google indexed several.
 *
 * A failed count changes nothing. An error is not evidence of an empty
 * result, and noindexing a heading because the database blinked would drop it
 * from the index for weeks.
 */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const raw = await searchParams
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  const filters = filtersFromSearchParams(params)

  let path = '/search'
  let noindex = false

  if (filters.hs4?.length || filters.keyword) {
    try {
      const buyers = await countBuyers(
        createPublicClient(),
        filters,
        MIN_RECORDS,
        (rows) => mergeByBuyer(rows as unknown as CompanyRow[]),
      )
      if (buyers === 0) noindex = true

      const onlyHeading =
        filters.hs4?.length === 1 && !filters.keyword && !filters.port && !filters.state
      const page = onlyHeading ? buyerPageForHs4(filters.hs4![0]) : null
      if (page && buyers >= MIN_RECORDS) path = buyerPageHref(page)
    } catch (error) {
      console.error('[search] metadata count failed', error)
    }
  }

  return pageMetadata({ ...BASE, path, noindex })
}

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Search US importers
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Every row is a company recorded on a customs filing as the buyer of goods
          imported into the US under this HS code. Search is free — you only pay
          when you want the full file.
        </p>
      </header>

      {/* useSearchParams needs a Suspense boundary during prerender. */}
      <Suspense fallback={<DashboardFallback />}>
        <SearchDashboard />
      </Suspense>
    </div>
  )
}

function DashboardFallback() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-36 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  )
}
