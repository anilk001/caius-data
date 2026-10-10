import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/** A browser just big enough for src/lib/tracking.ts. */
function fakeWindow() {
  const store = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    }
  }
  const calls: unknown[][] = []
  const ttqCalls: unknown[][] = []
  const win = {
    localStorage: store(),
    sessionStorage: store(),
    fbq: (...args: unknown[]) => void calls.push(args),
    ttq: { track: (...args: unknown[]) => void ttqCalls.push(args), page: () => {} },
    dispatchEvent: () => true,
    setTimeout: (fn: () => void) => fn(),
  }
  return { win, calls, ttqCalls }
}

// IDs are read at import, so they are set before the module loads.
process.env.NEXT_PUBLIC_META_PIXEL_ID = '1234567890'
process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = 'CABCDEF1234567890'
;(globalThis as { CustomEvent?: unknown }).CustomEvent ??= class { type: string; constructor(type: string) { this.type = type } }
const tracking = await import('../src/lib/tracking.ts')

test('nothing is sent before the visitor accepts', () => {
  // Caius is EU-operated; a marketing cookie needs consent first.
  const { win, calls, ttqCalls } = fakeWindow()
  ;(globalThis as { window?: unknown }).window = win
  tracking.track('Search', { search_string: '6204' })
  tracking.writeConsent('denied')
  tracking.track('Search', { search_string: '6204' })
  assert.equal(calls.length + ttqCalls.length, 0)
})

test('after Accept, both pixels get the event, with the landing UTM', () => {
  const { win, calls, ttqCalls } = fakeWindow()
  ;(globalThis as { window?: unknown }).window = win
  tracking.captureUtm('?utm_source=tiktok&utm_campaign=spices-oct&x=1')
  tracking.captureUtm('?utm_source=internal') // first touch wins
  tracking.writeConsent('granted')
  tracking.track('Purchase', { value: 17.7, currency: 'USD' })
  assert.deepEqual(calls[0], [
    'track', 'Purchase',
    { value: 17.7, currency: 'USD', utm_source: 'tiktok', utm_campaign: 'spices-oct' },
  ])
  assert.equal(ttqCalls[0][0], 'CompletePayment')
})

test('every briefed event has a TikTok name', () => {
  for (const e of ['ViewContent', 'Search', 'Lead', 'InitiateCheckout', 'Purchase'] as const) {
    assert.ok(tracking.TIKTOK_EVENT[e], e)
  }
})

test('each event fires where the brief puts it', () => {
  const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
  assert.match(read('app/buyers/[slug]/page.tsx'), /event="ViewContent"/)
  assert.match(read('components/search/search-dashboard.tsx'), /track\('Search'/)
  assert.match(read('components/search/search-dashboard.tsx'), /track\('Lead'/)
  assert.match(read('components/search/pack-picker.tsx'), /track\('InitiateCheckout'/)
  assert.match(read('components/order-status.tsx'), /track\('Purchase'/)
})

test('a malformed pixel ID never reaches the inline script', () => {
  const source = readFileSync(new URL('../src/components/pixels.tsx', import.meta.url), 'utf8')
  assert.match(source, /\/\^\\d\{5,20\}\$\/\.test\(META_PIXEL_ID\)/)
  assert.match(source, /\/\^\[A-Z0-9\]\{10,30\}\$\/\.test\(TIKTOK_PIXEL_ID\)/)
  assert.match(source, /consent === 'granted' && META_ID/)
  assert.match(source, /consent === 'granted' && TIKTOK_ID/)
})
