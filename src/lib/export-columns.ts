import type { CsvColumn } from '@/lib/csv'
import type { Buyer } from '@/lib/buyers'
import type { PublicCompany } from '@/types/database'

/**
 * Columns in the free 3-row sample. Deliberately the same fields the visitor
 * can already see on screen — the sample proves the format, not the data.
 */
export const SAMPLE_COLUMNS: CsvColumn<PublicCompany>[] = [
  { header: 'Importer Company', value: (r) => r.name },
  { header: 'City', value: (r) => r.city },
  { header: 'State', value: (r) => r.state },
  { header: 'Country', value: (r) => r.country ?? 'US' },
  { header: 'HS4 Code', value: (r) => r.hs4_code },
  {
    header: 'HS4 Source',
    value: (r) => (r.hs4_source === 'declared' ? 'declared by filer' : 'derived from description'),
  },
  { header: 'Product Description', value: (r) => r.product_description },
  { header: 'Shipments Observed', value: (r) => r.shipment_count ?? 0 },
  { header: 'Street Address', value: () => '[included in paid pack]' },
  { header: 'Port of Entry', value: () => '[included in paid pack]' },
  { header: 'First Seen', value: () => '[included in paid pack]' },
  { header: 'Last Seen', value: () => '[included in paid pack]' },
]

/** Full column set delivered after purchase. */
export const PACK_COLUMNS: CsvColumn<Buyer>[] = [
  { header: 'Importer Company', value: (r) => r.name },
  { header: 'Street Address', value: (r) => r.address },
  { header: 'City', value: (r) => r.city },
  { header: 'State', value: (r) => r.state },
  { header: 'Country', value: (r) => r.country ?? 'US' },
  { header: 'HS4 Code', value: (r) => r.hs4Codes.join('; ') || r.hs4_code },
  // The public CBP manifest feed carries no tariff classification
  // (19 CFR 103.31(e)(3)), so most codes are inferred from the goods
  // description. Saying so in the file is the difference between a buyer
  // checking our working and a buyer feeling misled.
  {
    header: 'HS4 Source',
    value: (r) =>
      r.hs4_source === 'declared'
        ? 'declared by filer'
        : `derived from description${r.hs4_confidence ? ` (confidence ${Number(r.hs4_confidence).toFixed(2)})` : ''}`,
  },
  { header: 'Product Description', value: (r) => r.product_description },
  { header: 'Port of Entry', value: (r) => r.primary_port },
  { header: 'Shipments Observed', value: (r) => r.shipment_count ?? 0 },
  { header: 'First Seen', value: (r) => r.first_seen },
  { header: 'Last Seen', value: (r) => r.last_seen },
  // One buyer filing from several warehouses is one row, not several. The other
  // addresses are still worth having, so they ride along here rather than
  // padding the row count.
  { header: 'Other Locations', value: (r) => r.locations.slice(1).join('; ') },
]
