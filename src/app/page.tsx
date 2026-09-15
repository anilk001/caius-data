import Link from 'next/link'
import { ArrowRight, FileDown, Search, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TrustBanner } from '@/components/trust-banner'
import { PACKS } from '@/lib/packs'
import { HS_SUGGESTIONS, SECTORS } from '@/lib/hs-codes'
import { formatUsd } from '@/lib/utils'

const STEPS = [
  {
    icon: Search,
    title: 'Search your HS code',
    body: 'Type 6204 or "cotton t-shirts". See the US companies already importing it — name, city, volume, product line.',
  },
  {
    icon: FileDown,
    title: 'Check three rows free',
    body: 'Download a 3-row sample CSV before you pay anything. Open it, check the format, decide.',
  },
  {
    icon: Send,
    title: 'Buy the pack, get the file',
    body: 'Pay once by card. The full CSV — street address, port of entry, date range — is emailed within a minute.',
  },
]

export default function HomePage() {
  const cheapest = PACKS.reduce((a, b) => (a.amountCents <= b.amountCents ? a : b))

  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
        <div className="max-w-3xl space-y-6">
          <Badge variant="brand" className="px-2.5 py-1">
            Built for Indian exporters
          </Badge>

          <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            The US companies importing your product are already on record.
          </h1>

          <p className="text-muted-foreground max-w-2xl text-lg leading-relaxed text-pretty">
            Every ocean shipment into the United States is logged by US Customs.
            Caius Data turns those manifests into a clean buyer list for your HS
            code — company name, location, volume, port and product line.
            <span className="text-foreground font-medium">
              {' '}
              Pay once from {formatUsd(cheapest.amountCents)}. No subscription.
            </span>
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button size="lg" variant="brand" asChild>
              <Link href="/search">
                Search importers free
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/search">Download 3 sample rows</Link>
            </Button>
          </div>

          <p className="text-muted-foreground text-sm">
            No account. No card to search. No recurring anything.
          </p>
        </div>

        {/* Sector chips */}
        <div className="mt-12 flex flex-wrap gap-2">
          {SECTORS.map((sector) => {
            const first = HS_SUGGESTIONS.find((s) => s.sector === sector)
            return (
              <Link
                key={sector}
                href={`/search?hs4=${first?.code ?? ''}`}
                className="border-border hover:border-foreground/30 hover:bg-accent rounded-full border px-3.5 py-1.5 text-sm transition-colors"
              >
                {sector}
              </Link>
            )
          })}
        </div>
      </section>

      <TrustBanner />

      {/* How it works ---------------------------------------------------- */}
      <section id="faq" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Three steps, about four minutes
        </h2>

        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <div key={title} className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="bg-brand/10 text-brand tnum flex size-8 items-center justify-center rounded-lg text-sm font-semibold">
                  {index + 1}
                </span>
                <Icon className="text-muted-foreground size-4" aria-hidden="true" />
              </div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing --------------------------------------------------------- */}
      <section id="pricing" className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Pay for the list, not for a seat
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Trade intelligence platforms charge $3,000 a year and lock the export
              button. We sell you the rows and get out of the way. Every pack is a
              one-time payment and the file is yours permanently.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {PACKS.map((pack) => (
              <div
                key={pack.id}
                className={`bg-card flex flex-col gap-4 rounded-xl border p-6 ${
                  pack.highlight ? 'border-brand/40 shadow-sm' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{pack.name}</p>
                  {pack.highlight && <Badge variant="brand">Most popular</Badge>}
                </div>

                <p className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-semibold tracking-tight">
                    {formatUsd(pack.amountCents)}
                  </span>
                  <span className="text-muted-foreground text-sm">one time</span>
                </p>

                <p className="text-muted-foreground flex-1 text-sm leading-relaxed">
                  <span className="text-foreground font-medium">
                    {pack.recordCount} importer companies
                  </span>
                  . {pack.blurb}
                </p>

                <Button variant={pack.highlight ? 'brand' : 'outline'} asChild>
                  <Link href="/search">Choose your HS code</Link>
                </Button>
              </div>
            ))}
          </div>

          <p className="text-muted-foreground mt-6 text-sm">
            Prices in USD. Packs are capped at the number of companies we actually
            hold for your filters — you are never charged for empty rows.
          </p>
        </div>
      </section>

      {/* Closing CTA ----------------------------------------------------- */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Find out who is buying what you make.
          </h2>
          <p className="text-muted-foreground mx-auto mt-3 max-w-lg leading-relaxed text-pretty">
            Search is free and needs no account. Start with your HS code.
          </p>
          <Button size="lg" variant="brand" className="mt-7" asChild>
            <Link href="/search">
              Open the search
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  )
}
