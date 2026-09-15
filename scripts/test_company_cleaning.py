#!/usr/bin/env python3
"""
Tests for the manifest cleaning rules.

Plain asserts, no test framework — this needs to run on a laptop with nothing
installed:  python3 scripts/test_company_cleaning.py
"""

from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from company_cleaning import (
    clean_company_name,
    looks_like_logistics,
    clean_hs4,
    clean_state,
    grouping_key,
    parse_date,
    parse_weight_kg,
    row_hash,
)

failures: list[str] = []


def check(label: str, actual, expected) -> None:
    if actual != expected:
        failures.append(f"  {label}\n    expected {expected!r}\n    got      {actual!r}")


# --- Name cleaning ---------------------------------------------------------
check("shouted name", clean_company_name("ACME IMPORTS INC."), "Acme Imports Inc")
check("mixed case left alone", clean_company_name("Acme Imports, Inc"), "Acme Imports, Inc")
check("broker suffix", clean_company_name("ACME IMPORTS LLC C/O EXPEDITORS INTL"), "Acme Imports LLC")
check("dba stripped", clean_company_name("GLOBAL TRADE CO DBA GTC USA"), "Global Trade Co")
check("acronym kept", clean_company_name("DIAMOND HOUSE OF NY LLC"), "Diamond House of NY LLC")
check("usa kept upper", clean_company_name("SPICE KING USA CORP"), "Spice King USA Corp")
check("placeholder rejected", clean_company_name("TO THE ORDER OF SHIPPER"), None)
check("unknown rejected", clean_company_name("unknown"), None)
check("empty rejected", clean_company_name(""), None)
check("none rejected", clean_company_name(None), None)

# --- Grouping --------------------------------------------------------------
check(
    "suffix variants group together",
    grouping_key("Acme Imports Inc", "Los Angeles", "CA", "6204"),
    grouping_key("ACME IMPORTS LLC", "los angeles", "ca", "6204"),
)
check(
    "different cities stay apart",
    grouping_key("Acme Imports Inc", "Los Angeles", "CA", "6204")
    != grouping_key("Acme Imports Inc", "Seattle", "WA", "6204"),
    True,
)
check(
    "different HS chapters stay apart",
    grouping_key("Acme Imports Inc", "Los Angeles", "CA", "6204")
    != grouping_key("Acme Imports Inc", "Los Angeles", "CA", "6203"),
    True,
)
check("name that is only a suffix", grouping_key("LLC", "NY", "NY", "6204"), None)

# --- HS codes --------------------------------------------------------------
check("dotted hts", clean_hs4("6204.42.3060"), "6204")
check("long numeric", clean_hs4("6204420000"), "6204")
check("already hs4", clean_hs4("6204"), "6204")
check("too short", clean_hs4("62"), None)
check("non numeric", clean_hs4("N/A"), None)

# --- Dates -----------------------------------------------------------------
check("us slash", parse_date("03/14/2026"), date(2026, 3, 14))
check("iso", parse_date("2026-01-08"), date(2026, 1, 8))
check("abbreviated", parse_date("15-Feb-2026"), date(2026, 2, 15))
check("month first text", parse_date("Feb 20, 2026"), date(2026, 2, 20))
check("day month text", parse_date("20 Feb 2026"), date(2026, 2, 20))
check("compact", parse_date("20260220"), date(2026, 2, 20))
check("iso with time", parse_date("2026-02-20T09:30:00Z"), date(2026, 2, 20))
check("space time", parse_date("2026-02-20 09:30:00"), date(2026, 2, 20))
check("junk", parse_date("N/A"), None)
check("empty", parse_date(""), None)

# --- Weights: the unit must be read, never assumed --------------------------
# Real manifests carry "158277 LB" and "6165 KG" in adjacent rows. Stripping
# the unit and keeping the number overstates every pound row by 2.2x.
check("pounds converted to kg", parse_weight_kg("158277 LB"), 71793.24)
check("pounds via unit column", parse_weight_kg("158277", "LB"), 71793.24)
check("kg stays kg", parse_weight_kg("6165 KG"), 6165.0)
check("kg via unit column", parse_weight_kg("6165", "KG"), 6165.0)
check("metric tonnes", parse_weight_kg("5", "MT"), 5000.0)
check("grams", parse_weight_kg("500", "G"), 0.5)
check("embedded unit beats the column", parse_weight_kg("100 LB", "KG"), 45.359)
check("unknown unit is refused", parse_weight_kg("1000", "banana"), None)
check("thousands separator", parse_weight_kg("12,400.50"), 12400.50)
check("unitless assumed kg", parse_weight_kg("9800"), 9800.0)
check("zero is not a weight", parse_weight_kg("0"), None)
check("junk", parse_weight_kg("n/a"), None)

# --- Carriers and forwarders are not buyers ---------------------------------
for name in [
    "EFL CONTAINER LINES LLC",
    "DE WELL CONTAINER SHIPPING, INC.",
    "FLEXPORT INTERNATIONAL LLC",
    "EXPEDITORS INTERNATIONAL",
    "SHANGHAI ZEHONG INTERNATIONAL LOGISTICS CO., LTD",
    "KUEHNE NAGEL LOGISTICS",
]:
    check(f"logistics: {name[:28]}", looks_like_logistics(name), True)

for name in [
    "GIORGIO ARMANI CORPORATION",
    "OLD NAVY LLC",
    "THE GAP, INC.",
    "URBAN OUTFITTERS,INC",
    "BANANA REPUBLIC.LLC",
    "ALL SAINTS USA LTD.",
    "SPICE KING USA CORP",
    "ACME APPAREL LOGISTICS",
]:
    check(f"buyer: {name[:32]}", looks_like_logistics(name), False)

check("empty name is not logistics", looks_like_logistics(""), False)
check("none is not logistics", looks_like_logistics(None), False)

# --- States ----------------------------------------------------------------
check("full name", clean_state("California"), "CA")
check("already code", clean_state("ca"), "CA")
check("new york", clean_state("New York"), "NY")
check("empty", clean_state(""), None)

# --- Row hashing -----------------------------------------------------------
check(
    "hash is order independent",
    row_hash({"a": "1", "b": "2"}),
    row_hash({"b": "2", "a": "1"}),
)
check(
    "hash changes with content",
    row_hash({"a": "1"}) != row_hash({"a": "2"}),
    True,
)


if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All cleaning tests passed.")
