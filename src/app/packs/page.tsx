import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createPublicClient } from '@/lib/supabase/admin'
import { countBuyers } from '@/lib/search'
import { mergeByBuyer } from '@/lib/buyers'
import type { CompanyRow } from '@/types/database'
import { BASE_CENTS, MIN_RECORDS, priceCents } from '@/lib/pricing'
import { MAX_PACK_RECORDS } from '@/lib/search-limits'
import { PROMO_PACKS, packSearchHref, type PromoPack } from '@/lib/promo-packs'
import { formatNumber, formatUsd } from '@/lib/utils'
import { pageMetadata } from '@/lib/seo'
import { buyerPageHref, type BuyerPage } from '@/lib/buyer-pages'
import { listedBuyerPages } from '@/lib/headings'
import { monthYear } from '@/lib/heading-stats'
import { breadcrumbLd, productLd } from '@/lib/structured-data'
import { JsonLd } from '@/components/json-ld'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = pageMetadata({
  title: 'Ready-made buyer packs by sector',
  description: `US companies importing garments, spices and more, from real US Customs records. Buyer packs from ${formatUsd(priceCents(MIN_RECORDS)!)}, no subscription.`,
  path: '/packs',
})

/**
 * Counts are read from the database, not written into the page.
 *
 * Ten minutes is a long time in a cache and no time at all in customs data:
 * nothing here changes between ingests, and a stale count is only ever stale
 * downwards, because a pack never shrinks. Recomputing on every request would
 * page the whole table once per tile for a number that moved last week.
 */
export const revalidate = 600

interface PackCount {
  pack: PromoPack
  /** Distinct companies, counted the way checkout counts them. Null if the
   *  count could not be read — never silently zero. */
  buyers: number | null
}

async function countPack(pack: PromoPack): Promise<PackCount> {
  try {
    const supabase = createPublicClient()
    // The same expression api/checkout uses to count what it charges for, so
    // the number on the tile and the number in the invoice cannot diverge.
    const buyers = await countBuyers(
      supabase,
      { hs4: pack.hs4 },
      MAX_PACK_RECORDS,
      (rows) => mergeByBuyer(rows as unknown as CompanyRow[]),
    )
    return { pack, buyers }
  } catch (error) {
    // One sector failing to count must not take the whole page down, but it
    // must not quietly become "coming soon" either — that is a page telling a
    // visitor we hold nothing when we may hold thousands. `buyers: null` is a
    // third state the card renders as an error, distinct from a real zero.
    console.error('[packs] count failed', pack.slug, error)
    return { pack, buyers: null }
  }
}

export default async function PacksPage() {
  const [counts, listed] = await Promise.all([
    Promise.all(PROMO_PACKS.map(countPack)),
    // A sector card links only to headings that are live; a failed read
    // drops the links, not the page.
    listedBuyerPages().catch(() => []),
  ])
  // The newest load across live headings. Absent, not guessed, when no
  // heading could be read.
  const updated = monthYear(
    listed
      .map((l) => l.updatedAt)
      .reduce<string | null>((hi, v) => (v && (!hi || v > hi) ? v : hi), null),
  )
  const headingsBySector = (slug: string): BuyerPage[] =>
    listed.filter((l) => l.page.sector === slug).map((l) => l.page)
  // Sectors we can actually sell come first; the rest stay visible, marked, so
  // a visitor can see what is coming rather than wonder why their trade is
  // missing.
  const ready = counts.filter((c) => c.buyers !== null && c.buyers >= MIN_RECORDS)
  const building = counts.filter((c) => c.buyers === null || c.buyers < MIN_RECORDS)

  // Only packs we can sell get an Offer, at the price the card prints.
  const products = ready.map(({ pack, buyers }) =>
    productLd({
      name: `${pack.title} — US importer buyer pack`,
      description: `${formatNumber(buyers)} US companies importing ${pack.blurb.toLowerCase().replace(/\.$/, '')}. One-time CSV download.`,
      path: `/packs#${pack.slug}`,
      sku: `pack-${pack.slug}`,
      priceCents: priceCents(buyers!)!,
    }),
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <JsonLd
        data={[
          ...products,
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Packs', path: '/packs' },
          ]),
        ]}
      />
      <header className="mb-10 max-w-2xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ready-made buyer packs
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          Pick the sector you export. Each pack lists US companies that
          already import these goods by sea, read from US Customs ocean
          manifests. Every number below is the count of separate
          US companies we hold for that sector right now — not a target, not
          a round number. You pay for what you receive.
        </p>
        {updated && (
          <p className="text-muted-foreground text-sm">Data updated: {updated}</p>
        )}
      </header>

      {ready.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ready.map((entry) => (
            <PackCard key={entry.pack.slug} {...entry} headings={headingsBySector(entry.pack.slug)} />
          ))}
        </div>
      )}

      {building.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-lg font-medium">Being built</h2>
          <p className="text-muted-foreground mb-4 text-sm">
            We sell a pack only once it holds at least {MIN_RECORDS} separate
            companies. These are on the way.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {building.map((entry) => (
              <PackCard key={entry.pack.slug} {...entry} headings={headingsBySector(entry.pack.slug)} />
            ))}
          </div>
        </section>
      )}

      <p className="text-muted-foreground mt-12 text-sm">
        Every pack is priced on the same rate card as a search you build
        yourself: {formatUsd(BASE_CENTS)} for the first {MIN_RECORDS} companies, then
        per company after that. There is no sector premium and no pack-only
        price.{' '}
        <Link href="/#pricing" className="underline underline-offset-4">
          See the rate card
        </Link>
        .
      </p>
    </div>
  )
}

function PackCard({ pack, buyers, headings }: PackCount & { headings: BuyerPage[] }) {
  const sellable = buyers !== null && buyers >= MIN_RECORDS
  const price = buyers === null ? null : priceCents(buyers)

  return (
    <div id={pack.slug} className="flex scroll-mt-20 flex-col rounded-xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{pack.title}</h3>
        {sellable ? (
          <Badge variant="secondary">{formatNumber(buyers)} companies</Badge>
        ) : (
          <Badge variant="outline">{buyers === null ? 'Unavailable' : 'Coming soon'}</Badge>
        )}
      </div>

      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
        {pack.blurb}
      </p>

      <p className="text-muted-foreground mt-3 font-mono text-xs">
        HS {pack.hs4.join(' · ')}
      </p>

      {headings.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {headings.map((heading) => (
            <li key={heading.slug}>
              <Link
                href={buyerPageHref(heading)}
                className="underline-offset-4 hover:underline"
              >
                US importers of {heading.productLower} (HS {heading.hs4})
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-auto pt-5">
        {sellable && price !== null ? (
          <>
            <p className="text-sm">
              <span className="text-2xl font-semibold">{formatUsd(price)}</span>{' '}
              <span className="text-muted-foreground">
                for all {formatNumber(buyers)}
              </span>
            </p>
            <Button asChild className="mt-3 w-full">
              <Link href={packSearchHref(pack)}>
                View the companies
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              {buyers === null
                ? 'Count unavailable right now — search the sector to see it.'
                : buyers === 0
                  ? 'No companies loaded yet.'
                  : `${formatNumber(buyers)} so far — we sell from ${MIN_RECORDS}.`}
            </p>
            <Button asChild variant="outline" className="mt-3 w-full">
              <Link href={packSearchHref(pack)}>Search this sector anyway</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
