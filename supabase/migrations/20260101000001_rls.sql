-- ---------------------------------------------------------------------------
-- Row-Level Security
--
-- Posture for Tier 1:
--   companies — world-readable. This is the data the search dashboard renders
--               for anonymous visitors, and it is company-level only.
--   shipments — no anonymous policy at all. Manifest detail is product we sell;
--               only the service role (server routes, ingest script) touches it.
--   orders    — no anonymous policy. Reads and writes go through server routes
--               holding the service-role key.
--
-- RLS is enabled on every table so that a missing policy means "denied",
-- not "wide open".
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.shipments enable row level security;
alter table public.orders    enable row level security;

-- companies: public read ------------------------------------------------------
drop policy if exists "companies are publicly readable" on public.companies;
create policy "companies are publicly readable"
  on public.companies
  for select
  to anon, authenticated
  using (true);

-- No insert/update/delete policies: writes are service-role only (ingest).

-- shipments: deliberately no policies -----------------------------------------
-- Anonymous and authenticated clients get zero rows. The service role bypasses
-- RLS entirely, which is how the fulfilment pipeline and ingest reach them.

-- orders: deliberately no policies --------------------------------------------
-- Purchases carry customer email addresses and download tokens. They are only
-- ever read or written by server code using SUPABASE_SERVICE_ROLE_KEY.

-- Grants. RLS decides which ROWS a role sees; grants decide whether it may
-- touch the table at all. Both are needed — a policy on a table the role has
-- no SELECT grant on still fails, and a grant with no policy returns nothing.
revoke all on public.shipments from anon, authenticated;
revoke all on public.orders    from anon, authenticated;
grant select on public.companies to anon, authenticated;

-- Supabase grants these to service_role by default, but stating them here keeps
-- the migration self-describing and portable to a plain Postgres.
grant all on public.companies to service_role;
grant all on public.shipments to service_role;
grant all on public.orders    to service_role;
