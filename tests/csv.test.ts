import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { csvFilename, toCsv, withBom, type CsvColumn } from '../src/lib/csv.ts'
import {
  normalizeHs4,
  isHs4,
  parseHs4List,
  formatHs4List,
  MAX_HS4_CODES,
} from '../src/lib/hs4.ts'
import { MAX_SEARCH_LIMIT, MAX_PACK_RECORDS } from '../src/lib/search-limits.ts'
import { priceCents, MIN_RECORDS } from '../src/lib/pricing.ts'
import { formatUsd } from '../src/lib/utils.ts'

interface Row {
  name: string
  city: string | null
  count: number | null
}

const columns: CsvColumn<Row>[] = [
  { header: 'Company', value: (r) => r.name },
  { header: 'City', value: (r) => r.city },
  { header: 'Shipments', value: (r) => r.count },
]

describe('toCsv', () => {
  it('writes a header row and CRLF line endings', () => {
    const csv = toCsv([{ name: 'Acme', city: 'LA', count: 3 }], columns)
    assert.equal(csv, 'Company,City,Shipments\r\nAcme,LA,3\r\n')
  })

  it('renders null and undefined as empty cells, not "null"', () => {
    const csv = toCsv([{ name: 'Acme', city: null, count: null }], columns)
    assert.equal(csv, 'Company,City,Shipments\r\nAcme,,\r\n')
  })

  it('quotes cells containing commas, quotes or newlines', () => {
    const csv = toCsv(
      [{ name: 'Acme, Inc', city: 'He said "hi"', count: 1 }],
      columns,
    )
    assert.match(csv, /"Acme, Inc"/)
    assert.match(csv, /"He said ""hi"""/)
  })

  it('keeps a multi-line cell inside one quoted field', () => {
    const csv = toCsv([{ name: 'Line1\nLine2', city: 'LA', count: 1 }], columns)
    assert.match(csv, /"Line1\nLine2"/)
  })

  // The product is a file people open in Excel. A company name beginning with
  // = + - @ would otherwise be evaluated as a formula on open.
  describe('formula injection guard', () => {
    for (const payload of [
      '=1+1',
      '+1+1',
      '-1+1',
      '@SUM(A1)',
      '=cmd|\' /c calc\'!A0',
      '=HYPERLINK("http://evil","click")',
    ]) {
      it(`neutralises ${JSON.stringify(payload)}`, () => {
        const csv = toCsv([{ name: payload, city: 'LA', count: 1 }], columns)
        const cell = csv.split('\r\n')[1].split(',')[0]
        assert.ok(
          cell.startsWith("'") || cell.startsWith('"\''),
          `expected a leading apostrophe, got ${cell}`,
        )
        assert.ok(!cell.startsWith('='), 'cell must not start with =')
      })
    }

    it('leaves an ordinary name untouched', () => {
      const csv = toCsv([{ name: 'Acme Imports Inc', city: 'LA', count: 1 }], columns)
      assert.match(csv, /\r\nAcme Imports Inc,LA,1/)
    })
  })
})

describe('withBom', () => {
  it('prefixes the UTF-8 BOM so Excel on Windows reads UTF-8', () => {
    assert.equal(withBom('a,b\r\n').charCodeAt(0), 0xfeff)
  })
})

describe('csvFilename', () => {
  it('slugifies and drops empty parts', () => {
    assert.equal(
      csvFilename(['Caius Data', null, '6204', 'Women’s Dresses']),
      'caius-data-6204-women-s-dresses.csv',
    )
  })

  it('falls back when every part is empty', () => {
    assert.equal(csvFilename([null, undefined, '']), 'caius-data.csv')
  })
})

describe('normalizeHs4', () => {
  it('extracts the 4-digit chapter from a long HTS code', () => {
    assert.equal(normalizeHs4('6204.42.3060'), '6204')
    assert.equal(normalizeHs4('6204420000'), '6204')
  })

  it('rejects anything shorter than 4 digits', () => {
    assert.equal(normalizeHs4('62'), null)
    assert.equal(normalizeHs4('abc'), null)
    assert.equal(normalizeHs4(null), null)
  })

  it('isHs4 only accepts exactly four digits', () => {
    assert.equal(isHs4('6204'), true)
    assert.equal(isHs4(' 6204 '), true)
    assert.equal(isHs4('62040'), false)
    assert.equal(isHs4('620a'), false)
    assert.equal(isHs4(null), false)
  })
})

describe('pricing / query limits', () => {
  // There is no price ceiling: a buyer may take a whole lane, and the largest
  // seen is 15,916 companies. So the paid path pages instead of issuing one
  // capped query, and nothing in pricing may reintroduce a cap by the back door.
  it('prices lists far beyond one request', () => {
    assert.ok(priceCents(MAX_SEARCH_LIMIT * 40) !== null)
    assert.ok(priceCents(15_916)! > priceCents(MAX_SEARCH_LIMIT)!)
  })

  it('prices right up to the safety ceiling', () => {
    // MAX_PACK_RECORDS guards memory, not revenue. Everything under it sells.
    assert.ok(priceCents(MAX_PACK_RECORDS) !== null)
    assert.ok(MAX_PACK_RECORDS > 15_916, 'the largest lane seen must fit')
  })

  it('sells nothing smaller than the minimum', () => {
    assert.equal(priceCents(MIN_RECORDS - 1), null)
    assert.ok(MIN_RECORDS < MAX_SEARCH_LIMIT)
  })
})

describe('formatUsd', () => {
  it('drops cents on round amounts', () => {
    assert.equal(formatUsd(900), '$9')
    assert.equal(formatUsd(7650), '$76.50')
  })

  it('keeps cents when they matter', () => {
    assert.equal(formatUsd(1999), '$19.99')
  })
})

describe('multi-heading selection', () => {
  it('parses one code, many codes, and a pasted list alike', () => {
    assert.deepEqual(parseHs4List('6204'), ['6204'])
    assert.deepEqual(parseHs4List('6204,6203'), ['6204', '6203'])
    assert.deepEqual(parseHs4List('6204 6203; 6109'), ['6204', '6203', '6109'])
    assert.deepEqual(parseHs4List(['6204', '6203']), ['6204', '6203'])
  })

  it('keeps a link shared before multi-select existed working', () => {
    assert.deepEqual(parseHs4List('6204'), ['6204'])
    assert.deepEqual(parseHs4List(null), [])
    assert.deepEqual(parseHs4List(''), [])
  })

  it('takes the heading off a longer tariff code', () => {
    // People paste 10-digit HTS codes straight out of an invoice.
    assert.deepEqual(parseHs4List('6204420000, 6203320000'), ['6204', '6203'])
  })

  it('drops duplicates while keeping the order given', () => {
    assert.deepEqual(parseHs4List('6204,6203,6204'), ['6204', '6203'])
  })

  it('ignores anything that is not a heading', () => {
    assert.deepEqual(parseHs4List('62,abc,6204'), ['6204'])
  })

  it('caps the list so a hand-edited URL cannot run away', () => {
    const many = Array.from({ length: MAX_HS4_CODES + 30 }, (_, i) =>
      String(1000 + i),
    ).join(',')
    assert.equal(parseHs4List(many).length, MAX_HS4_CODES)
  })

  it('round-trips through a URL value', () => {
    const codes = ['6204', '6203', '6109']
    assert.deepEqual(parseHs4List(formatHs4List(codes)), codes)
    assert.equal(formatHs4List([]), '')
  })
})
