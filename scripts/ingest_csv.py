#!/usr/bin/env python3
"""
Ingest a US importer manifest export into Supabase.

Reads a CSV of shipment-level manifest rows, cleans them, rolls them up into
company-level records, and writes both layers to Postgres.

    python scripts/ingest_csv.py data/tendata_6204.csv --hs4 6204
    python scripts/ingest_csv.py data/export.csv --dry-run --limit 500
    python scripts/ingest_csv.py data/export.csv --map "consignee=Buyer Name"

Column mapping
--------------
Every provider names its columns differently. The script auto-detects the
common spellings (see COLUMN_ALIASES) and prints what it matched before it
writes anything. Override with --map for anything it misses.

Idempotency
-----------
Each source row is fingerprinted, so re-running the same file inserts no
duplicate shipments. Company aggregates, however, are *summed* server-side —
re-running a file you have already ingested would double the shipment counts.
The script guards against this by checking fingerprints first and skipping
company aggregation for rows it has already seen. Use --force to override.
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from address_parser import parse_us_address  # noqa: E402
from hs4_classifier import MIN_CONFIDENCE, classify_hs4  # noqa: E402
from company_cleaning import (  # noqa: E402
    looks_like_logistics,
    clean_company_name,
    clean_country,
    clean_hs4,
    clean_state,
    clean_text,
    grouping_key,
    parse_date,
    parse_weight_kg,
    row_hash,
)

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None

try:
    from supabase import Client, create_client
except ImportError:  # pragma: no cover
    create_client = None
    Client = object  # type: ignore[assignment,misc]


# --------------------------------------------------------------------------
# Column detection
# --------------------------------------------------------------------------

# Ordered by preference: the first alias present in the file wins.
COLUMN_ALIASES: dict[str, tuple[str, ...]] = {
    "company_name": (
        "consignee name", "consignee", "importer name", "importer",
        "buyer name", "buyer", "us importer", "consignee_name",
        "notify party name", "company name", "company",
    ),
    "address": (
        "consignee address", "importer address", "buyer address",
        "address", "consignee_address", "street address",
    ),
    "city": ("consignee city", "importer city", "city", "buyer city"),
    "state": ("consignee state", "importer state", "state", "buyer state", "province"),
    # Deliberately narrow, and excluded from the substring fallback below. A
    # bare "Country" column in a manifest export is nearly always the SHIPPER's
    # country, and matching it here would stamp every US importer as "India".
    "country": ("consignee country", "importer country", "buyer country"),
    "hs_code": (
        "hs code", "hs", "hts code", "hts", "hs4", "harmonized code",
        "commodity code", "tariff code", "hscode",
    ),
    "product_description": (
        "product description", "goods description", "description",
        "commodity description", "product", "goods", "cargo description",
    ),
    "shipper_name": (
        "shipper name", "shipper", "supplier name", "supplier",
        "exporter name", "exporter", "seller",
    ),
    "shipper_country": (
        "shipper country", "supplier country", "exporter country",
        "country of origin", "origin country",
    ),
    "port_of_lading": (
        "port of lading", "port of loading", "loading port",
        "origin port", "departure port", "pol",
    ),
    "port_of_unlading": (
        "port of unlading", "port of unloading", "port of discharge",
        "us port", "arrival port", "destination port", "discharge port", "pod",
    ),
    "weight_kg": (
        "weight kg", "gross weight kg", "weight (kg)", "gross weight",
        "weight", "kgs", "kg",
    ),
    # Manifests mix pounds and kilograms row by row, so the unit column is read
    # rather than assumed — see parse_weight_kg.
    "weight_unit": ("weight unit", "weight_unit", "weight uom", "uom", "unit"),
    "arrival_date": (
        "arrival date", "date of arrival", "arrival", "eta",
        "shipment date", "date", "bl date", "bill of lading date",
    ),
    "carrier": ("carrier", "carrier name", "vessel carrier", "shipping line", "scac"),
}


# Fields where a substring match causes more harm than a missing value.
_NO_FUZZY_MATCH = frozenset({"country", "state", "city"})


def normalize_header(header: str) -> str:
    return " ".join(header.strip().lower().replace("_", " ").split())


def detect_columns(
    headers: list[str], overrides: dict[str, str]
) -> dict[str, str | None]:
    """Map our field names to the file's actual column headers."""
    lookup = {normalize_header(h): h for h in headers}
    mapping: dict[str, str | None] = {}

    for field_name, aliases in COLUMN_ALIASES.items():
        if field_name in overrides:
            mapping[field_name] = overrides[field_name]
            continue

        matched = None
        for alias in aliases:
            if alias in lookup:
                matched = lookup[alias]
                break

        # Fall back to a substring match — "Consignee Name (Cleaned)" etc.
        # Skipped for ambiguous fields where a loose match does real damage.
        if matched is None and field_name not in _NO_FUZZY_MATCH:
            for alias in aliases:
                for norm, original in lookup.items():
                    if alias in norm:
                        matched = original
                        break
                if matched:
                    break

        mapping[field_name] = matched

    return mapping


# --------------------------------------------------------------------------
# Aggregation
# --------------------------------------------------------------------------


@dataclass
class CompanyAggregate:
    name: str
    hs4: str
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str = "US"
    descriptions: Counter = field(default_factory=Counter)
    ports: Counter = field(default_factory=Counter)
    hs4_source: str = "derived"
    hs4_confidence: float | None = None
    first_seen: date | None = None
    last_seen: date | None = None
    shipment_count: int = 0

    def observe(
        self,
        address: str | None,
        city: str | None,
        state: str | None,
        country: str | None,
        description: str | None,
        port: str | None,
        arrival: date | None,
    ) -> None:
        self.shipment_count += 1

        # Keep the longest address seen — manifest rows truncate inconsistently.
        if address and (not self.address or len(address) > len(self.address)):
            self.address = address
        if city and not self.city:
            self.city = city
        if state and not self.state:
            self.state = state
        if country:
            self.country = country
        if description:
            self.descriptions[description] += 1
        if port:
            self.ports[port] += 1

        if arrival:
            if not self.first_seen or arrival < self.first_seen:
                self.first_seen = arrival
            if not self.last_seen or arrival > self.last_seen:
                self.last_seen = arrival

    def to_payload(self) -> dict[str, object]:
        return {
            "name": self.name,
            "address": self.address,
            "city": self.city,
            "state": self.state,
            "country": self.country,
            "hs4_code": self.hs4,
            # Most frequently filed description, not the first — the modal value
            # is what this buyer actually imports.
            "product_description": (
                self.descriptions.most_common(1)[0][0] if self.descriptions else None
            ),
            "primary_port": self.ports.most_common(1)[0][0] if self.ports else None,
            "first_seen": self.first_seen.isoformat() if self.first_seen else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "shipment_count": self.shipment_count,
            "hs4_source": self.hs4_source,
            "hs4_confidence": self.hs4_confidence,
        }


@dataclass
class Stats:
    read: int = 0
    skipped_no_name: int = 0
    skipped_no_hs4: int = 0
    skipped_duplicate: int = 0
    hs4_derived: int = 0
    hs4_underivable: int = 0
    address_parsed: int = 0
    address_unparseable: int = 0
    skipped_logistics: int = 0
    companies: int = 0
    shipments_written: int = 0

    def report(self) -> str:
        return (
            f"  rows read            {self.read:>8,}\n"
            f"  skipped (no name)    {self.skipped_no_name:>8,}\n"
            f"  skipped (no HS4)     {self.skipped_no_hs4:>8,}\n"
            f"  skipped (duplicate)  {self.skipped_duplicate:>8,}\n"
            f"  HS4 derived          {self.hs4_derived:>8,}\n"
            f"  HS4 underivable      {self.hs4_underivable:>8,}\n"
            f"  address parsed       {self.address_parsed:>8,}\n"
            f"  address unparseable  {self.address_unparseable:>8,}\n"
            f"  skipped (forwarder)  {self.skipped_logistics:>8,}\n"
            f"  companies upserted   {self.companies:>8,}\n"
            f"  shipments written    {self.shipments_written:>8,}"
        )


# --------------------------------------------------------------------------
# Supabase plumbing
# --------------------------------------------------------------------------


def get_client() -> Client:
    if create_client is None:
        sys.exit(
            "The `supabase` package is not installed.\n"
            "  pip install -r scripts/requirements.txt"
        )

    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not url or not key:
        sys.exit(
            "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n"
            "Copy .env.example to .env.local and fill them in."
        )

    return create_client(url, key)


def chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i : i + size]


def existing_hashes(client: Client, hashes: list[str]) -> set[str]:
    """Which of these source rows are already in the database?"""
    found: set[str] = set()
    for batch in chunked(hashes, 500):
        response = (
            client.table("shipments")
            .select("source_row_hash")
            .in_("source_row_hash", batch)
            .execute()
        )
        for row in response.data or []:
            if row.get("source_row_hash"):
                found.add(row["source_row_hash"])
    return found


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ingest a US importer manifest CSV into Supabase.",
    )
    parser.add_argument("csv_path", type=Path, help="Path to the manifest CSV export")
    parser.add_argument(
        "--hs4",
        help="Force this HS4 code for every row (use when the export has no HS column)",
    )
    parser.add_argument(
        "--keep-logistics",
        action="store_true",
        help=(
            "Keep consignees that look like carriers, forwarders or customs "
            "brokers. They are dropped by default: they appear in the consignee "
            "field but are not the company that bought the goods."
        ),
    )
    parser.add_argument(
        "--no-derive-hs4",
        action="store_true",
        help=(
            "Do not infer HS4 from the goods description. The public CBP manifest "
            "feed carries no tariff classification (19 CFR 103.31(e)(3)), so most "
            "rows are skipped without derivation."
        ),
    )
    parser.add_argument(
        "--min-hs4-confidence",
        type=float,
        default=None,
        metavar="0.0-1.0",
        help="Override the classifier's confidence floor for accepting a derived code",
    )
    parser.add_argument(
        "--map",
        action="append",
        default=[],
        metavar="FIELD=COLUMN",
        help="Override column detection, e.g. --map company_name='Buyer Name'",
    )
    parser.add_argument("--limit", type=int, help="Only read this many rows")
    parser.add_argument(
        "--batch-size", type=int, default=500, help="Rows per RPC call (default 500)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and summarise without writing to Supabase",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Ingest rows even if their fingerprint is already in the database",
    )
    parser.add_argument(
        "--encoding", default="utf-8-sig", help="CSV encoding (default utf-8-sig)"
    )
    parser.add_argument(
        "--to-airtable",
        action="store_true",
        help=(
            "Load the aggregated companies into the Airtable staging table for "
            "visual review instead of writing straight to Supabase. Approve rows "
            "there, then run scripts/airtable_to_supabase.py."
        ),
    )
    parser.add_argument(
        "--airtable-table",
        default="Importers (Staging)",
        help="Airtable table name used by --to-airtable",
    )
    args = parser.parse_args()

    if load_dotenv:
        for candidate in (".env.local", ".env"):
            if Path(candidate).exists():
                load_dotenv(candidate)
                break

    if not args.csv_path.exists():
        sys.exit(f"No such file: {args.csv_path}")

    overrides: dict[str, str] = {}
    for item in args.map:
        if "=" not in item:
            sys.exit(f"--map expects FIELD=COLUMN, got: {item}")
        key, value = item.split("=", 1)
        overrides[key.strip()] = value.strip()

    forced_hs4 = clean_hs4(args.hs4) if args.hs4 else None
    if args.hs4 and not forced_hs4:
        sys.exit(f"--hs4 must be at least 4 digits, got: {args.hs4}")

    # --- Read and clean ----------------------------------------------------
    stats = Stats()
    aggregates: dict[str, CompanyAggregate] = {}
    shipments: list[dict[str, object]] = []
    # Which company key each shipment belongs to, resolved to an id after upsert.
    shipment_keys: list[str] = []

    with args.csv_path.open("r", encoding=args.encoding, newline="") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            sys.exit("CSV has no header row.")

        columns = detect_columns(list(reader.fieldnames), overrides)

        print(f"\nReading {args.csv_path}")
        print("Column mapping:")
        for field_name, column in columns.items():
            marker = "  " if column else " !"
            print(f"{marker} {field_name:<22} {column or '(not found)'}")

        missing_critical = [
            f for f in ("company_name",) if not columns.get(f)
        ]
        if missing_critical:
            sys.exit(
                f"\nCannot continue: no column found for {', '.join(missing_critical)}.\n"
                f"Use --map to point at the right one, e.g.\n"
                f"  --map company_name='Consignee'"
            )
        if not columns.get("hs_code") and not forced_hs4:
            if args.no_derive_hs4:
                sys.exit(
                    "\nCannot continue: no HS code column, no --hs4, and derivation "
                    "disabled with --no-derive-hs4."
                )
            if not columns.get("product_description"):
                sys.exit(
                    "\nCannot continue: no HS code column and no goods description "
                    "to derive one from. Use --map product_description='<column>'."
                )
            print(
                "\n  note: no HS code column. The public CBP manifest feed carries no\n"
                "        tariff classification (19 CFR 103.31(e)(3)), so HS4 will be\n"
                "        DERIVED from the goods description and labelled as such.\n"
                "        Rows the classifier is unsure about are skipped, not guessed."
            )

        def cell(row: dict[str, str], field_name: str) -> str | None:
            column = columns.get(field_name)
            return row.get(column) if column else None

        print()
        for row in reader:
            if args.limit and stats.read >= args.limit:
                break
            stats.read += 1

            name = clean_company_name(cell(row, "company_name"))
            if not name:
                stats.skipped_no_name += 1
                continue

            # Carriers and forwarders turn up in the consignee field. Selling a
            # shipping line to an exporter as "a US buyer of your product" is
            # spotted on the first row and refunded on the second.
            if looks_like_logistics(name):
                stats.skipped_logistics += 1
                if not args.keep_logistics:
                    continue

            description = clean_text(cell(row, "product_description"))

            # Priority: an explicit --hs4, then a code the export actually
            # carries, then inference from the goods description.
            hs4 = forced_hs4 or clean_hs4(cell(row, "hs_code"))
            hs4_source = "declared" if hs4 else None
            hs4_confidence = None

            if not hs4 and not args.no_derive_hs4:
                verdict = classify_hs4(description)
                threshold = (
                    args.min_hs4_confidence
                    if args.min_hs4_confidence is not None
                    else MIN_CONFIDENCE
                )
                if verdict.hs4 and verdict.confidence >= threshold:
                    hs4 = verdict.hs4
                    hs4_source = verdict.source
                    hs4_confidence = verdict.confidence
                    stats.hs4_derived += 1
                else:
                    stats.hs4_underivable += 1

            if not hs4:
                stats.skipped_no_hs4 += 1
                continue

            city = clean_text(cell(row, "city"), 120)
            state = clean_state(cell(row, "state"))
            address = clean_text(cell(row, "address"), 300)

            # The public manifest feed has one address field and no separate
            # city/state (19 CFR 103.31(e)(3)). Without them every row becomes
            # its own company, because city and state are part of the grouping
            # key — so parse them out when the export does not supply them.
            if address and (not city or not state):
                parsed = parse_us_address(address)
                city = city or parsed.city
                state = state or parsed.state
                if parsed.is_usable:
                    stats.address_parsed += 1
                elif not city and not state:
                    stats.address_unparseable += 1
            # Tier 1 is a US importer dataset; absent an explicit importer
            # country column, US is the correct default. Normalised to an ISO
            # code on the way in, because packs are filtered on this column and
            # an unrecognised spelling of "United States" would drop real
            # buyers out of every pack without saying so.
            country = clean_country(cell(row, "country")) or "US"
            port_unlading = clean_text(cell(row, "port_of_unlading"), 120)
            arrival = parse_date(cell(row, "arrival_date"))

            key = grouping_key(name, city, state, hs4)
            if not key:
                stats.skipped_no_name += 1
                continue

            aggregate = aggregates.get(key)
            if aggregate is None:
                aggregate = CompanyAggregate(
                    name=name,
                    hs4=hs4,
                    city=city,
                    state=state,
                    country=country,
                    hs4_source=hs4_source or "derived",
                    hs4_confidence=hs4_confidence,
                )
                aggregates[key] = aggregate

            aggregate.observe(
                address, city, state, country, description, port_unlading, arrival
            )

            shipments.append(
                {
                    "shipper_name": clean_text(cell(row, "shipper_name"), 200),
                    "shipper_country": clean_text(cell(row, "shipper_country"), 60),
                    "hs4_code": hs4,
                    "product_description": description,
                    "port_of_lading": clean_text(cell(row, "port_of_lading"), 120),
                    "port_of_unlading": port_unlading,
                    "weight_kg": parse_weight_kg(
                        cell(row, "weight_kg"), cell(row, "weight_unit")
                    ),
                    "arrival_date": arrival.isoformat() if arrival else None,
                    "carrier": clean_text(cell(row, "carrier"), 120),
                    "raw_source": args.csv_path.name,
                    "source_row_hash": row_hash(
                        {k: v for k, v in row.items() if v not in (None, "")}
                    ),
                }
            )
            shipment_keys.append(key)

    stats.companies = len(aggregates)

    if args.dry_run:
        print("Dry run — nothing written.\n")
        print(stats.report())
        _preview(aggregates)
        return 0

    if not aggregates:
        print("Nothing to ingest.")
        print(stats.report())
        return 0

    if args.to_airtable:
        pushed = push_to_airtable(aggregates, args.airtable_table, args.csv_path.name)
        print(f"\nLoaded {pushed:,} companies into Airtable for review.")
        print(stats.report())
        _preview(aggregates)
        return 0

    client = get_client()

    # --- Skip rows already ingested ---------------------------------------
    if not args.force:
        hashes = [str(s["source_row_hash"]) for s in shipments]
        seen = existing_hashes(client, hashes)
        if seen:
            keep_ship: list[dict[str, object]] = []
            keep_keys: list[str] = []
            removed_by_key: Counter = Counter()

            for shipment, key in zip(shipments, shipment_keys):
                if str(shipment["source_row_hash"]) in seen:
                    stats.skipped_duplicate += 1
                    removed_by_key[key] += 1
                else:
                    keep_ship.append(shipment)
                    keep_keys.append(key)

            shipments, shipment_keys = keep_ship, keep_keys

            # Roll the aggregates back by the rows we are not re-ingesting, so
            # shipment_count does not double on a partial re-run.
            for key, count in removed_by_key.items():
                aggregate = aggregates[key]
                aggregate.shipment_count -= count
                if aggregate.shipment_count <= 0:
                    del aggregates[key]

            print(
                f"Skipping {stats.skipped_duplicate:,} rows already ingested "
                f"(use --force to override).\n"
            )

    if not aggregates:
        print("Every row in this file is already ingested. Nothing to do.")
        print(stats.report())
        return 0

    stats.companies = len(aggregates)

    # --- Upsert companies --------------------------------------------------
    print(f"Upserting {len(aggregates):,} companies…")
    key_to_id: dict[str, str] = {}
    payloads = [(key, agg.to_payload()) for key, agg in aggregates.items()]

    for batch in chunked(payloads, args.batch_size):
        response = client.rpc(
            "ingest_companies", {"payload": [payload for _, payload in batch]}
        ).execute()

        # The RPC returns the DB's own company_key, which differs from our
        # grouping key (ours also strips legal suffixes). Match on the payload
        # fields instead, rebuilding the DB key from what we sent.
        returned = {row["company_key"]: row["id"] for row in (response.data or [])}
        for our_key, payload in batch:
            db_key = "|".join(
                (
                    str(payload["name"]).strip().lower(),
                    (payload["city"] or "").strip().lower(),  # type: ignore[union-attr]
                    (payload["state"] or "").strip().lower(),  # type: ignore[union-attr]
                    str(payload["hs4_code"]).strip(),
                )
            )
            company_id = returned.get(db_key)
            if company_id:
                key_to_id[our_key] = company_id

    missing = len(aggregates) - len(key_to_id)
    if missing:
        print(f"  warning: {missing:,} companies did not come back with an id")

    # --- Insert shipments --------------------------------------------------
    resolved = []
    for shipment, key in zip(shipments, shipment_keys):
        company_id = key_to_id.get(key)
        if not company_id:
            continue
        resolved.append({**shipment, "company_id": company_id})

    print(f"Writing {len(resolved):,} shipments…")
    for batch in chunked(resolved, args.batch_size):
        response = client.rpc("ingest_shipments", {"payload": batch}).execute()
        written = response.data if isinstance(response.data, int) else len(batch)
        stats.shipments_written += written or 0

    print("\nDone.")
    print(stats.report())
    _preview(aggregates)
    return 0


def push_to_airtable(
    aggregates: dict[str, CompanyAggregate], table_name: str, source_file: str
) -> int:
    """
    Load aggregated companies into the Airtable staging table.

    Airtable is the review surface, not the store: you eyeball these rows, fix
    the names the manifest mangled, mark them Approved, and
    scripts/airtable_to_supabase.py moves them into Postgres.
    """
    try:
        from pyairtable import Api
    except ImportError:
        sys.exit(
            "pyairtable is not installed.\n  pip install -r scripts/requirements.txt"
        )

    api_key = os.environ.get("AIRTABLE_API_KEY")
    base_id = os.environ.get("AIRTABLE_BASE_ID")
    if not api_key or not base_id:
        sys.exit("Missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID.")

    table = Api(api_key).table(base_id, table_name)

    records = []
    for aggregate in aggregates.values():
        payload = aggregate.to_payload()
        records.append(
            {
                "Company Name": payload["name"],
                "Street Address": payload["address"],
                "City": payload["city"],
                "State": payload["state"],
                "HS4 Code": payload["hs4_code"],
                "Product Description": payload["product_description"],
                "Primary Port": payload["primary_port"],
                "Shipment Count": payload["shipment_count"],
                "First Seen": payload["first_seen"],
                "Last Seen": payload["last_seen"],
                "Review Status": "Needs review",
                "Source File": source_file,
            }
        )

    # Airtable caps batch creates at 10 records.
    written = 0
    for batch in chunked(records, 10):
        table.batch_create([{k: v for k, v in r.items() if v is not None} for r in batch])
        written += len(batch)
        if written % 100 == 0:
            print(f"  loaded {written:,}/{len(records):,}")

    return written


def _preview(aggregates: dict[str, CompanyAggregate], top: int = 10) -> None:
    if not aggregates:
        return
    ranked = sorted(
        aggregates.values(), key=lambda a: a.shipment_count, reverse=True
    )[:top]
    print(f"\nTop {len(ranked)} importers by volume:")
    for agg in ranked:
        location = ", ".join(p for p in (agg.city, agg.state) if p) or "—"
        print(f"  {agg.shipment_count:>6,}  {agg.name[:44]:<44}  {location}")
    print()


if __name__ == "__main__":
    raise SystemExit(main())
