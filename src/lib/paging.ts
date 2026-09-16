/**
 * Reading a list larger than one request can return.
 *
 * Pricing has no ceiling: a buyer may take a whole lane, and the largest seen is
 * 15,916 companies against a request that returns at most a thousand. So the
 * paid path pages. An off-by-one in the offset duplicates or drops rows inside a
 * file somebody paid for, and a loop that does not stop on a short page hammers
 * the database for nothing — which is why the arithmetic lives here, free of
 * Supabase, and is tested directly rather than through a mocked query builder.
 */

/** Fetch one page. Returns fewer rows than asked for only when exhausted. */
export type FetchPage<T> = (offset: number, size: number) => Promise<T[]>

export interface PagingOptions {
  /** Rows the caller actually wants. */
  wanted: number
  /** Rows per request. */
  pageSize: number
  /** Hard stop, whatever `wanted` says. Guards memory, not revenue. */
  ceiling: number
}

/** Read rows until `wanted` is reached, the source runs out, or the ceiling hits. */
export async function collectPaged<T>(
  fetchPage: FetchPage<T>,
  { wanted, pageSize, ceiling }: PagingOptions,
): Promise<T[]> {
  const target = Math.min(Math.max(wanted, 0), ceiling)
  const rows: T[] = []
  let offset = 0

  while (rows.length < target) {
    // Trim the last page to the remainder: asking for a full page and
    // discarding the tail would charge the database for rows nobody wants.
    const size = Math.min(pageSize, target - rows.length)
    const batch = await fetchPage(offset, size)
    rows.push(...batch)

    // A short page is the last page.
    if (batch.length < size) break
    offset += batch.length
  }

  return rows
}

/**
 * Read only as far as it takes to know whether `wanted` distinct items exist.
 *
 * `reduce` collapses raw rows into the thing being counted — rows into buyers,
 * where one buyer filing from three warehouses is three rows. Counting rows and
 * calling them buyers is the bug this exists to prevent.
 *
 * Stops early on purpose: pricing 50 companies out of a 15,916-row lane should
 * cost one request, not sixteen.
 */
export async function countPaged<T>(
  fetchPage: FetchPage<T>,
  { wanted, pageSize, ceiling }: PagingOptions,
  reduce: (rows: T[]) => { length: number },
): Promise<number> {
  const rows: T[] = []
  let offset = 0

  while (rows.length < ceiling) {
    const batch = await fetchPage(offset, pageSize)
    rows.push(...batch)

    if (reduce(rows).length >= wanted || batch.length < pageSize) break
    offset += batch.length
  }

  return reduce(rows).length
}
