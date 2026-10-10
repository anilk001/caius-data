import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { homeFaqs } from '../src/lib/home-faqs.ts'
import { MIN_RECORDS } from '../src/lib/pricing.ts'

test('the footer\'s #faq anchor has a section to land on', () => {
  // "How it works" linked to /#faq for months while no FAQ existed.
  const page = readFileSync(new URL('../src/app/page.tsx', import.meta.url), 'utf8')
  const footer = readFileSync(new URL('../src/components/site-footer.tsx', import.meta.url), 'utf8')
  assert.match(page, /id="faq"/)
  assert.match(page, /id="how-it-works"/)
  assert.match(footer, /href="\/#faq"/)
  assert.match(footer, /href="\/#how-it-works"/)
})

test('the FAQ never promises contact data or a subscription', () => {
  const faqs = homeFaqs(MIN_RECORDS)
  assert.equal(faqs.length, 8)
  const contact = faqs.find((f) => /contact emails/.test(f.question))!
  assert.match(contact.answer, /^No\./)
  const sub = faqs.find((f) => /subscription/.test(f.question))!
  assert.match(sub.answer, /^No\./)
})

test('the India answer never says buyers import from the visitor\'s country', () => {
  const india = homeFaqs(MIN_RECORDS).find((f) => /not from India/.test(f.question))!
  assert.match(india.answer, /India–US/)
  assert.match(india.answer, /do not claim they buy from your country/)
})

test('the minimum comes from the rate card', () => {
  const faq = homeFaqs(MIN_RECORDS).find((f) => /fewer companies/.test(f.question))!
  assert.match(faq.answer, new RegExp(`smallest list we sell is ${MIN_RECORDS} companies`))
})
