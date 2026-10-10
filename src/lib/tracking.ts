/**
 * Ad-pixel events for the social campaign: Meta Pixel and TikTok Pixel.
 *
 * Browser-only and consent-gated. Caius is EU-operated, so a marketing
 * cookie needs the visitor's consent before it is set (ePrivacy), and the
 * privacy policy says so. Until the visitor accepts, `track` does nothing
 * and the pixel scripts are never loaded — see src/components/pixels.tsx.
 *
 * Each pixel is skipped when its ID is unset. The IDs are NEXT_PUBLIC_
 * variables, inlined at build time, so they must be set on Railway before
 * the build runs, not only at runtime.
 */

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? ''
export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? ''

export function pixelsConfigured(): boolean {
  return Boolean(META_PIXEL_ID || TIKTOK_PIXEL_ID)
}

// --- Consent -----------------------------------------------------------------

const CONSENT_KEY = 'caius-marketing-consent'
export const CONSENT_EVENT = 'caius:consent'

export type Consent = 'granted' | 'denied' | null

export function readConsent(): Consent {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY)
    return value === 'granted' || value === 'denied' ? value : null
  } catch {
    return null
  }
}

export function writeConsent(value: Consent): void {
  try {
    if (value) window.localStorage.setItem(CONSENT_KEY, value)
    else window.localStorage.removeItem(CONSENT_KEY)
  } catch {
    // Storage blocked: the choice lasts for this page only, which errs on
    // the side of asking again rather than tracking.
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }))
}

// --- UTM ---------------------------------------------------------------------

const UTM_KEY = 'caius-utm'
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const

/**
 * Keep the campaign a visitor arrived from, for the rest of their visit.
 *
 * First touch per session: an internal link carries no UTM, and must not wipe
 * the one the visitor landed with. Stored in sessionStorage, which needs no
 * consent and never leaves the browser except inside a consented pixel event.
 */
export function captureUtm(search: string): void {
  try {
    if (window.sessionStorage.getItem(UTM_KEY)) return
    const params = new URLSearchParams(search)
    const utm: Record<string, string> = {}
    for (const key of UTM_PARAMS) {
      const value = params.get(key)?.trim()
      if (value) utm[key] = value.slice(0, 100)
    }
    if (Object.keys(utm).length) window.sessionStorage.setItem(UTM_KEY, JSON.stringify(utm))
  } catch {
    // No storage, no attribution. Never an error a visitor sees.
  }
}

export function storedUtm(): Record<string, string> {
  try {
    return JSON.parse(window.sessionStorage.getItem(UTM_KEY) ?? '{}')
  } catch {
    return {}
  }
}

// --- Events ------------------------------------------------------------------

export type PixelEvent = 'ViewContent' | 'Search' | 'Lead' | 'InitiateCheckout' | 'Purchase'

/**
 * TikTok's names for the same events. TikTok's standard set has no "Lead" or
 * "Purchase" in older pixel versions; SubmitForm and CompletePayment are the
 * long-standing equivalents.
 */
export const TIKTOK_EVENT: Record<PixelEvent, string> = {
  ViewContent: 'ViewContent',
  Search: 'Search',
  Lead: 'SubmitForm',
  InitiateCheckout: 'InitiateCheckout',
  Purchase: 'CompletePayment',
}

type Params = Record<string, string | number | string[] | undefined>

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void
    ttq?: { track: (event: string, params?: Params) => void; page: () => void }
  }
}

/**
 * Fire an event on whichever pixels are configured and consented.
 *
 * Right after a visitor accepts, the pixel scripts are mounted but may not
 * have run, so an event fired in the same moment — ViewContent on the page
 * they accepted on — would find no `fbq`. It waits briefly instead of
 * dropping the event.
 */
export function track(event: PixelEvent, params: Params = {}, attempt = 0): void {
  if (typeof window === 'undefined') return
  if (!pixelsConfigured() || readConsent() !== 'granted') return

  const waiting = (META_PIXEL_ID && !window.fbq) || (TIKTOK_PIXEL_ID && !window.ttq)
  if (waiting && attempt < 5) {
    window.setTimeout(() => track(event, params, attempt + 1), 300)
    return
  }

  const payload = { ...params, ...storedUtm() }
  try {
    if (META_PIXEL_ID) window.fbq?.('track', event, payload)
    if (TIKTOK_PIXEL_ID) window.ttq?.track(TIKTOK_EVENT[event], payload)
  } catch {
    // A pixel failing must never break a search, a download or a checkout.
  }
}
