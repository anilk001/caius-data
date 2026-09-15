'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CheckCircle2, Download, Loader2, Mail, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface Status {
  status: 'pending' | 'fulfilled' | 'delivered' | 'failed' | 'unknown'
  recordCount?: number
  hs4?: string
  email?: string
  downloadUrl?: string | null
}

const POLL_MS = 2500
const MAX_POLLS = 24 // ~1 minute before we stop and fall back to email

/**
 * Post-checkout screen.
 *
 * Stripe redirects here the instant payment clears, which is usually *before*
 * the webhook has finished building the CSV. Rather than telling the buyer to
 * go check their email and hope, we poll the order and hand them the download
 * the moment it exists.
 */
export function OrderStatus() {
  const sessionId = useSearchParams().get('session_id')
  const [state, setState] = useState<Status>({ status: 'pending' })
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    if (!sessionId) return

    let cancelled = false

    async function check() {
      try {
        const response = await fetch(
          `/api/orders/status?session_id=${encodeURIComponent(sessionId!)}`,
        )
        if (!response.ok) return
        const payload = (await response.json()) as Status
        if (!cancelled) setState(payload)
      } catch {
        // Transient — the next poll retries.
      }
    }

    void check()

    const timer = setInterval(() => {
      setPolls((n) => {
        if (n >= MAX_POLLS) {
          clearInterval(timer)
          return n
        }
        void check()
        return n + 1
      })
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [sessionId])

  if (!sessionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TriangleAlert className="text-muted-foreground size-5" />
            No order reference
          </CardTitle>
          <CardDescription>
            This page needs a checkout session. If you have just paid, check your
            email — the download link is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <Link href="/search">Back to search</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const ready = Boolean(state.downloadUrl)
  const stalled = !ready && polls >= MAX_POLLS

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {ready ? (
            <CheckCircle2 className="text-brand size-5" />
          ) : (
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          )}
          {ready ? 'Your buyer pack is ready' : 'Payment received — building your file'}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          {ready ? (
            <>
              {state.recordCount ?? ''} US importer records
              {state.hs4 && state.hs4 !== '0000' ? ` for HS ${state.hs4}` : ''}, with
              street address and port of entry unlocked.
              {/*
                Only claim the email was sent once the order is actually
                `delivered`. A pack can be fulfilled and downloadable while the
                mail fails, and telling someone to check an inbox that will
                never receive anything is worse than saying nothing.
              */}
              {state.status === 'delivered' ? (
                <> We also emailed this link to {state.email ?? 'your inbox'}.</>
              ) : (
                <> Download it here — save the file, as the emailed copy may not arrive.</>
              )}
            </>
          ) : stalled ? (
            'This is taking longer than usual. Your payment went through and the file will arrive by email shortly — nothing is lost.'
          ) : (
            'Assembling your CSV. This normally takes a few seconds; the page updates itself.'
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {ready && state.downloadUrl && (
          <Button size="lg" variant="brand" asChild>
            <a href={state.downloadUrl}>
              <Download />
              Download CSV
            </a>
          </Button>
        )}

        <p className="text-muted-foreground flex items-start gap-2 text-sm leading-relaxed">
          <Mail className="mt-0.5 size-4 shrink-0" />
          <span>
            The download link stays valid for 7 days. Save the file locally — it is
            yours permanently, and nothing renews.
          </span>
        </p>

        <div className="flex gap-2 pt-1">
          <Button variant="outline" asChild>
            <Link href="/search">Search another HS code</Link>
          </Button>
          {stalled && (
            <Button variant="ghost" asChild>
              <a href="mailto:support@caiusdata.com">Contact support</a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
