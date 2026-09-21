# Caius Data

One-time, pay-as-you-go **US importer buyer lists**, sold mainly to Indian
exporters. No subscriptions. A buyer picks HS headings, sees how many US
companies we hold, pays for that many, downloads a CSV.

Operated by **Caius Data LLC** (Wyoming, US), owned by Anil Kumar
(`ak@akay.ie`), who also runs Akay Irl Ltd — a separate business, separate repo.

- Live: https://www.caiusdata.com (Railway, deploys on push)
- Store: Supabase Postgres. **Not Airtable.** See "Airtable" below.
- Narrative history and open decisions: `STATUS.md`. Read it for *why*; this
  file is *what to do*.

## Commands

```bash
npm run check        # typecheck + lint + node tests + python tests — run before pushing
npm run dev          # local site on :3000
npm run build
```

Data pipeline, in order. Only the first call costs money:

```bash
export BOLD_API_KEY=...
python3 scripts/bold_api.py records --type imp --hs 620442 \
    --import-country US --export-country IN --max-records 250 --out data/x.json
python3 scripts/bold_shipments.py data/x.json --out data/x.csv
python3 scripts/ingest_csv.py data/x.csv --hs4 6204 --dry-run   # always dry-run first
python3 scripts/ingest_csv.py data/x.csv --hs4 6204
```

`--emit-payload FILE` writes the RPC payloads instead of posting, for loading
through a connection that does not hold the service-role key.

## Rules that are not negotiable

These each came from a real defect that reached real data. Changing one means
changing what a paying customer receives.

1. **Never hard-code a count anywhere a customer sees it.** Every number of
   companies is read from the database at render time. `tests/promo-packs.test.ts`
   fails the build if a literal like `"500 importers"` appears in the feature.
   A tile claiming 500 and delivering 380 is a refund and a bad review.
2. **A pack of 50 means 50 separate companies**, not 50 rows. One company
   importing under two headings is two rows and one buyer. Count with
   `countBuyers` + `mergeByBuyer` — the same expression `api/checkout` charges
   on — never `count(*)`.
3. **Never charge for more than we hold.** If a filter yields 120, we sell 120
   pro rata. Minimum saleable pack is 50 (`MIN_RECORDS`); below that we do not
   sell at all. No sale is ever below $9.
4. **Packs are US importers only.** `PACK_COUNTRY` in `src/lib/search.ts` filters
   inside `runCompanyQuery`, the single path public search, pack assembly and
   the buyer count all share. Canadian and Mexican arms stay in the database
   with their real country and are filtered out. `tests/pack-country.test.ts`
   fails if a second query path to `companies` appears.
5. **Never call the vendor's personal-data endpoints** — `company-contacts`,
   `contact-look-up`, `kyb`. They are named in `PERSONAL_DATA_ENDPOINTS` in
   `scripts/bold_api.py` so the omission reads as a decision. Caius is
   EU-operated; a personal email in a pack would be an international transfer
   with an erasure duty reaching every customer who downloaded that row.
   `scripts/personal_data.py` is the defence in depth.
6. **Never spend vendor credits without `--dry-run` first**, and never without
   saying the cost. Records are 1 credit each (2 on the country-specific US
   API); a single lane can hold 140,000 shipments.

## What the source data is, and is not

US CBP releases 22 data elements under **19 CFR 103.31(e)(3)**. That list has
**no HS code** and **no separate city or state**. Everything downstream follows
from this:

- HS4 is either declared by the filer inside the goods text, or derived by
  `scripts/hs4_classifier.py`. `companies.hs4_source` records which.
- City and state come from parsing `consignee_address`, which only the
  country-specific US API carries. Aggregated importer records (15 credits)
  have no address at all.
- The consignee field is filled by hand by filers. It holds forwarders, people,
  job titles, duplicated names and glued-together text. `scripts/company_cleaning.py`
  is the whole defence and every rule in it is evidence-driven — check real
  names before changing it.

Two orderings that are easy to get backwards:

- **`C/O` carries the buyer on either side.** `WEAR PACT, LLC C/O FLEXPORT`
  leads with the buyer; `SHIPMONK C/O SOFT SURROUNDINGS` leads with the
  warehouse. Judge both sides, never assume.
- **Deduping shipments.** With a bill of lading, the bill decides — the same
  bill arrives under several vendor record ids. Without one (38% of rows), only
  value and quantity separate two real shipments. See `fold_key` in
  `scripts/bold_shipments.py`.

## Pricing

`src/lib/pricing.ts` is the only source of truth; the browser sends a count,
never an amount, and checkout recounts before charging.

$9.00 for the first 50 companies, then 15¢ each to 500, 9¢ to 1,000, 5¢ beyond.
No cap. 50 → $9.00 · 100 → $16.50 · 500 → $76.50 · 3,000 → $221.50.

**No sector premium and no pack-only price.** A ready-made pack costs exactly
what the same search costs. Two prices for one thing causes refund arguments
and teaches buyers to wait for a discount.

## Airtable

Caius runs on Postgres. Airtable is an **optional review surface only**, behind
`ingest_csv.py --to-airtable`, never used for a real load. There is no Airtable
reference in `src/` and no Airtable dependency in `package.json`. Airtable's
per-base record ceiling is irrelevant here — one lane's shipments would exceed
it, which is exactly why the store is Postgres.

## Deployment traps that have each cost a day

- **Railway sets `NODE_ENV=production`**, so build-time packages must be in
  `dependencies`, not `devDependencies` (`tailwindcss`, `typescript`, `@types/*`).
- **`.next/cache` is a mounted volume** that survives deploys. `railway.json`
  clears it in `buildCommand`; a stale cache once hid a genuinely missing module
  through three "fixes".
- **Use `npm install`, not `npm ci`** in the build — `ci` deletes `node_modules`
  and hits `EBUSY` on Railway's cache mount.
- **GoDaddy cannot CNAME a bare domain.** The apex uses GoDaddy forwarding to
  `www`; only `www` is attached to Railway. Railway also needs a **TXT record**
  (`_railway-verify.<host>`) as well as the CNAME — without it the certificate
  sits at `VALIDATING_OWNERSHIP` forever.
- **`createClient` from `lib/supabase/server` reads cookies**, which forces
  dynamic rendering. For a public cacheable page use `createPublicClient` from
  `lib/supabase/admin`.
- **Never let a `catch` turn a failure into a zero.** A failed count renders as
  "Unavailable", not "Coming soon" — an error must not read as an empty shelf.

## Secrets

Never paste a live key into chat or commit one. `SUPABASE_SERVICE_ROLE_KEY`,
`STRIPE_SECRET_KEY` and `RESEND_API_KEY` live in Railway variables. For a one-off
load, create a **named Supabase secret key**, use it, then delete it — that
needs no rotation and causes no downtime, unlike rotating the legacy
`service_role` key, which invalidates the anon key the live site uses.

## Style

Match the surrounding code. Comments explain *why*, usually naming the real
record or failure that forced the rule — that is the house style throughout
`scripts/` and `src/lib/`, and it is what makes these rules survivable. Tests
carry the same: each asserts a real defect, not a hypothetical.
