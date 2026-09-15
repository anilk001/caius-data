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
