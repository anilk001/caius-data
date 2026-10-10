import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SearchDashboard } from '@/components/search/search-dashboard'
import { Skeleton } from '@/components/ui/skeleton'
import { FREE_SAMPLE_ROWS } from '@/lib/packs'
import { MIN_RECORDS, priceCents } from '@/lib/pricing'
import { formatUsd } from '@/lib/utils'

// "Packs from $19" sat here, typed by hand, long after the rate card started
// at $9. The price comes from the rate card or it is not stated.
const FROM = formatUsd(priceCents(MIN_RECORDS)!)

export const metadata: Metadata = {
  title: 'Search US importers by HS code',
  description:
    `Search US importers by HS code or product. Free to search, ${FREE_SAMPLE_ROWS} free sample rows, buyer lists from ${FROM}. No subscription.`,
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
