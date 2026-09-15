/**
 * RFC 4180 CSV generation.
 *
 * Buyers open these files in Excel and Google Sheets, so cells that begin with
 * `= + - @` are prefixed with a single quote. Without that guard a company name
 * like "=DDE(...)" becomes a formula the moment the buyer opens the file.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

const FORMULA_PREFIX = /^[=+\-@\t\r]/

function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  let value = String(raw)

  if (FORMULA_PREFIX.test(value)) {
    value = `'${value}`
  }

  if (/[",\n\r]/.test(value)) {
    value = `"${value.replace(/"/g, '""')}"`
  }

  return value
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((c) => escapeCell(c.header)).join(',')]

  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','))
  }

  // Trailing newline keeps `wc -l` and naive parsers happy.
  return `${lines.join('\r\n')}\r\n`
}

/**
 * UTF-8 BOM. Excel on Windows assumes the system codepage without it, which
 * mangles accented company names.
 */
export function withBom(csv: string): string {
  return `﻿${csv}`
}

export function csvFilename(parts: (string | null | undefined)[]): string {
  const slug = parts
    .filter(Boolean)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return `${slug || 'caius-data'}.csv`
}
