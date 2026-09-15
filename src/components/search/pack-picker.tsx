'use client'

import { useState } from 'react'
import { Check, Loader2, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PACKS, type Pack } from '@/lib/packs'
import { cn, formatUsd } from '@/lib/utils'
import type { Filters } from '@/lib/validation'

export function PackPicker({
  filters,
  disabled,
  matchCount,
}: {
  filters: Filters
  disabled: boolean
  matchCount: number | null
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function buy(pack: Pack) {
    setPending(pack.id)
    setError(null)

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...filters, packId: pack.id }),
      })

      const payload = await response.json()

      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? 'Checkout could not be started.')
      }

      window.location.assign(payload.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPending(null)
    }
  }

  return (
    <section id="pricing" className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">
          Take the full list
        </h2>
        <p className="text-muted-foreground text-sm">
          One payment. The CSV lands in your inbox in under a minute, with street
          address, port of entry and the full shipment date range unlocked.
          {matchCount !== null && matchCount > 0 ? (
            <>
              {' '}
              We currently hold{' '}
              <span className="text-foreground font-medium">
                ~{matchCount.toLocaleString('en-US')}
              </span>{' '}
              matching importers.
            </>
          ) : null}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {PACKS.map((pack) => {
          const capped =
            matchCount !== null && matchCount > 0 && matchCount < pack.recordCount

          return (
            <div
              key={pack.id}
              className={cn(
                'bg-card relative flex flex-col gap-4 rounded-xl border p-5 transition-shadow',
                pack.highlight && 'border-brand/40 shadow-sm',
              )}
            >
              {pack.highlight && (
                <Badge variant="brand" className="absolute -top-2.5 right-4">
                  Most popular
                </Badge>
              )}

              <div className="space-y-1">
                <p className="text-sm font-medium">{pack.name}</p>
                <p className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-semibold tracking-tight">
                    {formatUsd(pack.amountCents)}
                  </span>
                  <span className="text-muted-foreground text-xs">one time</span>
                </p>
              </div>

              <ul className="text-muted-foreground flex-1 space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="text-brand mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Up to{' '}
                    <span className="text-foreground font-medium">
                      {pack.recordCount}
                    </span>{' '}
                    importer companies
                  </span>
                </li>
                <li className="flex gap-2">
                  <Check className="text-brand mt-0.5 size-3.5 shrink-0" />
                  <span>{pack.blurb}</span>
                </li>
                <li className="flex gap-2">
                  <Check className="text-brand mt-0.5 size-3.5 shrink-0" />
                  <span>All 11 columns unlocked, CSV by email</span>
                </li>
              </ul>

              {capped && (
                <p className="text-muted-foreground text-xs">
                  Your filters match ~{matchCount.toLocaleString('en-US')} companies,
                  so you&apos;ll receive those — you are never charged for empty rows.
                </p>
              )}

              <Button
                variant={pack.highlight ? 'brand' : 'default'}
                onClick={() => buy(pack)}
                disabled={disabled || pending !== null}
              >
                {pending === pack.id ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Opening checkout…
                  </>
                ) : (
                  <>
                    <ShoppingCart />
                    Buy {pack.recordCount} buyers
                  </>
                )}
              </Button>
            </div>
          )
        })}
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
