-- ---------------------------------------------------------------------------
-- Caius Data — Tier 1 (Company Intelligence) schema
--
-- Three tables:
--   companies  — publicly searchable, company-level US importer records
--   shipments  — the underlying manifest rows a company record aggregates
--   orders     — Stripe purchases and CSV delivery state
--
-- Deviations from the original brief, and why:
--   * Free-text search uses a STORED generated tsvector column rather than a
--     bare expression index. `a || ' ' || b` is NULL whenever any operand is
--     NULL, so the brief's index silently dropped every company with no
--     product_description. COALESCE fixes that, and materialising the vector
--     lets PostgREST filter it directly (`.textSearch('search_tsv', ...)`).
--   * companies.company_key / shipments.source_row_hash give the ingest script
--     natural upsert keys so re-running a load is idempotent.
--   * companies.primary_port backs the "Port of Entry" filter on the search
--     dashboard — port lives on shipments, so it is rolled up at ingest time.
--   * orders gains query_params / csv_storage_path / download_expires_at /
--     delivered_at, which the fulfilment pipeline in the brief needs in order
--     to rebuild the buyer's query and hand back a 7-day signed link.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- 1. Companies ---------------------------------------------------------------
create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  address           text,
  city              text,
  state             text,
  country           text default 'US',
  hs4_code          text not null,
  product_description text,
  primary_port      text,
  first_seen        date,
  last_seen         date,
  shipment_count    int  default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  -- Natural key: one row per (company, location, HS4 chapter).
  company_key text generated always as (
    lower(btrim(name)) || '|' ||
    lower(coalesce(btrim(city), '')) || '|' ||
    lower(coalesce(btrim(state), '')) || '|' ||
    btrim(hs4_code)
  ) stored,

  -- Materialised search vector. Weighted so a company-name hit outranks a
  -- loose product-description hit.
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(hs4_code, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(product_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(city, '') || ' ' || coalesce(state, '')), 'C')
  ) stored,

  constraint companies_hs4_code_format check (hs4_code ~ '^[0-9]{4}$')
);

create unique index if not exists idx_companies_company_key on public.companies (company_key);
create index if not exists idx_companies_search        on public.companies using gin (search_tsv);
create index if not exists idx_companies_hs4           on public.companies (hs4_code);
create index if not exists idx_companies_port          on public.companies (primary_port);
create index if not exists idx_companies_state         on public.companies (state);
-- Packs are assembled "top N by volume", so the ordering key gets its own index.
create index if not exists idx_companies_hs4_volume    on public.companies (hs4_code, shipment_count desc);

comment on table  public.companies is 'Company-level US importer intelligence. Publicly readable.';
comment on column public.companies.primary_port is 'Modal port_of_unlading across this company''s shipments.';

-- 2. Shipments ---------------------------------------------------------------
create table if not exists public.shipments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid references public.companies(id) on delete cascade,
  shipper_name        text,
  shipper_country     text,
  hs4_code            text,
  product_description text,
  port_of_lading      text,
  port_of_unlading    text,
  weight_kg           numeric,
  arrival_date        date,
  carrier             text,
  raw_source          text default 'tendata_export',
  -- sha256 of the source CSV row; lets an interrupted load be re-run safely.
  source_row_hash     text,
  loaded_at           timestamptz default now()
);

create unique index if not exists idx_shipments_source_row_hash
  on public.shipments (source_row_hash) where source_row_hash is not null;
create index if not exists idx_shipments_company  on public.shipments (company_id);
create index if not exists idx_shipments_hs4      on public.shipments (hs4_code);
create index if not exists idx_shipments_arrival  on public.shipments (arrival_date desc);

comment on table public.shipments is 'Raw manifest records. Never exposed to anonymous clients.';

-- 3. Orders ------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  stripe_session_id   text unique not null,
  customer_email      text not null,
  hs4_code            text not null,
  record_count        int  not null,
  amount_cents        int  not null,
  status              text default 'pending',
  csv_download_token  uuid default gen_random_uuid(),
  -- Full search filters at time of purchase, so fulfilment rebuilds the exact
  -- result set the buyer previewed (keyword, port, state, pack id).
  query_params        jsonb default '{}'::jsonb,
  csv_storage_path    text,
  download_expires_at timestamptz,
  created_at          timestamptz default now(),
  fulfilled_at        timestamptz,
  delivered_at        timestamptz,

  constraint orders_status_check check (status in ('pending', 'fulfilled', 'delivered', 'failed'))
);

create unique index if not exists idx_orders_download_token on public.orders (csv_download_token);
create index if not exists idx_orders_email  on public.orders (customer_email);
create index if not exists idx_orders_status on public.orders (status);

comment on table public.orders is 'Stripe purchases. Service role only — no anonymous access.';

-- updated_at trigger ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
-- Empty search_path: Supabase's database linter flags mutable search paths on
-- trigger functions, because a caller-controlled path can change which objects
-- an unqualified name resolves to.
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();
