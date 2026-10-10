import { serialiseLd } from '@/lib/structured-data'

/** One JSON-LD block, rendered into the server HTML. */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // The payload is built by src/lib/structured-data.ts from values the page
      // already renders, and serialiseLd escapes "<".
      dangerouslySetInnerHTML={{ __html: serialiseLd(data) }}
    />
  )
}
