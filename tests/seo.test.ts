import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CANONICAL_ORIGIN, absoluteUrl, pageMetadata } from '../src/lib/seo.ts'

test('canonicals are absolute on www', () => {
  // The apex forwards to www (next.config.ts); a canonical on the apex or on
  // Railway's generated host would name a duplicate as the original.
  assert.equal(CANONICAL_ORIGIN, 'https://www.caiusdata.com')
  assert.equal(absoluteUrl('/'), 'https://www.caiusdata.com')
  assert.equal(absoluteUrl('/packs'), 'https://www.caiusdata.com/packs')
  assert.equal(absoluteUrl('packs'), 'https://www.caiusdata.com/packs')
})

test('a page gets its own url, title and description everywhere', () => {
  const meta = pageMetadata({ title: 'Packs', description: 'd', path: '/packs' })
  assert.equal(meta.alternates.canonical, 'https://www.caiusdata.com/packs')
  assert.equal(meta.openGraph.url, 'https://www.caiusdata.com/packs')
  assert.equal(meta.openGraph.title, 'Packs · Caius Data')
  assert.equal(meta.twitter.title, 'Packs · Caius Data')
  assert.equal(meta.openGraph.description, 'd')
  assert.ok(!('robots' in meta))
})

test('noindex keeps links followed', () => {
  const meta = pageMetadata({ title: 't', description: 'd', path: '/x', noindex: true })
  assert.deepEqual(meta.robots, { index: false, follow: true })
})

test('the brief\'s copy is gone from every page', () => {
  // "Indian exporters" and "export leads India" narrowed the market to one
  // country; the buyers are relevant to any exporter of the product.
  const root = fileURLToPath(new URL('../src/', import.meta.url))
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((e) => {
      const p = join(dir, e)
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(e) ? [p] : []
    })
  for (const file of walk(root)) {
    const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    assert.doesNotMatch(code, /Indian exporters|export leads India/i, file)
  }
})
