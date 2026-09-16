/**
 * HS code helpers.
 *
 * Kept free of any `@/` or server-only imports so it can be unit-tested
 * directly under `node --test`, and imported from both client and server.
 */

/** Reduce any HS/HTS code to a clean 4-digit chapter+heading, or null. */
export function normalizeHs4(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(0, 4) : null
}

/** True when the input is already exactly four digits. */
export function isHs4(raw: string | null | undefined): boolean {
  return typeof raw === 'string' && /^\d{4}$/.test(raw.trim())
}

/**
 * The most HS4 headings one search may carry.
 *
 * Generous on purpose — a buyer taking six headings is a bigger sale than one
 * taking one, and there is no reason to stand in the way. The cap exists only
 * so a hand-edited URL cannot turn into a thousand-value SQL `in` clause.
 */
export const MAX_HS4_CODES = 20

/**
 * Parse one or many HS4 codes from a URL value, a form field, or an array.
 *
 * Accepts "6204", "6204,6203", "6204 6203" and ["6204", "6203"] alike, because
 * all four arrive: the first from an old shared link, the second from the
 * chips input, the third from someone pasting a list out of a spreadsheet.
 * Deduplicates and keeps the order given, so a shared URL stays stable.
 */
export function parseHs4List(raw: string | string[] | null | undefined): string[] {
  if (!raw) return []

  const parts = Array.isArray(raw) ? raw : String(raw).split(/[,\s;]+/)
  const seen = new Set<string>()

  for (const part of parts) {
    const code = normalizeHs4(part)
    if (code && !seen.has(code)) seen.add(code)
    if (seen.size >= MAX_HS4_CODES) break
  }

  return [...seen]
}

/** Render a list of headings for a URL or a stored order row. */
export function formatHs4List(codes: string[] | null | undefined): string {
  return (codes ?? []).join(',')
}
