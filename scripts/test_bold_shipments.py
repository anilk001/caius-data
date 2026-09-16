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

from bold_shipments import (
    COLUMNS,
    collapse_repeats,
    convert,
    destination_country,
    flagged_as_shipping,
    iso_date,
    to_row,
)

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

# A different bill of lading, or the two rows are identical once mapped and
# the duplicate fold below removes one before the direction filter is tested.
exports = dict(GLOBAL, type="exp", id="e1", bill_of_lading_nbr="EXP0001")
kept, dropped = convert([GLOBAL, exports], keep_type="imp")
check("the direction filter works", len(kept), 1)
check("and says what it dropped", dropped["not type=imp"], 1)

# Filtering is opt-in: a lane bought as export declarations is still the buyer
# list we want, so nothing is dropped unless asked.
unfiltered, _ = convert([GLOBAL, exports])
check("no filter means no dropping", len(unfiltered), 2)

# --- Repeating goods text, from live records --------------------------------
# A consignment of N identical cartons arrives with its line item concatenated
# N times, unseparated. Sold as-is it reads like a broken file.
check("two identical line items fold to one",
      collapse_repeats("SLIM PULL-ON TROUSERS HTS: 62046290" * 2),
      "SLIM PULL-ON TROUSERS HTS: 62046290")
check("eleven fold to one, not to a smaller multiple",
      collapse_repeats("COTTON WOVEN GIRLS DRESS HTS: 62044290" * 11),
      "COTTON WOVEN GIRLS DRESS HTS: 62044290")

# Two genuinely different line items on one bill are two things the buyer
# shipped. Folding those would destroy what the pack is sold for.
mixed = ("98% ORGANIC COTTON 2% ELASTANE WOVEN WOMENS PANT. "
         "97% ORGANIC COTTON 3% ELASTANE WOVEN WOMENS PANT.")
check("different line items are left alone", collapse_repeats(mixed), mixed)
check("a single description is untouched",
      collapse_repeats("ELASTOMULTIESTER WOVEN LADIES DRESS WITH HTS: 62044390"),
      "ELASTOMULTIESTER WOVEN LADIES DRESS WITH HTS: 62044390")
check("empty stays empty", collapse_repeats(""), "")

# End to end, on a record as it actually arrived.
folded = to_row(dict(GLOBAL, products="WOMENS LINEN WOVEN SKIRT HTS: 62044290" * 6))
check("the converter folds on the way through",
      folded["Product Description"], "WOMENS LINEN WOVEN SKIRT HTS: 62044290")

# --- The vendor's own logistics flag ----------------------------------------
# Free, on every record, and independent of the name — which is all
# looks_like_logistics has to work with.
check("flag set as a number", flagged_as_shipping({"is_shipping": 1}), True)
check("flag set as a string", flagged_as_shipping({"is_shipping": "1"}), True)
check("flag clear", flagged_as_shipping({"is_shipping": 0}), False)
check("flag absent", flagged_as_shipping({}), False)

flagged = dict(GLOBAL, is_shipping=1, consignee_name="SOME FORWARDER LLC")
rows, skipped = convert([flagged])
check("a flagged consignee is not a row", rows, [])
check("and the drop is counted",
      skipped["vendor flagged the consignee as a shipping company"], 1)

# --- Unlading port decides the country --------------------------------------
# `country_imp` says US on records unladen in Brampton, Ontario. Gap (Canada)
# Inc is a real buyer but not a US importer, and a US pack that contains it is
# wrong in the way a customer notices first.
check("brampton is canada", destination_country("BRAMPTON"), "CA")
check("port names with punctuation still match",
      destination_country("Montreal, QC"), "CA")
check("manzanillo is mexico", destination_country("MANZANILLO"), "MX")
check("a us port settles nothing here", destination_country("NEW YORK"), None)
check("no port, no answer", destination_country(""), None)

canadian = to_row(dict(GLOBAL, consignee_name="GAP (CANADA) INC",
                       end_port="BRAMPTON", country_imp="US"))
check("the port overrides the feed's country",
      canadian["Consignee Country"], "CA")

# --- The same shipment filed twice -------------------------------------------
# ingest_csv checks a row's fingerprint against the database, so a re-run
# inserts nothing twice. Two identical rows inside one file are both new to it,
# and shipment count is what the pack is sold on.
twice = dict(GLOBAL, id=1), dict(GLOBAL, id=2)
rows, skipped = convert(list(twice))
check("one shipment, filed under two record ids, is one row", len(rows), 1)
check("and the fold is counted",
      skipped["identical to a row already converted"], 1)

different = dict(GLOBAL, id=3, bill_of_lading_nbr="OTHER123")
rows, _ = convert([GLOBAL, different])
check("two genuinely different bills stay two rows", len(rows), 2)

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All shipment converter tests passed.")
