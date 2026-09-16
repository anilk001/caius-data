import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Packs are sold as US importers, and the only thing keeping a Canadian buyer
 * out of one is a single `.eq('country', ...)` in runCompanyQuery. Public
 * search, pack assembly and the buyer count all go through that function
 * today, so the preview, the price and the delivered file agree.
 *
 * A second query path would break that quietly: the rows would come back, the
 * pack would ship, and the first person to notice would be a customer reading
 * "Brampton, ON" under a heading that says US. search.ts cannot be imported
 * here — it is `server-only` and uses `@/` aliases — so this guards the
 * structure instead of the behaviour, which is the part that is easy to
 * regress and hard to see.
 */

const SRC = new URL('../src/', import.meta.url).pathname

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (/\.tsx?$/.test(entry)) found.push(path)
  }
  return found
}

test('companies is queried from exactly one place', () => {
  const callers = sourceFiles(SRC).filter((path) =>
    /\bfrom\(\s*['"]companies['"]\s*\)/.test(readFileSync(path, 'utf8')),
  )
  assert.deepEqual(
    callers.map((p) => p.slice(SRC.length)),
    ['lib/search.ts'],
    'a new companies query must filter on country, or Canadian buyers leak into US packs',
  )
})

test('that one place filters on country', () => {
  const source = readFileSync(join(SRC, 'lib/search.ts'), 'utf8')
  assert.match(source, /PACK_COUNTRY\s*=\s*'US'/)
  assert.match(source, /\.eq\(\s*'country'/)
})

test('the filter is applied where every read passes through it', () => {
  const source = readFileSync(join(SRC, 'lib/search.ts'), 'utf8')
  const builder = source.slice(source.indexOf('function runCompanyQuery'))
  assert.ok(
    /\.eq\(\s*'country'/.test(builder),
    "the country filter must sit inside runCompanyQuery, which is the only path all three readers share",
  )
})
