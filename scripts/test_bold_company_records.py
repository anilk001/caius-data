#!/usr/bin/env python3
"""
Tests for mapping a vendor company record onto a Caius companies row.

Run: python3 scripts/test_bold_company_records.py

The fixture below is the example response from page 5 of their API brochure,
field for field. Each record costs 15 credits, so a mapping bug is not a
cosmetic problem — it is a pack sold to a customer with a freight forwarder at
the top of it, or a heading silently attached to the wrong buyer.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bold_company_records import map_all, map_company_record, sources_from

failures: list[str] = []


def check(label: str, got, expected) -> None:
    if got != expected:
        failures.append(f"  {label}\n    expected {expected!r}\n    got      {got!r}")


# Their brochure's own example, verbatim.
INDITEX = {
    "rank": 1,
    "id": "26IN0509065597",
    "name": "INDITEX TRENT RETAIL INDIA PVT.LTD.",
    "domain": "-",
    "country": {"name": "INDIA", "code": "IN", "name_cn": "印度"},
    "total_import_value": 7668604.44,
    "total_shipments": 48583,
    "total_import_quantity": 1431169.92,
    "total_weight": 7770.43,
    "total_suppliers": 3,
    "import_countries": [{"name": "INDIA", "name_cn": "x", "code": "IN"}],
    "export_countries": [{"name": "SPAIN", "name_cn": "x", "code": "ES"}],
    "loading_ports": ["ZARAGOZA", "MADRID", "LISBON"],
    "unloading_ports": ["Delhi", "DELHI AIR", "Mumbai (ex Bombay)"],
    "products": "0210/473-0 SEVERAL EAU DE TOILETTE",
}

row = map_company_record(INDITEX, "6204")

# The display name keeps its legal suffix — grouping_key is what strips it, so
# "Acme Inc" and "Acme LLC" still collapse without the CSV losing the suffix a
# customer needs to look the company up. What must not survive is "Pvt.ltd",
# which is what a title-caser makes of a glued "PVT.LTD.".
check("name is title-cased with its suffix intact", row["name"], "Inditex Trent Retail India Pvt Ltd")
check("heading comes from the query, not the record", row["hs4_code"], "6204")
check("country code is carried through", row["country"], "IN")
check("first unloading port stands in for the modal one", row["primary_port"], "Delhi")
check("shipment count is an int", row["shipment_count"], 48583)
check("products become the description", row["product_description"], "0210/473-0 SEVERAL EAU DE TOILETTE")
check("origin countries are kept for the pack", row["_sources_from"], ["ES"])

# "-" is their absent-value sentinel. Storing it as a domain would put a hyphen
# in front of a paying customer.
check("a '-' domain is absent, not a domain", row["_domain"], None)

# An aggregated record has no address at any level. The schema's company_key
# includes city and state, so this has to be explicit rather than assumed.
check("no city in an aggregate", row["city"], None)
check("no state in an aggregate", row["state"], None)
check("no address in an aggregate", row["address"], None)

# --- The heading must be a real one -----------------------------------------
for bad in ("62", "", "dresses", None):
    try:
        map_company_record(INDITEX, bad)
        failures.append(f"  --hs4 {bad!r} should have been rejected")
    except (ValueError, TypeError, AttributeError):
        pass

# --- Freight forwarders must never reach a pack ------------------------------
FORWARDER = dict(INDITEX, name="EXPEDITORS INTERNATIONAL OF WASHINGTON INC", id="x1")
check("a known forwarder is dropped", map_company_record(FORWARDER, "6204"), None)
check("a blank name is dropped", map_company_record(dict(INDITEX, name="  "), "6204"), None)
check("a '-' name is dropped", map_company_record(dict(INDITEX, name="-"), "6204"), None)

# --- Origin filtering, which is what the pack is actually sold on ------------
VIETNAM_BUYER = dict(
    INDITEX,
    id="v1",
    name="BANANA REPUBLIC LLC",
    country={"name": "UNITED STATES", "code": "US"},
    export_countries=[
        {"name": "VIET NAM", "code": "VN"},
        {"name": "SRI LANKA", "code": "LK"},
    ],
    total_shipments=1200,
)

check("matches on ISO code", sources_from(VIETNAM_BUYER, "VN"), True)
check("matches on country name", sources_from(VIETNAM_BUYER, "viet nam"), True)
check("a second origin still matches", sources_from(VIETNAM_BUYER, "LK"), True)
check("an origin it does not buy from", sources_from(VIETNAM_BUYER, "IN"), False)
check("missing export_countries is not a match", sources_from({"name": "X"}, "VN"), False)

rows, skipped = map_all([INDITEX, VIETNAM_BUYER, FORWARDER], "6204", origin="VN")
check("only the Vietnam buyer survives", [r["name"] for r in rows], ["Banana Republic LLC"])
# The forwarder also sources from Spain, so the origin filter catches it first —
# both it and the Spain buyer are counted here, not one.
check("non-matching origins are counted", skipped["does not source from VN"], 2)

# Without an origin filter the forwarder must still be dropped, by name.
rows_all, skipped_all = map_all([INDITEX, VIETNAM_BUYER, FORWARDER], "6204")
check("unfiltered, both real buyers survive", len(rows_all), 2)
check("and the forwarder does not", skipped_all["freight forwarder or carrier"], 1)

# --- Degenerate shapes -------------------------------------------------------
BARE = {"name": "ACME IMPORTS LLC", "total_shipments": None}
bare_row = map_company_record(BARE, "6204")
check("a missing shipment count reads as zero", bare_row["shipment_count"], 0)
check("no ports means no port", bare_row["primary_port"], None)
check("country defaults to US", bare_row["country"], "US")
check("no products means no description", bare_row["product_description"], None)

rows_junk, skipped_junk = map_all([BARE, "not an object", 7], "6204")
check("non-objects are skipped, not fatal", len(rows_junk), 1)
check("and are counted", skipped_junk["not an object"], 2)

# --- Deduplication and consolidator filtering, on the real top-10 ------------
# Every row below is from one live search: HS 6204, buyer country US, seller
# country All. Nothing here is invented.
LIVE = [
    # Top by shipment count, and worthless: 51,968 shipments totalling $275,311,
    # which is $5 and exactly one piece each, through Delhi Air Cargo. Sorted by
    # shipments — which is how packs are assembled — it leads every pack.
    {"id": "1", "name": "STELCORE MANAGEMENT SERVICES LLC", "total_shipments": 51968,
     "total_import_value": 275311.87, "total_import_quantity": 51968,
     "country": {"code": "US"}, "export_countries": [{"name": "INDIA", "code": "IN"}],
     "unloading_ports": ["DELHI AIR CARGO"], "products": "LADIES DRESS"},
    {"id": "2", "name": "AZAZIE SG PTE. LTD.", "total_shipments": 24332,
     "total_import_value": 5284487.47, "total_import_quantity": 246566,
     "country": {"code": "US"}, "export_countries": [{"name": "VIET NAM", "code": "VN"}],
     "unloading_ports": ["HQNAMDINH"], "products": "WOMENS DRESS"},
    # The same buyer, filed under an alias. The vendor bills 15 credits for each.
    {"id": "3", "name": "AZAZIE SG PTE. LTD/ AZAZIE INC.", "total_shipments": 3184,
     "total_import_value": 459487.10, "total_import_quantity": 19877,
     "country": {"code": "US"}, "export_countries": [{"name": "SRI LANKA", "code": "LK"}],
     "unloading_ports": [], "products": ""},
    {"id": "4", "name": "OLD NAVY LLC", "total_shipments": 7182,
     "total_import_value": 96991578.38, "total_import_quantity": 13736400,
     "country": {"code": "US"},
     "export_countries": [{"name": "INDIA", "code": "IN"}, {"name": "PAKISTAN", "code": "PK"}],
     "unloading_ports": ["New York/Newark Area, Newark, New Jersey"],
     "products": "WOMENS WOVEN DRESS"},
]

rows, skipped = map_all(LIVE, "6204")
names = sorted(r["name"] for r in rows)

check("the consolidator never reaches a pack", "Stelcore Management Services LLC" in names, False)
check("and is reported as such", skipped["parcel consolidator (1 pc or under $50 a shipment)"], 1)
check("two real buyers survive", len(rows), 2)

azazie = next(r for r in rows if "Azazie" in r["name"])
check("the alias is merged, not sold twice", skipped["merged into another filing of the same company"], 1)
check("merged shipments are summed", azazie["shipment_count"], 24332 + 3184)
check("merged values are summed", round(azazie["_total_value"], 2), round(5284487.47 + 459487.10, 2))
check("origins are unioned across filings", azazie["_sources_from"], ["LK", "VN"])
check("the fuller filing supplies the display name", azazie["name"], "Azazie SG Pte Ltd/ Azazie Inc")
check("a field empty in one filing is taken from the other", azazie["primary_port"], "HQNAMDINH")

old_navy = next(r for r in rows if "Old Navy" in r["name"])
check("a genuine high-volume buyer is untouched", old_navy["shipment_count"], 7182)
check("its US unloading port is kept", old_navy["primary_port"], "New York/Newark Area, Newark, New Jersey")

# Old Navy runs $13,505 and 1,913 pieces a shipment; Azazie $217 and 10. Both
# are real. The threshold must not creep up to where direct-to-consumer buyers
# start failing it.
check("a low-volume company is never judged on ratios",
      map_all([dict(LIVE[0], id="5", total_shipments=40, total_import_quantity=40,
                    total_import_value=212.0)], "6204")[0] != [], True)

# --- Personal data never enters the database ---------------------------------
# The vendor confirmed the API "may return personal email addresses or mobile
# numbers". Caius is EU-operated and sells outside the EU, so a personal email
# in a pack is an international transfer of personal data, with an erasure duty
# reaching every customer who downloaded that row. Cheaper never to hold it.
WITH_CONTACTS = {
    "id": "p1", "name": "ORIENT CRAFT LIMITED", "total_shipments": 900,
    "total_import_value": 4500000.0, "total_import_quantity": 180000,
    "country": {"code": "US"}, "export_countries": [{"name": "INDIA", "code": "IN"}],
    "unloading_ports": ["NEW YORK"],
    "products": "LADIES WOVEN DRESS - CONTACT ramesh@orientcraft.in OR +91 98765 43210",
    "contact_info": {"email": "ramesh@orientcraft.in", "phone": "+91 98765 43210"},
    "social_links": {"linkedin": "https://linkedin.com/in/ramesh"},
}

contact_rows, contact_skipped = map_all([WITH_CONTACTS], "6204")
row = contact_rows[0]

check("the buyer is still sold", row["name"], "Orient Craft Limited")
check("no contact field is copied onto the row",
      [k for k in row if "email" in k or "phone" in k or "social" in k or "contact" in k], [])
check("an address inside the goods description is redacted",
      row["product_description"],
      "LADIES WOVEN DRESS - CONTACT [removed] OR [removed]")
check("and the run says it saw them",
      contact_skipped["records carrying personal contact fields (dropped, not stored)"], 1)

# No false alarm on the ordinary case.
check("a record with no contact fields raises nothing",
      "records carrying personal contact fields (dropped, not stored)" in skipped, False)

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All company record mapping tests passed.")
