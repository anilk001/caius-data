import { ImageResponse } from 'next/og'

/**
 * The Organization logo for structured data, at /logo.png.
 *
 * The wordmark is live text (src/components/logo.tsx), so the site had no
 * image to name in `Organization.logo`, which Google requires as a raster or
 * SVG at a stable URL. This draws the same mark — "c" with the red accent dot
 * — square, on a white ground, as Google's logo guidelines ask.
 */
export const dynamic = 'force-static'

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-end', position: 'relative' }}>
          <span style={{ fontSize: 340, fontWeight: 700, color: '#18181b', lineHeight: 1 }}>c</span>
          <span
            style={{
              width: 78,
              height: 78,
              borderRadius: 9999,
              background: '#dc2626',
              marginLeft: 18,
              marginBottom: 40,
            }}
          />
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  )
}
