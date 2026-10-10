import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BUYER_PAGES,
  buyerPageFaqs,
  buyerPageHeading,
  findBuyerPage,
  maskCompanyName,
  productLine,
} from '../src/lib/buyer-pages.ts'
import { PROMO_PACKS } from '../src/lib/promo-packs.ts'
import { isHs4 } from '../src/lib/hs4.ts'
import { summariseHeading, topBy, monthYear } from '../src/lib/heading-stats.ts'
import { priceCents } from '../src/lib/pricing.ts'

test('every slug names its heading and is URL-safe', () => {
  const slugs = new Set<string>()
  for (const page of BUYER_PAGES) {
    assert.ok(isHs4(page.hs4), `${page.slug}: "${page.hs4}" is not a heading`)
    assert.match(page.slug, /^[a-z0-9-]+$/)
    assert.ok(page.slug.endsWith(`-hs-${page.hs4}`), `${page.slug} does not end with its HS code`)
    assert.ok(!slugs.has(page.slug), `duplicate slug ${page.slug}`)
    slugs.add(page.slug)
  }
})

test('one page per heading', () => {
  // Two pages on one heading would split its ranking and show one count twice.
  const codes = BUYER_PAGES.map((p) => p.hs4)
  assert.equal(new Set(codes).size, codes.length)
})

test('every page sits in the sector pack that sells its heading', () => {
  // The breadcrumb names the sector, and the sector's pack must contain the
  // heading or the "All of garments" link sells a different list.
  for (const page of BUYER_PAGES) {
    const pack = PROMO_PACKS.find((p) => p.slug === page.sector)
    assert.ok(pack, `${page.slug}: no pack called ${page.sector}`)
    assert.ok(pack.hs4.includes(page.hs4), `${page.slug}: ${page.sector} does not carry HS ${page.hs4}`)
  }
})

test('0904 is not sold as black pepper alone', () => {
  // Every record loaded under 0904 is dried or ground red chilli (HS6 090421,
  // 090422). A page calling them black pepper buyers sells the wrong list.
  const page = BUYER_PAGES.find((p) => p.hs4 === '0904')!
  assert.match(page.product, /chilli/i)
  assert.doesNotMatch(page.slug, /black-pepper/)
})

test('the heading reads as briefed', () => {
  const page = findBuyerPage('us-importers-womens-garments-hs-6204')!
  assert.equal(
    buyerPageHeading(page, 108),
    "US Importers of Women's Garments (HS 6204) — 108 Buyer Companies",
  )
  assert.equal(findBuyerPage('nope'), null)
})

test('the full list price is the rate card price', () => {
  // The brief's own worked example: all 108 for $17.70.
  assert.equal(priceCents(108), 1770)
})

test('a masked name keeps no identifying word', () => {
  // "Old Navy" with only the first word masked still reads "Navy" — enough to
  // name the buyer and give away the paid product.
  const masked = maskCompanyName('OLD NAVY LLC')
  assert.equal(masked, 'O** N*** LLC')
  for (const name of ['THE GAP INC', 'Urban Outfitters, Inc.', 'A&B SPICE TRADING CO']) {
    const out = maskCompanyName(name)
    for (const word of name.replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean)) {
      if (/^(inc|co|llc|ltd)$/i.test(word)) continue
      if (word.length < 2) continue
      assert.ok(!out.toLowerCase().includes(word.toLowerCase()), `"${word}" survives in "${out}"`)
    }
  }
  assert.equal(maskCompanyName(null), '—')
})

test('a product line drops numbers and exporter identifiers', () => {
  // Real 0904 goods text: the tail carries the invoice, shipping-bill and
  // GSTIN numbers that identify the Indian exporter.
  const raw =
    'TOTAL NO. OF BAGS- 1469 BA GS RED CHILLI WHOLE S-17 STEMLESS ETO TREATED (O F GENUS CAPSICUM) ' +
    'HS CODE: 09042110 INVOICE NO. EGST/0692 DT . 13.09.2022 =GSTIN : 36AABCB3746N1ZF'
  const line = productLine(raw)
  assert.doesNotMatch(line, /\d/)
  assert.doesNotMatch(line, /egst|gstin|invoice/i)
  assert.match(line, /Red Chilli Whole/)
  assert.equal(productLine(null), '—')
  assert.equal(productLine('HS CODE 09042211'), '—')
})

test('FAQ answers state the count and no contact data', () => {
  const page = findBuyerPage('us-importers-pepper-chillies-hs-0904')!
  const faqs = buyerPageFaqs(page, 110, ['NJ', 'TX', 'CA'])
  assert.equal(faqs.length, 3)
  assert.match(faqs[0].answer, /110 separate US companies/)
  assert.match(faqs[0].answer, /NJ, TX and CA/)
  // The paid file has no emails or phones; an answer implying otherwise is a
  // refund request.
  assert.match(faqs[1].answer, /does not include email addresses, phone numbers/)
})

test('stats rank by buyers, skip blanks and span the dates', () => {
  const row = (state: string | null, port: string | null, first: string, last: string) => ({
    name: 'x', city: null, state, primary_port: port, product_description: null,
    shipment_count: 1, first_seen: first, last_seen: last, updated_at: last,
  })
  const stats = summariseHeading([
    row('NJ', 'Newark', '2024-01-01', '2024-06-01'),
    row('nj', 'Newark', '2023-05-01', '2025-08-21'),
    row(null, 'Houston', '2024-02-01', '2024-03-01'),
    row('TX', null, '2024-02-01', '2024-03-01'),
  ])
  assert.equal(stats.buyers, 4)
  assert.deepEqual(stats.topStates, [{ name: 'NJ', buyers: 2 }, { name: 'TX', buyers: 1 }])
  assert.deepEqual(stats.topPorts[0], { name: 'Newark', buyers: 2 })
  assert.equal(stats.firstSeen, '2023-05-01')
  assert.equal(stats.lastSeen, '2025-08-21')
  assert.equal(monthYear(stats.updatedAt), 'August 2025')
  assert.equal(topBy([], () => 'a').length, 0)
})

test('the landing page never hard-codes a count and counts like checkout', () => {
  // Same rule as the packs page: a number of companies on the page comes out
  // of the database. loadHeading merges with mergeByBuyer, the merge checkout
  // charges on.
  const page = readFileSync(new URL('../src/app/buyers/[slug]/page.tsx', import.meta.url), 'utf8')
  const loader = readFileSync(new URL('../src/lib/headings.ts', import.meta.url), 'utf8')
  for (const source of [page, loader]) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(code, /\b\d{2,}\s*(\+\s*)?(companies|importers|buyers)\b/i)
  }
  assert.match(loader, /mergeByBuyer\(/)
  assert.match(page, /stats\.buyers < MIN_RECORDS\) notFound\(\)/)
})
