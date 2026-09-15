-- ---------------------------------------------------------------------------
-- Record where each HS4 code came from.
--
-- 19 CFR 103.31(e)(3) lists the 22 data elements CBP releases from the public
-- vessel manifest feed, and a tariff classification is not among them — the
-- source carries "Description of goods" as free text and nothing more. Every
-- provider reselling this data has the same gap, so an HS4 code on a manifest
-- row is nearly always DERIVED from the description rather than declared by
-- the filer.
--
-- Selling a derived code as though it were declared would be a claim we cannot
-- support, so provenance travels with the data and surfaces in the CSV.
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists hs4_source text default 'derived',
  add column if not exists hs4_confidence numeric;

alter table public.companies
  drop constraint if exists companies_hs4_source_check;
alter table public.companies
  add constraint companies_hs4_source_check
  check (hs4_source in ('declared', 'derived'));

alter table public.companies
  drop constraint if exists companies_hs4_confidence_range;
alter table public.companies
  add constraint companies_hs4_confidence_range
  check (hs4_confidence is null or (hs4_confidence >= 0 and hs4_confidence <= 1));

comment on column public.companies.hs4_source is
  'declared = the filer stated the code; derived = inferred from the goods description.';
comment on column public.companies.hs4_confidence is
  'Classifier confidence 0-1 for a derived code. Null when declared.';

create index if not exists idx_companies_hs4_source on public.companies (hs4_source);
