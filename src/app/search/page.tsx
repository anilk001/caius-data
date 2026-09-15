import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SearchDashboard } from '@/components/search/search-dashboard'
import { Skeleton } from '@/components/ui/skeleton'

export const metadata: Metadata = {
  title: 'Search US importers by HS code',
  description:
    'Filter US importer companies by product keyword, HS4 code and port of entry. Free to search, 3 free sample rows, packs from $19.',
}

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8 max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Search US importers
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Every row is a real US company that has taken delivery of goods under
          this HS code. Search is free — you only pay when you want the full file.
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
