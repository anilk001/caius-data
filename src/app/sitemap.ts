import type { MetadataRoute } from 'next'
import { listedBuyerPages } from '@/lib/headings'
import { buyerPageHref } from '@/lib/buyer-pages'
import { COMPETITORS, competitorPath, isPublished } from '@/lib/competitors'
import { guidePath, publishedGuides } from '@/lib/guides'
import { CONTENT_UPDATED } from '@/lib/content-dates'
import { sitemapEntries } from '@/lib/sitemap-entries'

/**
 * An hour. The sitemap reads every heading's count, which is too much work to
 * repeat for each crawler fetch and changes only when a lane is ingested.
 */
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // A failed read lists no /buyers pages for an hour rather than listing
  // pages that may be empty. listedBuyerPages already drops a single failed
  // heading; this catches the database being unreachable altogether.
  const listed = await listedBuyerPages().catch((error) => {
    console.error('[sitemap] heading counts failed', error)
    return []
  })

  return sitemapEntries({
    buyers: listed.map((l) => ({ path: buyerPageHref(l.page), updatedAt: l.updatedAt })),
    comparisons: COMPETITORS.filter(isPublished).map((c) => ({ path: competitorPath(c) })),
    comparisonsUpdated: CONTENT_UPDATED.comparisons,
    guides: publishedGuides().map((g) => ({ path: guidePath(g), updated: g.updated })),
    aboutUpdated: CONTENT_UPDATED.about,
    legal: [
      { path: '/terms', updated: CONTENT_UPDATED.terms },
      { path: '/privacy', updated: CONTENT_UPDATED.privacy },
      { path: '/refunds', updated: CONTENT_UPDATED.refunds },
    ],
  })
}
