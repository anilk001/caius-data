import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  COMPETITORS,
  comparisonHeading,
  competitorPath,
  isPublished,
  type Competitor,
} from '../src/lib/competitors.ts'

test('no comparison page is indexable until a person checks its facts', () => {
  // A misstated rival price on an indexed page is a false-advertising
  // complaint. Shipping these as noindex drafts is the point.
  for (const c of COMPETITORS) assert.equal(isPublished(c), false, c.slug)
})

test('publishing needs every fact verified, filled in and dated', () => {
  const fact = { value: 'Annual plans', verified: true }
  const ready: Competitor = {
    ...COMPETITORS[0],
    pricingModel: fact, minimumSpend: fact, exportLimits: fact, accountNeeded: fact,
    checkedOn: '2026-10-10',
  }
  assert.equal(isPublished(ready), true)
  assert.equal(isPublished({ ...ready, checkedOn: null }), false)
  assert.equal(isPublished({ ...ready, exportLimits: { value: '', verified: true } }), false)
  assert.equal(isPublished({ ...ready, minimumSpend: { value: '$1', verified: false } }), false)
})

test('the pages are where the brief puts them, under the briefed H1', () => {
  assert.deepEqual(COMPETITORS.map(competitorPath), [
    '/importgenius-alternative', '/volza-alternative', '/panjiva-alternative',
  ])
  assert.equal(
    comparisonHeading(COMPETITORS[1]),
    'Volza Alternative for Small Exporters — Pay per List, Not per Year',
  )
})

test('the page writes no competitor fact of its own', () => {
  // Every claim about a rival comes from src/lib/competitors.ts, where it
  // carries a verified flag. A dollar figure typed into the page would not.
  const page = readFileSync(new URL('../src/components/comparison-page.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(page, /\$\d/)
  assert.match(page, /Not yet verified/)
  assert.match(page, /noindex: !isPublished\(c\)/)
})
