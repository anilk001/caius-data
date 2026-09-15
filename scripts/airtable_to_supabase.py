#!/usr/bin/env python3
"""
Push reviewed importer records from Airtable into Supabase.

Why this exists
---------------
Airtable is not the production store — it cannot serve a public search page at
5 requests/second per base, it has no row-level security, and it has no unique
constraints, which is what makes Stripe webhook replays safe in Postgres.

What it is very good at is the bit Postgres is bad at: a human looking at 400
rows of manifest data and spotting that "Acme Imports" and "ACME IMPRTS" are
the same buyer, or that a description column is full of shipping-line noise.

So the lane is:

    Tendata CSV  ──ingest_csv.py --to-airtable──▶  Airtable staging table
                                                          │
                                              (you review and approve)
                                                          │
                                   ──airtable_to_supabase.py──▶  Supabase

Only rows marked Approved are pushed. Everything else is left alone, so you can
work through a backlog over several sittings.

Usage
-----
    export AIRTABLE_API_KEY=pat...
    export AIRTABLE_BASE_ID=app...
    python scripts/airtable_to_supabase.py --dry-run
    python scripts/airtable_to_supabase.py
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from company_cleaning import (  # noqa: E402
    clean_company_name,
    clean_hs4,
    clean_state,
    clean_text,
    parse_date,
)

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:
    from pyairtable import Api
except ImportError:  # pragma: no cover
    Api = None

try:
    from supabase import create_client
except ImportError:  # pragma: no cover
    create_client = None


DEFAULT_TABLE = "Importers (Staging)"
APPROVED = "Approved"
SYNCED = "Synced"

# Airtable field name -> our field name.
FIELD_MAP = {
    "Company Name": "name",
    "Street Address": "address",
    "City": "city",
    "State": "state",
    "HS4 Code": "hs4_code",
    "Product Description": "product_description",
    "Primary Port": "primary_port",
    "Shipment Count": "shipment_count",
    "First Seen": "first_seen",
    "Last Seen": "last_seen",
}


def chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def build_payload(fields: dict) -> tuple[dict | None, str | None]:
    """Convert one Airtable record into an ingest_companies payload row."""
    name = clean_company_name(fields.get("Company Name"))
    if not name:
        return None, "no usable company name"

    hs4 = clean_hs4(fields.get("HS4 Code"))
    if not hs4:
        return None, "no valid 4-digit HS code"

    first_seen = parse_date(fields.get("First Seen"))
    last_seen = parse_date(fields.get("Last Seen"))

    try:
        shipment_count = int(fields.get("Shipment Count") or 0)
    except (TypeError, ValueError):
        shipment_count = 0

    return (
        {
            "name": name,
            "address": clean_text(fields.get("Street Address"), 300),
            "city": clean_text(fields.get("City"), 120),
            "state": clean_state(fields.get("State")),
            "country": "US",
            "hs4_code": hs4,
            "product_description": clean_text(fields.get("Product Description")),
            "primary_port": clean_text(fields.get("Primary Port"), 120),
            "first_seen": first_seen.isoformat() if first_seen else None,
            "last_seen": last_seen.isoformat() if last_seen else None,
            "shipment_count": shipment_count,
        },
        None,
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Push approved Airtable importer records into Supabase."
    )
    parser.add_argument("--table", default=DEFAULT_TABLE, help="Airtable table name")
    parser.add_argument(
        "--view", help="Only sync records in this Airtable view (optional)"
    )
    parser.add_argument(
        "--status-field",
        default="Review Status",
        help="Single-select field gating the sync (default 'Review Status')",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Sync every record, not just those marked Approved",
    )
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if load_dotenv:
        for candidate in (".env.local", ".env"):
            if Path(candidate).exists():
                load_dotenv(candidate)
                break

    if Api is None:
        sys.exit("pyairtable is not installed.\n  pip install -r scripts/requirements.txt")

    api_key = os.environ.get("AIRTABLE_API_KEY")
    base_id = os.environ.get("AIRTABLE_BASE_ID")
    if not api_key or not base_id:
        sys.exit(
            "Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID.\n"
            "Create a personal access token at airtable.com/create/tokens with\n"
            "data.records:read, data.records:write and schema.bases:read."
        )

    table = Api(api_key).table(base_id, args.table)

    formula = None
    if not args.all:
        formula = f"{{{args.status_field}}} = '{APPROVED}'"

    print(f"Reading {args.table} from base {base_id}…")
    records = table.all(view=args.view, formula=formula)
    print(f"  {len(records):,} record(s) to sync\n")

    if not records:
        print("Nothing marked Approved. Mark rows in Airtable and run again.")
        return 0

    payloads: list[dict] = []
    record_ids: list[str] = []
    rejected: list[tuple[str, str]] = []

    for record in records:
        payload, reason = build_payload(record.get("fields", {}))
        if payload is None:
            rejected.append((record["id"], reason or "unknown"))
            continue
        payloads.append(payload)
        record_ids.append(record["id"])

    if rejected:
        print(f"Skipping {len(rejected)} record(s) that failed validation:")
        for record_id, reason in rejected[:10]:
            print(f"  {record_id}  {reason}")
        if len(rejected) > 10:
            print(f"  … and {len(rejected) - 10} more")
        print()

    if args.dry_run:
        print("Dry run — nothing written to Supabase or Airtable.\n")
        for payload in payloads[:10]:
            location = ", ".join(p for p in (payload["city"], payload["state"]) if p)
            print(
                f"  {payload['shipment_count']:>5}  {str(payload['name'])[:40]:<40}"
                f"  HS {payload['hs4_code']}  {location}"
            )
        if len(payloads) > 10:
            print(f"  … and {len(payloads) - 10} more")
        return 0

    if not payloads:
        print("No valid records to push.")
        return 0

    if create_client is None:
        sys.exit("supabase is not installed.\n  pip install -r scripts/requirements.txt")

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")

    client = create_client(url, key)

    pushed = 0
    for batch in chunked(payloads, args.batch_size):
        client.rpc("ingest_companies", {"payload": batch}).execute()
        pushed += len(batch)
        print(f"  pushed {pushed:,}/{len(payloads):,}")

    # Mark the Airtable rows so a second run does not re-add their shipment
    # counts. ingest_companies SUMS counts on conflict, so this matters.
    print(f"\nMarking {len(record_ids):,} record(s) as {SYNCED} in Airtable…")
    updates = [
        {"id": record_id, "fields": {args.status_field: SYNCED}}
        for record_id in record_ids
    ]
    for batch in chunked(updates, 10):
        table.batch_update(batch)

    print(f"\nDone. {pushed:,} companies pushed to Supabase.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
