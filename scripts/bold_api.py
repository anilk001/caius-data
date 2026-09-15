#!/usr/bin/env python3
"""
Client for the billofladingdata.com partner API.

Written to be run from YOUR machine, not from Claude's sandbox — that sandbox's
network policy blocks tradedata.billofladingdata.com outright, so every call has
to originate somewhere with real egress.

    export BOLD_API_KEY=...

    # Free: what filters exist for imports?
    python scripts/bold_api.py filters --type imp --hs 6204

    # Any endpoint, body from the command line, response saved to disk
    python scripts/bold_api.py call shipment-records \\
        --body '{"type":"imp","hs_codes":["6204"],"limit":500}' \\
        --out data/6204.json

    # Summarise what came back, before spending more credits
    python scripts/bold_api.py inspect data/6204.json

Credits are only consumed when records are returned, so `filters` is free and
`inspect` is local. Nothing here writes to Supabase — feed the saved JSON to
ingest_csv.py once the field mapping is settled.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

BASE_URL = "https://tradedata.billofladingdata.com/partner-api"
TIMEOUT = 120


def _key() -> str:
    key = os.environ.get("BOLD_API_KEY")
    if not key:
        sys.exit(
            "Set BOLD_API_KEY first:\n"
            "  export BOLD_API_KEY=your-key-here"
        )
    return key


def post(endpoint: str, body: dict, *, retries: int = 3) -> dict:
    """
    POST to one endpoint and return the decoded response.

    Their terms throttle burst traffic, so a 429 backs off rather than
    hammering — being rate-limited into a block would cost more than waiting.
    """
    url = f"{BASE_URL}/{endpoint.lstrip('/')}"
    payload = json.dumps(body).encode("utf-8")

    for attempt in range(1, retries + 1):
        request = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "api-key": _key(),
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            detail = err.read().decode("utf-8", "ignore")[:400]
            if err.code == 429 and attempt < retries:
                wait = 2 ** attempt * 5
                print(f"  rate limited, waiting {wait}s…", file=sys.stderr)
                time.sleep(wait)
                continue
            if err.code in (401, 403):
                sys.exit(f"Auth failed ({err.code}). Check BOLD_API_KEY.\n{detail}")
            sys.exit(f"HTTP {err.code} from {endpoint}:\n{detail}")
        except urllib.error.URLError as err:
            if attempt < retries:
                time.sleep(2 ** attempt)
                continue
            sys.exit(f"Could not reach {url}: {err.reason}")

    sys.exit("Exhausted retries.")


def cmd_filters(args: argparse.Namespace) -> None:
    body: dict = {"type": args.type}
    if args.hs:
        body["hs_codes"] = args.hs
    if args.product:
        body["products"] = args.product
    if args.company:
        body["company_id"] = args.company

    print(f"POST search-filters  {json.dumps(body)}\n")
    data = post("search-filters", body)
    print(json.dumps(data, indent=2)[:8000])
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(data, indent=2))
        print(f"\nSaved to {args.out}")


def cmd_call(args: argparse.Namespace) -> None:
    try:
        body = json.loads(args.body)
    except json.JSONDecodeError as err:
        sys.exit(f"--body is not valid JSON: {err}")

    print(f"POST {args.endpoint}  {json.dumps(body)[:200]}\n")
    data = post(args.endpoint, body)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2))
    print(f"Saved to {out}")
    _summarise(data)


def cmd_inspect(args: argparse.Namespace) -> None:
    data = json.loads(Path(args.path).read_text())
    _summarise(data)


def _records(data) -> list[dict]:
    """Find the list of records whatever the envelope is called."""
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        for key in ("data", "records", "results", "rows", "items", "shipments"):
            value = data.get(key)
            if isinstance(value, list):
                return [r for r in value if isinstance(r, dict)]
        # Sometimes the payload is nested one deeper.
        for value in data.values():
            if isinstance(value, dict):
                found = _records(value)
                if found:
                    return found
    return []


def _summarise(data) -> None:
    """
    Describe a response without assuming its shape.

    The point is to learn the field names and fill rates before committing to a
    mapping — a column that is 2% populated is not a column you can build a
    product on, and the only way to know is to look.
    """
    records = _records(data)
    if not records:
        print("\nNo record list found. Top-level shape:")
        print(json.dumps(data, indent=2)[:2000])
        return

    print(f"\n=== {len(records)} records ===\n")
    fields = Counter()
    for r in records:
        for k, v in r.items():
            if v not in (None, "", [], {}):
                fields[k] += 1

    print(f"{'field':<34} {'filled':>8}  {'%':>5}")
    print("-" * 52)
    for field, count in sorted(fields.items(), key=lambda kv: -kv[1]):
        pct = 100 * count / len(records)
        flag = "  <-- sparse" if pct < 60 else ""
        print(f"{field:<34} {count:>8}  {pct:>4.0f}%{flag}")

    missing = sorted({k for r in records for k in r} - set(fields))
    if missing:
        print(f"\nAlways empty: {', '.join(missing)}")

    print("\n=== first record ===")
    print(json.dumps(records[0], indent=2)[:2500])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    sub = parser.add_subparsers(dest="command", required=True)

    f = sub.add_parser("filters", help="Free: list available search filters")
    f.add_argument("--type", choices=["imp", "exp"], default="imp")
    f.add_argument("--hs", action="append", help="HS code (repeatable)")
    f.add_argument("--product", action="append", help="Product name (repeatable)")
    f.add_argument("--company", help="Company id to scope to")
    f.add_argument("--out", help="Save the response here")
    f.set_defaults(func=cmd_filters)

    c = sub.add_parser("call", help="POST any endpoint and save the response")
    c.add_argument("endpoint", help="e.g. shipment-records")
    c.add_argument("--body", required=True, help="Request body as JSON")
    c.add_argument("--out", required=True, help="Where to save the response")
    c.set_defaults(func=cmd_call)

    i = sub.add_parser("inspect", help="Summarise a saved response (no credits)")
    i.add_argument("path")
    i.set_defaults(func=cmd_inspect)

    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
