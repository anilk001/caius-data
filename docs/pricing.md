# Caius Data — costs, pricing and the business model

Worked 16 September 2026. Run `python3 scripts/pricing_model.py` to regenerate
the arithmetic; `docs/pricing-model-output.txt` is the current output.

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

| | |
| --- | --- |
| Boldata setup fee | $499 once |
| LLC formation (est) | $150 once |
| First credit pack (Growth, 200k credits) | $199 once |
| Supabase Pro | $300/yr |
| Railway hosting (est) | $120/yr |
| Domain | $15/yr |
| Wyoming registered agent (est) | $150/yr |
| Wyoming annual report | $60/yr |
| US tax filing, Form 5472 + 1120 (est) | $500/yr |
| **Year one** | **≈ $2,000** |
| **Year two onward** | **≈ $1,145 + credits** |

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

## Recommended pricing

| Pack | Contents | Price | Net after Stripe |
| --- | --- | --- | --- |
| Starter | 50 companies, one lane | **$9** | $8.30 |
| Standard | 200 companies, one lane | **$29** | $27.42 |
| Full lane | every company in the lane | **$79** | $75.22 |

Stripe is charged at 4.4% + $0.30 — 2.9% + 30c plus the 1.5% international-card
fee, because the buyers hold Indian cards and the account is American.

### Why $29 and not $9 or $19

Going lower buys almost nothing and costs a great deal:

| Price | vs cheapest annual | vs Volza | Stripe's cut | Sales to break even, yr 1 |
| --- | --- | --- | --- | --- |
| $9 | 13x cheaper | 167x | 7.7% | 240 |
| $19 | 6x cheaper | 79x | 6.0% | 112 |
| $29 | 4x cheaper | 52x | 5.4% | **73** |
| $49 | 2x cheaper | 31x | 5.0% | 43 |

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

At $29 with a $199 credit top-up: **49 sales a year**, about one a week. Five
hundred sales a year at $29 returns roughly **$12,400 profit**.

## The real constraint is not price

Seventy-three sales is not a pricing problem, it is a traffic problem. Paid
advertising probably cannot work here: a $29 sale nets $27, and a B2B
acquisition cost anywhere near that leaves nothing.

So the engine has to be search. An exporter in Tirupur types "US buyers of
cotton dresses" or "who imports HS 6204 from India". A page per HS4 heading
crossed with origin country answers exactly that query, and the free search and
three-row sample already exist to convert it. That is the growth plan; pricing
is not.

## Risks worth pricing in

1. **Form 5472.** A foreign-owned single-member US LLC must file Form 5472 with
   a pro-forma 1120 every year. The penalty for not filing is **$25,000** — more
   than the business will make in year one. Get a US accountant before the first
   sale, not before the first tax deadline.
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
