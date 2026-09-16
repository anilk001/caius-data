import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { buyerKey, mergeByBuyer, overFetch, type Buyer } from '../src/lib/buyers.ts'
import { MAX_SEARCH_LIMIT } from '../src/lib/search-limits.ts'
import {
  PACKS,
  proratedAmountCents,
  isTooSmallToSell,
  minCompaniesFor,
  MIN_SALE_CENTS,
} from '../src/lib/packs.ts'
import type { CompanyRow } from '../src/types/database.ts'

/**
 * A pack sold as "200 companies" has to contain 200 companies a customer can
 * count. These tests pin that promise: one buyer filing from several warehouses
 * is one row, and the pack still reaches its advertised size.
 */

let nextId = 0
function row(partial: Partial<CompanyRow> & { name: string }): CompanyRow {
  return {
    id: `id-${nextId++}`,
    name: partial.name,
    address: partial.address ?? null,
    city: partial.city ?? null,
    state: partial.state ?? null,
    country: 'US',
    hs4_code: partial.hs4_code ?? '6204',
    hs4_source: 'declared',
    hs4_confidence: null,
    product_description: partial.product_description ?? null,
    primary_port: partial.primary_port ?? null,
    first_seen: partial.first_seen ?? null,
    last_seen: partial.last_seen ?? null,
    shipment_count: partial.shipment_count ?? 0,
    company_key: null,
    created_at: null,
    updated_at: null,
  } as unknown as CompanyRow
}

describe('buyerKey', () => {
  it('treats legal-suffix variants as the same buyer', () => {
    const keys = new Set([
      buyerKey('Acme Imports Inc'),
      buyerKey('ACME IMPORTS LLC'),
      buyerKey('Acme Imports, Ltd.'),
      buyerKey('Acme Imports Private Limited'),
    ])
    assert.equal(keys.size, 1)
  })

  it('matches the Python ingest on Indian and Singaporean suffixes', () => {
    assert.equal(buyerKey('Orient Craft Pvt Ltd'), buyerKey('ORIENT CRAFT LIMITED'))
    assert.equal(buyerKey('Azazie SG Pte Ltd'), buyerKey('AZAZIE SG PTE. LTD.'))
  })

  it('cuts at an alias slash, since one buyer files under two names', () => {
    assert.equal(
      buyerKey('AZAZIE SG PTE. LTD/ AZAZIE INC.'),
      buyerKey('AZAZIE SG PTE. LTD.'),
    )
  })

  it('leaves a Danish A/S suffix alone', () => {
    // Splitting here would invent a company called "Maersk Line A".
    assert.notEqual(buyerKey('MAERSK LINE A/S'), buyerKey('MAERSK LINE A'))
  })

  it('never strips a name down to nothing', () => {
    assert.equal(buyerKey('Holdings'), 'holdings')
    assert.equal(buyerKey('  '), '')
    assert.equal(buyerKey(null), '')
  })

  it('distinguishes genuinely different buyers', () => {
    assert.notEqual(buyerKey('Old Navy LLC'), buyerKey('Gap Inc'))
  })
})

describe('mergeByBuyer', () => {
  it('turns one buyer at three warehouses into one row', () => {
    const merged = mergeByBuyer([
      row({ name: 'OLD NAVY LLC', city: 'New York', state: 'NY', shipment_count: 700 }),
      row({ name: 'Old Navy, Inc.', city: 'Chicago', state: 'IL', shipment_count: 300 }),
      row({ name: 'OLD NAVY', city: 'Newark', state: 'NJ', shipment_count: 100 }),
    ])

    assert.equal(merged.length, 1)
    assert.equal(merged[0].mergedRows, 3)
    // Shipment counts are parts of one buyer's trade, so they sum.
    assert.equal(merged[0].shipment_count, 1100)
    assert.deepEqual(merged[0].locations, ['New York, NY', 'Chicago, IL', 'Newark, NJ'])
  })

  it('keeps the date range across every filing', () => {
    const merged = mergeByBuyer([
      row({ name: 'Acme Inc', first_seen: '2025-06-01', last_seen: '2026-01-01' }),
      row({ name: 'Acme LLC', first_seen: '2025-02-01', last_seen: '2025-09-01' }),
    ])
    assert.equal(merged[0].first_seen, '2025-02-01')
    assert.equal(merged[0].last_seen, '2026-01-01')
  })

  it('fills a blank field from another filing rather than losing it', () => {
    const merged = mergeByBuyer([
      row({ name: 'Acme Inc', address: null, primary_port: 'Los Angeles' }),
      row({ name: 'Acme LLC', address: '1 Main St', primary_port: 'Long Beach' }),
    ])
    assert.equal(merged[0].address, '1 Main St')
    // The first filing's port wins — it is the higher-ranked row.
    assert.equal(merged[0].primary_port, 'Los Angeles')
  })

  it('collects headings when a keyword pack spans more than one', () => {
    const merged = mergeByBuyer([
      row({ name: 'Gap Inc', hs4_code: '6204' }),
      row({ name: 'GAP INC.', hs4_code: '6109' }),
    ])
    assert.deepEqual(merged[0].hs4Codes, ['6204', '6109'])
  })

  it('preserves rank order, so a pack matches the preview that sold it', () => {
    const merged = mergeByBuyer([
      row({ name: 'Big Buyer Inc', shipment_count: 900 }),
      row({ name: 'Small Buyer Inc', shipment_count: 10 }),
      row({ name: 'BIG BUYER LLC', shipment_count: 800 }),
    ])
    assert.deepEqual(
      merged.map((b: Buyer) => b.name),
      ['Big Buyer Inc', 'Small Buyer Inc'],
    )
  })

  it('does not merge distinct buyers', () => {
    const merged = mergeByBuyer([
      row({ name: 'Old Navy LLC' }),
      row({ name: 'Gap Inc' }),
      row({ name: 'Urban Outfitters Inc' }),
    ])
    assert.equal(merged.length, 3)
  })

  it('keeps unnamed rows apart rather than collapsing them into one', () => {
    // An empty buyerKey must not become a bucket that swallows every blank row.
    const merged = mergeByBuyer([row({ name: '' }), row({ name: '  ' })])
    assert.equal(merged.length, 2)
  })

  it('handles an empty result', () => {
    assert.deepEqual(mergeByBuyer([]), [])
  })
})

describe('overFetch', () => {
  it('asks for more rows than the pack needs, because merging shrinks them', () => {
    assert.ok(overFetch(200, MAX_SEARCH_LIMIT) > 200)
    assert.ok(overFetch(50, MAX_SEARCH_LIMIT) >= 75)
  })

  it('never exceeds the query ceiling', () => {
    assert.equal(overFetch(500, MAX_SEARCH_LIMIT), MAX_SEARCH_LIMIT)
    assert.ok(overFetch(400, MAX_SEARCH_LIMIT) <= MAX_SEARCH_LIMIT)
  })

  it('delivers a full pack when duplicates are present', () => {
    // 260 rows in which every tenth buyer files twice. Asking for exactly 200
    // would return 200 rows and merge down to about 182 — a short pack.
    const rows: CompanyRow[] = []
    for (let i = 0; i < 260; i += 1) {
      const buyer = Math.floor(i / 1.3)
      rows.push(row({ name: `Buyer ${buyer} Inc`, shipment_count: 1000 - i }))
    }
    const merged = mergeByBuyer(rows.slice(0, overFetch(200, MAX_SEARCH_LIMIT)))
    assert.ok(merged.length >= 200, `only ${merged.length} distinct buyers`)
    assert.equal(merged.slice(0, 200).length, 200)
  })
})

describe('pro-rata pricing for a short niche', () => {
  const pack = { id: 'p', name: 'Starter', recordCount: 200, amountCents: 1900, blurb: '' }

  it('charges full price when the niche is full', () => {
    assert.equal(proratedAmountCents(pack, 200), 1900)
    assert.equal(proratedAmountCents(pack, 500), 1900)
  })

  it('charges the fraction actually delivered', () => {
    // 120 of 200 companies is 60% of the pack, so 60% of the price.
    assert.equal(proratedAmountCents(pack, 120), 1140)
    assert.equal(proratedAmountCents(pack, 100), 950)
  })

  it('rounds the buyer\u2019s way, never ours', () => {
    // 1900 * 7 / 200 = 66.5 cents. Floored, not rounded up.
    assert.equal(proratedAmountCents(pack, 7), 66)
  })

  it('never charges for a pack it cannot fill at all', () => {
    assert.equal(proratedAmountCents(pack, 0), 0)
    assert.equal(proratedAmountCents(pack, -5), 0)
  })

  it('refuses any sale under the $9 minimum', () => {
    // $19 over 200 companies is 9.5c each, so $9 needs 95 of them.
    assert.equal(minCompaniesFor(pack), 95)
    assert.equal(isTooSmallToSell(pack, 94), true)
    assert.equal(isTooSmallToSell(pack, 95), false)
    assert.equal(isTooSmallToSell(pack, 200), false)
    assert.ok(proratedAmountCents(pack, 94) < MIN_SALE_CENTS)
    assert.ok(proratedAmountCents(pack, 95) >= MIN_SALE_CENTS)
  })

  it('never lets a floored price slip under the minimum', () => {
    // minCompaniesFor ceilings precisely because proratedAmountCents floors.
    for (const real of PACKS) {
      const floor = minCompaniesFor(real)
      assert.ok(
        proratedAmountCents(real, floor) >= MIN_SALE_CENTS,
        `${real.id}: ${floor} companies prices under the minimum`,
      )
      assert.equal(isTooSmallToSell(real, floor), false)
      assert.equal(isTooSmallToSell(real, floor - 1), true)
    }
  })

  it('keeps the minimum reachable inside every pack', () => {
    // A pack whose full price is under the floor would be unsellable at any
    // size. That is a pricing mistake, not a runtime condition.
    for (const real of PACKS) {
      assert.ok(
        real.amountCents >= MIN_SALE_CENTS,
        `${real.id} is priced below the minimum sale`,
      )
      assert.ok(minCompaniesFor(real) <= real.recordCount)
    }
  })

  it('prices every real pack sanely at one company, then refuses it', () => {
    for (const real of PACKS) {
      const one = proratedAmountCents(real, 1)
      assert.ok(one >= 0 && one < real.amountCents, `${real.id} priced oddly at 1`)
      assert.equal(isTooSmallToSell(real, 1), true)
    }
  })
})
