# Caius Data — costs, pricing and the business model

Worked 16 September 2026. Run `python3 scripts/pricing_model.py` to regenerate
the arithmetic; `docs/pricing-model-output.txt` is the current output.

## Floor: no sale under $9

A niche holding fewer companies than the pack is charged pro rata — 120 of 200
costs 120/200 of the price — but **below $9 there is no sale at all**. Stripe's
own floor is 50 cents; this is a business one. Every sale costs the same to
support whatever it earned, and a thin file sets an expectation of what a Caius
pack contains that the next buyer inherits.

| Pack | Size | Price | Fewest companies sellable |
| --- | --- | --- | --- |
| Starter | 200 | $19 | 95 |
| Growth | 350 | $29 | 109 |
| Pro | 500 | $49 | 92 |

The thresholds derive from the floor and the pack price, so changing either
moves them. Below it the pack card shows no price and the button reads "Too few
companies", rather than letting someone click through to a refusal.

## What a row is

**One row is one company.** Not one shipment, not one company-location. A buyer
with 400 shipments is one row; a buyer filing from three warehouses is one row
with the other two addresses in an "Other Locations" column. A pack sold as 50
companies contains 50 companies a customer can count and check.

This is not free. Three things shrink a raw purchase before it becomes a pack:

| Loss | Cause |
| --- | --- |
| Freight forwarders and carriers | Not buyers. An exporter mailing Expeditors has bought their competitors' shipping agents. |
| Parcel consolidators | Top of one real list was 51,968 shipments worth $275,311 — $5 and one piece a shipment. |
| Duplicate filings | Azazie appears twice in one 7,592-row list; the vendor bills 15 credits for each. |

On the one real top-ten sample available, 11 records yielded 9 sellable rows.
That is a small sample, so treat ~80% as a working figure and measure it on the
first real purchase. It means the cost per **delivered** company is nearer 19
credits than 15 — about $3.70 rather than $2.98 for 200 companies. Still small
enough not to change any pricing decision, but the yield has to be measured
before a pack count is promised, not after.

The system enforces the promise rather than hoping for it: fulfilment
over-fetches, merges, then takes exactly N, and checkout counts distinct buyers
so the Stripe line item names the number the file will actually contain.

## The one fact that decides pricing

**Data cost is per segment, not per sale.** The Boldata licence permits
permanent storage and unlimited reuse across customers, so a segment — one HS4
heading crossed with one origin country, say 6204 from India — is bought once
and sold for ever.

| Segment size | Credits | Cost (Growth pack) | Cost (Scale pack) |
| --- | --- | --- | --- |
| 200 companies | 3,000 | $2.98 | $2.07 |
| 1,000 companies | 15,000 | $14.93 | $10.35 |
| 15,916 companies (all of 6204) | 238,740 | $237.55 | $164.73 |

Sell one segment to a hundred exporters and the data cost per sale is a few
cents. The only genuine per-sale cost is Stripe.

## What it costs to run

The company already exists, so formation is not a cost.

| | |
| --- | --- |
| Boldata setup fee | $499 once |
| First credit pack (Growth, 200k credits) | $199 once |
| Supabase Pro | $300/yr |
| Railway hosting (est) | $120/yr |
| Domain | $15/yr |
| Registered agent renewal (est) | $150/yr |
| Wyoming annual report | $60/yr |
| Form 5472 + pro-forma 1120, flat-fee CPA | $399/yr |
| **Year one** | **≈ $1,742** |
| **Year two onward** | **≈ $1,044 + credits** |

### Accounting and filings

Two jurisdictions, two people, and they are not interchangeable.

**US federal — online, flat fee.** A foreign-owned single-member LLC must file
Form 5472 with a pro-forma 1120 every year, even with no profit, as long as
there was a reportable transaction — funding the company counts. The penalty for
missing it is **$25,000**, which is more than this business makes in year one.
Firms that do only this filing charge **$175-$399** flat. Budget $399.

Do **not** take a formation provider's bundled "total compliance" plan without
pricing it: doola's is around **$2,000 a year**, more than every other cost in
the table combined. It buys bookkeeping software and a dedicated bookkeeper for
a business whose books are one Stripe payout line and six supplier bills. The
filing is the part that carries the penalty; the bookkeeping is a spreadsheet.

Before buying any plan, ask the provider one question: **does it include Form
5472 and the pro-forma 1120 for a foreign-owned single-member LLC?** Some plans
cover the state annual report and a standard return and exclude 5472, or charge
for it separately. That is the only line that matters.

**Irish side — the existing freelance accountant.** He cannot file US federal
returns; that needs a US preparer. But he is the right person for the question
that actually decides the tax bill: how Irish Revenue treats income from a US
LLC owned by an Irish resident, and whether it lands as personal income. Ask him
before the first sale, not at year end.

**BOI: no filing.** FinCEN's 2025 rule narrowed "reporting company" to entities
formed under foreign law and registered in a US state. A Wyoming LLC is domestic
however it is owned, so it is exempt.

## What the market charges

| Competitor | Per month | First-year cost |
| --- | --- | --- |
| ImportYeti paid tier (from) | $10 | $120 |
| Seair Exim (from, $80/6mo) | $13 | $160 |
| Volza Startup | $125 | $1,500 |
| ImportGenius USA Essentials | $229 | $2,198 |
| Export Genius (from) | $278 | $3,336 |
| Boldata's own lead-building plan | $299 | $3,588 |
| ImportGenius USA Pro | $449 | $4,310 |
| Volza SME | $375 | $4,500 |
| Panjiva (S&P Global) | undisclosed, enterprise | |

Two floors matter. The cheapest committed alternative is roughly **$120–160 for
a year**. Anything with real filtering — pick an HS code, pick an origin
country, download the buyers — starts at **$1,500 a year**.

Nobody sells a single filtered list once. That gap is the product.

## Pricing, as set

A **lane** is one HS4 heading crossed with one origin country — "HS 6204 from
India", not "HS 6204". That is the unit an exporter actually wants, and the one
that makes the pitch *US dress buyers already sourcing from Vietnam* rather than
a generic importer list.

| Pack | Companies | Price | Per company | Fewest sellable |
| --- | --- | --- | --- | --- |
| Starter | 50 | **$9** | $0.180 | 50 — sold whole, never part |
| Standard | 200 | **$29** | $0.145 | 63 |
| Pro | 500 | **$59** | $0.118 | 77 |

Price per company falls as the pack grows, so each step up is a real upgrade;
a test enforces that, because it is the easy thing to break when a price is
edited by hand. Between the floor and the full pack the price is pro rata.
Starter has no pro-rata band at all: at $9 for 50 it is already at the minimum,
so a lane with 40 companies is not sold.

### Not yet sellable: the whole lane

A full lane can be far larger than any pack here — HS 6204 from Vietnam alone
holds 7,592 buyers. `MAX_SEARCH_LIMIT` is 500, so 500 is the deepest list that
can be delivered today, and Pro is named for what it is rather than promising a
lane it cannot fill.

Selling a genuine full-lane pack needs `searchCompaniesFull` to paginate rather
than issue one capped query, and the resulting CSV size checked. That is the
highest-margin product on the list — the data behind the largest lane costs $165
once and resells for ever — so it is worth building, but it is a change to the
query layer rather than a number in this file.

### Why $29 and not $9 or $19

Going lower buys almost nothing and costs a great deal:

| Price | vs cheapest annual | vs Volza | Stripe's cut | Sales to break even, yr 1 |
| --- | --- | --- | --- | --- |
| $9 | 13x cheaper | 167x | 7.7% | 210 |
| $19 | 6x cheaper | 79x | 6.0% | 98 |
| $29 | 4x cheaper | 52x | 5.4% | **64** |
| $49 | 2x cheaper | 31x | 5.0% | 37 |

At $29 the pack is already four times cheaper than the cheapest annual
subscription on the market and fifty times cheaper than the cheapest one that
can actually filter by HS code and origin. Dropping to $9 changes that to
"thirteen times cheaper", which no buyer's decision turns on — while tripling
the number of sales needed and handing Stripe half again as much of each one.
Stripe's fixed 30c is the problem: 1.6% of a $29 sale, 3.3% of a $9 one.

The $9 Starter is not there to make money. It is there so a first-time buyer
risks nothing, and so the free sample has somewhere to lead.

The $79 full lane is where the margin is. The largest segment found so far —
every US buyer of HS 6204 — costs $165 to acquire and can be sold repeatedly.

### Break-even, year two onward

At $29 with a $199 credit top-up: **45 sales a year**, fewer than one a week.
Five hundred sales a year at $29 returns roughly **$12,500 profit**.

## The real constraint is not price

Sixty-four sales is not a pricing problem, it is a traffic problem. Paid
advertising probably cannot work here: a $29 sale nets $27, and a B2B
acquisition cost anywhere near that leaves nothing.

So the engine has to be search. An exporter in Tirupur types "US buyers of
cotton dresses" or "who imports HS 6204 from India". A page per HS4 heading
crossed with origin country answers exactly that query, and the free search and
three-row sample already exist to convert it. That is the growth plan; pricing
is not.

## Risks worth pricing in

1. **Form 5472** — see above. It is the single largest downside risk in the
   whole plan, and it is administrative rather than commercial.
2. **Indian cards on Stripe.** International card acceptance from India can be
   unreliable. Test a real Indian card before launch; a checkout that declines is
   indistinguishable from a product nobody wants.
3. **India GST / OIDAR.** Selling a digital service into India may require GST
   handling. Collecting a GSTIN at checkout puts B2B sales on reverse charge.
   Confirm with the accountant in point 1.
4. **Chargebacks.** Data products attract them. The free three-row sample is the
   defence: a buyer who has seen the format cannot claim they did not know.
5. **Credits expire after 12 months.** Buy the pack size the next twelve months
   justify, not the one with the best headline rate. Growth at $199 covers about
   13,000 company records, which is ten to thirteen lanes — enough to launch.

## First segments to buy

The $199 Growth pack covers roughly 13,300 company records. Ten lanes of ~1,000,
chosen for what India actually ships to the United States:

| HS4 | Goods | Indian cluster |
| --- | --- | --- |
| 3004 | Medicaments | Hyderabad, Ahmedabad |
| 7113 | Jewellery | Surat, Mumbai |
| 6204 | Women's dresses and suits, woven | Tirupur, Delhi NCR |
| 6203 | Men's suits and trousers | Bengaluru, Delhi NCR |
| 6109 | T-shirts, knitted | Tirupur |
| 6302 | Bed and table linen | Karur, Panipat |
| 5701 | Carpets, knotted | Bhadohi, Mirzapur |
| 4202 | Leather goods and handbags | Kanpur, Chennai |
| 0910 | Spices — ginger, turmeric | Kerala, Andhra |
| 2933 | Heterocyclic compounds | Gujarat |

Build two first, sell them, and let what sells decide the next eight.
