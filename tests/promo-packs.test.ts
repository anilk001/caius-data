import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PROMO_PACKS, findPromoPack, packSearchHref } from '../src/lib/promo-packs.ts'
import { parseHs4List, isHs4, MAX_HS4_CODES } from '../src/lib/hs4.ts'

test('every heading is a real HS4 code', () => {
  for (const pack of PROMO_PACKS) {
    for (const code of pack.hs4) {
      assert.ok(isHs4(code), `${pack.slug}: "${code}" is not a 4-digit heading`)
    }
  }
})

test('no pack exceeds what a search will accept', () => {
  // A pack that parses down to fewer headings than it advertises would show a
  // count for one query and sell the results of another.
  for (const pack of PROMO_PACKS) {
    assert.ok(
      pack.hs4.length <= MAX_HS4_CODES,
      `${pack.slug} carries ${pack.hs4.length} headings, over the ${MAX_HS4_CODES} cap`,
    )
    const parsed = parseHs4List(pack.hs4.join(','))
    assert.deepEqual(parsed, pack.hs4, `${pack.slug} does not survive parseHs4List`)
  }
})

test('a heading belongs to one sector only', () => {
  // Two packs sharing a heading would double-count the same buyers across
  // tiles, and a customer who bought both would pay twice for one company.
  const seen = new Map<string, string>()
  for (const pack of PROMO_PACKS) {
    for (const code of pack.hs4) {
      const owner = seen.get(code)
      assert.equal(owner, undefined, `HS ${code} is in both ${owner} and ${pack.slug}`)
      seen.set(code, pack.slug)
    }
  }
})

test('slugs are unique and URL-safe', () => {
  const slugs = PROMO_PACKS.map((p) => p.slug)
  assert.equal(new Set(slugs).size, slugs.length, 'duplicate slug')
  for (const slug of slugs) assert.match(slug, /^[a-z0-9-]+$/)
})

test('lookup works and misses cleanly', () => {
  assert.equal(findPromoPack('garments')?.title, 'Garments & textiles')
  assert.equal(findPromoPack('nope'), null)
})

test('the search link reproduces the pack', () => {
  const pack = PROMO_PACKS[0]
  const href = packSearchHref(pack)
  const hs4 = new URL(href, 'https://example.com').searchParams.get('hs4')
  assert.deepEqual(parseHs4List(hs4), pack.hs4)
})

/**
 * The whole point of the page: a tile may never state a number that did not
 * come out of the database. A literal count in the definitions or the page
 * would be a promise nothing keeps.
 */
test('no count is hard-coded anywhere in the feature', () => {
  const sources = [
    '../src/lib/promo-packs.ts',
    '../src/app/packs/page.tsx',
  ].map((rel) => readFileSync(new URL(rel, import.meta.url).pathname, 'utf8'))

  for (const source of sources) {
    // Comments are stripped first. The rule is about what a visitor reads on
    // the page, not about prose explaining the rule — this test failed on its
    // own rationale the first time it ran.
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    const strings = code.match(/(['"`])(?:\\.|(?!\1).)*\1/g) ?? []
    for (const literal of strings) {
      assert.doesNotMatch(
        literal,
        /\b\d{2,}\s*(\+\s*)?(companies|importers|buyers)\b/i,
        `a count is written into the source: ${literal}`,
      )
    }
  }
})

test('the page counts buyers rather than rows', () => {
  // One company importing under two of a pack's headings is two rows and one
  // buyer. Counting rows would oversell every multi-heading pack.
  const page = readFileSync(
    new URL('../src/app/packs/page.tsx', import.meta.url).pathname,
    'utf8',
  )
  assert.match(page, /countBuyers\(/)
  assert.match(page, /mergeByBuyer\(/)
})
