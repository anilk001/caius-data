'use client'

import { useMemo, useState } from 'react'
import { Check, Loader2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MIN_RECORDS, perCompanyCents, priceCents } from '@/lib/pricing'
import { formatUsd } from '@/lib/utils'
import type { Filters } from '@/lib/validation'

/**
 * Choose how many companies to buy.
 *
 * Fixed packs are gone. They forced the choice between charging full price for
 * a short file and refusing a niche that holds 120 companies when the pack says
 * 200. Buying a count removes the question — there is no pack size left to fall
 * short of, and the price follows what is actually delivered.
 *
 * The price shown here is computed with the same function the server uses, but
 * it is only ever an indication: the browser sends a count, never an amount,
 * and checkout recounts distinct buyers before charging. A client that could
 * name its own price would name zero.
 */

/** Shortcuts, so most buyers never touch the input. */
const PRESETS = [50, 200, 500, 1000, 2500] as const

export function PackPicker({
  filters,
  disabled,
  matchCount,
}: {
  filters: Filters
  disabled: boolean
  matchCount: number | null
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const available = matchCount ?? 0
  const [records, setRecords] = useState<number>(200)

  // Never offer more than we hold, and never fewer than we sell.
  const wanted = Math.min(Math.max(records, MIN_RECORDS), Math.max(available, MIN_RECORDS))
  const sellable = available >= MIN_RECORDS
  const price = useMemo(() => priceCents(wanted), [wanted])
  const perEach = useMemo(() => perCompanyCents(wanted), [wanted])

  async function buy() {
    setPending(true)
    setError(null)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...filters, records: wanted }),
      })

      const payload = await response.json()
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Checkout could not be started.')
      }

      window.location.assign(payload.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPending(false)
    }
  }

  return (
    <section id="pricing" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Take the list</h2>
        <p className="text-muted-foreground text-sm">
          Pay for the companies you take, nothing else. One payment, no
          subscription. The CSV lands in your inbox in under a minute with street
          address, port of entry and the full shipment date range unlocked.
        </p>
      </div>

      <div className="bg-card space-y-5 rounded-xl border p-5 sm:p-6">
        {!sellable ? (
          <p className="text-muted-foreground text-sm">
            {available > 0
              ? `Only ${available.toLocaleString('en-US')} companies match these filters. The smallest list we sell is ${MIN_RECORDS} — widen your search and this unlocks.`
              : 'Enter an HS code or product keyword above to price a list.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="record-count"
                  className="text-muted-foreground text-xs font-medium"
                >
                  How many companies?
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="record-count"
                    type="number"
                    min={MIN_RECORDS}
                    max={available}
                    step={10}
                    value={records}
                    onChange={(e) => setRecords(Number(e.target.value) || MIN_RECORDS)}
                    onBlur={() => setRecords(wanted)}
                    className="border-input bg-background focus-visible:ring-ring w-28 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                  />
                  <span className="text-muted-foreground text-sm">
                    of ~{available.toLocaleString('en-US')} available
                  </span>
                </div>
              </div>

              <p className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tracking-tight">
                  {price === null ? '—' : formatUsd(price)}
                </span>
                {perEach !== null && (
                  <span className="text-muted-foreground text-xs">
                    {(perEach / 100).toFixed(3).replace(/^0/, '')}¢ per company
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {PRESETS.filter((n) => n <= available).map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={wanted === n ? 'brand' : 'outline'}
                  size="sm"
                  onClick={() => setRecords(n)}
                >
                  {n.toLocaleString('en-US')}
                </Button>
              ))}
              {available > MIN_RECORDS && !PRESETS.includes(available as never) && (
                <Button
                  type="button"
                  variant={wanted === available ? 'brand' : 'outline'}
                  size="sm"
                  onClick={() => setRecords(available)}
                >
                  All {available.toLocaleString('en-US')}
                </Button>
              )}
            </div>


            <ul className="text-muted-foreground grid gap-2 text-sm sm:grid-cols-3">
              <li className="flex gap-2">
                <Check className="text-brand mt-0.5 size-3.5 shrink-0" />
                <span>One row per company, never duplicated</span>
              </li>
              <li className="flex gap-2">
                <Check className="text-brand mt-0.5 size-3.5 shrink-0" />
                <span>Forwarders and consolidators removed</span>
              </li>
              <li className="flex gap-2">
                <Check className="text-brand mt-0.5 size-3.5 shrink-0" />
                <span>All 12 columns unlocked, CSV by email</span>
              </li>
            </ul>

            <Button
              variant="brand"
              className="w-full sm:w-auto"
              onClick={buy}
              disabled={disabled || pending || price === null}
            >
              {pending ? (
                <>
                  <Loader2 className="animate-spin" />
                  Opening checkout…
                </>
              ) : (
                <>
                  <ShoppingCart />
                  Buy {wanted.toLocaleString('en-US')} companies
                  {price !== null && ` — ${formatUsd(price)}`}
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {disabled && (
        <p className="text-muted-foreground text-sm">
          Enter an HS code or product keyword above to unlock checkout.
        </p>
      )}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
