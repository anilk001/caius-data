#!/usr/bin/env python3
"""
Turn a saved billofladingdata shipping-records response into a CSV that
ingest_csv.py can load.

    python3 scripts/bold_api.py records --hs 6204 \
        --import-country US --export-country IN \
        --max-records 1000 --out data/6204-in.json

    python3 scripts/bold_shipments.py data/6204-in.json --out data/6204-in.csv
    python3 scripts/ingest_csv.py data/6204-in.csv --hs4 6204

Why a converter rather than a second ingest
-------------------------------------------
ingest_csv.py already does the hard parts — name cleaning, HS4 classification
from goods descriptions, address parsing, weight-unit conversion, company
aggregation, and row fingerprinting so a re-run inserts nothing twice. All of
that is tested. Writing a parallel JSON ingest would mean a second copy of it,
and the second copy is the one that quietly drifts. So this maps their fields
onto the column names ingest_csv already recognises and stops there.

Two response shapes
-------------------
The global API and the country-specific USA API return different field sets for
the same thing — `start_port` against `start_port_name`, `bydate` against
`estimated_arrival_date` — and only the USA one carries `consignee_address`,
which is where city and state come from. Both are read, so a pack can be built
from either without the caller having to know which they bought.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from company_cleaning import clean_country, country_from_name
from personal_data import detect_personal_fields, redact_contacts

# Output column -> the response fields to try, in order. First non-empty wins.
FIELD_MAP: dict[str, tuple[str, ...]] = {
    "Consignee Name": ("consignee_name",),
    # USA API only. Without it there is no city or state, and the search
    # dashboard's state filter finds nothing — see STATUS.md.
    "Consignee Address": ("consignee_address",),
    "Consignee Country": ("country_imp_en", "country_imp"),
    "HS Code": ("hs_code",),
    "Product Description": ("products", "hs_code_desc"),
    "Shipper Name": ("shipper_name",),
    "Shipper Country": ("country_exp_en", "or_country", "country_exp"),
    "Port of Lading": ("start_port_name", "start_port"),
    "Port of Unlading": ("end_port_name", "end_port"),
    "Weight": ("weight",),
    "Weight Unit": ("weight_unit",),
    "Arrival Date": ("estimated_arrival_date", "bydate"),
    "Carrier": ("carrier_name", "carrier_code"),
    # Value and quantity are what tell a wholesale buyer from a parcel
    # consolidator: Stelcore's 51,968 shipments average $5 and one piece each.
    # They are also the only thing separating two genuinely different shipments
    # on a record that carries no bill of lading.
    "Value": ("amount",),
    "Quantity": ("manifest_qty",),
    "Quantity Unit": ("manifest_units",),
    # Not a column ingest_csv reads. It rides along so each row fingerprints
    # distinctly: two identical shipments on one day are two shipments, and
    # without a bill of lading number they would hash alike and one would be
    # dropped as a duplicate on re-run. It is 56% filled on a real pull, which
    # is why dedupe cannot rely on it alone — see fold_key.
    "Bill of Lading": ("bill_of_lading_nbr",),
}

COLUMNS = list(FIELD_MAP)

ABSENT = {"", "-", "--", "n/a", "null", "none"}

# The vendor flags logistics companies themselves, on every record, at no extra
# cost. It is a second opinion independent of the name, which is the only thing
# company_cleaning.looks_like_logistics has to go on — so a forwarder with a
# name that gives nothing away ("Intoglo Technologies Inc") can still be caught.
SHIPPING_FLAG = "is_shipping"


def flagged_as_shipping(record: dict) -> bool:
    raw = record.get(SHIPPING_FLAG)
    if raw is None:
        return False
    text = str(raw).strip().lower()
    return text in {"1", "true", "yes", "y"}


# `country_imp` says US on records whose goods are unladen in Canada: the feed
# is US-facing, not a statement about where the buyer sits. A pack sold as "US
# importers" that contains Gap (Canada) Inc is wrong in the way a customer
# notices first, so the port decides the country and the caller can filter.
#
# Only unambiguous port names are listed. "Richmond", "Windsor" and "Delta"
# are all US cities too, and guessing wrong on those would relabel real US
# buyers as foreign.
NON_US_PORTS = {
    "BRAMPTON": "CA", "TORONTO": "CA", "MISSISSAUGA": "CA", "MONTREAL": "CA",
    "MONTREAL QC": "CA", "VANCOUVER BC": "CA", "PRINCE RUPERT": "CA",
    "HALIFAX": "CA", "CALGARY": "CA", "EDMONTON": "CA", "WINNIPEG": "CA",
    "SAINT JOHN NB": "CA", "QUEBEC": "CA", "OTTAWA": "CA",
    "MANZANILLO": "MX", "VERACRUZ": "MX", "LAZARO CARDENAS": "MX",
    "ALTAMIRA": "MX", "MONTERREY": "MX", "GUADALAJARA": "MX",
}


def destination_country(port: str) -> str | None:
    """The country a port of unlading sits in, when the name settles it."""
    if not port:
        return None
    key = "".join(ch for ch in port.upper() if ch.isalnum() or ch == " ")
    return NON_US_PORTS.get(" ".join(key.split()))


def _value(record: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        raw = record.get(key)
        if raw is None:
            continue
        text = str(raw).strip()
        if text and text.lower() not in ABSENT:
            return text
    return ""


def collapse_repeats(text: str) -> str:
    """
    Fold a goods description that repeats itself.

    A consignment of eleven identical cartons arrives with its line item
    concatenated eleven times, unseparated:

        "WOMENS LINEN WOVEN SKIRT HTS: 62044290WOMENS LINEN WOVEN SKIRT HTS: …"

    Sold as-is it reads like a broken file. The repetition carries no
    information — the carton count is already its own field — so one copy is
    kept. Only exact tiling is folded: two genuinely different line items on
    one bill are two things the buyer shipped, and both belong in the cell.
    """
    if not text:
        return text

    length = len(text)
    # The shortest unit that tiles the whole string wins, so eleven copies fold
    # to one rather than to a smaller number of copies.
    for size in range(1, length // 2 + 1):
        if length % size:
            continue
        unit = text[:size]
        if unit * (length // size) == text:
            return unit

    return text


def iso_date(raw: str) -> str:
    """
    Normalise a date to YYYY-MM-DD.

    `bydate` arrives as the integer 20260129 and the USA API's
    `estimated_arrival_date` as a string. Both are handed on in one shape so a
    reader of the CSV is not left guessing which they got.
    """
    if not raw:
        return ""
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) == 8:
        return f"{digits[:4]}-{digits[4:6]}-{digits[6:]}"
    return raw


def to_row(record: dict) -> dict[str, str] | None:
    """Map one response record, or None when there is no buyer to sell."""
    row = {column: _value(record, keys) for column, keys in FIELD_MAP.items()}

    if not row["Consignee Name"]:
        return None

    # The name first: a foreign arm can still land its goods in a US port.
    # "AMERICAN EAGLE OUTFITTERS CANADA" arrived unlading in New York.
    elsewhere = (
        country_from_name(row["Consignee Name"])
        or destination_country(row["Port of Unlading"])
    )
    # Normalised either way, so the CSV holds ISO codes and the report below
    # does not have to know every spelling of "United States".
    row["Consignee Country"] = (
        elsewhere or clean_country(row["Consignee Country"]) or ""
    )

    row["Arrival Date"] = iso_date(row["Arrival Date"])
    # Filer-typed goods text sometimes carries a contact. A column allowlist
    # cannot help when the address is inside a column we want.
    row["Product Description"] = (
        redact_contacts(collapse_repeats(row["Product Description"])) or ""
    )
    return row


def fold_key(row: dict[str, str]) -> tuple[str, ...]:
    """
    What makes two rows the same shipment rather than two shipments.

    Measured on a real pull of 250 records, and the two cases want opposite
    rules:

    * **With a bill of lading.** 22 of 84 bills appear more than once under
      different vendor record ids, and every repeat carries the identical
      product and HS code. That is one shipment reaching us through two merged
      sources, so the bill decides and the rest of the row is ignored.

    * **Without one** — 141 of the 250 records. These differ only in value and
      quantity: $172.09 for 4 cartons against $516.27 for 12, on the same day,
      to the same buyer, of the same goods. Two shipments. Folding on
      everything-but-those made 54 of them disappear; folding on the whole row,
      value and quantity included, leaves 139 of 141 standing.

    Shipment count is what a pack is sold on, so both errors cost money: one
    inflates the count, the other quietly deletes a quarter of it.
    """
    bill = row.get("Bill of Lading", "")
    if bill:
        return ("bl", row.get("Consignee Name", ""), bill)
    return ("row", *(row[column] for column in COLUMNS))


def convert(records, keep_type: str | None = None) -> tuple[list[dict], Counter]:
    rows: list[dict] = []
    skipped: Counter = Counter()
    # See fold_key. ingest_csv fingerprints rows against what is already in the
    # database, so a re-run inserts nothing twice — but two copies of one
    # shipment inside a single file are both new to it, and the company's
    # shipment count is what we sell.
    seen: set[tuple[str, ...]] = set()

    for record in records:
        if not isinstance(record, dict):
            skipped["not an object"] += 1
            continue
        if keep_type and str(record.get("type", "")).lower() != keep_type:
            skipped[f"not type={keep_type}"] += 1
            continue

        if flagged_as_shipping(record):
            skipped["vendor flagged the consignee as a shipping company"] += 1
            continue

        row = to_row(record)
        if row is None:
            skipped["no consignee name"] += 1
            continue

        fingerprint = fold_key(row)
        if fingerprint in seen:
            skipped["the same shipment, filed twice"] += 1
            continue
        seen.add(fingerprint)

        rows.append(row)

    personal = sum(1 for r in records if isinstance(r, dict) and detect_personal_fields(r))
    if personal:
        skipped["carried personal contact fields (not written)"] = personal

    return rows, skipped


def report(rows: list[dict]) -> None:
    """
    Fill rates, before anyone spends credits on more of the same.

    A column that is 2% populated is not a column a product can be built on,
    and the only way to know is to look at what actually arrived.
    """
    if not rows:
        return
    print(f"\n{'column':<22}{'filled':>8}{'%':>7}")
    print("-" * 37)
    for column in COLUMNS:
        filled = sum(1 for r in rows if r[column])
        pct = 100 * filled / len(rows)
        flag = "  <- sparse" if pct < 60 else ""
        print(f"{column:<22}{filled:>8}{pct:>6.0f}%{flag}")

    buyers = {r["Consignee Name"].strip().lower() for r in rows}
    print(f"\n{len(rows)} shipment rows, {len(buyers)} distinct consignee names")
    print("(the real company count comes after ingest_csv merges name variants)")

    foreign = Counter(
        r["Consignee Country"] for r in rows
        if r["Consignee Country"] and r["Consignee Country"] != "US"
    )
    if foreign:
        total = sum(foreign.values())
        detail = ", ".join(f"{c} {n}" for c, n in foreign.most_common())
        print(f"\n{total} row(s) unladen outside the US ({detail}).")
        print("These are not US importers. Decide before they go in a US pack.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    parser.add_argument("path", help="Saved JSON from bold_api.py records")
    parser.add_argument("--out", required=True, help="CSV to write")
    parser.add_argument(
        "--type",
        choices=["imp", "exp"],
        help="Keep only this trade direction (default: keep everything)",
    )
    args = parser.parse_args()

    data = json.loads(Path(args.path).read_text())
    from bold_api import _records

    records = _records(data) if isinstance(data, dict) else data
    if not isinstance(records, list) or not records:
        sys.exit(f"No records found in {args.path}. Try `bold_api.py inspect` on it.")

    rows, skipped = convert(records, args.type)
    print(f"{len(records)} record(s) in, {len(rows)} row(s) out.")
    for reason, count in skipped.most_common():
        print(f"  dropped {count:>6}  {reason}")

    if not rows:
        return 1

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    report(rows)
    print(f"\nWrote {out}")
    print(f"Next: python3 scripts/ingest_csv.py {out} --hs4 <heading> --dry-run")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
