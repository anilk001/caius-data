'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  CONSENT_EVENT,
  META_PIXEL_ID,
  TIKTOK_PIXEL_ID,
  captureUtm,
  pixelsConfigured,
  readConsent,
  track,
  writeConsent,
  type Consent,
} from '@/lib/tracking'

/**
 * IDs are interpolated into inline script, so anything that is not the shape
 * of a real ID is refused rather than escaped: Meta IDs are digits, TikTok's
 * are upper-case letters and digits.
 */
const META_ID = /^\d{5,20}$/.test(META_PIXEL_ID) ? META_PIXEL_ID : ''
const TIKTOK_ID = /^[A-Z0-9]{10,30}$/.test(TIKTOK_PIXEL_ID) ? TIKTOK_PIXEL_ID : ''

function useConsent(): [Consent, boolean] {
  const [consent, setConsent] = useState<Consent>(null)
  const [read, setRead] = useState(false)
  useEffect(() => {
    // localStorage exists only in the browser, so the stored choice is read
    // after mount; until then nothing loads and no banner flashes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsent(readConsent())
    setRead(true)
    const onChange = (e: Event) => setConsent((e as CustomEvent<Consent>).detail)
    window.addEventListener(CONSENT_EVENT, onChange)
    return () => window.removeEventListener(CONSENT_EVENT, onChange)
  }, [])
  return [consent, read]
}

/**
 * Meta and TikTok pixels, loaded only after the visitor accepts marketing
 * cookies, and not at all when neither ID is set. Mounted once, in the root
 * layout.
 */
export function Pixels() {
  const pathname = usePathname()
  const [consent, read] = useConsent()
  // The path the last PageView was sent for. The base code sends one for the
  // page it loads on, so that page starts as sent.
  const sentPath = useRef(pathname)

  // Remember the campaign the visitor landed from, before anything else runs.
  useEffect(() => {
    captureUtm(window.location.search)
  }, [])

  // The base code sends the first PageView; client-side navigations do not
  // reload it, so each later route change sends its own.
  useEffect(() => {
    if (consent !== 'granted') {
      // Until the scripts load, the page that loads them is the one the base
      // code will count.
      sentPath.current = pathname
      return
    }
    if (pathname === sentPath.current) return
    sentPath.current = pathname
    window.fbq?.('track', 'PageView')
    window.ttq?.page()
  }, [pathname, consent])

  if (!pixelsConfigured() || !(META_ID || TIKTOK_ID)) return null

  return (
    <>
      {consent === 'granted' && META_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_ID}');fbq('track','PageView');`}
        </Script>
      )}
      {consent === 'granted' && TIKTOK_ID && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};ttq.load('${TIKTOK_ID}');ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
      {read && consent === null && <ConsentBanner />}
    </>
  )
}

function ConsentBanner() {
  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="bg-card fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-xl border p-4 shadow-lg sm:inset-x-6"
    >
      <p className="text-sm leading-relaxed">
        We would like to use Meta and TikTok advertising cookies to measure our
        ads. They are off unless you accept. Search and checkout work either way.{' '}
        <a href="/privacy#cookies" className="underline underline-offset-4">
          Privacy policy
        </a>
      </p>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="brand" onClick={() => writeConsent('granted')}>
          Accept
        </Button>
        <Button size="sm" variant="outline" onClick={() => writeConsent('denied')}>
          Decline
        </Button>
      </div>
    </div>
  )
}

/**
 * Footer link that withdraws or re-asks. Withdrawing stops every event at
 * once (`track` checks consent on each call) and tells the pixels to stop;
 * scripts already loaded leave the page on the next navigation.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  if (!pixelsConfigured()) return null
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.fbq?.('consent', 'revoke')
        ;(window.ttq as { revokeConsent?: () => void } | undefined)?.revokeConsent?.()
        writeConsent(null)
      }}
    >
      Cookie settings
    </button>
  )
}

/** Fires one event when a page mounts — for server pages such as /buyers. */
export function TrackOnMount({
  event,
  params,
}: {
  event: 'ViewContent'
  params: Record<string, string | number | string[]>
}) {
  const [consent] = useConsent()
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current || consent !== 'granted') return
    sent.current = true
    track(event, params)
  }, [consent, event, params])
  return null
}
