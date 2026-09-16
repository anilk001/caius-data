-- ---------------------------------------------------------------------------
-- Country is a claim, so make it deterministic.
--
-- Two changes to public.ingest_companies:
--
--   * Aggregating a batch picked an arbitrary country from the group, so a
--     buyer with both US and Canadian filings got whichever row sorted first.
--   * The upsert never updated country at all, so a company first written from
--     a Canadian filing kept 'CA' for good.
--
-- Both now prefer 'US': a company that lands goods in the United States on any
-- of its filings is a US importer. Packs are filtered on this column, so
-- "whichever row sorted first" is not an answer we can sell.
--
-- Everything else in the function is unchanged from
-- 20260101000002_ingest_functions.sql.
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
      coalesce(r.shipment_count, 0)       as shipment_count,
      coalesce(nullif(btrim(coalesce(r.hs4_source, '')), ''), 'derived') as hs4_source,
      r.hs4_confidence
    from jsonb_to_recordset(payload) as r (
      name text, address text, city text, state text, country text,
      hs4_code text, product_description text, primary_port text,
      first_seen date, last_seen date, shipment_count int,
      hs4_source text, hs4_confidence numeric
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
      -- A company that lands goods in the US on any of its filings is a US
      -- importer, so 'US' wins over anything else in the same group.
      (array_agg(country order by case when country = 'US' then 0 else 1 end)
        filter (where country is not null))[1]                      as country,
      hs4_code,
      (array_agg(product_description order by length(product_description) desc)
        filter (where product_description is not null))[1]           as product_description,
      (array_agg(primary_port) filter (where primary_port is not null))[1] as primary_port,
      min(first_seen) as first_seen,
      max(last_seen)  as last_seen,
      sum(shipment_count)::int as shipment_count,
      (array_agg(hs4_source order by case hs4_source when 'declared' then 0 else 1 end))[1] as hs4_source,
      max(hs4_confidence) as hs4_confidence
    from incoming
    group by lower(name), lower(coalesce(city, '')), lower(coalesce(state, '')), hs4_code
  ),
  upserted as (
    insert into public.companies as c (
      name, address, city, state, country, hs4_code,
      product_description, primary_port, first_seen, last_seen, shipment_count,
      hs4_source, hs4_confidence
    )
    select d.name, d.address, d.city, d.state, d.country, d.hs4_code,
           d.product_description, d.primary_port, d.first_seen, d.last_seen, d.shipment_count,
           d.hs4_source, d.hs4_confidence
    from deduped d
    on conflict (company_key) do update set
      address             = coalesce(excluded.address, c.address),
      -- Country was never updated here, so a company first seen unlading in
      -- Brampton kept 'CA' even once US filings arrived. Same rule as above.
      country             = case
                              when c.country = 'US' or excluded.country = 'US' then 'US'
                              else coalesce(excluded.country, c.country)
                            end,
      product_description = coalesce(excluded.product_description, c.product_description),
      primary_port        = coalesce(excluded.primary_port, c.primary_port),
      first_seen          = least(coalesce(c.first_seen, excluded.first_seen), excluded.first_seen),
      last_seen           = greatest(coalesce(c.last_seen, excluded.last_seen), excluded.last_seen),
      shipment_count      = c.shipment_count + excluded.shipment_count,
      -- A declared code always outranks a derived one.
      hs4_source          = case when c.hs4_source = 'declared' or excluded.hs4_source = 'declared'
                                 then 'declared' else 'derived' end,
      hs4_confidence      = greatest(coalesce(c.hs4_confidence, 0), coalesce(excluded.hs4_confidence, 0))
    returning c.company_key, c.id
  )
  select u.company_key, u.id from upserted u;
end;
$$;
