import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'
import { HS_SUGGESTIONS } from '@/lib/hs-codes'
import { PROMO_PACKS, packSearchHref } from '@/lib/promo-packs'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const now = new Date()

  const staticPages = ['', '/packs', '/search', '/terms', '/privacy', '/refunds'].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: path === '' ? 1 : 0.7,
  }))

  // One indexable landing URL per launch niche — this is the organic entry point
  // for "6204 importers usa" style searches.
  const hsPages = HS_SUGGESTIONS.map((s) => ({
    url: `${base}/search?hs4=${s.code}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }))

  // A sector pack is a broader query than any single heading, and it is the URL
  // a visitor is most likely to be sent by someone else.
  const packPages = PROMO_PACKS.map((pack) => ({
    url: `${base}${packSearchHref(pack)}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.65,
  }))

  return [...staticPages, ...packPages, ...hsPages]
}

export const dynamic = 'force-dynamic'
