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
check("and the forwarder does not", skipped_all["blank name or logistics company"], 1)

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

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All company record mapping tests passed.")
