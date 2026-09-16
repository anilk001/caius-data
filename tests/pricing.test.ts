import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import {
  priceCents,
  recordsAtCap,
  BASE_CENTS,
  BASE_RECORDS,
  CAP_CENTS,
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
    assert.equal(priceCents(250), 3900)
  })

  it('tapers beyond 250 and again beyond 1000', () => {
    assert.equal(priceCents(500), 3900 + 250 * 8)
    assert.equal(priceCents(1000), 3900 + 750 * 8)
    assert.equal(priceCents(2000), 9900 + 1000 * 4)
  })

  it('never exceeds the cap, however deep the lane', () => {
    // The whole Vietnam 6204 lane, and the whole heading across all origins.
    assert.equal(priceCents(7592), CAP_CENTS)
    assert.equal(priceCents(15916), CAP_CENTS)
    assert.equal(priceCents(1_000_000), CAP_CENTS)
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

  it('stays far below the market it undercuts', () => {
    // Cheapest annual subscription with HS-and-origin filtering is $1,500.
    assert.ok(CAP_CENTS < 150_000 / 5, 'a whole lane should undercut Volza many times over')
  })

  it('reports where the cap takes over', () => {
    const at = recordsAtCap()
    assert.equal(priceCents(at), CAP_CENTS)
    assert.ok(priceCents(at - 1)! < CAP_CENTS, 'one fewer should still be under the cap')
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
    assert.ok(BASE_CENTS < CAP_CENTS)
  })
})
