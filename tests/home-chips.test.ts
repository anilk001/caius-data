import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HOME_CHIPS, visibleChips } from '../src/lib/hs-codes.ts'
import { MIN_RECORDS } from '../src/lib/pricing.ts'

test('a heading below MIN_RECORDS yields no chip', () => {
  // 0904 once held 49 separate buyers: one short of a sale. A chip there would
  // send a visitor to a search they cannot buy from.
  const counts = new Map([
    ['6204', MIN_RECORDS],
    ['0904', MIN_RECORDS - 1],
  ])
  const shown = visibleChips(HOME_CHIPS, counts, MIN_RECORDS).map((c) => c.code)
  assert.deepEqual(shown, ['6204'])
})

test('a failed or missing count hides the chip rather than showing an empty shelf', () => {
  const counts = new Map<string, number | null>([['6204', null]])
  assert.deepEqual(visibleChips(HOME_CHIPS, counts, MIN_RECORDS), [])
  assert.deepEqual(visibleChips(HOME_CHIPS, new Map(), MIN_RECORDS), [])
})

test('8517 is not a candidate', () => {
  // India to US electronics is a few consignees filing thousands of times.
  assert.ok(!HOME_CHIPS.some((c) => c.code === '8517'))
})

test('the home page counts buyers through the shared query path', () => {
  // countBuyers goes through runCompanyQuery, which applies PACK_COUNTRY: the
  // chip counts US buyers exactly as checkout does.
  const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8')
  assert.match(page, /countBuyers\(/)
  assert.match(page, /mergeByBuyer\(/)
  assert.match(page, /visibleChips\(/)
})

test('metadata states no count and no literal price', () => {
  const layout = readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(layout, /\d{2,}\s*[–-]\s*\d{2,}\s*buyer/i)
  assert.doesNotMatch(layout, /\$\d/)
})
