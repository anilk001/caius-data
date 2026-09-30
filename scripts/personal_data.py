#!/usr/bin/env python3
"""
Keep personal contact data out of Caius Data entirely.

The vendor confirmed their API "may return personal email addresses or mobile
numbers" and that those fields can be excluded at extraction. We exclude them,
and this module is where that decision is enforced rather than remembered.

Why exclude rather than filter at export
----------------------------------------
Caius is EU-operated and sells to buyers outside the EU, so a personal email in
a pack is an international transfer of personal data, with a lawful basis to
establish, subject-access requests to answer and an erasure duty that reaches
every customer who ever downloaded that row. A business name at a business
address carries none of that. The commercial value of a scraped mobile number
is not worth the compliance surface, so the data never enters the database at
all — there is nothing to erase, disclose or transfer.

Two leak paths, both closed here:

1. **Named fields** — contact_info, social_links and friends. `detect_personal_fields`
   reports which a response carried, so an ingest run can state plainly that it
   saw them and dropped them. That statement is the audit record.
2. **Free text** — `products` and description blobs are filer-typed and
   sometimes carry "contact ramesh@example.com". An allowlist of columns does
   not help when the address is inside a column we do want.
"""

from __future__ import annotations

import re

# Field names that hold, or may hold, personal contact data. Matched on the
# whole name and on nesting, so "contact_info.email" is caught by "contact_info".
PERSONAL_FIELD_NAMES = frozenset({
    "contact_info", "contacts", "contact", "contact_email", "contact_phone",
    "email", "emails", "email_address", "personal_email",
    "phone", "phones", "phone_number", "mobile", "mobile_number", "telephone",
    "whatsapp", "fax",
    "social_links", "linkedin", "twitter", "facebook", "instagram",
    "contact_person", "contact_name", "director", "directors", "owner",
})

EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b")

# Deliberately narrow. Trade data is full of long digit strings — HS codes,
# container numbers, bill of lading numbers, quantities — and a greedy phone
# pattern would redact the goods description it was meant to protect. So a
# number counts as a phone only when it announces itself: an international "+"
# prefix, or a parenthesised North American area code.
PHONE = re.compile(
    r"(?:\+\d[\d\s().-]{7,17}\d)"
    r"|(?:\(\d{3}\)\s*\d{3}[\s.-]?\d{4})"
)

REDACTED = "[removed]"


def _is_empty(value) -> bool:
    return value in (None, "", [], {}, "-") or (
        isinstance(value, dict) and all(_is_empty(v) for v in value.values())
    )


def detect_personal_fields(record: dict, prefix: str = "") -> list[str]:
    """
    Names of populated personal-data fields in a vendor record.

    Empty ones are not reported: their brochure example ships `contact_info`
    with two empty strings, and a compliance report that cries wolf on every
    record is one nobody reads.
    """
    found: list[str] = []
    if not isinstance(record, dict):
        return found

    for key, value in record.items():
        path = f"{prefix}{key}"
        if key.lower() in PERSONAL_FIELD_NAMES and not _is_empty(value):
            found.append(path)
            continue
        if isinstance(value, dict):
            found.extend(detect_personal_fields(value, prefix=f"{path}."))
    return found


# The country-specific US API's consignee_address is the one free-text field a
# paid pack delivers whole, and filers type the contact into it: "USA TEL. 213
# 489 9018, FAX 213 489 1346", "EMAIL: JJHTRADINGINC49@GMAIL.COM", "USA,  MR.
# ROBERT DE PAULA", "PH NO:732, 960". All four arrived in one 800-record HS 0904
# pull. The contact always trails the address, so everything from the first
# marker on goes. "MS" is not a marker — it is Mississippi.
_ADDRESS_CONTACT = re.compile(
    r"\b(?:tel|telephone|phone|fax|mobile|mob|contact|attn)\b"
    r"|\bph\b\.?\s*(?:no\b|[:#+(\d])"
    r"|\be\s*-?\s*mail\b"
    r"|\bmrs?\b\.?\s*[a-z]"
    r"|\bt\s*\.\s*\(?\d{3}"
    # "USA VICTOR : (956) 212-9464" — a first name announcing its number.
    r"|\b[a-z]+\s*:\s*\(?\d{3}\)?[\s.-]\d{3}",
    re.IGNORECASE,
)
# Once the country is written the address is over: "OXNARD; CA 93030,ZIP
# UNITED STATES,MARTINA ,TIFFNY.ALLEN@" is two people after it. A bare "USA"
# ends it only after a ZIP, because "1003 CRESTVIEW CIRCLE, USA WESTON FL" is
# the filer's word order, not the end.
_ADDRESS_END = re.compile(
    r"(?:united states(?: of america)?|\d{5}(?:-\d{4})?[\s,]*(?:usa|u\.s\.a\.?|us))\b",
    re.IGNORECASE,
)
# An email the fixed-width field cut short has no domain left to match EMAIL.
_EMAIL_FRAGMENT = re.compile(r"[\w.+-]*@[\w.-]*")

# In an address, unlike goods text, a bare 3-3-4 number is a phone: nothing else
# there has that shape. A ZIP+4 is 5-4.
_LOOSE_PHONE = re.compile(r"\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b")


def redact_address(text: str | None) -> str | None:
    """Cut the contact details a filer typed after a consignee address."""
    if not text:
        return text
    cleaned = str(text)
    end = _ADDRESS_END.search(cleaned)
    if end:
        cleaned = cleaned[: end.end()]
    marker = _ADDRESS_CONTACT.search(cleaned)
    if marker:
        cleaned = cleaned[: marker.start()]
    cleaned = _EMAIL_FRAGMENT.sub("", cleaned)
    cleaned = _LOOSE_PHONE.sub("", redact_contacts(cleaned) or "")
    cleaned = cleaned.replace(REDACTED, "")
    return re.sub(r"\s{2,}", " ", cleaned).strip(" ,.;:-") or None


# Goods text on the US API carries the notify party's contact after the goods:
# "==CTC:MR.CARLOS A. LASTRA EMAIL :CARLOS…", "#EMAIL:DAVID=SCHIFFFOOD. C" (an
# "=" typed for the "@", so EMAIL cannot see it), "==MO: +1…". A labelled
# contact is never followed by more goods, so the text is cut at the label.
_CONTACT_LABEL = re.compile(
    r"\b(?:e\s*-?\s*mail|ctc|attn|contact|mob(?:ile)?|mo|tel|ph)\s*[:#]"
    r"|\bmrs?\.\s*[a-z]"
    # "FREIGHT PREPAID 2ND NOTIFY PARTY JEANETTE LABARDINI CHB 4411 HERSHE
    # STREET" — a named customs broker, on a real HS 0904 record.
    r"|\b(?:\d(?:st|nd|rd|th)\s+)?notify\s+party\b",
    re.IGNORECASE,
)


def redact_contacts(text: str | None) -> str | None:
    """Strip email addresses and unambiguous phone numbers from free text."""
    if not text:
        return text
    label = _CONTACT_LABEL.search(str(text))
    if label:
        text = str(text)[: label.start()].rstrip(" =#,;:-")
        if not text:
            return None
    cleaned = EMAIL.sub(REDACTED, str(text))
    cleaned = PHONE.sub(REDACTED, cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip() or None
