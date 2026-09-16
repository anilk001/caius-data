import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { collectPaged, countPaged, type FetchPage } from '../src/lib/paging.ts'
import { mergeByBuyer } from '../src/lib/buyers.ts'
import { PAGE_SIZE, MAX_PACK_RECORDS } from '../src/lib/search-limits.ts'
import type { CompanyRow } from '../src/types/database.ts'

/**
 * Pricing has no ceiling, so a buyer may take a whole lane — 15,916 companies
 * on the largest seen, against a request returning at most a thousand. The
 * promise rests entirely on this arithmetic: an off-by-one duplicates or drops
 * rows inside a file somebody paid for, and a loop that ignores a short page
 * hammers the database for nothing.
 */

/** A source of `total` rows that records every page it was asked for. */
function source(total: number) {
  const pages: Array<{ offset: number; size: number }> = []

  const fetchPage: FetchPage<CompanyRow> = async (offset, size) => {
    pages.push({ offset, size })
    const rows: CompanyRow[] = []
    for (let i = offset; i < Math.min(offset + size, total); i += 1) {
      rows.push({
        id: `id-${i}`,
        name: `Buyer ${i} Inc`,
        city: null,
        state: null,
        hs4_code: '6204',
        shipment_count: total - i,
      } as unknown as CompanyRow)
    }
    return rows
  }

  return { fetchPage, pages }
}

const opts = { pageSize: PAGE_SIZE, ceiling: MAX_PACK_RECORDS }

describe('paging a paid list', () => {
  it('returns every row of a list far larger than one request', async () => {
    const { fetchPage } = source(15_916)
    const rows = await collectPaged(fetchPage, { ...opts, wanted: 15_916 })

    assert.equal(rows.length, 15_916)
    assert.equal(rows[0].id, 'id-0')
    assert.equal(rows.at(-1)!.id, 'id-15915')
  })

  it('never repeats or skips a row across page boundaries', async () => {
    const { fetchPage } = source(2_600)
    const rows = await collectPaged(fetchPage, { ...opts, wanted: 2_600 })

    assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, 'a row appeared twice')
    rows.forEach((row, i) => assert.equal(row.id, `id-${i}`, `row ${i} out of order`))
  })

  it('asks for contiguous pages from zero', async () => {
    const { fetchPage, pages } = source(2_500)
    await collectPaged(fetchPage, { ...opts, wanted: 2_500 })

    assert.equal(pages[0].offset, 0)
    for (let i = 1; i < pages.length; i += 1) {
      assert.equal(
        pages[i].offset,
        pages[i - 1].offset + pages[i - 1].size,
        'gap or overlap between pages',
      )
    }
  })

  it('stops on a short page instead of running to the limit', async () => {
    // A niche holding 300, asked for as 15,916. Without the short-page check
    // this issues sixteen requests and gets nothing back from fifteen of them.
    const { fetchPage, pages } = source(300)
    const rows = await collectPaged(fetchPage, { ...opts, wanted: 15_916 })

    assert.equal(rows.length, 300)
    assert.equal(pages.length, 1)
  })

  it('trims the last page to the remainder', async () => {
    const { fetchPage, pages } = source(15_916)
    const rows = await collectPaged(fetchPage, { ...opts, wanted: 1_200 })

    assert.equal(rows.length, 1_200)
    assert.equal(pages.at(-1)!.size, 1_200 - PAGE_SIZE)
  })

  it('honours the safety ceiling', async () => {
    const { fetchPage } = source(MAX_PACK_RECORDS * 2)
    const rows = await collectPaged(fetchPage, { ...opts, wanted: 10_000_000 })
    assert.equal(rows.length, MAX_PACK_RECORDS)
  })

  it('reads nothing when nothing is wanted', async () => {
    const { fetchPage, pages } = source(1_000)
    assert.deepEqual(await collectPaged(fetchPage, { ...opts, wanted: 0 }), [])
    assert.equal(pages.length, 0)
  })

  it('survives an empty result', async () => {
    const { fetchPage } = source(0)
    assert.deepEqual(await collectPaged(fetchPage, { ...opts, wanted: 500 }), [])
  })
})

describe('counting buyers for a quote', () => {
  const merge = (rows: CompanyRow[]) => mergeByBuyer(rows)

  it('stops as soon as it has enough', async () => {
    // Pricing 50 companies out of a 15,916-row lane must cost one request.
    const { fetchPage, pages } = source(15_916)
    const count = await countPaged(fetchPage, { ...opts, wanted: 50 }, merge)

    assert.ok(count >= 50)
    assert.equal(pages.length, 1)
  })

  it('reads on when merging leaves too few', async () => {
    const { fetchPage, pages } = source(15_916)
    await countPaged(fetchPage, { ...opts, wanted: 2_500 }, merge)
    assert.ok(pages.length > 1, 'should have paged past the first request')
  })

  it('reports what a thin niche really holds', async () => {
    const { fetchPage } = source(37)
    assert.equal(await countPaged(fetchPage, { ...opts, wanted: 200 }, merge), 37)
  })

  it('counts buyers, not rows', async () => {
    // Twelve rows, three of them the same buyer under different suffixes.
    const rows: CompanyRow[] = [
      ...['Old Navy LLC', 'Old Navy, Inc.', 'OLD NAVY'],
      ...Array.from({ length: 9 }, (_, i) => `Buyer ${i} Inc`),
    ].map((name, i) => ({ id: `id-${i}`, name, city: null, state: null, hs4_code: '6204' }) as unknown as CompanyRow)

    const fetchPage: FetchPage<CompanyRow> = async (offset, size) =>
      rows.slice(offset, offset + size)

    assert.equal(await countPaged(fetchPage, { ...opts, wanted: 100 }, merge), 10)
  })
})
