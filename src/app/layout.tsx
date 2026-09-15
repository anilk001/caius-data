import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://caiusdata.com'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Caius Data — US importer buyer lists for Indian exporters',
    template: '%s · Caius Data',
  },
  description:
    'Search US importers by HS code and buy a one-time CSV of 200–500 buyer companies. No subscription. From $19.',
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
      'One-time buyer packs from $19. Search by HS code, download a CSV, keep it forever.',
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Caius Data — US importer buyer lists',
    description: 'One-time buyer packs from $19. No subscription.',
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
