import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'
import { HS_SUGGESTIONS } from '@/lib/hs-codes'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const now = new Date()

  const staticPages = ['', '/search', '/terms', '/privacy', '/refunds'].map((path) => ({
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

  return [...staticPages, ...hsPages]
}

export const dynamic = 'force-dynamic'
