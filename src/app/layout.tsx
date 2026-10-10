import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { MIN_RECORDS, priceCents } from '@/lib/pricing'
import { formatUsd } from '@/lib/utils'
import { CANONICAL_ORIGIN, SITE_NAME } from '@/lib/seo'
import { organizationLd, websiteLd } from '@/lib/structured-data'
import { JsonLd } from '@/components/json-ld'
import { OPERATOR } from '@/components/legal-page'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// The cheapest sale there is, from the rate card. Metadata once quoted a
// starting price and a range of company counts long after both had stopped
// being true; a search result is the first thing a buyer reads, so it states
// no count at all and takes its price from the only place prices live.
const FROM = formatUsd(priceCents(MIN_RECORDS)!)

/**
 * Site-wide defaults only. Each page sets its own title, description,
 * canonical, Open Graph and Twitter block through `pageMetadata` in
 * src/lib/seo.ts — a default og:url here would have every page that forgot
 * claim to be the home page, which is what every page used to do.
 */
export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: {
    default: `US Importer Buyer Lists by HS Code from ${FROM} — ${SITE_NAME}`,
    template: `%s · ${SITE_NAME}`,
  },
  description:
    `Search US importers by HS code and buy a one-time CSV of the buyer companies we hold. No subscription. From ${FROM}.`,
  openGraph: { type: 'website', siteName: SITE_NAME },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <JsonLd data={[organizationLd(OPERATOR), websiteLd()]} />
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
