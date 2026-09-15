import type { CsvColumn } from '@/lib/csv'
import type { CompanyRow, PublicCompany } from '@/types/database'

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
  { header: 'Product Description', value: (r) => r.product_description },
  { header: 'Shipments Observed', value: (r) => r.shipment_count ?? 0 },
  { header: 'Street Address', value: () => '[included in paid pack]' },
  { header: 'Port of Entry', value: () => '[included in paid pack]' },
  { header: 'First Seen', value: () => '[included in paid pack]' },
  { header: 'Last Seen', value: () => '[included in paid pack]' },
]

/** Full column set delivered after purchase. */
export const PACK_COLUMNS: CsvColumn<CompanyRow>[] = [
  { header: 'Importer Company', value: (r) => r.name },
  { header: 'Street Address', value: (r) => r.address },
  { header: 'City', value: (r) => r.city },
  { header: 'State', value: (r) => r.state },
  { header: 'Country', value: (r) => r.country ?? 'US' },
  { header: 'HS4 Code', value: (r) => r.hs4_code },
  { header: 'Product Description', value: (r) => r.product_description },
  { header: 'Port of Entry', value: (r) => r.primary_port },
  { header: 'Shipments Observed', value: (r) => r.shipment_count ?? 0 },
  { header: 'First Seen', value: (r) => r.first_seen },
  { header: 'Last Seen', value: (r) => r.last_seen },
]
