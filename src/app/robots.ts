import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/env'

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
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}

export const dynamic = 'force-dynamic'
