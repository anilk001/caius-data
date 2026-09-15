import { z } from 'zod'
import { PACKS } from '@/lib/packs'

const packIds = PACKS.map((p) => p.id) as [string, ...string[]]

/** Shared filter shape for search, sample CSV and checkout. */
export const filtersSchema = z.object({
  keyword: z.string().trim().max(120).optional().nullable(),
  hs4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, 'HS code must be 4 digits')
    .optional()
    .nullable(),
  port: z.string().trim().max(80).optional().nullable(),
  state: z.string().trim().max(40).optional().nullable(),
})

export type Filters = z.infer<typeof filtersSchema>

export const checkoutSchema = filtersSchema.extend({
  packId: z.enum(packIds),
  email: z.string().trim().email().max(200).optional().nullable(),
})

export type CheckoutInput = z.infer<typeof checkoutSchema>

/** Parse filters out of a URLSearchParams, dropping empty strings. */
export function filtersFromSearchParams(params: URLSearchParams): Filters {
  const pick = (key: string) => {
    const value = params.get(key)?.trim()
    return value ? value : undefined
  }

  const parsed = filtersSchema.safeParse({
    keyword: pick('keyword'),
    hs4: pick('hs4'),
    port: pick('port'),
    state: pick('state'),
  })

  // An unparseable HS code shouldn't 400 a browse — drop it and keep the rest.
  if (!parsed.success) {
    return {
      keyword: pick('keyword') ?? null,
      hs4: null,
      port: pick('port') ?? null,
      state: pick('state') ?? null,
    }
  }

  return parsed.data
}

export function hasAnyFilter(filters: Filters): boolean {
  return Boolean(filters.keyword || filters.hs4 || filters.port || filters.state)
}
