#!/usr/bin/env python3
"""
Tests for HS4 derivation from manifest goods descriptions.

Plain asserts, no framework:  python3 scripts/test_hs4_classifier.py

The rule these tests enforce: a wrong HS4 is worse than no HS4. A buyer who
pays for "the top 200 importers of HS 6204" and receives furniture importers
asks for a refund and does not come back.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hs4_classifier import MIN_CONFIDENCE, classify_hs4

failures: list[str] = []


def expect(desc: str, hs4: str | None, note: str = "") -> None:
    r = classify_hs4(desc)
    if r.hs4 != hs4:
        failures.append(
            f"  {desc!r}{' — ' + note if note else ''}\n"
            f"    expected {hs4!r}, got {r.hs4!r} "
            f"(confidence {r.confidence}, matched {r.matched[:3]})"
        )


def expect_confident(desc: str) -> None:
    r = classify_hs4(desc)
    if not r.is_confident:
        failures.append(f"  {desc!r} should be confident, got {r.confidence}")


# --- The five launch sectors ------------------------------------------------
expect("WOMENS COTTON WOVEN DRESSES", "6204")
expect("LADIES WOVEN DRESSES POLYESTER", "6204")
expect("MENS SUITS WOOL", "6203")
expect("T-SHIRTS COTTON KNITTED", "6109")
expect("GIRLS PULLOVER", "6110")
expect("BED LINEN COTTON", "6302")

expect("GROUND TURMERIC POWDER", "0910")
expect("CURRY POWDER MIXED SPICE", "0910")
expect("BLACK PEPPER WHOLE", "0904")
expect("CUMIN SEEDS", "0909")
expect("CASHEW NUTS WHOLE", "0801")

expect("GOLD JEWELLERY SET WITH DIAMONDS", "7113")
expect("ROUGH DIAMONDS UNWORKED", "7102")
expect("IMITATION JEWELLERY ASSORTED", "7117")

expect("LED MODULES AND DRIVERS", "8541")
expect("LITHIUM BATTERIES", "8507")
expect("INSULATED WIRES AND CABLES", "8544")

expect("REACTIVE DYES FOR TEXTILE", "3204")
expect("INSECTICIDE AGROCHEMICAL", "3808")

# --- A code the filer typed in beats any inference --------------------------
expect("HS CODE 6204.42 LADIES WEAR", "6204", "declared code wins")
expect("HTS 620442 APPAREL", "6204", "declared code wins")
if classify_hs4("HS CODE 6204.42 LADIES WEAR").source != "declared":
    failures.append("  declared code should report source='declared'")

# --- Must abstain rather than guess -----------------------------------------
expect("ASSORTED GOODS", None, "no signal")
expect("GENERAL MERCHANDISE", None, "no signal")
expect("FAK FREIGHT ALL KINDS", None, "no signal")
expect("", None, "empty")
expect(None, None, "none")
expect("MENS AND LADIES SHIRTS", None, "spans two gendered codes")
expect("MENS AND WOMENS APPAREL", None, "spans two gendered codes")

# --- False friends ----------------------------------------------------------
expect("SOFA COVER", None, "a cover is not a sofa")
expect("LEDGER BOOKS", None, "'led' must not match 'ledger'")
expect("SLED TOY", None, "'led' must not match 'sled'")
expect("BATTERY CHARGER", None, "a charger is not a battery")
expect("JEWELLERY DISPLAY BOX", None, "packaging is not jewellery")

# --- Plurals and inflections ------------------------------------------------
for singular, plural in [
    ("COTTON SOCK", "COTTON SOCKS"),
    ("AREA RUG", "AREA RUGS"),
    ("STORAGE BOX", "STORAGE BOXES"),
    ("LITHIUM BATTERY", "LITHIUM BATTERIES"),
    ("OFFICE CHAIR", "OFFICE CHAIRS"),
]:
    a, b = classify_hs4(singular).hs4, classify_hs4(plural).hs4
    if a != b:
        failures.append(f"  plural mismatch: {singular!r}={a} vs {plural!r}={b}")

# --- Confidence is meaningful -----------------------------------------------
expect_confident("WOMENS COTTON WOVEN DRESSES")
expect_confident("GROUND TURMERIC POWDER")
if classify_hs4("ASSORTED GOODS").confidence != 0.0:
    failures.append("  a no-signal description should score 0.0")
if not 0.0 <= MIN_CONFIDENCE <= 1.0:
    failures.append("  MIN_CONFIDENCE must be a probability")

# --- Real descriptions from the billofladingdata sample ---------------------
expect("SOFA", "9401")
expect("OFFICE CHAIR", "9401")
expect("STORAGE BOX", "9403")
expect("CEILING FAN", "8414")
expect("VACUUM CUP", "9617")
expect("AREA RUG MATERIAL: POLYESTER", "5703")
expect("CAT SCRATCH BOARDS MATERIAL: SISAL ROPE", None, "genuinely uncovered")

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All HS4 classifier tests passed.")
