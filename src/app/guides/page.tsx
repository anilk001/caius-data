import Link from 'next/link'
import { GUIDES, guidePath, publishedGuides } from '@/lib/guides'
import { pageMetadata } from '@/lib/seo'
import { Badge } from '@/components/ui/badge'

/**
 * Indexable once at least one guide is published. An index of outlines is a
 * page of links to noindexed drafts, which is nothing to rank.
 */
export const metadata = pageMetadata({
  title: 'Guides for exporters selling to the US',
  description:
    'Practical guides for small exporters: finding US buyers, HS codes, emailing importers, and shipping garments and spices to the US.',
  path: '/guides',
  noindex: publishedGuides().length === 0,
})

export default function GuidesIndex() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Guides</h1>
        <p className="text-muted-foreground leading-relaxed">
          Practical notes for small exporters selling to US buyers.
        </p>
      </header>

      <ul className="mt-10 divide-y border-y">
        {GUIDES.map((guide) => (
          <li key={guide.slug} className="py-5">
            <Link href={guidePath(guide)} className="group block space-y-1">
              <span className="flex items-center gap-2 font-medium group-hover:underline">
                {guide.title}
                {guide.draft && <Badge variant="outline">Draft</Badge>}
              </span>
              <span className="text-muted-foreground block text-sm">{guide.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
