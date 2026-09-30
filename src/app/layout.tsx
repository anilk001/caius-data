import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { MIN_RECORDS, priceCents } from '@/lib/pricing'
import { formatUsd } from '@/lib/utils'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://caiusdata.com'

// The cheapest sale there is, from the rate card. Metadata once quoted a
// starting price and a range of company counts long after both had stopped
// being true; a search result is the first thing a buyer reads, so it states
// no count at all and takes its price from the only place prices live.
const FROM = formatUsd(priceCents(MIN_RECORDS)!)

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Caius Data — US importer buyer lists for Indian exporters',
    template: '%s · Caius Data',
  },
  description:
    `Search US importers by HS code and buy a one-time CSV of the buyer companies we hold. No subscription. From ${FROM}.`,
  keywords: [
    'US importer list',
    'HS code buyers',
    'export leads India',
    'customs manifest data',
    'buyer list CSV',
  ],
  openGraph: {
    type: 'website',
    siteName: 'Caius Data',
    title: 'Find the US companies already importing your product',
    description:
      `One-time buyer lists from ${FROM}. Search by HS code, download a CSV, keep it forever.`,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Caius Data — US importer buyer lists',
    description: `One-time buyer lists from ${FROM}. No subscription.`,
  },
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
        <div className="flex min-h-dvh flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  )
}
