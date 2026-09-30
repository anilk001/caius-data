#!/usr/bin/env python3
"""
Tests for keeping personal contact data out of the database.

Run: python3 scripts/test_personal_data.py

Two ways to fail, and they fail in opposite directions. Letting an email
through puts Caius in the business of transferring personal data out of the EU.
Redacting too eagerly destroys the goods descriptions the packs are sold on —
trade text is nothing but long digit strings, and every one of them looks like
a phone number to a careless pattern.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from personal_data import detect_personal_fields, redact_contacts

failures: list[str] = []


def check(label: str, got, expected) -> None:
    if got != expected:
        failures.append(f"  {label}\n    expected {expected!r}\n    got      {got!r}")


# --- Named fields, using their own company-profile shape --------------------
PROFILE = {
    "name": "AB INBEV UK LIMITED",
    "domain": "ab-inbev.com",
    "contact_info": {"phone": "+44 20 7946 0958", "email": "buyer@ab-inbev.com"},
    "social_links": {"linkedin": "https://linkedin.com/company/ab-inbev", "twitter": ""},
    "total_shipments": 521,
}
found = detect_personal_fields(PROFILE)
check("populated contact fields are reported", "contact_info" in found, True)
check("populated social links are reported", "social_links" in found, True)
check("ordinary fields are not", [f for f in found if f in ("name", "domain")], [])

# Their own brochure example ships these empty. A report that fires on every
# record is one nobody reads.
EMPTY = {"contact_info": {"phone": "", "email": ""}, "social_links": {"linkedin": "", "twitter": ""}}
check("empty contact fields are not reported", detect_personal_fields(EMPTY), [])
check("a '-' placeholder is empty", detect_personal_fields({"email": "-"}), [])
check("nested paths are named in full",
      detect_personal_fields({"data": {"contact_info": {"email": "a@b.com"}}}), ["data.contact_info"])
check("a non-dict is not an error", detect_personal_fields("nope"), [])

# --- Free text ---------------------------------------------------------------
check("an email in a goods description is removed",
      redact_contacts("LADIES DRESS CONTACT ramesh@exporter.co.in FOR SPECS"),
      "LADIES DRESS CONTACT [removed] FOR SPECS")
check("an international number is removed",
      redact_contacts("WOVEN DRESS CALL +91 98765 43210"),
      "WOVEN DRESS CALL [removed]")
check("a US number in parentheses is removed",
      redact_contacts("SAMPLES (267) 941-1099"), "SAMPLES [removed]")
check("nothing to redact is left alone",
      redact_contacts("LADIES WOVEN DRESS 100% COTTON"), "LADIES WOVEN DRESS 100% COTTON")
check("empty stays empty", redact_contacts(""), "")
check("None stays None", redact_contacts(None), None)

# --- What must survive: trade data is all long digit strings ------------------
# Every one of these is real. A greedy phone pattern eats the product.
for text in [
    "HS 62044290620449996211 WOMENS DRESSES",   # concatenated filer codes
    "BILL OF LADING 510202601304665",
    "CONTAINER MSKU 4567890 SEAL 1234567",
    "13736400.36 PCS 5210131.19 KG",
    "INV 2026-09-15 PO 4500123456",
    "0210/473-0 SEVERAL EAU DE TOILETTE",
]:
    if redact_contacts(text) != text:
        failures.append(f"  trade text must survive redaction:\n    {text!r}\n    became {redact_contacts(text)!r}")


# --- Labelled contacts in goods text, from the HS 0904 pull on the US API ----
for raw, expected in [
    ("RED CHILLI POWDER FREIGHT PREPAID ==MO: +1 713 555 0100 EMAIL: INFO=RAJM ASALA.COM",
     "RED CHILLI POWDER FREIGHT PREPAID"),
    ("CRUSHED CHILLI GSTIN:36AABC P6061C1ZQ ==CTC:MR.CARLOS A. LASTRA EMAIL :CARLOS",
     "CRUSHED CHILLI GSTIN:36AABC P6061C1ZQ"),
    ("PAPRIKA . =GSTIN : 36AABCB3746N1Z F #EMAIL:DAVID=SCHIFFFOOD. C",
     "PAPRIKA . =GSTIN : 36AABCB3746N1Z F"),
    # HS codes and lot numbers are not contacts.
    ("H S CODE 09042211 090 42219 ASSORTED CHILLI", "H S CODE 09042211 090 42219 ASSORTED CHILLI"),
    ("MOISTURE 10% MAX, PH 5.5", "MOISTURE 10% MAX, PH 5.5"),
]:
    got = redact_contacts(raw)
    if got != expected:
        failures.append(f"  goods {raw!r}\n    expected {expected!r}\n    got      {got!r}")

# --- Consignee addresses: every case from the HS 0904 pull on the US API ------
from personal_data import redact_address  # noqa: E402

for raw, expected in [
    ("747 SOUTH CENTRAL AVE, LOS ANGELES, CA 90021, P.O.BOX 21386, USA TEL. 213 489 9018, FAX 213 489 1346",
     "747 SOUTH CENTRAL AVE, LOS ANGELES, CA 90021, P.O.BOX 21386, USA"),
    ("2512 TYLER AVE EL MONTE, CA 91733 EMAIL: JJHTRADINGINC49@GMAIL.COM AVE EL MONTE 91733 US",
     "2512 TYLER AVE EL MONTE, CA 91733"),
    ("P.O. BOX 10726 NEW ORLEANS, LA 70181 USA,  MR. ROBERT DE PAULA", "P.O. BOX 10726 NEW ORLEANS, LA 70181 USA"),
    ("203 WINDSOR, CANTER DRIVE, EAST WINDSOR, NJ, 08520, US. PH NO:732, 960", "203 WINDSOR, CANTER DRIVE, EAST WINDSOR, NJ, 08520, US"),
    ("209 45 45TH ROAD 2ND FLOOR BAYSIDE, NY 11361 T . 718-341-0066", "209 45 45TH ROAD 2ND FLOOR BAYSIDE, NY 11361"),
    ("3801 W URSULA AVE MCALLEN TX 78503 USA VICTOR : (956) 212-9464", "3801 W URSULA AVE MCALLEN TX 78503 USA"),
    ("P.O.BOX 10726 NEW ORLEANS,LA 70181 USA MR.ROBERT DE PAULA", "P.O.BOX 10726 NEW ORLEANS,LA 70181 USA"),
    ("3250 CAMINO DEL SOL OXNARD; CA 93030,ZIP UNITED STATES,MARTINA ,TIFFNY.ALLEN@",
     "3250 CAMINO DEL SOL OXNARD; CA 93030,ZIP UNITED STATES"),
    ("1003 CRESTVIEW CIRCLE, USA WESTON FL 33323 UNITED STATES", "1003 CRESTVIEW CIRCLE, USA WESTON FL 33323 UNITED STATES"),
    # Nothing to cut: a ZIP+4, a Mississippi address, a suite number.
    ("16-00 POLLITT DRIVE FAIR LAWN NJ 07410-1234 UNITED STATES", "16-00 POLLITT DRIVE FAIR LAWN NJ 07410-1234 UNITED STATES"),
    ("100 MAIN ST JACKSON MS 39201 US", "100 MAIN ST JACKSON MS 39201 US"),
    ("1308 SANTA ANITA AVENUE SUITE #A SOUTH EL MONTE CA 91733", "1308 SANTA ANITA AVENUE SUITE #A SOUTH EL MONTE CA 91733"),
    (None, None),
]:
    got = redact_address(raw)
    if got != expected:
        failures.append(f"  address {raw!r}\n    expected {expected!r}\n    got      {got!r}")

if failures:
    print(f"\n{len(failures)} failure(s):\n")
    print("\n\n".join(failures))
    raise SystemExit(1)

print("All personal data tests passed.")
