# Caius Data

US customs import intelligence for Indian exporters. Search the companies
already importing under your HS code, then buy a one-time CSV of 200–500 buyer
records. No subscription.

- **Production:** [caiusdata.com](https://caiusdata.com)
- **Defensive domain:** caiustrade.com → redirects to caiusdata.com

---

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, shadcn/ui |
| Database | Supabase Postgres with Row-Level Security |
| File storage | Supabase private Storage + 7-day signed URLs |
| Payments | Stripe Checkout |
| Email | Resend (`mail.caiusdata.com`) |
| Hosting | Railway |
| Data staging | Airtable (review lane only — see below) |

---

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in your keys
npm run dev
```

Then apply the database migrations — see [`supabase/README.md`](supabase/README.md).

### Checks

```bash
npm run typecheck              # tsc --noEmit
npm run lint                   # eslint
npm run build                  # production build
python3 scripts/test_company_cleaning.py
```

---

## How the money path works

```
visitor searches /search
        │
        ├─ Download 3 free sample rows ──▶ /api/sample-csv (no email wall)
        │
        └─ Buy a pack ──▶ /api/checkout
                              │  writes a PENDING order, price taken from
                              │  lib/packs.ts — never from the request body
                              ▼
                        Stripe Checkout
                              │
                              ▼
              /api/webhooks/stripe  (raw body, signature verified)
                              │
                              ├─ query companies for the buyer's filters
                              ├─ build CSV in memory
                              ├─ upload to private Supabase Storage
                              ├─ sign a 7-day download URL
                              └─ email it via Resend
                              │
                              ▼
                  /success polls /api/orders/status
                  and offers the download immediately
```

**Idempotency.** Stripe retries webhooks for up to three days. `orders.stripe_session_id`
is `UNIQUE`, and `fulfillCheckoutSession` returns early when an order is already
`fulfilled` or `delivered`. A replay is a no-op, so the buyer never gets two
emails and we never build the same file twice.

**Failure ordering.** The pack is uploaded and the order marked `fulfilled`
*before* the email is sent. If Resend is down the buyer still gets their file
from `/success`, and the webhook's 500 makes Stripe retry the delivery.

---

## What "blurred columns" actually means

The preview table blurs two columns. **The blur is decoration, not security.**

The real gate is server-side: `PUBLIC_COMPANY_COLUMNS` in `src/types/database.ts`
lists the only fields any anonymous response may contain. Street address, port
of entry and the first/last-seen dates are not in that list, so they never leave
the database for an unpaid visitor.

The cells under the blur render redaction glyphs (`••••••`) — never real
withheld data, and never plausible fake data either. Anything sent to a browser
can be read out of the DOM; putting genuine contact details behind a CSS filter
would be a leak, and putting fabricated ones there would be a lie.

---

## Data ingestion

### Straight to Supabase

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r scripts/requirements.txt

python scripts/ingest_csv.py data/tendata_6204.csv --dry-run   # inspect first
python scripts/ingest_csv.py data/tendata_6204.csv
```

The script auto-detects column names across providers and prints what it
matched before writing anything. Override with `--map`:

```bash
python scripts/ingest_csv.py data/export.csv --map "company_name=Buyer Name"
```

It cleans company names (strips `C/O BROKER`, `DBA`, legal suffixes, rejects
`TO THE ORDER OF` placeholders), normalises dates across a dozen formats, rolls
shipments up per company, and fingerprints every source row so a re-run inserts
no duplicates.

### Via Airtable (the review lane)

Airtable is **not** the production store. It cannot serve a public search page
(5 req/sec per base), has no row-level security, and has no unique constraints —
which is exactly what makes Stripe webhook replays safe in Postgres.

What it is good at is a human looking at 400 rows and spotting that
`ACME IMPRTS` and `Acme Imports Inc` are the same buyer. So:

```bash
python scripts/ingest_csv.py data/export.csv --to-airtable
#   → review and fix names in the "Importers (Staging)" table
#   → set Review Status to "Approved"
python scripts/airtable_to_supabase.py --dry-run
python scripts/airtable_to_supabase.py
```

Only `Approved` rows sync, and the script flips them to `Synced` afterwards —
`ingest_companies` *sums* shipment counts on conflict, so a double-approve would
inflate the volume ranking that packs are sorted on.

---

## Repository layout

```
src/app/                      routes
  api/search/                 public company search (anon key)
  api/sample-csv/             free 3-row CSV
  api/checkout/               Stripe Checkout session + pending order
  api/webhooks/stripe/        signature verification + fulfilment
  api/orders/status/          backs the /success poll
  search/                     the dashboard
src/lib/
  search.ts                   the one query both preview and fulfilment use
  fulfillment.ts              order → CSV → storage → email
  packs.ts                    prices. server-side source of truth
  csv.ts                      RFC 4180 + formula-injection guard
supabase/migrations/          schema, RLS, ingest RPCs, storage bucket
scripts/                      Python ingest + Airtable sync + tests
```

---

## Deployment (Railway)

```bash
railway link
railway variables --set NEXT_PUBLIC_SUPABASE_URL=... # etc, see .env.example
railway up
```

`railway.json` pins the build and start commands and points the healthcheck at
`/api/health`, which deliberately does not touch the database — a Supabase blip
should not cause Railway to cycle the container.

After the first deploy, point `caiusdata.com` at the Railway domain in GoDaddy
and set `SITE_URL=https://caiusdata.com` so Stripe redirects and email links
resolve correctly.

`SITE_URL` rather than `NEXT_PUBLIC_SITE_URL`: Next inlines `NEXT_PUBLIC_*` at
**build** time, so a value added after the build would be silently ignored and
Stripe would redirect buyers to localhost. `SITE_URL` is read at request time.

### Stripe webhook

Add an endpoint at `https://caiusdata.com/api/webhooks/stripe` subscribed to
`checkout.session.completed` and `checkout.session.async_payment_succeeded`,
then set `STRIPE_WEBHOOK_SECRET`.

Locally:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Licence

Proprietary. © Caius Data LLC.
