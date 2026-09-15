'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, Lock, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ResultsTable } from '@/components/search/results-table'
import { PackPicker } from '@/components/search/pack-picker'
import { COMMON_PORTS, HS_SUGGESTIONS, describeHs4 } from '@/lib/hs-codes'
import { FREE_SAMPLE_ROWS } from '@/lib/packs'
import type { Filters } from '@/lib/validation'
import type { PublicCompany } from '@/types/database'

interface SearchResponse {
  rows: PublicCompany[]
  total: number | null
  page: number
  hasMore: boolean
  filtered: boolean
}

const EMPTY: Filters = { keyword: '', hs4: '', port: '', state: '' }

export function SearchDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Form state is separate from applied state so typing does not fire a query
  // per keystroke; the debounce below decides when a draft becomes a search.
  const [draft, setDraft] = useState<Filters>(() => ({
    keyword: searchParams.get('keyword') ?? '',
    hs4: searchParams.get('hs4') ?? '',
    port: searchParams.get('port') ?? '',
    state: searchParams.get('state') ?? '',
  }))
  const [applied, setApplied] = useState<Filters>(draft)

  // The result carries the query it belongs to. `loading` is then derived
  // rather than stored, which removes both the setState-in-effect cascade and
  // the stale-response race in one move: a reply for an old query simply never
  // matches the current one.
  const [result, setResult] = useState<{
    query: string
    data: SearchResponse | null
    error: string | null
  } | null>(null)
  const [sampling, setSampling] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  const queryString = useMemo(() => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(applied)) {
      const trimmed = value?.trim()
      if (trimmed) params.set(key, trimmed)
    }
    return params.toString()
  }, [applied])

  const hasFilters = Boolean(
    applied.keyword?.trim() || applied.hs4?.trim() || applied.port?.trim() || applied.state?.trim(),
  )

  // Debounce draft -> applied.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(draft), 350)
    return () => clearTimeout(timer)
  }, [draft])

  // Keep the URL shareable — an exporter can send a filtered view to a colleague.
  useEffect(() => {
    router.replace(queryString ? `/search?${queryString}` : '/search', {
      scroll: false,
    })
  }, [queryString, router])

  useEffect(() => {
    const controller = new AbortController()

    async function run() {
      try {
        const response = await fetch(`/api/search?${queryString}`, {
          signal: controller.signal,
        })
        const payload = await response.json()

        if (!response.ok) {
          setResult({
            query: queryString,
            data: null,
            error: payload.error ?? 'Search failed.',
          })
          return
        }

        setResult({ query: queryString, data: payload as SearchResponse, error: null })
      } catch (err) {
        if (controller.signal.aborted) return
        setResult({
          query: queryString,
          data: null,
          error: err instanceof Error ? err.message : 'Search failed.',
        })
      }
    }

    void run()
    return () => controller.abort()
  }, [queryString])

  const loading = result?.query !== queryString
  const data = result?.query === queryString ? result.data : null
  const error = result?.query === queryString ? result.error : null

  async function downloadSample() {
    setSampling(true)
    setSampleError(null)
    try {
      const response = await fetch(`/api/sample-csv?${queryString}`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Could not build a sample.')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download =
        response.headers
          .get('content-disposition')
          ?.match(/filename="(.+)"/)?.[1] ?? 'caius-data-sample.csv'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setSampleError(
        err instanceof Error ? err.message : 'Could not build a sample.',
      )
    } finally {
      setSampling(false)
    }
  }

  const rows = data?.rows ?? []
  const hsLabel = describeHs4(applied.hs4?.trim())

  return (
    <div className="space-y-8">
      {/* Filters -------------------------------------------------------- */}
      <section className="bg-card rounded-xl border p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="keyword">Product keyword</Label>
            <Input
              id="keyword"
              placeholder="cotton t-shirts, turmeric…"
              value={draft.keyword ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="hs4">HS4 code</Label>
            <Input
              id="hs4"
              inputMode="numeric"
              maxLength={4}
              placeholder="6204"
              className="tnum font-mono"
              value={draft.hs4 ?? ''}
              onChange={(e) =>
                setDraft((d) => ({ ...d, hs4: e.target.value.replace(/\D/g, '').slice(0, 4) }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="port">Port of entry</Label>
            <Input
              id="port"
              list="common-ports"
              placeholder="Los Angeles, Savannah…"
              value={draft.port ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, port: e.target.value }))}
            />
            <datalist id="common-ports">
              {COMMON_PORTS.map((port) => (
                <option key={port} value={port} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="state">US state</Label>
            <Input
              id="state"
              maxLength={2}
              placeholder="CA"
              className="uppercase"
              value={draft.state ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  state: e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2),
                }))
              }
            />
          </div>
        </div>

        {/* Quick-start chips */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground mr-1 text-xs">Popular:</span>
          {HS_SUGGESTIONS.slice(0, 8).map((s) => (
            <button
              key={s.code}
              type="button"
              onClick={() => setDraft({ ...EMPTY, hs4: s.code })}
              className="border-border hover:border-foreground/30 hover:bg-accent rounded-md border px-2 py-1 text-xs transition-colors"
              title={s.label}
            >
              <span className="tnum font-mono">{s.code}</span>
              <span className="text-muted-foreground ml-1.5">{s.sector}</span>
            </button>
          ))}
          {hasFilters && (
            <button
              type="button"
              onClick={() => setDraft(EMPTY)}
              className="text-muted-foreground hover:text-foreground ml-auto inline-flex items-center gap-1 text-xs transition-colors"
            >
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Result header --------------------------------------------------- */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              {loading ? (
                <Loader2 className="text-muted-foreground size-4 animate-spin" />
              ) : (
                <Search className="text-muted-foreground size-4" />
              )}
              {hasFilters ? 'Matching US importers' : 'US importers'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {data?.total !== null && data?.total !== undefined ? (
                <>
                  ~{data.total.toLocaleString('en-US')} companies
                  {hsLabel ? ` · ${hsLabel}` : ''}
                </>
              ) : (
                'Searching…'
              )}
            </p>
          </div>

          <Button
            variant="outline"
            onClick={downloadSample}
            disabled={sampling || rows.length === 0}
          >
            {sampling ? <Loader2 className="animate-spin" /> : <Download />}
            Download {FREE_SAMPLE_ROWS} free sample rows
          </Button>
        </div>

        {(error || sampleError) && (
          <p className="text-destructive text-sm" role="alert">
            {error ?? sampleError}
          </p>
        )}

        <div className="bg-card overflow-hidden rounded-xl border">
          {!loading && rows.length === 0 && !error ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <>
              <ResultsTable rows={rows} loading={loading} />
              <div className="text-muted-foreground flex flex-wrap items-center gap-2 border-t px-4 py-3 text-xs">
                <Badge variant="secondary" className="gap-1">
                  <Lock className="size-3" />
                  2 columns locked
                </Badge>
                <span>
                  Street address and port of entry unlock with any paid pack.
                  Showing {rows.length} of ~
                  {(data?.total ?? rows.length).toLocaleString('en-US')}.
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      <PackPicker
        filters={applied}
        disabled={!applied.keyword?.trim() && !applied.hs4?.trim()}
        matchCount={data?.total ?? null}
      />
    </div>
  )
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="font-medium">
        {hasFilters ? 'No importers match those filters' : 'No data loaded yet'}
      </p>
      <p className="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-relaxed">
        {hasFilters
          ? 'Try a broader HS chapter, drop the port filter, or search by product keyword instead of code.'
          : 'Run the ingest script against a manifest export to populate the companies table.'}
      </p>
    </div>
  )
}
