/**
 * Per-page metadata.
 *
 * Every page used to inherit the home page's og:url, og:title and
 * og:description from the root layout, so a link to /packs shared on WhatsApp
 * previewed as the home page and Google saw nine pages claiming one URL. Each
 * page now builds its own block here, and every block carries a canonical.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

/**
 * The one origin every canonical points at.
 *
 * Not `siteUrl()`: that falls back to Railway's generated domain when SITE_URL
 * is unset, and a canonical naming web-production-aa1c3.up.railway.app would
 * tell Google the real site is a duplicate. `www` is the served host — see
 * CANONICAL_HOST in next.config.ts, which this must match.
 */
export const CANONICAL_ORIGIN = 'https://www.caiusdata.com'

export const SITE_NAME = 'Caius Data'

/** Absolute URL on the canonical origin for a path such as `/packs`. */
export function absoluteUrl(path: string): string {
  if (!path || path === '/') return CANONICAL_ORIGIN
  return `${CANONICAL_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}

export interface PageSeo {
  /** The page's own title, without the " · Caius Data" suffix. */
  title: string
  description: string
  /** Path on the canonical origin, e.g. `/buyers/us-importers-...`. */
  path: string
  /** Use the title as given, without the site-name suffix. */
  absoluteTitle?: boolean
  /** `noindex, follow` — for drafts and empty results. */
  noindex?: boolean
  /** og:title and twitter:title, when they should differ from the title. */
  socialTitle?: string
}

/**
 * The metadata object for one page.
 *
 * The return type is structural rather than Next's `Metadata`, so this module
 * stays importable from plain Node; Next accepts it as-is.
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle,
  noindex,
  socialTitle,
}: PageSeo) {
  const fullTitle = socialTitle ?? (absoluteTitle ? title : `${title} · ${SITE_NAME}`)
  const url = absoluteUrl(path)

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website' as const,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url,
    },
    twitter: {
      card: 'summary_large_image' as const,
      title: fullTitle,
      description,
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  }
}
