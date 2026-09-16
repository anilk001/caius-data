# Caius Data — current state

Written 15 September 2026. Read this first if you are picking the project up
without the conversation that built it.

---

## What works, end to end

A real Stripe payment produced a real CSV in 71 seconds, verified from the
database rather than the screen.

```
/search → /api/checkout → Stripe → /api/webhooks/stripe
        → CSV built → private Supabase bucket → 7-day signed link → email
```

| | |
| --- | --- |
| Live URL | https://web-production-aa1c3.up.railway.app |
| Repo branch | `claude/caius-data-tier-1-launch-o6a54x` |
| Supabase | project `npwcvpvayaovpjhcmzkz`, region `ap-southeast-1` |
| Railway | project `caius-data`, service `web`, auto-deploys on push |
| Email | `mail.caiusdata.com`, verified, sending key scoped to that domain |

Verified against the live database: RLS blocks anon from `shipments` and
`orders`; the free 3-row sample works; webhook signature verification works;
re-ingest sums shipment counts correctly; a replayed `source_row_hash` inserts
nothing.

## The one thing missing

**Real data.** `companies` holds 16 rows whose names begin `[TEST]` — all
invented, all to be deleted the moment genuine manifest data lands.

---

## The finding that shapes everything

**The public US manifest feed contains no HS codes.**

19 CFR 103.31(e)(3) lists the 22 data elements CBP releases. A tariff
classification is not among them — the source gives `Description of goods` as
free text and nothing more. A provider sample confirmed it: 46 columns matching
the regulation element for element, with `Hscode` populated in **1 row of 85**.

Caius Data is keyed on HS4, so HS4 is now derived from the goods description
(`scripts/hs4_classifier.py`) and labelled as derived everywhere it appears —
`companies.hs4_source`, `companies.hs4_confidence`, and an "HS4 Source" column
in both the free sample and the paid CSV.

The same regulation explains two other things:

* **No city or state.** One combined `Consignee address` field, hence
  `scripts/address_parser.py`. This matters beyond the UI: city and state form
  part of the key that merges a company's rows, so without them every shipment
  becomes its own "company" and the volume ranking collapses.
* **Coverage has structural holes.** Importers may file for confidentiality
  under 103.31(d) for renewable two-year periods, and those rows arrive with the
  consignee blanked. Never claim completeness.

---

## The data vendor — answered

Vendor: billofladingdata.com, operated by **Boldata LLC** (named in their
documentation footer; that is the counterparty on any agreement). Nothing
purchased yet.

They confirmed in writing, 16 September 2026:

* **Resale is permitted**, in raw or derived form, with no extra fee beyond API
  pricing and setup. No cap on customers, records per customer, or total records.
* **Permanent storage and reuse** across packs and customers, with no time limit.
* **Survival**: records bought while the licence is active stay usable, customers
  keep delivered CSVs, and nothing must be deleted if we stop buying credits.
* **No territorial restriction**, and attribution is optional ("Trade data
  provided by BillOfLadingData.com").
* **They warrant upstream rights** and will indemnify for claims from their data
  sources — "subject to the agreed contractual terms", so the actual clause still
  has to be read.
* **Onward-transfer restrictions we must impose on our customers**, now in
  `/terms` clause 3: no resale in any form, no substantially similar bulk dataset
  (especially cheaper), no public or downloadable publication, no transfer or
  sub-licence outside their own company.

### Still to settle

1. **The written licence agreement.** Promised, not yet received. The setup fee
   is non-refundable in the general case, and they offered to agree terms before
   purchase — so read and sign the agreement *first*, then pay. Do not reverse
   that order.
2. **The indemnity clause itself.** "Subject to the agreed contractual terms"
   can mean anything until the terms exist.

### Personal data — decided

They confirmed the API may return personal email addresses and mobile numbers,
and that these can be excluded at extraction. We exclude them.

Their documentation tab bar shows three modules absent from the sales brochure:
**Company Contacts**, **Contact Look Up** and **KYB**. That is where personal
contact data lives, which gives a cleaner boundary than field filtering: we do
not call those endpoints at all. `PERSONAL_DATA_ENDPOINTS` in `bold_api.py`
names them so the omission reads as a decision rather than an oversight.

`scripts/personal_data.py` is the defence in depth — it reports any populated
contact field a response carries and redacts addresses and phone numbers from
free-text goods descriptions, where a column allowlist cannot help. Caius is
EU-operated and sells outside the EU, so a personal email in a pack would be an
international transfer of personal data with an erasure duty reaching every
customer who ever downloaded that row. Holding none of it removes the question.

---

### The endpoints — confirmed

Docs portal: `tradedata.billofladingdata.com/supplier/api-documentation?tab=documentation`
(add `&tab=country-specific-api-documentation&country=us` for the USA API).

Modules, from their own tab bar:

| Free | Paid | Never called |
| --- | --- | --- |
| Search Filters | Shipping Records — 1 credit/record | Company Contacts |
| Shipping Filters | All Importers / All Exporters — 15 credits | Contact Look Up |
| Insights | Competitors — 15 credits | KYB |
| Company Search | Company Details — 20 credits/profile | |
| Check Logistic Company | Country-specific USA/India — 2 credits/record | |
| Products | | |

**`POST /partner-api/shipping-records`** — required: `page_size` (max 250),
`page_no`, `type` (imp/exp). At least one of `company_ids`, `hs_codes`,
`products`, `bill_of_lading_nbrs`. Optional: `date_range` (12-month cap, and
**defaults to the last 12 months when omitted**, so deeper history takes several
runs), `import_countries` / `export_countries` (2-letter codes), `weight`,
`quantity`, `import_value` (each `{min, max}`), `loading_ports`,
`unloading_ports`, `importer_names`, `exporter_names`, `transport_types` (sea,
land, air, postal, railway, pipeline, power transmission, other).

**All Importers takes HS code together with buyer and seller country in one
request.** HS code is required; the countries are optional. So a pack is always
built around a heading, which is how they are sold anyway.

`bold_api.py records` pages this endpoint behind a mandatory `--max-records` cap
and prints the credit cost for confirmation before the first call. There is no
fetch-everything mode: one HS code returns 15,916 importers, and the shipments
behind those would empty any credit pack on this price list.

Free trial: 1,000 API credits plus 600 download credits.

### Cost of a pack — correcting an earlier note

An earlier version of this file said buying shipment records and aggregating
locally is "15x cheaper" than buying company records. That was wrong. It assumed
1 credit per US record (it is 2) and ignored shipments per company. The real
break-even is 7.5 shipments per company, and any real importer ships far more
than that, so for a buyer pack **their company record is the cheaper path**.

200 company records = 3,000 credits = about **$2 per pack** at Scale Pack rates
($690/1M credits), against a $19-49 price. Shipment-level extraction is still
worth buying for the companies a pack actually sells, because it is reusable
across every later pack that company appears in, and it is what lets us build
the origin-country filter ourselves at shipment granularity.

Their filter panel offers import country and export country, so the origin
filter the packs are sold on is available on the paid side, not just in the
free `search-filters` response. Still to pin down from the docs: the exact
parameter names and whether both can be combined with `hs_codes` in one call.

`scripts/bold_company_records.py` maps their company record onto a `companies`
row and filters by origin locally, so the pack can be built either way — one
filtered call if the API takes both, or a broad call filtered here if not.

Note what an aggregated company record does **not** carry: no HS code (the
heading is implied by the query you paid for) and no address, city or state —
only a country. `companies.company_key` is (name, city, state, hs4), so these
rows key on name and heading alone. That is still unique, but the dashboard's
state filter will not find them and the CSV's City/State column will be blank.
City and state live on `consignee_address` in the shipment record at 2 credits,
so they are a second purchase rather than a parsing problem. Decide whether a
pack needs them before quoting a price.

Also worth testing on free credits before relying on it: the 20-credit company
profile advertises contact details and social links, but both were empty
strings in their own brochure example, and the brochure calls them "contact
placeholders". Do not price a pack around contact data that may not exist.

### What "importer" means in their data — read before writing any site copy

HS 6204, buyer country US, seller country Vietnam returns **7,592 importers**.
The segment is easily big enough. What it contains is the problem:

    AZAZIE SG PTE. LTD.             24,332 shipments   $5.28m   HQNAMDINH
    DT UNIFORMS PTE. LTD.            4,624             $14.2m   CMYTHOIAG
    SOUTH ISLAND GARMENT SDN. BHD    3,418             $16.2m   HQTTHUAN

`PTE. LTD.` is Singapore and `SDN. BHD` is Malaysia, and every port code is
Vietnamese — Nam Dinh, Cat Lai, Thu Dau Mot, Song Than in Binh Duong. This is
**Vietnamese export customs data**, not US CBP manifest data, and the buyer
named on an export declaration is whoever the factory invoiced: usually an
offshore procurement arm rather than the US importer of record.

The data is sound — per-piece values come out at $4.41 for uniforms and $141
for bridal gowns, which is exactly right. But two things follow:

* `/search` says "Every row is a real US company" and the pack is sold as "US
  importer records". On this source that is false. The honest framing is
  "companies buying into the US market", and the country column means
  destination, not domicile. Fix the copy before launch, not after a refund
  request.
* The same search with seller country set to All Countries answers this. It
  returns 15,916 importers and the India/Pakistan rows are real US companies:
  Old Navy LLC, The Gap Inc, Urban Outfitters. Those rows also carry weight in
  kg and **US unloading ports** (New York/Newark, Chicago) alongside Indian
  loading ports (Nhava Sheva, Delhi) — fields the Vietnam rows do not have.

So they hold two different sources and the filter picks between them. For
Anil's market that is the good news: on the **India lane the buyers are
US-domiciled and the records are richer**, which is exactly the pack an Indian
exporter wants. Old Navy and Gap both source from India *and* Pakistan, so a
Pakistani supplier is a displaceable competitor sitting in the same row.

Describe a pack by the lane it was built from, not with one blanket claim.

### Two filters that have to run before anything is sold

**Parcel consolidators, which no name rule catches.** Top of that 15,916-row
list by shipment count is STELCORE MANAGEMENT SERVICES LLC with 51,968
shipments — worth $275,311 in total. That is $5 and exactly 1.0 pieces per
shipment, through Delhi Air Cargo. Real buyers in the same list run $217 to
$13,505 per shipment. The name gives nothing away; the ratios do, so
`looks_like_consolidator()` judges on pieces and value per shipment and only
for companies with 500+ shipments, below which one mis-keyed declaration
swings the average. Packs are assembled "top N by volume", so without this
Stelcore leads every pack sold.

**Duplicate filings.** Entity resolution is ours to do, not theirs. Azazie appears at rows 1 and 8 of
the same list ("AZAZIE SG PTE. LTD." and "AZAZIE SG PTE. LTD/ AZAZIE INC.") and
their aggregation does not merge them, so a 15-credit company record is billed
twice and a customer sees one buyer as two. `grouping_key` cuts at an alias
slash, leaving Danish "A/S" suffixes alone, and `merge_rows()` sums the totals
and unions the origin countries — two filings of one company are two parts of
its trade, not two estimates of it.

**What 250 real records showed.** The first large live response (HS 620442,
US←IN, 250 of 26,740) carried 75 distinct consignee names. The name filter as
it stood dropped 4 of them. Eleven more should have gone:

* Forwarders the markers missed — Pegasus Maritime, Swift Cargo, Olympiad Line
  LLC, AJ Worldwide Services, Intoglo Technologies, International Warehouse
  Group. `maritime`, bare `cargo`, `worldwide services`, `warehouse group` and
  `line llc` are now markers, punctuation is stripped before matching so
  "Olympiad Line, LLC" reads the same as "Olympiad Line LLC", and Intoglo —
  whose name gives nothing away — is in `_KNOWN_LOGISTICS`.
* Not companies at all — "ATTN : KRISTIN SHEELER" (a person),
  "INDIVIDUAL (I9NBD221612934)" (a customs reference), "BOUTIQUE MANAGER" (a
  job title). Cut as noise or rejected as placeholders.

The vendor ships an `is_shipping` flag on every record, free, and
`bold_shipments.py` now honours it. It is a second opinion independent of the
name, which is all `looks_like_logistics` has to go on.

**Canadian consignees in a US pack — a product decision, not a bug.** Five of
the 75 were Gap (Canada) Inc, Old Navy (Canada) Inc, PVH Canada, SML Canada
Acquisition and American Eagle Outfitters Canada. `country_imp` says US on all
of them; `end_port` says BRAMPTON, which is Ontario. The feed is US-facing, not
a statement about where the buyer sits. `bold_shipments.py` now lets an
unambiguous port of unlading override the country and prints a count of rows
unladen outside the US, so the rows are labelled rather than silently sold as
US importers. Whether a "US buyers" pack should carry them at all is still
open — they are genuine buyers of Indian apparel, just not American ones.

Cost of this segment: 7,592 company records is 113,880 credits, about $79 at
Scale Pack rates, plus the one-off $499 setup. A 200-company pack is 3,000
credits, about $2.07.

Full pricing: $499 setup (once); credit packs $59/25k, $79/50k, $199/200k,
$690/1M, $1,950/5M; credits valid 12 months, extended by any later purchase;
1,000 free trial credits on registration. Also seen outside the API: $99 per US
HS code lifetime, and $299/month for a 1-seat "lead building" plan.

---

## Loading real data

Three steps, all offline except the first:

    export BOLD_API_KEY=...
    python3 scripts/bold_api.py records --hs 6204 \
        --import-country US --export-country IN \
        --max-records 1000 --out data/6204-in.json

    python3 scripts/bold_shipments.py data/6204-in.json --out data/6204-in.csv
    python3 scripts/ingest_csv.py data/6204-in.csv --hs4 6204 --dry-run
    python3 scripts/ingest_csv.py data/6204-in.csv --hs4 6204

`bold_shipments.py` maps their response onto the column names `ingest_csv.py`
already recognises rather than being a second ingest. Everything expensive to
get right — name cleaning, HS4 classification from goods text, address parsing,
weight-unit conversion, row fingerprinting so a re-run inserts nothing twice —
already exists there and is tested. A parallel JSON ingest would be a second
copy of all of it, and the second copy is the one that drifts.

It reads both response shapes. The global API and the USA country-specific API
name the same things differently (`start_port` vs `start_port_name`, `bydate`
vs `estimated_arrival_date`), and only the USA one carries `consignee_address`,
which is where city and state come from.

Proven end to end on 120 synthetic records in the documented shapes: 120 rows
converted, 17 forwarder rows dropped, 103 addresses parsed, 6 companies
upserted. The first call spends credits; everything after it is local, and
`--dry-run` shows what would be written before anything is.

## Before taking a real payment

* Delete the `[TEST]` rows. `/search` claims "Every row is a real US company",
  which is currently false.
* Fill in `OPERATOR` in `src/components/legal-page.tsx` — the registered agent
  line is a placeholder, and `legalName` must match the Articles of Organization.
* Rotate every secret that passed through a chat transcript:
  `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and the Stripe keys.
* Create a **live-mode** Stripe webhook endpoint with its own `whsec_`. Test and
  live are separate worlds, and forgetting this is the classic launch-day bug.
* Point `caiusdata.com` at Railway and set `SITE_URL` to it. Use `SITE_URL`, not
  `NEXT_PUBLIC_SITE_URL` — the latter is baked in at build time.
* Upgrade Supabase to Pro. Free projects pause after 7 days of inactivity, and
  there are no backups.
* Prices in `src/lib/packs.ts` are provisional, pending market research.

---

## Running it

```bash
npm install
npm run check          # typecheck, lint, 24 node tests, 3 Python suites
npm run build
npm run dev
```

Ingest: `python scripts/ingest_csv.py <file.csv> --dry-run` first, always. It
auto-detects column names across providers and prints what it matched before
writing anything. `--map field=Column` overrides.

`supabase/README.md` covers migrations. `README.md` covers architecture and the
reasoning behind the blurred-column design (the blur is decoration; the real
gate is server-side).
