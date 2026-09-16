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


def redact_contacts(text: str | None) -> str | None:
    """Strip email addresses and unambiguous phone numbers from free text."""
    if not text:
        return text
    cleaned = EMAIL.sub(REDACTED, str(text))
    cleaned = PHONE.sub(REDACTED, cleaned)
    return re.sub(r"\s{2,}", " ", cleaned).strip() or None
