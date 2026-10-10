import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Order pages carry a Stripe session id; never let them be indexed.
        disallow: ['/api/', '/success'],
      },
    ],
    // The canonical host, not siteUrl(): on Railway's generated domain that
    // would point crawlers at a sitemap of the duplicate.
    sitemap: absoluteUrl('/sitemap.xml'),
  }
}

