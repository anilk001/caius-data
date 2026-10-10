/**
 * schema.org JSON-LD builders.
 *
 * Pure functions over values the page already renders, so the markup cannot
 * claim a price, a count or an answer the visitor does not see — Google drops
 * rich results whose markup and page disagree, and a Product price that is
 * not the checkout price is a misleading offer.
 *
 * Kept free of any `@/` or server-only import so it can be unit-tested under
 * `node --test`.
 */

import { CANONICAL_ORIGIN, SITE_NAME, absoluteUrl } from './seo.ts'

type Ld = Record<string, unknown>

const CONTEXT = 'https://schema.org'
const ORG_ID = `${CANONICAL_ORIGIN}/#organization`

export function organizationLd(operator: { legalName: string; supportEmail: string }): Ld {
  return {
    '@context': CONTEXT,
    '@type': 'Organization',
    '@id': ORG_ID,
    name: SITE_NAME,
    legalName: operator.legalName,
    url: CANONICAL_ORIGIN,
    logo: absoluteUrl('/logo.png'),
    email: operator.supportEmail,
    address: {
      '@type': 'PostalAddress',
      addressRegion: 'WY',
      addressCountry: 'US',
    },
  }
}

export function websiteLd(): Ld {
  return {
    '@context': CONTEXT,
    '@type': 'WebSite',
    '@id': `${CANONICAL_ORIGIN}/#website`,
    name: SITE_NAME,
    url: CANONICAL_ORIGIN,
    publisher: { '@id': ORG_ID },
  }
}

export function breadcrumbLd(items: { name: string; path: string }[]): Ld {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  }
}

/**
 * A buyer list as a Product with one Offer: the whole list at the rate-card
 * price. `priceCents` must be the number the page prints, from priceCents().
 */
export function productLd(product: {
  name: string
  description: string
  path: string
  sku: string
  priceCents: number
}): Ld {
  const url = absoluteUrl(product.path)
  return {
    '@context': CONTEXT,
    '@type': 'Product',
    name: product.name,
    description: product.description,
    sku: product.sku,
    url,
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'USD',
      price: (product.priceCents / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      url,
      seller: { '@id': ORG_ID },
    },
  }
}

export function faqLd(faqs: { question: string; answer: string }[]): Ld {
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  }
}

/**
 * Serialise for a <script> tag. `<` is escaped so a value containing
 * "</script>" — a company name, one day — cannot close the tag early.
 */
export function serialiseLd(data: Ld | Ld[]): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
