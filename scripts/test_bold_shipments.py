#!/usr/bin/env python3
"""
Tests for converting vendor shipment records into an ingestible CSV.

Run: python3 scripts/test_bold_shipments.py

The two fixtures are the documented shapes: the Global API example from page 4
of their brochure, and the USA country-specific field list from page 7. They
disagree about the name of almost every field that matters — port, date,
address — so reading only one of them silently produces a CSV with empty
columns and a pack with no city, state or dates in it.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bold_shipments import COLUMNS, convert, iso_date, to_row

failures: list[str] = []


def check(label: str, got, expected) -> None:
    if got != expected:
        failures.append(f"  {label}\n    expected {expected!r}\n    got      {got!r}")


# --- Global API shape, from their own brochure ------------------------------
GLOBAL = {
    "id": "SFi_lZwBqGkGMwAiu4Ag",
    "type": "imp",
    "hs_code": "6204420000",
    "hs_code_desc": "WOMENS DRESSES OF COTTON",
    "bydate": 20260129,
    "country_imp": "US",
    "country_imp_en": "UNITED STATES",
    "country_exp": "IN",
    "country_exp_en": "INDIA",
    "amount": 34890.0,
    "manifest_units": "CARTONS",
    "manifest_qty": 240,
    "weight_unit": "KG",
    "weight": 3120,
    "shipper_name": "ORIENT CRAFT LIMITED",
    "consignee_name": "OLD NAVY LLC",
    "products": "LADIES WOVEN DRESS 100% COTTON",
    "start_port": "Jawaharlal Nehru (Nhava Sheva)",
    "end_port": "New York/Newark Area, Newark, New Jersey",
    "bill_of_lading_nbr": "510202601304665",
    "or_country": "INDIA",
}

row = to_row(GLOBAL)
check("consignee becomes the buyer", row["Consignee Name"], "OLD NAVY LLC")
check("hs code is passed through raw", row["HS Code"], "6204420000")
check("goods text becomes the description", row["Product Description"], "LADIES WOVEN DRESS 100% COTTON")
check("bydate becomes an ISO date", row["Arrival Date"], "2026-01-29")
check("origin prefers the readable name", row["Shipper Country"], "INDIA")
check("global port fields are read", row["Port of Unlading"], "New York/Newark Area, Newark, New Jersey")
check("weight and its unit travel together", (row["Weight"], row["Weight Unit"]), ("3120", "KG"))
check("bill of lading rides along", row["Bill of Lading"], "510202601304665")
# The global shape has no address, so city and state are simply absent.
check("no address in the global shape", row["Consignee Address"], "")

# --- USA country-specific shape, same shipment, different field names -------
USA = {
    "id": "us-1",
    "type": "imp",
    "hs_code": "6204420000",
    "estimated_arrival_date": "2026-01-29",
    "country_imp": "US",
    "country_exp": "IN",
    "manifest_units": "CARTONS",
    "manifest_qty": 240,
    "weight": 3120,
    "shipper_name": "ORIENT CRAFT LIMITED",
    "shipper_address": "GURGAON HARYANA INDIA",
    "consignee_name": "OLD NAVY LLC",
    "consignee_address": "2 FOLSOM ST, SAN FRANCISCO, CA 94105",
    "products": "LADIES WOVEN DRESS 100% COTTON",
    "start_port_name": "Nhava Sheva",
    "end_port_name": "New York, New York",
    "bill_of_lading_nbr": "BL-2",
    "carrier_name": "MAERSK LINE",
    "vessel_name": "MAERSK SELETAR",
    "container_number": "MSKU4567890",
}

usa = to_row(USA)
check("the address the pack needs is read", usa["Consignee Address"], "2 FOLSOM ST, SAN FRANCISCO, CA 94105")
check("the _name port variant is read", usa["Port of Unlading"], "New York, New York")
check("the estimated arrival date is read", usa["Arrival Date"], "2026-01-29")
check("carrier is read", usa["Carrier"], "MAERSK LINE")
check("origin falls back to the code", usa["Shipper Country"], "IN")
# No weight_unit on this shape. Passing an empty one lets parse_weight_kg apply
# its documented default rather than this script inventing a unit.
check("no unit is invented", usa["Weight Unit"], "")

# --- Every column the CSV promises exists on every row ----------------------
for name, produced in (("global", row), ("usa", usa)):
    missing = [c for c in COLUMNS if c not in produced]
    if missing:
        failures.append(f"  {name} row is missing columns: {missing}")

# --- Dates ------------------------------------------------------------------
check("integer bydate", iso_date("20260129"), "2026-01-29")
check("already ISO", iso_date("2026-01-29"), "2026-01-29")
check("empty stays empty", iso_date(""), "")
# Something unrecognised is passed through rather than mangled into a wrong
# date — ingest_csv has its own format list and may well understand it.
check("unknown format is left alone", iso_date("29 Jan 2026"), "29 Jan 2026")

# --- Absent-value sentinels -------------------------------------------------
# Their "-" means absent. Written as-is it becomes a carrier called "-".
dashes = to_row(dict(GLOBAL, carrier_name="-", products="-", end_port="N/A"))
check("a '-' carrier is empty", dashes["Carrier"], "")
check("an 'N/A' port is empty", dashes["Port of Unlading"], "")
# A "-" in products is absent, not a description, so the tariff description is
# used instead. That fallback is the whole point of listing two fields.
check("an absent products field falls back to the HS description",
      dashes["Product Description"], "WOMENS DRESSES OF COTTON")
check("both absent means empty",
      to_row(dict(GLOBAL, products="-", hs_code_desc=""))["Product Description"], "")

# --- Rows with nothing to sell ----------------------------------------------
check("no consignee, no row", to_row(dict(GLOBAL, consignee_name="")), None)
check("missing consignee key, no row", to_row({"hs_code": "6204"}), None)

# --- Contacts never reach the CSV -------------------------------------------
contact = to_row(dict(GLOBAL, products="DRESS - CALL ramesh@exporter.co.in"))
check("an address in goods text is redacted",
      contact["Product Description"], "DRESS - CALL [removed]")

# --- convert() --------------------------------------------------------------
rows, skipped = convert([GLOBAL, USA, {"type": "imp"}, "junk"])
check("both real shipments convert", len(rows), 2)
check("a row with no buyer is counted", skipped["no consignee name"], 1)
check("a non-object is counted", skipped["not an object"], 1)

exports = dict(GLOBAL, type="exp", id="e1")
kept, dropped = convert([GLOBAL, exports], keep_type="imp")
check("the direction filter works", len(kept), 1)
check("and says what it dropped", dropped["not type=imp"], 1)

# Filtering is opt-in: a lane bought as export declarations is still the buyer
# list we want, so nothing is dropped unless asked.
unfiltered, _ = convert([GLOBAL, exports])
check("no filter means no dropping", len(unfiltered), 2)

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All shipment converter tests passed.")
