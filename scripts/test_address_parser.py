#!/usr/bin/env python3
"""
Tests for splitting a combined US address into its parts.

Run: python3 scripts/test_address_parser.py

The public manifest feed has one address field (19 CFR 103.31(e)(3)), but the
search dashboard filters by state, the results table shows City/State, and —
most importantly — city and state form part of the key that merges one
company's rows. A city parsed inconsistently splits a company in two and
wrecks the shipment ranking packs are sorted on.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from address_parser import parse_us_address

failures: list[str] = []


def expect(raw, city, state, postcode=..., note=""):
    p = parse_us_address(raw)
    if p.city != city or p.state != state:
        failures.append(
            f"  {raw!r}{' — ' + note if note else ''}\n"
            f"    expected city={city!r} state={state!r}\n"
            f"    got      city={p.city!r} state={p.state!r}"
        )
    if postcode is not ... and p.postcode != postcode:
        failures.append(f"  {raw!r}: expected postcode {postcode!r}, got {p.postcode!r}")


# --- Real formats from the billofladingdata sample --------------------------
expect("490 CHADBOURNE RD A100 FAIRFIELD, CA 94534", "Fairfield", "CA", "94534")
expect("3900 PEEK RD, KATY, TX, UNITEDSTATES, 77449-6463", "Katy", "TX", "77449-6463")
expect("5050 PALO VERDE ST STE 118H,MONTCLAIR,CALIFORNIA 91763,US", "Montclair", "CA", "91763")
expect("3331 MARYBROOKS LN", None, None, None, "no city or state present")
expect("47548 HALYARD DRIVE SUITE B", None, None, None, "unit only, no city")

# --- Multi-word cities must survive intact ---------------------------------
expect("220 W 5TH ST STE 400 LOS ANGELES CA 90013", "Los Angeles", "CA")
expect("2200 MISSION COLLEGE BLVD SANTA CLARA CA 95054", "Santa Clara", "CA")
expect("580 5TH AVE, NEW YORK, NY 10036", "New York", "NY")

# --- Full state names -------------------------------------------------------
expect("1617 6TH AVE SEATTLE WASHINGTON 98101", "Seattle", "WA")
expect("100 MAIN ST, AUSTIN, TEXAS 78701", "Austin", "TX")

# --- A street number is not a postcode --------------------------------------
if parse_us_address("47548 HALYARD DRIVE SUITE B").postcode is not None:
    failures.append("  leading house number must not be read as a postcode")
expect("94534 SOME RD, KATY, TX 77449", "Katy", "TX", "77449", "leading number is not the zip")

# --- Country noise stripped, never read as a city ---------------------------
for suffix in ["UNITED STATES", "UNITEDSTATES", "USA", "US", "U.S.A."]:
    p = parse_us_address(f"88 MEEKER AVE, BROOKLYN, NY 11222, {suffix}")
    if p.city != "Brooklyn" or p.state != "NY":
        failures.append(f"  country suffix {suffix!r} broke parsing: {p.city!r}/{p.state!r}")

# --- Street directionals belong to the street -------------------------------
expect("700 NEW YORK AVE NW WASHINGTON DC 20001", "Washington", "DC")

# --- Degenerate input -------------------------------------------------------
for junk in [None, "", "   ", ",,,", "N/A"]:
    p = parse_us_address(junk)
    if p.is_usable:
        failures.append(f"  {junk!r} should not be usable")

# --- The property that actually matters: same input, same output ------------
addr = "220 W 5TH ST STE 400 LOS ANGELES CA 90013"
if len({(parse_us_address(addr).city, parse_us_address(addr).state) for _ in range(5)}) != 1:
    failures.append("  parsing must be deterministic")

# Case and spacing variants of one address must group identically.
variants = [
    "220 W 5TH ST STE 400 LOS ANGELES CA 90013",
    "220 w 5th st ste 400 los angeles ca 90013",
    "220 W 5TH ST STE 400  LOS ANGELES  CA  90013",
]
keys = {(parse_us_address(v).city, parse_us_address(v).state) for v in variants}
if len(keys) != 1:
    failures.append(f"  case/spacing variants must group together, got {keys}")

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All address parser tests passed.")
