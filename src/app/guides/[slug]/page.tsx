import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { GUIDES, findGuide, guidePath } from '@/lib/guides'
import { buyerPageForHs4, buyerPageHref } from '@/lib/buyer-pages'
import { listedBuyerPages } from '@/lib/headings'
import { pageMetadata } from '@/lib/seo'

/** The /buyers links move only when a lane is ingested. */
export const revalidate = 86400

export const dynamicParams = false

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }))
}

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = findGuide((await params).slug)
  if (!guide) notFound()
  return pageMetadata({
    title: guide.title,
    description: guide.description,
    path: guidePath(guide),
    // An outline is not a guide. See src/lib/guides.ts.
    noindex: guide.draft,
  })
}

export default async function GuidePage({ params }: Props) {
  const guide = findGuide((await params).slug)
  if (!guide) notFound()

  // A heading with a live landing page links there; any other goes to the
  // search for that heading, so a guide never links to a 404.
  const listed = await listedBuyerPages().catch(() => [])
  const live = new Set(listed.map((l) => l.page.hs4))
  const links = guide.hs4.map((code) => {
    const page = buyerPageForHs4(code)
    return page && live.has(code)
      ? { href: buyerPageHref(page), label: `US importers of ${page.productLower} (HS ${code})` }
      : { href: `/search?hs4=${code}`, label: `Search US importers under HS ${code}` }
  })

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 text-sm">
        <Link href="/guides" className="hover:text-foreground">Guides</Link>
      </nav>

      <header className="space-y-3">
        {guide.draft && <Badge variant="outline">Draft — outline only</Badge>}
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {guide.title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">{guide.description}</p>
      </header>

      <div className="mt-10 space-y-10">
        {guide.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
            {section.body ? (
              section.body.map((p) => (
                <p key={p} className="text-muted-foreground leading-relaxed">{p}</p>
              ))
            ) : (
              <ul className="text-muted-foreground list-disc space-y-1.5 pl-5 text-sm">
                {section.outline.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <aside className="bg-card mt-12 rounded-xl border p-5">
        <h2 className="font-medium">Find the buyers</h2>
        <ul className="mt-3 space-y-1.5 text-sm">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="underline underline-offset-4">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </article>
  )
}
