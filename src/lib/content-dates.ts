/**
 * When each hand-written page last changed, as ISO dates.
 *
 * The sitemap's lastmod used to be `new Date()` on every request, which tells
 * a crawler every page changed every time it looks — so it learns to ignore
 * the field. These are the real dates; the legal pages print them too, so
 * "Last updated" and the sitemap cannot disagree. Change the date when you
 * change the copy.
 */
export const CONTENT_UPDATED = {
  terms: '2026-09-15',
  privacy: '2026-10-10',
  refunds: '2026-09-15',
  about: '2026-10-10',
  comparisons: '2026-10-10',
} as const

/** "15 September 2026", the form the legal pages print. */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso))
}
