#!/usr/bin/env python3
"""
Cost and pricing model for Caius Data packs.

Run: python3 scripts/pricing_model.py

Every number here is either a published price or an arithmetic consequence of
one. Estimates are marked. The point is to find the price that is far below the
market and still profitable, which are not in tension here — the market sells
annual subscriptions and we sell a file once.
"""

from __future__ import annotations

# --- Vendor: Boldata LLC (billofladingdata.com), published --------------------
SETUP_FEE = 499.00
CREDIT_PACKS = {           # credits: price
    "Micro":   (25_000, 59.00),
    "Starter": (50_000, 79.00),
    "Growth":  (200_000, 199.00),
    "Scale":   (1_000_000, 690.00),
    "Volume":  (5_000_000, 1_950.00),
}
CREDITS_COMPANY_RECORD = 15
CREDITS_SHIPMENT_GLOBAL = 1
CREDITS_SHIPMENT_USA = 2

# --- Stripe: US account, cards issued in India = international ----------------
# 2.9% + $0.30 domestic, plus 1.5% international card fee.
STRIPE_PCT = 0.044
STRIPE_FIXED = 0.30

# --- Fixed running costs, per year -------------------------------------------
# Marked (est) where it is a judgement rather than a published price.
FIXED_ANNUAL = {
    "Supabase Pro":                    300.00,
    "Railway hosting (est)":           120.00,
    "Resend (free tier, 3k/month)":      0.00,
    "Domain":                           15.00,
    "Wyoming registered agent (est)":  150.00,
    "Wyoming annual report":            60.00,
    "US tax filing 5472 + 1120 (est)": 500.00,
}
ONE_OFF = {"Boldata setup fee": SETUP_FEE, "LLC formation (est)": 150.00}


def net_of_stripe(price: float) -> float:
    return price - (price * STRIPE_PCT + STRIPE_FIXED)


def rule(char: str = "-", width: int = 72) -> None:
    print(char * width)


print("=" * 72)
print("1. WHAT THE DATA COSTS")
print("=" * 72)
print(f"{'pack':<10}{'credits':>12}{'price':>10}{'$/1k credits':>15}{'company records':>18}")
rule()
for name, (credits, price) in CREDIT_PACKS.items():
    per_k = price / credits * 1000
    companies = credits // CREDITS_COMPANY_RECORD
    print(f"{name:<10}{credits:>12,}{price:>10,.0f}{per_k:>15.2f}{companies:>18,}")

print()
print("A segment = one HS4 heading x one origin country, e.g. 6204 from India.")
print("Buying one is a one-off: the licence permits permanent storage and reuse")
print("across unlimited packs and customers, so the same segment is sold again")
print("and again at no further data cost.")
print()
print(f"{'segment size':<18}{'credits':>10}{'Growth pack':>14}{'Scale pack':>14}")
rule()
for n in (200, 500, 1000, 5000, 15916):
    credits = n * CREDITS_COMPANY_RECORD
    growth = credits * (199.00 / 200_000)
    scale = credits * (690.00 / 1_000_000)
    label = f"{n:,} companies"
    print(f"{label:<18}{credits:>10,}{growth:>14,.2f}{scale:>14,.2f}")

print()
print("=" * 72)
print("2. WHAT IT COSTS TO RUN, YEAR ONE")
print("=" * 72)
for name, cost in ONE_OFF.items():
    print(f"  {name:<40}{cost:>10,.2f}   once")
one_off_total = sum(ONE_OFF.values())
for name, cost in FIXED_ANNUAL.items():
    print(f"  {name:<40}{cost:>10,.2f}   /year")
fixed_total = sum(FIXED_ANNUAL.values())
first_credits = CREDIT_PACKS["Growth"][1]
print(f"  {'First credit pack (Growth, 200k)':<40}{first_credits:>10,.2f}   once")
rule()
year_one = one_off_total + fixed_total + first_credits
print(f"  {'YEAR ONE TOTAL':<40}{year_one:>10,.2f}")
print(f"  {'Year two onwards (no setup/formation)':<40}{fixed_total:>10,.2f}  + credits")

print()
print("=" * 72)
print("3. WHAT WE HAVE TO SELL AT")
print("=" * 72)
print("Data cost per sale approaches zero once a segment is bought, so the only")
print("real per-sale cost is Stripe. Stripe's fixed 30c is what punishes a very")
print("low price — it is 1.6% of $19 but 6% of $5.")
print()
print(f"{'price':>8}{'Stripe fee':>13}{'net':>10}{'fee %':>9}{'sales to break even yr1':>26}")
rule()
for price in (5, 9, 12, 19, 29, 39, 49, 79):
    fee = price * STRIPE_PCT + STRIPE_FIXED
    net = price - fee
    print(f"{price:>8,.0f}{fee:>13.2f}{net:>10.2f}{fee/price:>8.1%}{year_one/net:>26,.0f}")

print()
print("Year two onwards, with a $199 credit top-up:")
print(f"{'price':>8}{'net':>10}{'sales to break even':>24}{'profit at 500 sales':>22}")
rule()
year_two = fixed_total + 199.00
for price in (9, 19, 29, 39, 49):
    net = net_of_stripe(price)
    print(f"{price:>8,.0f}{net:>10.2f}{year_two/net:>24,.0f}{500*net - year_two:>22,.0f}")

print()
print("=" * 72)
print("4. WHAT THE MARKET CHARGES")
print("=" * 72)
market = [
    ("ImportGenius USA Essentials", 229.00, "month", 2198.00),
    ("ImportGenius USA Pro",        449.00, "month", 4310.00),
    ("Export Genius (from)",        278.00, "month", 278*12),
    ("Volza Startup",               125.00, "month", 1500.00),
    ("Volza SME",                   375.00, "month", 4500.00),
    ("Boldata own 'lead building'", 299.00, "month", 299*12),
    ("Seair (from, $80/6mo)",        13.33, "month", 160.00),
    ("ImportYeti paid (from, est)",  10.00, "month", 120.00),
]
print(f"{'competitor':<32}{'per month':>12}{'first-year cost':>18}")
rule()
for name, monthly, _, annual in sorted(market, key=lambda m: m[3]):
    print(f"{name:<32}{monthly:>12,.2f}{annual:>18,.2f}")

print()
print("The cheapest committed alternative is roughly $120-160 for a year.")
print("Everything with real filtering starts at $1,500/year.")
print()
print(f"{'our price':>12}{'vs cheapest ($120/yr)':>24}{'vs Volza Startup':>20}{'vs ImportGenius':>18}")
rule()
for price in (9, 19, 29, 49):
    print(f"{price:>12,.0f}{120/price:>23,.0f}x{1500/price:>19,.0f}x{2198/price:>17,.0f}x")
