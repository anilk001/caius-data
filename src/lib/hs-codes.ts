/**
 * Curated HS4 chapters for the niches Caius Data launches into.
 *
 * These are the export lines where Indian sellers most often go looking for US
 * buyers, so they double as the quick-start chips on the search page. The list
 * is presentation only — search accepts any valid 4-digit code.
 */
export interface HsSuggestion {
  code: string
  label: string
  sector: 'Garments' | 'Spices' | 'Gems & Jewellery' | 'Electronics' | 'Chemicals'
}

export const HS_SUGGESTIONS: HsSuggestion[] = [
  { code: '6204', label: "Women's suits, jackets, dresses", sector: 'Garments' },
  { code: '6203', label: "Men's suits, jackets, trousers", sector: 'Garments' },
  { code: '6109', label: 'T-shirts, singlets, vests (knitted)', sector: 'Garments' },
  { code: '6302', label: 'Bed, table & kitchen linen', sector: 'Garments' },
  { code: '5208', label: 'Woven cotton fabric', sector: 'Garments' },

  { code: '0904', label: 'Pepper, chillies & capsicum', sector: 'Spices' },
  { code: '0910', label: 'Ginger, turmeric, curry spices', sector: 'Spices' },
  { code: '0909', label: 'Cumin, coriander, fennel seeds', sector: 'Spices' },
  { code: '0801', label: 'Coconuts, cashews, brazil nuts', sector: 'Spices' },

  { code: '7113', label: 'Jewellery of precious metal', sector: 'Gems & Jewellery' },
  { code: '7102', label: 'Diamonds, worked & unworked', sector: 'Gems & Jewellery' },
  { code: '7117', label: 'Imitation jewellery', sector: 'Gems & Jewellery' },

  { code: '8517', label: 'Phones & networking equipment', sector: 'Electronics' },
  { code: '8544', label: 'Insulated wire, cable & connectors', sector: 'Electronics' },
  { code: '8536', label: 'Switches, relays, circuit apparatus', sector: 'Electronics' },
  { code: '8541', label: 'Semiconductors & LEDs', sector: 'Electronics' },

  { code: '2933', label: 'Heterocyclic nitrogen compounds (APIs)', sector: 'Chemicals' },
  { code: '3204', label: 'Synthetic organic colouring matter', sector: 'Chemicals' },
  { code: '2942', label: 'Other organic compounds', sector: 'Chemicals' },
  { code: '3808', label: 'Insecticides & agrochemicals', sector: 'Chemicals' },
]

export const SECTORS = [
  'Garments',
  'Spices',
  'Gems & Jewellery',
  'Electronics',
  'Chemicals',
] as const

export function describeHs4(code: string | null | undefined): string | null {
  if (!code) return null
  return HS_SUGGESTIONS.find((s) => s.code === code)?.label ?? null
}

/** The busiest US container ports, for the Port of Entry filter's datalist. */
export const COMMON_PORTS = [
  'Los Angeles, CA',
  'Long Beach, CA',
  'New York/Newark, NY',
  'Savannah, GA',
  'Houston, TX',
  'Norfolk, VA',
  'Charleston, SC',
  'Seattle, WA',
  'Tacoma, WA',
  'Oakland, CA',
  'Baltimore, MD',
  'Miami, FL',
  'Port Everglades, FL',
  'New Orleans, LA',
  'Philadelphia, PA',
]
