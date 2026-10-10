import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sitemapEntries, type SitemapInputs } from '../src/lib/sitemap-entries.ts'

const INPUT: SitemapInputs = {
  buyers: [
    { path: '/buyers/us-importers-womens-garments-hs-6204', updatedAt: '2026-09-16 17:09:37.894001+00' },
    { path: '/buyers/us-importers-pepper-chillies-hs-0904', updatedAt: '2026-10-06T10:00:55.836852+00:00' },
  ],
  comparisons: [],
  comparisonsUpdated: '2026-10-10',
  guides: [],
  aboutUpdated: '2026-10-10',
  legal: [{ path: '/terms', updated: '2026-09-15' }],
}

test('no query-string URL is listed', () => {
  // /search?hs4=6204 was listed and indexed as an empty page.
  for (const e of sitemapEntries(INPUT)) assert.doesNotMatch(e.url, /\?/, e.url)
})

test('every URL is on the canonical host', () => {
  for (const e of sitemapEntries(INPUT)) assert.match(e.url, /^https:\/\/www\.caiusdata\.com(\/|$)/)
})

test('lastmod is the data date, not the request time', () => {
  const byUrl = new Map(sitemapEntries(INPUT).map((e) => [e.url, e]))
  assert.equal(byUrl.get('https://www.caiusdata.com')!.lastModified, '2026-10-06T10:00:55.836Z')
  assert.equal(
    byUrl.get('https://www.caiusdata.com/buyers/us-importers-womens-garments-hs-6204')!.lastModified,
    '2026-09-16T17:09:37.894Z',
  )
  const source = readFileSync(new URL('../src/app/sitemap.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /new Date\(\)/)
})

test('with no data date, lastmod is left out rather than invented', () => {
  const entries = sitemapEntries({ ...INPUT, buyers: [] })
  assert.equal(entries.find((e) => e.url === 'https://www.caiusdata.com')!.lastModified, undefined)
})

test('legal pages are yearly at 0.2', () => {
  const terms = sitemapEntries(INPUT).find((e) => e.url.endsWith('/terms'))!
  assert.equal(terms.changeFrequency, 'yearly')
  assert.equal(terms.priority, 0.2)
  assert.equal(terms.lastModified, '2026-09-15')
})

test('drafts stay out; the guides index appears with its first guide', () => {
  const urls = sitemapEntries(INPUT).map((e) => e.url)
  assert.ok(!urls.some((u) => u.includes('/guides')))
  assert.ok(!urls.some((u) => u.includes('-alternative')))
  const withGuide = sitemapEntries({
    ...INPUT,
    guides: [{ path: '/guides/what-is-an-hs-code', updated: '2026-11-01' }],
  }).map((e) => e.url)
  assert.ok(withGuide.includes('https://www.caiusdata.com/guides'))
  assert.ok(withGuide.includes('https://www.caiusdata.com/guides/what-is-an-hs-code'))
})

test('robots keeps its disallows and names the canonical sitemap', () => {
  const robots = readFileSync(new URL('../src/app/robots.ts', import.meta.url), 'utf8')
  assert.match(robots, /disallow: \['\/api\/', '\/success'\]/)
  assert.match(robots, /absoluteUrl\('\/sitemap\.xml'\)/)
})
