import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  priceCents,
  perCompanyCents,
  BASE_CENTS,
  BASE_RECORDS,
  MIN_RECORDS,
  RATE_BANDS,
} from '../src/lib/pricing.ts'

describe('per-company pricing', () => {
  it('charges the base for the base number of companies', () => {
    assert.equal(priceCents(50), 900)
  })

  it('refuses a list too small to sell', () => {
    // null, not 0 — an unsellable list must not read as a free one.
    assert.equal(priceCents(49), null)
    assert.equal(priceCents(0), null)
    assert.equal(priceCents(-10), null)
    assert.equal(priceCents(Number.NaN), null)
  })

  it('charges 15c each through the first band', () => {
    assert.equal(priceCents(100), 900 + 50 * 15)
    assert.equal(priceCents(200), 3150)
    assert.equal(priceCents(500), 900 + 450 * 15) // $76.50
  })

  it('tapers to 9c beyond 500 and 5c beyond 1000', () => {
    assert.equal(priceCents(1000), 7650 + 500 * 9) // $121.50
    assert.equal(priceCents(2000), 12150 + 1000 * 5) // $171.50
  })

  it('prices the real lanes we expect to sell', () => {
    // The whole Vietnam 6204 lane, and the whole heading across all origins.
    assert.equal(priceCents(7592), 12150 + 6592 * 5) // $451.10
    assert.equal(priceCents(15916), 12150 + 14916 * 5) // $867.30
  })

  it('stays under the cheapest annual subscription for any realistic lane', () => {
    // Volza Startup is $1,500/year and is the cheapest with HS-and-origin
    // filtering. Without a cap, the taper alone has to hold the line — so this
    // pins where it stops holding, rather than assuming it always does.
    assert.ok(priceCents(15916)! < 150_000, 'the largest heading seen must undercut Volza')
    assert.ok(priceCents(28_000)! < 150_000)
    assert.ok(priceCents(30_000)! > 150_000, 'crossover is around 28,500 — worth knowing')
  })

  it('gets cheaper per company at every step, never dearer', () => {
    // The property the whole rate card exists to guarantee: a buyer who takes
    // more must never pay more each. One inverted band edge breaks it silently.
    let previous = Infinity
    for (let n = MIN_RECORDS; n <= 5000; n += 1) {
      const per = priceCents(n)! / n
      assert.ok(per <= previous + 1e-9, `per-company price rose at ${n}`)
      previous = per
    }
  })

  it('never charges less in total for more companies', () => {
    let previous = 0
    for (let n = MIN_RECORDS; n <= 5000; n += 1) {
      const total = priceCents(n)!
      assert.ok(total >= previous, `total fell at ${n}`)
      previous = total
    }
  })

  it('reports the rate a buyer is actually getting', () => {
    assert.equal(perCompanyCents(50), 18)
    assert.ok(perCompanyCents(7592)! < 6)
    assert.equal(perCompanyCents(49), null)
  })

  it('keeps the rate card sane', () => {
    // Bands must ascend and rates must fall, or the taper is not a taper.
    let edge = BASE_RECORDS
    let rate = Infinity
    for (const band of RATE_BANDS) {
      assert.ok(band.cents < rate, 'each band must be cheaper than the last')
      rate = band.cents
      if (band.upTo !== null) {
        assert.ok(band.upTo > edge, 'band edges must ascend')
        edge = band.upTo
      }
    }
    assert.ok(BASE_CENTS > 0)
  })
})
