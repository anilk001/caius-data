#!/usr/bin/env python3
"""
Tests for reading the billofladingdata search-filters response.

Run: python3 scripts/test_bold_api.py

Every case below comes from the real response to a 620442 query: 73 hs_codes
ranging from 2 to 20 digits, plus import_countries and export_countries as
{label, value} objects. Getting this wrong costs money rather than correctness
— credits are consumed per record returned, so a code list that leaks 62114999
into a dress pack is billed for handbag shipments nobody asked for.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bold_api import (
    find_list,
    heading_of,
    leading_digits,
    option_pairs,
    select_codes,
)

failures: list[str] = []


def check(label: str, got, expected) -> None:
    if got != expected:
        failures.append(f"  {label}\n    expected {expected!r}\n    got      {got!r}")


# --- Digit extraction -------------------------------------------------------
check("bare code", leading_digits("620442"), "620442")
check("code with description", leading_digits("6204420000 - WOMENS DRESSES"), "6204420000")
check("leading space", leading_digits("  62044290"), "62044290")
check("no digits at all", leading_digits("UNKNOWN"), "")
# A description containing digits must not be glued onto the code.
check("digits in description", leading_digits("6204 COTTON 2 PLY"), "6204")

check("heading of a 10-digit code", heading_of("6204420000"), "6204")
check("heading of a chapter", heading_of("62"), None)
check("heading of a 4-digit code", heading_of("6204"), "6204")
check("heading of junk", heading_of("N/A"), None)

# --- The real 73-code list, trimmed to one of each shape --------------------
RESPONSE = {
    "data": {
        "hs_codes": [
            "620442",            # the heading itself, 6 digits
            "6204420000",
            "62044290",
            "620443201",
            "62044290620449996211",  # two codes run together by the filer
            "6204",
            "62",                # whole chapter — too broad to attribute
            "61",
            "39",
            "3050",              # not an apparel code at all
            "610610009",
            "62114999",
            "39269069",
            "620630000",
            "620442",            # duplicate, as the feed really does repeat
        ],
        "export_countries": [
            {"label": "INDIA", "value": "IN"},
            {"label": "VIET NAM", "value": "VN"},
            {"label": "SRI LANKA", "value": "LK"},
        ],
        "import_countries": [{"label": "UNITED STATES", "value": "US"}],
    }
}

kept, dropped = select_codes(
    [value for _, value in option_pairs(RESPONSE, "hs_codes")],
    ["620442"],
)

check(
    "keeps every 6204 code, in its original spelling, once each",
    kept,
    ["620442", "6204420000", "62044290", "620443201", "62044290620449996211", "6204"],
)
check(
    "drops chapters, other headings and non-apparel noise",
    dropped,
    ["62", "61", "39", "3050", "610610009", "62114999", "39269069", "620630000"],
)

# A chapter code is the expensive mistake: "62" would buy the whole of apparel.
if "62" in kept:
    failures.append("  bare chapter '62' must never survive a heading filter")

# Filtering on a 4-digit heading must behave the same as on a 6-digit code:
# the caller types whatever the vendor's docs demanded that day.
kept4, _ = select_codes([v for _, v in option_pairs(RESPONSE, "hs_codes")], ["6204"])
check("4-digit and 6-digit headings select alike", kept4, kept)

# Two headings at once — packs are sometimes sold across a related pair.
kept_pair, _ = select_codes(
    [v for _, v in option_pairs(RESPONSE, "hs_codes")], ["6204", "6206"]
)
check("second heading pulls its codes in", "620630000" in kept_pair, True)

# --- Countries --------------------------------------------------------------
check(
    "export countries normalise to (label, value)",
    option_pairs(RESPONSE, "export_countries"),
    [("INDIA", "IN"), ("VIET NAM", "VN"), ("SRI LANKA", "LK")],
)
check(
    "origin filtering is what makes a pack worth buying",
    [value for label, value in option_pairs(RESPONSE, "export_countries") if label == "INDIA"],
    ["IN"],
)

# --- Envelope shapes --------------------------------------------------------
# The response has been seen both wrapped in "data" and bare; neither may break.
check("finds a list nested under data", find_list(RESPONSE, "import_countries"),
      [{"label": "UNITED STATES", "value": "US"}])
check("finds a list at the top level",
      find_list({"hs_codes": ["6204"]}, "hs_codes"), ["6204"])
check("missing key is empty, not an error", find_list(RESPONSE, "ports"), [])

# Bare strings and {label, value} objects can share one list.
check(
    "mixed shapes in one list",
    option_pairs({"hs_codes": ["6204", {"label": "6206 BLOUSES", "value": "6206"}]}, "hs_codes"),
    [("6204", "6204"), ("6206 BLOUSES", "6206")],
)

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All bold_api filter tests passed.")
