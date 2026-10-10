import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, ChevronRight, Download, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  buyerPageFaqs,
  buyerPageHeading,
  buyerPageHref,
  findBuyerPage,
  maskCompanyName,
  productLine,
  relatedBuyerPages,
  type BuyerPage,
} from '@/lib/buyer-pages'
import { listedBuyerPages, loadHeading } from '@/lib/headings'
import { monthYear } from '@/lib/heading-stats'
import { findPromoPack } from '@/lib/promo-packs'
import { MIN_RECORDS, priceCents } from '@/lib/pricing'
import { FREE_SAMPLE_ROWS } from '@/lib/packs'
import { pageMetadata } from '@/lib/seo'
import { breadcrumbLd, faqLd, productLd } from '@/lib/structured-data'
import { JsonLd } from '@/components/json-ld'
import { formatDate, formatNumber, formatUsd } from '@/lib/utils'

/**
 * A day. The heading changes only when a lane is ingested, and a stale count
 * is only ever stale downwards — a heading never loses buyers between loads.
 */
export const revalidate = 86400

/** Headings that gain stock after a build render on first request. */
export const dynamicParams = true

/**
 * Prebuilt at deploy for every heading that is live then. A build without
 * database access prebuilds nothing and every page renders on demand instead,
 * which is slower once and otherwise identical.
 */
export async function generateStaticParams() {
  try {
    const listed = await listedBuyerPages()
    return listed.map(({ page }) => ({ slug: page.slug }))
  } catch {
    return []
  }
}

type Props = { params: Promise<{ slug: string }> }

/**
 * The page, or a 404 when the heading has no definition or too few buyers to
 * sell. A failed read throws instead: ISR keeps serving the last good page,
 * where a 404 would tell Google the heading had gone.
 */
async function resolve(slug: string) {
  const page = findBuyerPage(slug)
  if (!page) notFound()
  const stats = await loadHeading(page.hs4)
  if (stats.buyers < MIN_RECORDS) notFound()
  return { page, stats, price: priceCents(stats.buyers)! }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { page, stats, price } = await resolve(slug)
  const count = formatNumber(stats.buyers)

  return pageMetadata({
    title: buyerPageHeading(page, stats.buyers),
    absoluteTitle: true,
    description:
      `${count} US companies already importing ${page.productLower} (HS ${page.hs4}), ` +
      `from US Customs manifests. See top states and ports and ${FREE_SAMPLE_ROWS} free sample rows. ` +
      `All ${count} for ${formatUsd(price)}, no subscription.`,
    path: buyerPageHref(page),
  })
}

export default async function BuyerLandingPage({ params }: Props) {
  const { slug } = await params
  const { page, stats, price } = await resolve(slug)

  const sector = findPromoPack(page.sector)
  const updated = monthYear(stats.updatedAt)
  const faqs = buyerPageFaqs(page, stats.buyers, stats.topStates.map((s) => s.name))
  const searchHref = `/search?hs4=${page.hs4}`

  // Only headings that are live get a link. A related link to a heading with
  // no stock is a link to an empty shelf.
  const listed = await listedBuyerPages().catch(() => [])
  const live = new Set(listed.map((l) => l.page.slug))
  const related = relatedBuyerPages(page).filter((p) => live.has(p.slug))

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: 'Packs', path: '/packs' },
    ...(sector ? [{ name: sector.title, path: `/packs#${sector.slug}` }] : []),
    { name: page.product, path: buyerPageHref(page) },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* The Product price is the price box's price: priceCents(stats.buyers). */}
      <JsonLd
        data={[
          productLd({
            name: `US importers of ${page.productLower} (HS ${page.hs4}) — buyer list CSV`,
            description:
              `${formatNumber(stats.buyers)} US companies importing ${page.covers}, ` +
              `from US Customs import records. One-time CSV download.`,
            path: buyerPageHref(page),
            sku: `hs-${page.hs4}`,
            priceCents: price,
          }),
          breadcrumbLd(crumbs),
          faqLd(faqs),
        ]}
      />

      {/* Breadcrumb ---------------------------------------------------- */}
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 text-sm">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-foreground">Home</Link>
          </li>
          <Crumb />
          <li>
            <Link href="/packs" className="hover:text-foreground">Packs</Link>
          </li>
          {sector && (
            <>
              <Crumb />
              <li>
                <Link href={`/packs#${sector.slug}`} className="hover:text-foreground">
                  {sector.title}
                </Link>
              </li>
            </>
          )}
          <Crumb />
          <li aria-current="page" className="text-foreground">{page.product}</li>
        </ol>
      </nav>

      {/* Heading and intro --------------------------------------------- */}
      <header className="max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {buyerPageHeading(page, stats.buyers)}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
          These are {formatNumber(stats.buyers)} separate US companies named on US
          Customs import records as the buyer of {page.covers}. Every one of them
          already imports {page.productLower} from overseas suppliers, so they are
          the buyers an SME exporter of {page.productLower} would pitch to,
          wherever you ship from.
        </p>
        {updated && (
          <p className="text-muted-foreground text-sm">Data updated: {updated}</p>
        )}
      </header>

      {/* Stats ----------------------------------------------------------- */}
      <section aria-labelledby="stats" className="mt-10">
        <h2 id="stats" className="sr-only">About these buyers</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="US buyer companies">
            <span className="text-3xl font-semibold tracking-tight">
              {formatNumber(stats.buyers)}
            </span>
          </Stat>
          <Stat label="Shipments on record">
            <span className="text-lg font-medium">
              {formatDate(stats.firstSeen)} – {formatDate(stats.lastSeen)}
            </span>
          </Stat>
          <Stat label="Top US states">
            <RankedList items={stats.topStates} empty="Not recorded in this heading's source" />
          </Stat>
          <Stat label="Top ports of entry">
            <RankedList items={stats.topPorts} empty="Not recorded" format={titleCity} />
          </Stat>
        </dl>
      </section>

      {/* Sample rows ----------------------------------------------------- */}
      <section aria-labelledby="sample" className="mt-12 space-y-4">
        <div className="space-y-1">
          <h2 id="sample" className="text-xl font-semibold tracking-tight">
            {stats.sample.length} of the {formatNumber(stats.buyers)} buyers
          </h2>
          <p className="text-muted-foreground text-sm">
            In the order search ranks them, which is the order the paid file
            uses. Names are masked
            on this page; the CSV carries the full company name, street address,
            port of entry and date range.
          </p>
        </div>

        <div className="bg-card overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-[200px]">Importer company</TableHead>
                <TableHead className="min-w-[110px]">City</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="min-w-[130px]">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3" aria-hidden="true" />
                    Port of entry
                  </span>
                </TableHead>
                <TableHead className="text-right">Shipments</TableHead>
                <TableHead className="min-w-[200px]">Product line</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.sample.map((buyer) => (
                <TableRow key={buyer.id}>
                  <TableCell className="font-medium font-mono text-xs sm:text-sm">
                    {maskCompanyName(buyer.name)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{titleCity(buyer.city)}</TableCell>
                  <TableCell className="text-muted-foreground">{buyer.state ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">In paid file</TableCell>
                  <TableCell className="tnum text-right font-medium">
                    {formatNumber(buyer.shipment_count)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {productLine(buyer.product_description)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Price box ------------------------------------------------------- */}
      <section aria-labelledby="price" className="bg-card mt-12 rounded-xl border p-6 sm:p-8">
        <h2 id="price" className="text-xl font-semibold tracking-tight">
          Take the list
        </h2>
        <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-4xl font-semibold tracking-tight">
            All {formatNumber(stats.buyers)} for {formatUsd(price)}
          </span>
        </p>
        <p className="text-muted-foreground mt-2 text-sm">
          One payment, no subscription, the file is yours. Or take fewer: the
          first {MIN_RECORDS} cost {formatUsd(priceCents(MIN_RECORDS)!)}, on the same
          rate card as every search.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" variant="brand" asChild>
            <Link href={`${searchHref}#pricing`}>
              Buy the list
              <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href={searchHref}>
              <Download />
              Download {FREE_SAMPLE_ROWS} free sample rows
            </Link>
          </Button>
        </div>
      </section>

      {/* FAQ ------------------------------------------------------------- */}
      <section aria-labelledby="faq" className="mt-14 max-w-3xl">
        <h2 id="faq" className="text-xl font-semibold tracking-tight">
          Questions about {page.productLower} importers
        </h2>
        <div className="mt-6 space-y-6">
          {faqs.map((faq) => (
            <div key={faq.question} className="space-y-2">
              <h3 className="font-medium">{faq.question}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Related --------------------------------------------------------- */}
      <section aria-labelledby="related" className="mt-14 border-t pt-8">
        <h2 id="related" className="text-lg font-medium">Related HS codes</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {related.map((p) => (
            <RelatedLink key={p.slug} page={p} />
          ))}
          {sector && (
            <li>
              <Link
                href={`/search?hs4=${sector.hs4.join(',')}`}
                className="border-border hover:bg-accent inline-flex rounded-full border px-3.5 py-1.5 text-sm"
              >
                All of {sector.title.toLowerCase()} (HS {sector.hs4.join(', ')})
              </Link>
            </li>
          )}
          <li>
            <Link
              href="/packs"
              className="border-border hover:bg-accent inline-flex rounded-full border px-3.5 py-1.5 text-sm"
            >
              Every sector pack
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}

function Crumb() {
  return (
    <li aria-hidden="true">
      <ChevronRight className="size-3.5" />
    </li>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-5">
      <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-2">{children}</dd>
    </div>
  )
}

/**
 * A ranked list, or a sentence saying the field is absent. Aggregated company
 * records carry no address (STATUS.md), so a whole heading can hold no state;
 * a bare dash there reads as a rendering fault.
 */
function RankedList({
  items,
  empty,
  format = (name: string) => name,
}: {
  items: { name: string; buyers: number }[]
  empty: string
  format?: (name: string) => string
}) {
  if (items.length === 0) return <span className="text-muted-foreground text-sm">{empty}</span>
  return (
    <ol className="space-y-1 text-sm">
      {items.map((item) => (
        <li key={item.name} className="flex justify-between gap-3">
          <span className="truncate" title={item.name}>{format(item.name)}</span>
          <Badge variant="secondary" className="tnum shrink-0">
            {formatNumber(item.buyers)}
          </Badge>
        </li>
      ))}
    </ol>
  )
}

function RelatedLink({ page }: { page: BuyerPage }) {
  return (
    <li>
      <Link
        href={buyerPageHref(page)}
        className="border-border hover:bg-accent inline-flex rounded-full border px-3.5 py-1.5 text-sm"
      >
        {page.product} (HS {page.hs4})
      </Link>
    </li>
  )
}

/** Filers type place names in capitals; "MCALLEN" reads better as "Mcallen". */
function titleCity(city: string | null): string {
  if (!city) return '—'
  return city.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())
}
