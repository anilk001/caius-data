import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  breadcrumbLd,
  faqLd,
  organizationLd,
  productLd,
  serialiseLd,
  websiteLd,
} from '../src/lib/structured-data.ts'
import { priceCents } from '../src/lib/pricing.ts'

test('the Organization names the operator as filed', () => {
  const org = organizationLd({ legalName: 'Caius Data LLC', supportEmail: 'support@caiusdata.com' })
  assert.equal(org.name, 'Caius Data')
  assert.equal(org.legalName, 'Caius Data LLC')
  assert.equal(org.email, 'support@caiusdata.com')
  assert.equal(org.logo, 'https://www.caiusdata.com/logo.png')
  assert.deepEqual(org.address, { '@type': 'PostalAddress', addressRegion: 'WY', addressCountry: 'US' })
  assert.deepEqual((websiteLd().publisher as { '@id': string })['@id'], org['@id'])
})

test('the Offer price is the rate-card price, in dollars', () => {
  // 108 companies on the rate card is $17.70; the markup must say 17.70, not
  // 1770 and not a rounded 18.
  const ld = productLd({ name: 'n', description: 'd', path: '/buyers/x', sku: 's', priceCents: priceCents(108)! })
  const offer = ld.offers as Record<string, string>
  assert.equal(offer.price, '17.70')
  assert.equal(offer.priceCurrency, 'USD')
  assert.equal(offer.availability, 'https://schema.org/InStock')
  assert.equal(offer.url, 'https://www.caiusdata.com/buyers/x')
})

test('breadcrumbs are numbered from one with absolute urls', () => {
  const ld = breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Packs', path: '/packs' }])
  const items = ld.itemListElement as { position: number; item: string }[]
  assert.deepEqual(items.map((i) => i.position), [1, 2])
  assert.equal(items[1].item, 'https://www.caiusdata.com/packs')
})

test('FAQ markup carries the visible text unchanged', () => {
  const faqs = [{ question: 'Q?', answer: 'A.' }]
  const ld = faqLd(faqs)
  const q = (ld.mainEntity as { name: string; acceptedAnswer: { text: string } }[])[0]
  assert.equal(q.name, 'Q?')
  assert.equal(q.acceptedAnswer.text, 'A.')
})

test('a value cannot close the script tag', () => {
  const out = serialiseLd({ name: '</script><script>alert(1)</script>' })
  assert.doesNotMatch(out, /<\/script/i)
  assert.equal(JSON.parse(out).name, '</script><script>alert(1)</script>')
})
