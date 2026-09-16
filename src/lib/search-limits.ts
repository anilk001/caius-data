/**
 * Shared query limits.
 *
 * Kept free of server-only imports so both the search layer and the tests can
 * read them.
 */

/** Rows one public search request may return. Protects the browse endpoint. */
export const MAX_SEARCH_LIMIT = 500

/** Rows fetched per round trip when assembling a paid list. */
export const PAGE_SIZE = 1000

/**
 * Hard ceiling on a single paid list.
 *
 * Not a pricing limit — the rate card has no cap and a buyer may take a whole
 * lane. This is the guard that stops a runaway query building a gigabyte CSV in
 * memory. The largest lane observed is 15,916 companies, so nothing real comes
 * close; if something does, it should be looked at rather than silently served.
 */
export const MAX_PACK_RECORDS = 50_000
