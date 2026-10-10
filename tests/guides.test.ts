import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { GUIDES, publishedGuides } from '../src/lib/guides.ts'
import { buyerPageForHs4 } from '../src/lib/buyer-pages.ts'
import { isHs4 } from '../src/lib/hs4.ts'

test('every guide links to a defined buyers page', () => {
  for (const guide of GUIDES) {
    assert.ok(guide.hs4.length > 0, `${guide.slug} links to no buyers page`)
    for (const code of guide.hs4) {
      assert.ok(isHs4(code), `${guide.slug}: ${code}`)
      assert.ok(buyerPageForHs4(code), `${guide.slug}: no /buyers page defined for HS ${code}`)
    }
  }
})

test('slugs are unique and dates are ISO', () => {
  const slugs = GUIDES.map((g) => g.slug)
  assert.equal(new Set(slugs).size, slugs.length)
  for (const guide of GUIDES) {
    assert.match(guide.slug, /^[a-z0-9-]+$/)
    assert.match(guide.updated, /^\d{4}-\d{2}-\d{2}$/)
  }
})

test('a guide without written sections cannot be published', () => {
  // An outline indexed under a guide's title is a thin page.
  for (const guide of publishedGuides()) {
    for (const section of guide.sections) {
      assert.ok(section.body?.length, `${guide.slug}: "${section.heading}" has no body`)
    }
  }
})

test('drafts are noindex', () => {
  const page = readFileSync(new URL('../src/app/guides/[slug]/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /noindex: guide\.draft/)
})
