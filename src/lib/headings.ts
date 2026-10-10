import 'server-only'

import { cache } from 'react'
import { createPublicClient } from '@/lib/supabase/admin'
import { searchHeading, type HeadingCompany } from '@/lib/search'
import { mergeByBuyer, type Buyer } from '@/lib/buyers'
import { summariseHeading, type HeadingStats } from '@/lib/heading-stats'
import { BUYER_PAGES, type BuyerPage } from '@/lib/buyer-pages'
import { MIN_RECORDS } from '@/lib/pricing'
import type { CompanyRow } from '@/types/database'

export type HeadingBuyer = Buyer & Pick<HeadingCompany, 'updated_at'>

/**
 * Everything a /buyers page states about one heading, read through the same
 * query path and the same merge checkout charges on — so the count in the H1
 * and the count in the price box are the count on the invoice.
 *
 * Throws on a failed read. A caller must not turn that into zero: a page that
 * 404s because the database blinked tells Google the heading is gone.
 *
 * `cache` dedupes within one render, where the page, its metadata and its
 * JSON-LD all ask for the same heading.
 */
export const loadHeading = cache(async (hs4: string): Promise<HeadingStats<HeadingBuyer>> => {
  const rows = await searchHeading(createPublicClient(), { hs4 })
  // mergeByBuyer keeps every field of the first row it sees for a buyer, so
  // updated_at rides through; the latest across a buyer's rows is not needed,
  // only the latest across the heading.
  const buyers = mergeByBuyer(rows as unknown as CompanyRow[]) as HeadingBuyer[]
  return summariseHeading(buyers)
})

export interface ListedPage {
  page: BuyerPage
  buyers: number
  updatedAt: string | null
}

/**
 * The pages that are live right now: MIN_RECORDS or more buyers.
 *
 * A heading whose count fails is left out and logged, not listed with a
 * guessed number — a sitemap or a related link pointing at a page that may be
 * empty is worse than one link fewer for an hour.
 */
export const listedBuyerPages = cache(async (): Promise<ListedPage[]> => {
  const results = await Promise.all(
    BUYER_PAGES.map(async (page) => {
      try {
        const stats = await loadHeading(page.hs4)
        return { page, buyers: stats.buyers, updatedAt: stats.updatedAt }
      } catch (error) {
        console.error('[buyers] heading count failed', page.hs4, error)
        return null
      }
    }),
  )
  return results.filter((r): r is ListedPage => r !== null && r.buyers >= MIN_RECORDS)
})
