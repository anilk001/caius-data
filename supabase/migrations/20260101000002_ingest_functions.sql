-- ---------------------------------------------------------------------------
-- Bulk ingest helpers used by scripts/ingest_csv.py
--
-- The script pre-aggregates a manifest export in pandas-free Python and then
-- posts two batches per chunk: companies first (to resolve ids), then the
-- shipment rows keyed to those ids. Doing the merge in SQL keeps the arithmetic
-- (shipment totals, first/last seen) correct when a load is re-run or when a
-- second export overlaps the first.
-- ---------------------------------------------------------------------------

-- Merge a batch of aggregated company rows and return their ids.
--
-- payload: jsonb array of
--   { name, address, city, state, country, hs4_code, product_description,
--     primary_port, first_seen, last_seen, shipment_count }
create or replace function public.ingest_companies(payload jsonb)
returns table (company_key text, id uuid)
language plpgsql
security definer
set search_path = public
as $$
-- The OUT parameters are named `company_key` and `id`, which collide with the
-- columns of the same name in `on conflict (company_key)`. Without this
-- pragma PL/pgSQL raises "column reference is ambiguous" at runtime.
#variable_conflict use_column
begin
  return query
  with incoming as (
    select
      btrim(r.name)                       as name,
      nullif(btrim(coalesce(r.address, '')), '')  as address,
      nullif(btrim(coalesce(r.city, '')), '')     as city,
      nullif(btrim(coalesce(r.state, '')), '')    as state,
      coalesce(nullif(btrim(coalesce(r.country, '')), ''), 'US') as country,
      btrim(r.hs4_code)                   as hs4_code,
      nullif(btrim(coalesce(r.product_description, '')), '') as product_description,
      nullif(btrim(coalesce(r.primary_port, '')), '')        as primary_port,
      r.first_seen,
      r.last_seen,
      coalesce(r.shipment_count, 0)       as shipment_count
    from jsonb_to_recordset(payload) as r (
      name text, address text, city text, state text, country text,
      hs4_code text, product_description text, primary_port text,
      first_seen date, last_seen date, shipment_count int
    )
    where btrim(coalesce(r.name, '')) <> ''
      and btrim(coalesce(r.hs4_code, '')) ~ '^[0-9]{4}$'
  ),
  -- Collapse duplicates inside the batch itself: ON CONFLICT cannot touch the
  -- same row twice in one statement.
  deduped as (
    select
      lower(name) || '|' || lower(coalesce(city, '')) || '|' ||
        lower(coalesce(state, '')) || '|' || hs4_code as key,
      (array_agg(name order by length(name) desc))[1]                as name,
      (array_agg(address) filter (where address is not null))[1]     as address,
      (array_agg(city)    filter (where city is not null))[1]        as city,
      (array_agg(state)   filter (where state is not null))[1]       as state,
      (array_agg(country) filter (where country is not null))[1]     as country,
      hs4_code,
      (array_agg(product_description order by length(product_description) desc)
        filter (where product_description is not null))[1]           as product_description,
      (array_agg(primary_port) filter (where primary_port is not null))[1] as primary_port,
      min(first_seen) as first_seen,
      max(last_seen)  as last_seen,
      sum(shipment_count)::int as shipment_count
    from incoming
    group by lower(name), lower(coalesce(city, '')), lower(coalesce(state, '')), hs4_code
  ),
  upserted as (
    insert into public.companies as c (
      name, address, city, state, country, hs4_code,
      product_description, primary_port, first_seen, last_seen, shipment_count
    )
    select d.name, d.address, d.city, d.state, d.country, d.hs4_code,
           d.product_description, d.primary_port, d.first_seen, d.last_seen, d.shipment_count
    from deduped d
    on conflict (company_key) do update set
      address             = coalesce(excluded.address, c.address),
      product_description = coalesce(excluded.product_description, c.product_description),
      primary_port        = coalesce(excluded.primary_port, c.primary_port),
      first_seen          = least(coalesce(c.first_seen, excluded.first_seen), excluded.first_seen),
      last_seen           = greatest(coalesce(c.last_seen, excluded.last_seen), excluded.last_seen),
      shipment_count      = c.shipment_count + excluded.shipment_count
    returning c.company_key, c.id
  )
  select u.company_key, u.id from upserted u;
end;
$$;

-- Insert a batch of shipment rows, skipping any whose source_row_hash is
-- already present. Returns how many rows were actually written.
--
-- payload: jsonb array of shipment columns plus company_id and source_row_hash.
create or replace function public.ingest_shipments(payload jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  written int;
begin
  with incoming as (
    select distinct on (r.source_row_hash)
      r.company_id, r.shipper_name, r.shipper_country, r.hs4_code,
      r.product_description, r.port_of_lading, r.port_of_unlading,
      r.weight_kg, r.arrival_date, r.carrier,
      coalesce(r.raw_source, 'tendata_export') as raw_source,
      r.source_row_hash
    from jsonb_to_recordset(payload) as r (
      company_id uuid, shipper_name text, shipper_country text, hs4_code text,
      product_description text, port_of_lading text, port_of_unlading text,
      weight_kg numeric, arrival_date date, carrier text, raw_source text,
      source_row_hash text
    )
    where r.company_id is not null
  ),
  inserted as (
    insert into public.shipments (
      company_id, shipper_name, shipper_country, hs4_code, product_description,
      port_of_lading, port_of_unlading, weight_kg, arrival_date, carrier,
      raw_source, source_row_hash
    )
    select company_id, shipper_name, shipper_country, hs4_code, product_description,
           port_of_lading, port_of_unlading, weight_kg, arrival_date, carrier,
           raw_source, source_row_hash
    from incoming
    on conflict (source_row_hash) where source_row_hash is not null do nothing
    returning 1
  )
  select count(*)::int into written from inserted;

  return written;
end;
$$;

-- Only the service role may call these.
revoke execute on function public.ingest_companies(jsonb) from public, anon, authenticated;
revoke execute on function public.ingest_shipments(jsonb) from public, anon, authenticated;
grant  execute on function public.ingest_companies(jsonb) to service_role;
grant  execute on function public.ingest_shipments(jsonb) to service_role;
