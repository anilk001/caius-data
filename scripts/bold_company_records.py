#!/usr/bin/env python3
"""
Map a billofladingdata company record onto a Caius `companies` row.

Their All Importers / All Exporters / Competitors endpoint returns aggregated
company records — 15 credits each — in the shape documented on page 5 of their
API brochure. That is the cheapest way to build a buyer pack: a pack of 200
companies costs about 3,000 credits, roughly $2 at Scale Pack rates, against a
$19-49 price. Aggregating shipment records into the same thing costs several
times more, because a real importer ships far more than the 7.5 shipments per
company where the two paths break even.

    python scripts/bold_company_records.py data/6204-importers.json --hs4 6204
    python scripts/bold_company_records.py data/6204-importers.json --hs4 6204 \
        --origin VN --out data/rows.json

What their record does NOT contain
----------------------------------
Two absences shape everything downstream:

* **No HS code.** The heading is implied by the query you paid for, not carried
  in the response, so --hs4 is required and is trusted as given.
* **No address, city or state.** Only a country. Our companies.company_key is
  (name, city, state, hs4), so a company built from these records keys on name
  and heading alone. That is still unique, but the search dashboard's state
  filter will find nothing for them, and the results table's City/State column
  will be blank. City and state live on `consignee_address` in the shipment
  record (2 credits), so they are a separate purchase, not a parsing problem.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from personal_data import detect_personal_fields, redact_contacts
from company_cleaning import (
    clean_company_name,
    clean_hs4,
    clean_text,
    grouping_key,
    looks_like_consolidator,
    looks_like_logistics,
)

# Their JSON uses "-" where a value is absent rather than null or "".
ABSENT = {"", "-", "--", "n/a", "N/A", "null", "none"}


def _text(value) -> str | None:
    """Their absent-value sentinel is "-", which is not a domain or a product."""
    if value is None:
        return None
    cleaned = clean_text(str(value))
    if not cleaned or cleaned.strip().lower() in ABSENT:
        return None
    return cleaned


def _country_codes(record: dict, key: str) -> list[str]:
    """Pull ISO codes out of [{"name": …, "code": "VN", "name_cn": …}, …]."""
    codes = []
    for entry in record.get(key) or []:
        if isinstance(entry, dict) and entry.get("code"):
            codes.append(str(entry["code"]).strip().upper())
        elif isinstance(entry, str) and entry.strip():
            codes.append(entry.strip().upper())
    return codes


def sources_from(record: dict, origin: str) -> bool:
    """
    Does this importer buy from `origin`?

    This is the filter the whole product rests on: an Indian exporter is not
    buying a list of dress importers, they are buying the ones already sourcing
    dresses from Vietnam, Bangladesh or Turkey — buyers with a live supplier to
    displace. Matches on ISO code or country name, since callers reach for both.
    """
    needle = origin.strip().upper()
    if needle in _country_codes(record, "export_countries"):
        return True
    return any(
        isinstance(entry, dict) and needle == str(entry.get("name", "")).strip().upper()
        for entry in record.get("export_countries") or []
    )


def map_company_record(record: dict, hs4: str) -> dict | None:
    """
    Turn one of their company records into a row for public.companies.

    Returns None for anything not worth selling — a blank name, or a freight
    forwarder. Logistics companies dominate manifest data by volume and are
    worthless in a buyer pack: an exporter who cold-mails Expeditors has bought
    a list of their own competitors' shipping agents.
    """
    heading = clean_hs4(hs4)
    if not heading:
        raise ValueError(f"--hs4 must be a 4-digit heading, got {hs4!r}")

    name = clean_company_name(_text(record.get("name")) or "")
    if not name:
        return None
    if looks_like_logistics(name):
        return None

    country = record.get("country") or {}
    ports = [p for p in (_text(p) for p in record.get("unloading_ports") or []) if p]

    shipments = int(record.get("total_shipments") or 0)
    value = record.get("total_import_value") or record.get("total_export_value")
    quantity = record.get("total_import_quantity") or record.get("total_export_quantity")
    if looks_like_consolidator(shipments, value, quantity):
        return None

    return {
        "name": name,
        "hs4_code": heading,
        "country": (country.get("code") or "US").strip().upper() if isinstance(country, dict) else "US",
        # No city/state exists in an aggregated record — see the module docstring.
        "city": None,
        "state": None,
        "address": None,
        # Filer-typed text sometimes carries "contact ramesh@exporter.co.in".
        # A column allowlist does not help when the address sits inside a column
        # we do want.
        "product_description": redact_contacts(_text(record.get("products"))),
        # companies.primary_port is documented as the modal port of unlading,
        # which an aggregate cannot give us: the list arrives unranked. First
        # listed is a proxy, and is marked as such rather than passed off as
        # the real thing.
        "primary_port": ports[0] if ports else None,
        "shipment_count": shipments,
        # Carried for the pack CSV, not for the companies table.
        "_vendor_id": _text(record.get("id")),
        "_domain": _text(record.get("domain")),
        "_total_value": value,
        "_total_quantity": quantity,
        "_total_suppliers": record.get("total_suppliers"),
        "_sources_from": _country_codes(record, "export_countries"),
        "_primary_port_is_proxy": bool(ports),
    }


def merge_rows(rows: list[dict]) -> tuple[list[dict], int]:
    """
    Collapse rows that are the same company filed under different names.

    Azazie appears twice in one 7,592-row buyer list — "AZAZIE SG PTE. LTD."
    and "AZAZIE SG PTE. LTD/ AZAZIE INC." — and the vendor's own aggregation
    does not merge them. Sold as-is that is one buyer shown as two, billed at
    15 credits each. grouping_key does the matching; this does the arithmetic.

    Totals are summed, because two filings of one company are two parts of its
    trade, not two estimates of it. The longest name wins as the display name:
    the fuller filing is the one that names the whole group.
    """
    merged: dict[str, dict] = {}
    duplicates = 0

    for row in rows:
        key = grouping_key(row["name"], row["city"], row["state"], row["hs4_code"])
        if key is None:
            key = f"{row['name'].lower()}|{row['hs4_code']}"

        existing = merged.get(key)
        if existing is None:
            merged[key] = dict(row)
            continue

        duplicates += 1
        existing["shipment_count"] += row["shipment_count"]
        for field in ("_total_value", "_total_quantity"):
            if row.get(field):
                existing[field] = (existing.get(field) or 0) + row[field]
        # Origins are a set union: a buyer sourcing from Vietnam under one
        # filing and Sri Lanka under another sources from both.
        existing["_sources_from"] = sorted(
            set(existing["_sources_from"]) | set(row["_sources_from"])
        )
        for field in ("product_description", "primary_port", "_domain", "_vendor_id"):
            if not existing.get(field) and row.get(field):
                existing[field] = row[field]
        if len(row["name"]) > len(existing["name"]):
            existing["name"] = row["name"]

    return list(merged.values()), duplicates


def map_all(
    records, hs4: str, origin: str | None = None
) -> tuple[list[dict], Counter]:
    """Map a whole response, counting what was dropped and why."""
    rows: list[dict] = []
    skipped: Counter = Counter()
    for record in records:
        if not isinstance(record, dict):
            skipped["not an object"] += 1
            continue
        if origin and not sources_from(record, origin):
            skipped[f"does not source from {origin.upper()}"] += 1
            continue

        name = clean_company_name(_text(record.get("name")) or "")
        row = map_company_record(record, hs4)
        if row is None:
            if not name:
                skipped["blank or placeholder name"] += 1
            elif looks_like_logistics(name):
                skipped["freight forwarder or carrier"] += 1
            else:
                skipped["parcel consolidator (1 pc or under $50 a shipment)"] += 1
            continue
        rows.append(row)

    # Audit line, not a filter: the mapper never copies these fields, so this
    # records that the response carried them and that nothing was stored.
    personal = sum(1 for r in records if isinstance(r, dict) and detect_personal_fields(r))
    if personal:
        skipped[f"records carrying personal contact fields (dropped, not stored)"] = personal

    rows, duplicates = merge_rows(rows)
    if duplicates:
        skipped[f"merged into another filing of the same company"] = duplicates
    return rows, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("path", help="Saved JSON response from the importers endpoint")
    parser.add_argument("--hs4", required=True, help="The heading you queried, e.g. 6204")
    parser.add_argument("--origin", help="Keep only importers sourcing from this country")
    parser.add_argument("--out", help="Write the mapped rows here as JSON")
    args = parser.parse_args()

    data = json.loads(Path(args.path).read_text())
    # Reuse the envelope-agnostic record finder rather than guessing the key.
    from bold_api import _records

    records = _records(data)
    if not records:
        sys.exit(f"No records found in {args.path}. Run `bold_api.py inspect` on it.")

    rows, skipped = map_all(records, args.hs4, args.origin)
    print(f"{len(records)} record(s) in, {len(rows)} row(s) out.")
    for reason, count in skipped.most_common():
        print(f"  dropped {count:>5}  {reason}")

    if not rows:
        return 1

    missing_port = sum(1 for r in rows if not r["primary_port"])
    missing_desc = sum(1 for r in rows if not r["product_description"])
    have_domain = sum(1 for r in rows if r["_domain"])
    print(f"\n  no port        {missing_port:>5} / {len(rows)}")
    print(f"  no products    {missing_desc:>5} / {len(rows)}")
    print(f"  have a domain  {have_domain:>5} / {len(rows)}")
    print("  city/state         0 / %d  (not in an aggregated record)" % len(rows))

    print("\nTop 5 by shipment count:")
    for row in sorted(rows, key=lambda r: -r["shipment_count"])[:5]:
        origins = ",".join(row["_sources_from"][:4]) or "unknown"
        print(f"  {row['shipment_count']:>7}  {row['name'][:44]:<44} <- {origins}")

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(rows, indent=2))
        print(f"\nWrote {len(rows)} row(s) to {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
