import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { csvFilename, toCsv, withBom, type CsvColumn } from '../src/lib/csv.ts'
import { normalizeHs4, isHs4 } from '../src/lib/hs4.ts'
import { PACKS, getPack } from '../src/lib/packs.ts'
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

describe('packs', () => {
  it('has unique ids', () => {
    assert.equal(new Set(PACKS.map((p) => p.id)).size, PACKS.length)
  })

  it('prices rise with record count', () => {
    const sorted = [...PACKS].sort((a, b) => a.recordCount - b.recordCount)
    for (let i = 1; i < sorted.length; i += 1) {
      assert.ok(
        sorted[i].amountCents > sorted[i - 1].amountCents,
        `${sorted[i].id} must cost more than ${sorted[i - 1].id}`,
      )
    }
  })

  it('stays inside the advertised $19-$49 band', () => {
    for (const pack of PACKS) {
      assert.ok(pack.amountCents >= 1900 && pack.amountCents <= 4900, pack.id)
    }
  })

  it('refuses an unknown pack id, so price cannot be forged', () => {
    assert.equal(getPack('free-1000000'), undefined)
    assert.equal(getPack(null), undefined)
  })
})

describe('formatUsd', () => {
  it('drops cents on round amounts', () => {
    assert.equal(formatUsd(1900), '$19')
    assert.equal(formatUsd(4900), '$49')
  })

  it('keeps cents when they matter', () => {
    assert.equal(formatUsd(1999), '$19.99')
  })
})
