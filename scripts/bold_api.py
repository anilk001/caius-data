#!/usr/bin/env python3
"""
Client for the billofladingdata.com partner API.

Written to be run from YOUR machine, not from Claude's sandbox — that sandbox's
network policy blocks tradedata.billofladingdata.com outright, so every call has
to originate somewhere with real egress.

    export BOLD_API_KEY=...

    # Free: what filters exist for imports?
    python scripts/bold_api.py filters --type imp --hs 620442 \\
        --origin INDIA --codes-out data/6204-codes.json

    # Free: which endpoint names actually exist? (404 vs 400 tells you)
    python scripts/bold_api.py probe

    # Paid: US shipments of HS 6204 from India, capped and confirmed first
    python scripts/bold_api.py records --hs 6204 \\
        --import-country US --export-country IN \\
        --max-records 500 --out data/6204-in.json

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
import re
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


# --- Making sense of what search-filters returns -----------------------------
#
# Their hs_codes list is not a clean taxonomy. It is the set of raw strings
# customs filers actually typed, so a query for 620442 comes back with entries
# from 2 digits ("62") to 20 ("62044290620449996211" — two codes run together),
# most without a description, and a fair few belonging to other headings
# entirely. Pass that list back verbatim and you buy records for handbags and
# T-shirts alongside the dresses you asked for; credits are spent per record
# returned, so the noise is not free.
#
# The fix is a prefix filter on the HS4 heading, which is the level the packs
# are sold at anyway.


def find_list(data, key: str) -> list:
    """Find the list stored under `key`, however deeply the response nests it."""
    if isinstance(data, dict):
        value = data.get(key)
        if isinstance(value, list):
            return value
        for nested in data.values():
            found = find_list(nested, key)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = find_list(item, key)
            if found:
                return found
    return []


def option_pairs(data, key: str) -> list[tuple[str, str]]:
    """
    Normalise a filter list to (label, value) pairs.

    Codes arrive as bare strings; countries as {"label": "INDIA", "value": "IN"}.
    Both shapes turn up in one response, so neither is assumed.
    """
    pairs: list[tuple[str, str]] = []
    for item in find_list(data, key):
        if isinstance(item, str):
            pairs.append((item, item))
        elif isinstance(item, dict):
            value = item.get("value") or item.get("code") or item.get("id")
            label = item.get("label") or item.get("name") or value
            if value is not None:
                pairs.append((str(label), str(value)))
    return pairs


def leading_digits(code: str) -> str:
    """The digit run a code starts with, ignoring any trailing description."""
    match = re.match(r"\s*(\d+)", str(code))
    return match.group(1) if match else ""


def heading_of(code: str) -> str | None:
    """The HS4 heading a code belongs to, or None if it is too short to tell."""
    digits = leading_digits(code)
    return digits[:4] if len(digits) >= 4 else None


def select_codes(codes, headings) -> tuple[list[str], list[str]]:
    """
    Split returned codes into the ones worth buying and the ones to discard.

    Anything shorter than four digits is dropped rather than kept: "62" is the
    whole apparel chapter, and sending it back would widen the search from
    dresses to every garment in the feed. Codes are returned in their original
    spelling — the API's own vocabulary is what it expects back, not a
    prettified version of it.
    """
    wanted = {h for h in (heading_of(c) for c in headings) if h}
    kept: list[str] = []
    dropped: list[str] = []
    seen: set[str] = set()
    for code in codes:
        code = str(code)
        if code in seen:
            continue
        seen.add(code)
        (kept if heading_of(code) in wanted else dropped).append(code)
    return kept, dropped


def report_codes(data, headings) -> list[str]:
    """Print what the prefix filter kept and dropped; return the kept list."""
    codes = [value for _, value in option_pairs(data, "hs_codes")]
    # With no heading to filter against every code would be "off-heading", which
    # is a report nobody wants. Say nothing and let the caller dump the raw JSON.
    if not codes or not headings:
        return []

    kept, dropped = select_codes(codes, headings)
    wanted = sorted({h for h in (heading_of(h) for h in headings) if h})
    print(f"\n=== hs_codes: {len(kept)} of {len(codes)} match {', '.join(wanted)} ===")

    if dropped:
        print(f"\nDropped {len(dropped)} off-heading code(s):")
        by_heading = Counter(heading_of(c) or "under 4 digits" for c in dropped)
        for heading, count in by_heading.most_common():
            print(f"  {heading:<14} x{count}")

    # A filer who types two codes into one field produces a string no schedule
    # contains. It still matches its own rows, so it is kept — but it is worth
    # seeing rather than silently shipping.
    odd = [c for c in kept if len(leading_digits(c)) > 10]
    if odd:
        print(f"\nUnusually long (concatenated by the filer), kept anyway: {odd}")

    return kept


def report_countries(data, origin: str | None) -> None:
    """Show which trade lanes can be filtered, and resolve one by name."""
    for key, label in (("export_countries", "origin"), ("import_countries", "destination")):
        pairs = option_pairs(data, key)
        if pairs:
            print(f"\n{key} ({label}): {len(pairs)} available")

    if not origin:
        return

    pairs = option_pairs(data, "export_countries")
    needle = origin.strip().upper()
    matches = [p for p in pairs if needle in p[0].upper() or needle == p[1].upper()]
    print(f"\nOrigin lookup for {origin!r}:")
    if matches:
        for name, value in matches:
            print(f'  {name}  ->  {{"export_countries": ["{value}"]}}')
    else:
        print("  no matching export country in this response")


# --- Finding the endpoints ---------------------------------------------------
#
# The brochure names ten API modules but not their URL slugs, and a wrong slug
# is indistinguishable from a broken key until you look at the status code.
# Happily the API tells us for free: search-filters answers a bodyless request
# with
#
#     {"code": 400, "message": "Either hs_codes, products or company_id must
#      be provided."}
#
# A 400 means the route exists and validated our (empty) body. A 404 means it
# does not. Neither returns records, and credits are only charged on records
# returned — so the whole surface can be mapped without spending anything.

# Confirmed from their documentation portal's own tab bar. Three of these —
# company-contacts, contact-look-up and kyb — are not in the sales brochure and
# are almost certainly where the personal emails and mobile numbers they
# mentioned live. We never call them: not calling an endpoint is a cleaner
# boundary than filtering its response, and it leaves nothing to explain.
FREE_ENDPOINTS = [
    "search-filters",
    "shipping-filters",
    "insights",
    "company-search",
    "check-logistic-company",
    "products",
]

PAID_ENDPOINTS = [
    "shipping-records",   # 1 credit per record
    "all-importers",      # 15 credits per company record
    "all-exporters",
    "competitors",
    "company-details",    # 20 credits per profile
]

# Deliberately excluded. Listed so the omission reads as a decision.
PERSONAL_DATA_ENDPOINTS = ["company-contacts", "contact-look-up", "kyb"]

CANDIDATE_ENDPOINTS = FREE_ENDPOINTS + PAID_ENDPOINTS


def probe_endpoint(endpoint: str) -> tuple[int, str]:
    """
    Ask whether an endpoint exists, without asking it for anything.

    Deliberately bypasses post(): that helper exits the process on an HTTP
    error, which is right for a real call and useless for a probe, where the
    error code IS the answer.
    """
    request = urllib.request.Request(
        f"{BASE_URL}/{endpoint}",
        data=b"{}",
        method="POST",
        headers={
            "Content-Type": "application/json",
            "api-key": _key(),
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            body = response.read().decode("utf-8", "ignore")
            return response.status, body[:200]
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8", "ignore")[:200]
    except urllib.error.URLError as err:
        return 0, str(err.reason)


def cmd_probe(args: argparse.Namespace) -> None:
    endpoints = args.endpoint or CANDIDATE_ENDPOINTS
    print(f"Probing {len(endpoints)} endpoint(s) with an empty body.")
    print("400/422 = exists, 404 = does not, 401/403 = key problem.\n")

    found: list[str] = []
    for endpoint in endpoints:
        status, detail = probe_endpoint(endpoint)
        if status == 404:
            verdict = "no such endpoint"
        elif status in (400, 422):
            verdict = "EXISTS"
            found.append(endpoint)
        elif status in (401, 403):
            verdict = "auth rejected — check BOLD_API_KEY"
        elif status == 429:
            verdict = "rate limited, slow down"
        elif status == 200:
            # A 200 to an empty body means it accepted the request. If that
            # returned records, it just cost credits — worth shouting about.
            verdict = "EXISTS (returned 200 — check whether this spent credits)"
            found.append(endpoint)
        else:
            verdict = "unexpected"
        print(f"  {status:<5} {endpoint:<26} {verdict}")
        if status not in (404,) and detail:
            print(f"        {detail.strip()[:150]}")
        time.sleep(args.delay)

    print(f"\n{len(found)} endpoint(s) exist: {', '.join(found) or 'none'}")


# --- Buying shipment records -------------------------------------------------

MAX_PAGE_SIZE = 250        # their limit
CREDITS_PER_RECORD = 1     # global API; the country-specific USA API is 2


def cmd_records(args: argparse.Namespace) -> None:
    """
    Page through shipping-records, stopping at a record count you chose.

    Every record returned costs a credit, so the cost is stated and confirmed
    before the first call rather than discovered afterwards. There is no
    "fetch everything" mode on purpose: their own dashboard reports 15,916
    importers for one HS code, and the shipments behind those would empty any
    credit pack bought so far.

    Their date_range defaults to the last 12 months when omitted, and caps at
    12 months when given, so a longer history has to be assembled from several
    runs rather than asked for in one.
    """
    body: dict = {
        "type": args.type,
        "page_size": min(args.page_size, MAX_PAGE_SIZE),
        "page_no": 1,
    }
    if args.hs:
        body["hs_codes"] = args.hs
    if args.company:
        body["company_ids"] = args.company
    if args.product:
        body["products"] = args.product
    if not any(k in body for k in ("hs_codes", "company_ids", "products")):
        sys.exit("Pass at least one of --hs, --company or --product.")

    if args.import_country:
        body["import_countries"] = [c.upper() for c in args.import_country]
    if args.export_country:
        body["export_countries"] = [c.upper() for c in args.export_country]
    if args.start or args.end:
        body["date_range"] = {}
        if args.start:
            body["date_range"]["start_date"] = args.start
        if args.end:
            body["date_range"]["end_date"] = args.end

    cost = args.max_records * CREDITS_PER_RECORD
    print(f"shipping-records  {json.dumps(body)}")
    print(f"Up to {args.max_records} records = about {cost} credits.")
    if not args.yes:
        reply = input("Type 'yes' to spend them: ").strip().lower()
        if reply != "yes":
            sys.exit("Stopped. Nothing spent.")

    collected: list[dict] = []
    page = 1
    while len(collected) < args.max_records:
        body["page_no"] = page
        body["page_size"] = min(args.page_size, args.max_records - len(collected), MAX_PAGE_SIZE)
        data = post("shipping-records", body)
        batch = _records(data)
        collected.extend(batch)
        print(f"  page {page}: {len(batch)} record(s), {len(collected)} total")
        # A short page is the last page. Without this the loop pays for empty
        # pages until it reaches the cap.
        if len(batch) < body["page_size"]:
            break
        page += 1
        time.sleep(args.delay)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(collected, indent=2))
    print(f"\nSaved {len(collected)} record(s) to {out} (~{len(collected)} credits).")
    _summarise(collected)


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
    _report_filters(data, args)


def cmd_refine(args: argparse.Namespace) -> None:
    """Re-run the filter report against a saved response, spending nothing."""
    _report_filters(json.loads(Path(args.path).read_text()), args)


def _report_filters(data, args: argparse.Namespace) -> None:
    kept = report_codes(data, args.hs or [])
    report_countries(data, args.origin)

    if not kept and not args.hs:
        print(json.dumps(data, indent=2)[:8000])

    if kept:
        print("\nReady to paste into the records call:")
        print(json.dumps({"hs_codes": kept}, indent=2)[:4000])

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(data, indent=2))
        print(f"\nFull response saved to {args.out}")

    if args.codes_out:
        if not kept:
            sys.exit("Nothing to save: no hs_codes matched. Pass --hs to filter.")
        Path(args.codes_out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.codes_out).write_text(json.dumps(kept, indent=2))
        print(f"{len(kept)} code(s) saved to {args.codes_out}")


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
    f.add_argument("--origin", help="Country to look up in export_countries, e.g. INDIA")
    f.add_argument("--out", help="Save the full response here")
    f.add_argument("--codes-out", help="Save just the matching hs_codes here")
    f.set_defaults(func=cmd_filters)

    r = sub.add_parser("refine", help="Re-filter a saved search-filters response")
    r.add_argument("path")
    r.add_argument("--hs", action="append", help="HS heading to keep (repeatable)")
    r.add_argument("--origin", help="Country to look up in export_countries")
    r.add_argument("--out", help="Ignored; kept so refine and filters share flags")
    r.add_argument("--codes-out", help="Save just the matching hs_codes here")
    r.set_defaults(func=cmd_refine)

    c = sub.add_parser("call", help="POST any endpoint and save the response")
    c.add_argument("endpoint", help="e.g. shipment-records")
    c.add_argument("--body", required=True, help="Request body as JSON")
    c.add_argument("--out", required=True, help="Where to save the response")
    c.set_defaults(func=cmd_call)

    p = sub.add_parser("probe", help="Free: find which endpoint names exist")
    p.add_argument("endpoint", nargs="*", help="Names to try (default: the brochure's modules)")
    p.add_argument("--delay", type=float, default=1.5, help="Seconds between probes")
    p.set_defaults(func=cmd_probe)

    r = sub.add_parser("records", help="Buy shipment records (1 credit each)")
    r.add_argument("--type", choices=["imp", "exp"], default="imp")
    r.add_argument("--hs", action="append", help="HS code (repeatable)")
    r.add_argument("--company", action="append", help="Company id (repeatable)")
    r.add_argument("--product", action="append", help="Product name (repeatable)")
    r.add_argument("--import-country", action="append", help="2-letter code, e.g. US")
    r.add_argument("--export-country", action="append", help="2-letter code, e.g. IN")
    r.add_argument("--start", help="YYYY-MM-DD (range caps at 12 months)")
    r.add_argument("--end", help="YYYY-MM-DD")
    r.add_argument("--max-records", type=int, required=True, help="Hard cap; 1 credit each")
    r.add_argument("--page-size", type=int, default=MAX_PAGE_SIZE)
    r.add_argument("--delay", type=float, default=1.0, help="Seconds between pages")
    r.add_argument("--yes", action="store_true", help="Skip the spend confirmation")
    r.add_argument("--out", required=True, help="Where to save the records")
    r.set_defaults(func=cmd_records)

    i = sub.add_parser("inspect", help="Summarise a saved response (no credits)")
    i.add_argument("path")
    i.set_defaults(func=cmd_inspect)

    args = parser.parse_args()
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
