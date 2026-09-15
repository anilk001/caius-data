/**
 * Hand-maintained mirror of the Tier 1 schema in `supabase/migrations`.
 *
 * Regenerate with:
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type CompanyRow = {
  id: string
  name: string
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  hs4_code: string
  /** 'declared' = the filer stated it; 'derived' = inferred from the description. */
  hs4_source: 'declared' | 'derived' | null
  hs4_confidence: number | null
  product_description: string | null
  primary_port: string | null
  first_seen: string | null
  last_seen: string | null
  shipment_count: number | null
  created_at: string | null
  updated_at: string | null
  company_key: string
  search_tsv: unknown
}

export type ShipmentRow = {
  id: string
  company_id: string | null
  shipper_name: string | null
  shipper_country: string | null
  hs4_code: string | null
  product_description: string | null
  port_of_lading: string | null
  port_of_unlading: string | null
  weight_kg: number | null
  arrival_date: string | null
  carrier: string | null
  raw_source: string | null
  source_row_hash: string | null
  loaded_at: string | null
}

export type OrderStatus = 'pending' | 'fulfilled' | 'delivered' | 'failed'

export type OrderRow = {
  id: string
  stripe_session_id: string
  customer_email: string
  hs4_code: string
  record_count: number
  amount_cents: number
  status: OrderStatus
  csv_download_token: string
  query_params: Json
  csv_storage_path: string | null
  download_expires_at: string | null
  created_at: string | null
  fulfilled_at: string | null
  delivered_at: string | null
}

export type Database = {
  public: {
    Tables: {
      companies: {
        Row: CompanyRow
        Insert: Partial<Omit<CompanyRow, 'id' | 'company_key' | 'search_tsv'>> & {
          name: string
          hs4_code: string
        }
        Update: Partial<Omit<CompanyRow, 'company_key' | 'search_tsv'>>
        Relationships: []
      }
      shipments: {
        Row: ShipmentRow
        Insert: Partial<Omit<ShipmentRow, 'id'>>
        Update: Partial<ShipmentRow>
        Relationships: []
      }
      orders: {
        Row: OrderRow
        Insert: Partial<Omit<OrderRow, 'id'>> & {
          stripe_session_id: string
          customer_email: string
          hs4_code: string
          record_count: number
          amount_cents: number
        }
        Update: Partial<OrderRow>
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      ingest_companies: {
        Args: { payload: Json }
        Returns: { company_key: string; id: string }[]
      }
      ingest_shipments: {
        Args: { payload: Json }
        Returns: number
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}

/** The company-level fields the public search dashboard is allowed to render. */
export const PUBLIC_COMPANY_COLUMNS = [
  'id',
  'name',
  'city',
  'state',
  'country',
  'hs4_code',
  'hs4_source',
  'product_description',
  'primary_port',
  'first_seen',
  'last_seen',
  'shipment_count',
] as const

export type PublicCompany = Pick<
  CompanyRow,
  (typeof PUBLIC_COMPANY_COLUMNS)[number]
>
