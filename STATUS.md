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

## Open questions for the data vendor

Being evaluated: billofladingdata.com. Nothing purchased.

1. **Does the licence permit redistribution?** Unanswered, and it decides
   everything. Their published terms cover rate limits and key security and say
   nothing about what you may do with records once you have them. Silence is not
   permission.
2. **How is their `hs_codes` filter derived,** given the source has no HS codes
   and their own sample's column was empty? If they infer it from descriptions,
   their per-HS-code pricing is selling inference we now do ourselves.
3. **Does the US country-specific API carry structured city/state fields?**
4. Do credits expire? What are the rate limits?
5. **What is the shipment-records endpoint called, and what does it take?**
   `search-filters` is documented and working; the endpoint that actually
   returns records is not, so `scripts/bold_api.py call` is still aimed at a
   guessed name.

### Answered by the live key

**Origin-country filtering exists.** A `search-filters` response carries both
`export_countries` and `import_countries` (~100 entries each, India among them).
That changes what a pack is: not "the top 200 importers of HS 6204", but "200 US
dress buyers currently sourcing from Vietnam" — the same records, sold to an
Indian exporter as switch targets. Worth noting that in a 6204 shipment sample,
every consignee sourced from Vietnam, Sri Lanka, China or Turkey, and not one
from India. The buyers are there; they are just buying from someone else.

**Their HS codes are raw filer strings, not a taxonomy.** A query for 620442
returns 73 codes running from 2 digits (`62`, the whole apparel chapter) to 20
(`62044290620449996211`, two codes typed into one field), and 18 of them belong
to other headings entirely. Sending that list back buys handbags and T-shirts
along with the dresses, and credits are charged per record returned. So the
workflow is: `search-filters` -> prefix-filter on the HS4 heading -> pass the
survivors to the records endpoint. `scripts/bold_api.py filters --hs 620442
--codes-out codes.json` does the filtering and prints what it dropped;
`refine` re-runs it against a saved response for free.

### The endpoints, and where they are documented

The API docs are a portal, not a file:

* All modules: `tradedata.billofladingdata.com/supplier/api-documentation?tab=documentation`
* USA: same URL with `?tab=country-specific-api-documentation&country=us`

Their brochure (page 2) names ten modules and splits them free from paid:

| Free | Paid |
| --- | --- |
| Search Filters | Global Shipping Records — 1 credit/record |
| Shipping Filters | Country-Specific USA/India — **2** credits/record |
| Insights | All Importers / Exporters / Competitors — 15 credits/record |
| Products | Company Details profile — 20 credits/profile |
| Company Search | |
| Check Logistics Company | |

Slugs are not published, so `scripts/bold_api.py probe` maps them: an empty body
draws a 400 from a route that exists and a 404 from one that does not, returns no
records either way, and credits are only charged on records returned.

The USA field list (brochure page 7) includes `hs_code`, `hs_code_desc`,
`consignee_address`, `carrier_name`, `vessel_name` and `container_number` — well
beyond the 22 elements of 19 CFR 103.31, so they are enriching from somewhere.
The address still arrives as one blob, so `address_parser.py` stays. The HS
column in their own sample XLSX was empty, so `hs4_classifier.py` stays too, as
the fallback for rows where "where available" turns out to mean absent.

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

Unverified: whether All Importers accepts `hs_codes` + `export_countries`
together. If it does, "US importers of 6204 sourcing from Vietnam" is one paid
call. That is the whole product, so check it before anything else.

Full pricing: $499 setup (once); credit packs $59/25k, $79/50k, $199/200k,
$690/1M, $1,950/5M; credits valid 12 months, extended by any later purchase;
1,000 free trial credits on registration. Also seen outside the API: $99 per US
HS code lifetime, and $299/month for a 1-seat "lead building" plan.

---

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
