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
    clean_country,
    country_from_name,
    looks_like_logistics,
    looks_like_consolidator,
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
    # Every name below reached the KEPT list on real HS 620442 records and
    # would have been sold to an Indian exporter as a buyer of their goods.
    "PEGASUS MARITIME, INC",
    "SWIFT CARGO INC",
    "OLYMPIAD LINE LLC",
    "OLYMPIAD LINE, LLC",
    "AJ WORLDWIDE SERVICES INC",
    "INTOGLO TECHNOLOGIES INC",
    "INTERNATIONAL WAREHOUSE GROUP",
    "SMARTMODE INTERNATIONAL LOGISTICS",
    "DSV AIR & SEA INC.",
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
    # The real buyers the widened markers must not touch. "Kate Quinn
    # Organics Inc Warehouse" is the buyer's own warehouse, not a 3PL, and
    # "Sugartown Worldwide" is Lilly Pulitzer.
    "KATE QUINN ORGANICS INC WAREHOUSE",
    "SUGARTOWN WORLDWIDE LLC",
    "VINEYARD VINES LLC",
    "HILL HOUSE HOME LLC",
    "PVH CORP",
    "J CREW GROUP INC",
    "NORDSTROM INC",
    "H&M HENNES & MAURITZ LP",
]:
    check(f"buyer: {name[:32]}", looks_like_logistics(name), False)

check("empty name is not logistics", looks_like_logistics(""), False)
check("none is not logistics", looks_like_logistics(None), False)

# --- Names that are not companies -------------------------------------------
# "ATTN : KRISTIN SHEELER" is a person and "INDIVIDUAL (I9NBD221612934)" is a
# customs reference. Both arrived in the consignee field of real records.
check("a person is not a company", clean_company_name("ATTN : KRISTIN SHEELER"), None)
check("attn after a name is cut",
      clean_company_name("ACME IMPORTS LLC ATTN: J SMITH"), "Acme Imports LLC")
check("an individual is not a company",
      clean_company_name("INDIVIDUAL (I9NBD221612934)"), None)
check("a job title is not a company", clean_company_name("BOUTIQUE MANAGER"), None)
check("the buyer's own warehouse is the buyer",
      clean_company_name("KATE QUINN ORGANICS INC WAREHOUSE"),
      "Kate Quinn Organics Inc")
check("a warehouse on its own is nobody", clean_company_name("WAREHOUSE"), None)

# --- C/O carries the buyer on either side ------------------------------------
# The filer's order is not reliable, and getting it backwards sells a
# fulfilment warehouse as a buyer of women's dresses.
check("buyer leads", clean_company_name("WEAR PACT, LLC C/O FLEXPORT"), "Wear Pact, LLC")
check("forwarder leads",
      clean_company_name("SHIPMONK C/O SOFT SURROUNDINGS"), "Soft Surroundings")
check("neither side is logistics, so the first still wins",
      clean_company_name("OMIKA C/O DASH FULFILLMENT"), "Omika")

# The four that reached a real pack preview before the markers covered them.
for name in [
    "3 PL WAREHOUSEING & DISTRIBUTION NJ",
    "J&S SUPPLY CHAIN MANAGEMENT",
    "BERGEN RECEIVING",
    "SHIPMONK PENNSYLVANIA (PA2)",
]:
    check(f"logistics: {name[:30]}", looks_like_logistics(clean_company_name(name)), True)

# --- A tail after the legal suffix -------------------------------------------
check("a person after the suffix is not part of the name",
      clean_company_name("RETAILVISOR LLC TERRY GRANT"), "Retailvisor LLC")
check("a country after the suffix is not part of the name",
      clean_company_name("WAL-MART STORES, INC. USA"), "Wal-Mart Stores, Inc")
# "international", "group" and "holdings" are in _SUFFIXES but sit mid-name
# constantly, so only incorporation words start a trim. Trimming on the wider
# set truncated both of these, and hid a forwarder from the filter.
check("a long tail is part of the name",
      clean_company_name("LEVEL LLC INTERNATIONAL FOLK ART"),
      "Level LLC International Folk Art")
check("international is not a trim point",
      clean_company_name("SMARTMODE INTERNATIONAL LOGISTICS L"),
      "Smartmode International Logistics L")

# --- Casing defects real names exposed --------------------------------------
check("by is a word, not an acronym",
      clean_company_name("WEST BY CPW LLC"), "West by CPW LLC")
check("byrd is a surname, not an acronym",
      clean_company_name("LIZA BYRD BOUTIQUE"), "Liza Byrd Boutique")
check("an ampersand joins words like a hyphen",
      clean_company_name("H&M HENNES&MAURITZ L.P.1600"),
      "H&M Hennes&Mauritz L.P.1600")
check("initials keep their capitals with a suite glued on",
      clean_company_name("ACME L.P.1600"), "Acme L.P.1600")

# --- A name the filer typed twice -------------------------------------------
check("doubled name folds",
      clean_company_name("OLD NAVY, LLC OLD NAVY, LLC"), "Old Navy, LLC")
check("tripled name folds", clean_company_name("GAP INC GAP INC GAP INC"), "Gap Inc")
check("a short repeat is left alone", clean_company_name("HO HO"), "Ho Ho")
check("a name that merely starts alike is left alone",
      clean_company_name("SAKS FIFTH AVENUE SAKS INC"), "Saks Fifth Avenue Saks Inc")

# --- Countries --------------------------------------------------------------
# Packs are filtered on this column with an equality test, so every spelling of
# the United States a filer might use has to land on "US". One that does not
# drops a real buyer out of every pack, silently.
for spelling in ["US", "usa", "USA", "United States", "U.S.A.",
                 "united states of america", "U S A", "America"]:
    check(f"country: {spelling}", clean_country(spelling), "US")

check("canada", clean_country("Canada"), "CA")
check("canada by code", clean_country("ca"), "CA")
check("mexico", clean_country("MEXICO"), "MX")
check("india", clean_country("India"), "IN")
check("a placeholder is no country", clean_country("n/a"), None)
check("empty", clean_country(""), None)
check("none", clean_country(None), None)
# Not guessed at. A wrong guess relabels a buyer's nationality, which is the
# one claim the front page makes.
check("an unknown country is handed back", clean_country("Freedonia"), "Freedonia")

# --- A foreign arm that lands its goods in a US port -------------------------
# "AMERICAN EAGLE OUTFITTERS CANADA" arrived on a real record unlading in New
# York. The port cannot see it; the name is what the customer reads.
for name, code in [
    ("Gap (Canada) Inc", "CA"),
    ("Old Navy (Canada) Inc", "CA"),
    ("PVH Canada, Inc", "CA"),
    ("SML Canada Acquisition Corp", "CA"),
    ("AMERICAN EAGLE OUTFITTERS CANADA", "CA"),
    ("H&M Canada Ltd", "CA"),
    ("Grupo Mexico Retail SA", "MX"),
]:
    check(f"arm: {name[:32]}", country_from_name(name), code)

# The expensive kind of wrong is the other way round. Each of these is a real
# or plausible US buyer that a wider rule would drop from every pack, silently.
for name in [
    "Canada Goose Holdings Inc",       # the country leads the brand
    "Canada Dry Bottling Co",
    "Global India Trading Inc",        # imports FROM India, sits in the US
    "China Star Imports LLC",
    "Acme New Mexico LLC",             # New Mexico is in the United States
    "Coach Services Inc",
    "JP Boden Services Inc",
]:
    check(f"not an arm: {name[:32]}", country_from_name(name), None)

check("empty name declares nothing", country_from_name(""), None)
check("none declares nothing", country_from_name(None), None)

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


# --- Glued legal suffixes and dotted initials --------------------------------
# Indian and Singaporean filers write "PVT.LTD." with no space. Title-cased as
# one token that becomes "Pvt.ltd", which is not a name to sell to anyone.
for raw, expected in [
    ("INDITEX TRENT RETAIL INDIA PVT.LTD.", "Inditex Trent Retail India Pvt Ltd"),
    ("ACME PTE.LTD.", "Acme Pte Ltd"),
    ("J.P.MORGAN CHASE", "J.P. Morgan Chase"),
    ("U.S.A. IMPORTS INC", "U.S.A. Imports Inc"),
    ("A.B.C. TEXTILES L.L.C.", "A.B.C. Textiles LLC"),
    ("URBAN OUTFITTERS,INC", "Urban Outfitters, Inc"),
    ("SINTEX INTERNATIONAL LIMITED.,", "Sintex International Limited"),
]:
    got = clean_company_name(raw)
    if got != expected:
        failures.append(f"  {raw!r}\n    expected {expected!r}\n    got      {got!r}")

# The Indian suffixes must collapse variants the same way the US ones do.
keys = {
    grouping_key(clean_company_name(n), "", "", "6204")
    for n in ("ORIENT CRAFT PVT.LTD.", "ORIENT CRAFT PRIVATE LIMITED", "ORIENT CRAFT LTD")
}
if len(keys) != 1:
    failures.append(f"  Indian legal-suffix variants must group together, got {keys}")

# --- Aliased names, as filed on real Vietnamese export declarations ----------
# Azazie appears twice in one 7,592-row buyer list, as "AZAZIE SG PTE. LTD."
# (24,332 shipments) and "AZAZIE SG PTE. LTD/ AZAZIE INC." (3,184). The vendor
# charges 15 credits per company record, so an unmerged alias is billed twice
# and shows a customer one buyer as two.
alias_keys = {
    grouping_key(clean_company_name(n), "", "", "6204")
    for n in ("AZAZIE SG PTE. LTD.", "AZAZIE SG PTE. LTD/ AZAZIE INC.")
}
if len(alias_keys) != 1:
    failures.append(f"  aliased filings must group together, got {alias_keys}")

# But a slash is not always an alias. A/S is a Danish legal suffix, and cutting
# there would invent a company called "Maersk Line A".
if grouping_key(clean_company_name("MAERSK LINE A/S"), "", "", "8901") == grouping_key(
    clean_company_name("MAERSK LINE A"), "", "", "8901"
):
    failures.append("  'A/S' is a legal suffix, not an alias separator")

# --- Names as they actually arrive on the India lane -------------------------
# Every one of these is a real consignee on HS 6204 from India.
for raw, expected in [
    # A domain is not a glued legal suffix. This came out as "Cbazaar. Com".
    ("CBAZAAR.COM INC.", "Cbazaar.com Inc"),
    # A hyphen is a word break to a reader and one token to a title-caser.
    ("WAL-MART STORES, INC. USA", "Wal-Mart Stores, Inc"),
    ("WAL-MART INC.", "Wal-Mart Inc"),
    # Filed with the bracket left open; the brand inside is how buyers know it.
    ("LAST BRAND INC (QUINCE", "Last Brand Inc (Quince)"),
    ("URBAN OUTFITTERS,INC", "Urban Outfitters, Inc"),
    ("ETHNOVOG INTERNATIONAL INC.", "Ethnovog International Inc"),
]:
    got = clean_company_name(raw)
    if got != expected:
        failures.append(f"  {raw!r}\n    expected {expected!r}\n    got      {got!r}")

# The domain exception must not undo the suffix splitting it sits next to.
for raw, expected in [
    ("INDITEX TRENT RETAIL INDIA PVT.LTD.", "Inditex Trent Retail India Pvt Ltd"),
    ("ACME PTE.LTD.", "Acme Pte Ltd"),
]:
    got = clean_company_name(raw)
    if got != expected:
        failures.append(f"  {raw!r}\n    expected {expected!r}\n    got      {got!r}")

# --- Parcel shippers, judged on the real India lane --------------------------
# name, shipments, total value, total quantity, should_drop
for name, ships, value, qty, drop in [
    # Every one of these is real, from HS 6204 US<-IN, 12 months to Sep 2026.
    ("Stelcore Management Services", 51968, 275311.87, 51968, True),
    ("Cbazaar.com",                   2694, 164028.21, 2694,  True),
    ("Ethnovog International",        1222, 34330.47, 1222,   True),
    ("AA Brands",                      998, 4693.65, 1063,    True),
    ("Urban Outfitters",              3491, 25512417.97, 1563063, False),
    ("Old Navy",                      2404, 31102194.69, 5014501, False),
    ("Wal-Mart Stores",               2070, 44581846.49, 4956074, False),
    ("Last Brand (Quince)",           1368, 511089.14, 32265,  False),
    ("The Gap",                        988, 4467803.19, 537771, False),
]:
    got = looks_like_consolidator(ships, value, qty)
    if got != drop:
        failures.append(
            f"  {name}: expected drop={drop}, got {got} "
            f"(${value/ships:,.0f}/shipment, {qty/ships:.1f} units/shipment)"
        )

# The unit is untrustworthy — one response listed a hundred of them. A buyer
# shipping a DOZEN at a time reads as one unit per shipment, and must survive.
if looks_like_consolidator(900, 1_800_000.0, 900):
    failures.append("  a buyer at $2,000 a shipment must not read as a parcel courier")

# But a genuine courier at one unit a shipment still goes.
if not looks_like_consolidator(900, 27_000.0, 900):
    failures.append("  $30 and one unit a shipment is a courier, not a buyer")

# Too few shipments to judge on ratios at all.
if looks_like_consolidator(120, 600.0, 120):
    failures.append("  a company below the volume threshold must never be judged")

# --- Brackets left open by cutting a noise clause ----------------------------
# "COACH SERVICES INC (DBA COACH) CCLS" is balanced until the DBA clause is
# removed, and removing it leaves a bracket opening onto nothing.
for raw, expected in [
    ("COACH SERVICES INC (DBA COACH) CCLS", "Coach Services Inc"),
    ("WEAR PACT, LLC C/O FLEXPORT", "Wear Pact, LLC"),
    ("SUGARTOWN WORLDWIDE LLC.", "Sugartown Worldwide LLC"),
    ("JP BODEN SERVICES INC.", "JP Boden Services Inc"),
]:
    got = clean_company_name(raw)
    if got != expected:
        failures.append(f"  {raw!r}\n    expected {expected!r}\n    got      {got!r}")

# A bracket with real content inside is still closed rather than cut.
if clean_company_name("LAST BRAND INC (QUINCE") != "Last Brand Inc (Quince)":
    failures.append("  an open bracket with a brand inside must be closed, not stripped")

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All cleaning tests passed.")
