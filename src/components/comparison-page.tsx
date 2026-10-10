import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  comparisonHeading,
  competitorPath,
  isPublished,
  type Competitor,
  type Fact,
} from '@/lib/competitors'
import { buyerPageHref } from '@/lib/buyer-pages'
import { listedBuyerPages } from '@/lib/headings'
import { MIN_RECORDS, priceCents } from '@/lib/pricing'
import { FREE_SAMPLE_ROWS } from '@/lib/packs'
import { pageMetadata } from '@/lib/seo'
import { formatNumber, formatUsd } from '@/lib/utils'

export function comparisonMetadata(c: Competitor) {
  return pageMetadata({
    title: `${c.name} alternative for small exporters`,
    description:
      `Compare ${c.name} with Caius Data: a one-time CSV of US importers by HS code from ` +
      `${formatUsd(priceCents(MIN_RECORDS)!)}, no subscription and no account.`,
    path: competitorPath(c),
    // Facts about a competitor go public only after a person has checked
    // them against the competitor's own site. See src/lib/competitors.ts.
    noindex: !isPublished(c),
  })
}

/** Example list sizes for the "what a list costs" line, from the rate card. */
const EXAMPLES = [MIN_RECORDS, 200, 500]

export async function ComparisonPage({ competitor: c }: { competitor: Competitor }) {
  const listed = await listedBuyerPages().catch(() => [])

  const rows: { label: string; ours: string; theirs: Fact }[] = [
    {
      label: 'Pricing model',
      ours: 'One-off payment per list. No subscription.',
      theirs: c.pricingModel,
    },
    {
      label: 'Minimum spend',
      ours: `${formatUsd(priceCents(MIN_RECORDS)!)} for ${MIN_RECORDS} companies.`,
      theirs: c.minimumSpend,
    },
    {
      label: 'Export limits',
      ours: 'None. You download every company you pay for as a CSV, and keep it.',
      theirs: c.exportLimits,
    },
    {
      label: 'Account needed',
      ours: 'No. Search is free; checkout asks only for an email and a card, through Stripe.',
      theirs: c.accountNeeded,
    },
  ]

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {comparisonHeading(c)}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed text-pretty">
          {c.name} is {c.what}. It suits teams that work with trade data every
          day. If you are a small exporter who needs one list of US companies
          already importing your product, Caius Data sells exactly that: pay once
          for the companies you take, download a CSV, keep it.
        </p>
      </header>

      <section aria-labelledby="compare" className="mt-10">
        <h2 id="compare" className="text-xl font-semibold tracking-tight">
          {c.name} and Caius Data side by side
        </h2>
        <div className="bg-card mt-4 overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="min-w-[130px]" />
                <TableHead className="min-w-[220px]">Caius Data</TableHead>
                <TableHead className="min-w-[220px]">{c.name}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="whitespace-normal">{row.ours}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-normal">
                    {row.theirs.verified && row.theirs.value
                      ? row.theirs.value
                      : 'Not yet verified'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          {c.checkedOn
            ? `${c.name} details checked against its public website on ${c.checkedOn}. Check their site for current terms.`
            : `${c.name} details have not yet been checked against its public website.`}{' '}
          {c.name} is a trademark of its owner; Caius Data is not affiliated with it.
        </p>
      </section>

      <section aria-labelledby="fit" className="mt-12 grid gap-8 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 id="fit" className="font-semibold">When a subscription platform fits better</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You track competitors&apos; shipments month after month, need many
            countries&apos; customs records in one place, or want shipment-level
            detail and team seats. That is what platforms like {c.name} are built
            for.
          </p>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold">When a one-off list fits better</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            You want to know which US companies already buy your product, then
            start contacting them. One list, priced by the company:{' '}
            {EXAMPLES.map((n) => `${formatNumber(n)} for ${formatUsd(priceCents(n)!)}`).join(', ')}.
            Download {FREE_SAMPLE_ROWS} sample rows free before you pay.
          </p>
        </div>
      </section>

      <section aria-labelledby="start" className="mt-12 border-t pt-8">
        <h2 id="start" className="text-lg font-medium">Start with your product</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {listed.map(({ page }) => (
            <li key={page.slug}>
              <Link
                href={buyerPageHref(page)}
                className="border-border hover:bg-accent inline-flex rounded-full border px-3.5 py-1.5 text-sm"
              >
                US importers of {page.productLower} (HS {page.hs4})
              </Link>
            </li>
          ))}
        </ul>
        <Button variant="brand" className="mt-6" asChild>
          <Link href="/search">
            Search by HS code
            <ArrowRight />
          </Link>
        </Button>
      </section>
    </div>
  )
}
