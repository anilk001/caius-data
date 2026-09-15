"""
Company-name and field normalisation shared by every ingest path.

Manifest data is filed by carriers and brokers, so the same buyer appears as
"ACME IMPORTS INC.", "Acme Imports, Inc", "ACME IMPORTS INC C/O ABC BROKERS"
and "ACME IMPORTS INC - DO NOT USE". Left alone, one real buyer becomes four
rows and the volume ranking that packs are sorted on is meaningless.

The goal here is a name good enough to *group* on, not a legally perfect one.
We are deliberately conservative: it is better to leave two spellings separate
than to merge two genuinely different companies.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime

# Legal suffixes stripped for grouping. Kept short on purpose — the more we
# strip, the more likely two distinct companies collide.
_SUFFIXES = (
    "incorporated", "inc", "corporation", "corp", "company", "co",
    "limited", "ltd", "llc", "l l c", "lp", "llp", "plc", "pllc",
    "holdings", "holding", "group", "intl", "international",
    # This trade lane is India and South-East Asia, so their legal suffixes
    # matter as much as the US ones for collapsing name variants.
    "pvt", "private", "pte",
)

# Broker / consignee noise that rides along in the name field.
_NOISE_PATTERNS = (
    r"\bc\s*/\s*o\b.*$",          # "C/O SOME BROKER"
    r"\bdba\b.*$",                # "DBA TRADING NAME"
    r"\bdo not use\b.*$",
    r"\bto the order of\b.*$",
    r"\border of\b.*$",
    r"\bsame as consignee\b.*$",
    r"\bnot available\b.*$",
    r"\bunknown\b.*$",
)

_PLACEHOLDER_NAMES = {
    "", "n/a", "na", "none", "unknown", "to order", "to the order of",
    "same as consignee", "consignee", "not available", "notify party",
}

# "PVT.LTD." and "URBAN OUTFITTERS,INC" are each one token to a title-caser,
# which renders them "Pvt.ltd" and "Outfitters,inc" — not names to put in front
# of a paying customer. Split a full stop or comma sitting between two letters,
# but only when what follows is a word rather than an initial, so "PVT.LTD"
# opens up while "J.P. MORGAN" and "U.S.A." are left alone.
_GLUED_SUFFIX = re.compile(r"(?<=[A-Za-z])([.,])(?=[A-Za-z]{2,})")

# Dotted initials: U.S.A., J.P., A.B.C. A plain title-caser lower-cases
# everything after the first letter and yields "U.s.a.".
_DOTTED_INITIALS = re.compile(r"^(?:[A-Za-z]\.){2,}[A-Za-z]?\.?$")

# "AZAZIE SG PTE. LTD/ AZAZIE INC." is one buyer filed under two names, and the
# vendor's own aggregation bills for it twice. The left side is the contracting
# entity, so grouping cuts there. Both sides must be substantial: "MAERSK A/S"
# is a Danish legal suffix, not two companies, and splitting it would invent a
# company called "Maersk A".
_ALIAS_SLASH = re.compile(r"^(?P<first>[^/]{3,}?)\s*/\s*(?P<rest>.{3,})$")

_WS = re.compile(r"\s+")
_PUNCT = re.compile(r"[.,]")
_NON_NAME = re.compile(r"[^a-z0-9&\s-]")

_DATE_FORMATS = (
    "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%m-%d-%Y", "%d-%m-%Y",
    "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%b %d, %Y", "%Y%m%d",
    "%m/%d/%y", "%d/%m/%y",
)


def clean_company_name(raw: str | None) -> str | None:
    """Return a display-ready company name, or None if the value is junk."""
    if not raw:
        return None

    name = _WS.sub(" ", _GLUED_SUFFIX.sub(r"\1 ", str(raw))).strip()
    if name.lower() in _PLACEHOLDER_NAMES:
        return None

    # Drop trailing broker noise before anything else.
    lowered = name.lower()
    for pattern in _NOISE_PATTERNS:
        match = re.search(pattern, lowered)
        if match:
            name = name[: match.start()].strip(" ,-")
            lowered = name.lower()

    if not name or lowered in _PLACEHOLDER_NAMES:
        return None

    # ALL CAPS is the manifest norm and reads as shouting in a CSV. Title-case
    # it, but leave names that already have mixed case alone — someone filed
    # those deliberately.
    if name.isupper():
        name = _title_case(name)

    name = name.strip(" ,.-")
    return name or None


# Tokens with a fixed presentation. Legal suffixes read as words, not shouts:
# "Acme Imports Inc", never "Acme Imports INC".
_FIXED_CASE = {
    "llc": "LLC", "l.l.c": "LLC", "llp": "LLP", "lp": "LP", "plc": "PLC",
    "pllc": "PLLC", "usa": "USA", "us": "US", "uk": "UK", "na": "NA",
    "inc": "Inc", "ltd": "Ltd", "corp": "Corp", "co": "Co", "intl": "Intl",
    "pvt": "Pvt", "pte": "Pte", "private": "Private",
    "and": "and", "of": "of", "the": "the", "for": "for", "de": "de",
}

# Kept lowercase unless they lead the name.
_MINOR_WORDS = {"and", "of", "the", "for", "de", "a", "an"}


def _title_case(name: str) -> str:
    """Title-case a shouted name, keeping acronyms and legal suffixes right."""
    words = []
    for index, word in enumerate(name.split(" ")):
        stripped = word.strip(".,").lower()

        if stripped in _FIXED_CASE:
            fixed = _FIXED_CASE[stripped]
            # A minor word that leads the name still gets capitalised.
            if index == 0 and stripped in _MINOR_WORDS:
                fixed = fixed.capitalize()
            words.append(fixed)
            continue

        if _DOTTED_INITIALS.match(word):
            words.append(word.upper())
            continue

        # Vowel-free short tokens are almost always acronyms: NY, BMW, HDFC.
        if len(stripped) <= 4 and stripped.isalpha() and _looks_like_acronym(stripped):
            words.append(stripped.upper())
            continue

        words.append(word.capitalize())

    return " ".join(words)


def _looks_like_acronym(word: str) -> bool:
    return not any(c in "aeiou" for c in word.lower())


def grouping_key(name: str | None, city: str | None, state: str | None, hs4: str | None) -> str | None:
    """
    Stable key used to aggregate manifest rows into one company record.

    Mirrors the `company_key` generated column in Postgres closely enough to
    group on, but additionally strips legal suffixes so "Acme Imports Inc" and
    "Acme Imports LLC" at the same address collapse together.
    """
    if not name or not hs4:
        return None

    alias = _ALIAS_SLASH.match(name.strip())
    if alias:
        name = alias.group("first")

    base = _NON_NAME.sub(" ", _PUNCT.sub(" ", name.lower()))
    tokens = [t for t in _WS.sub(" ", base).strip().split(" ") if t]

    while tokens and tokens[-1] in _SUFFIXES:
        tokens.pop()

    if not tokens:
        return None

    return "|".join(
        (
            " ".join(tokens),
            (city or "").strip().lower(),
            (state or "").strip().lower(),
            hs4,
        )
    )


def clean_hs4(raw: str | None) -> str | None:
    """Reduce any HS/HTS code to its 4-digit chapter+heading."""
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) < 4:
        return None
    return digits[:4]


def parse_date(raw: str | None) -> date | None:
    """Parse the many date formats manifest exports use. None if unparseable."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text.lower() in {"n/a", "na", "none", "null", "-"}:
        return None

    # Trim a time component if one rode along, without wrecking formats that
    # legitimately contain a space ("Feb 20, 2026", "20 Feb 2026").
    if "T" in text:
        text = text.split("T", 1)[0]
    if ":" in text:
        text = text.split(" ", 1)[0] if " " in text else text

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


# Weight units seen in real manifest exports, as a multiplier to kilograms.
# Manifests mix them freely — one provider sample carried "158277 LB" and
# "6165 KG" in adjacent rows — so the unit has to be read, never assumed.
_WEIGHT_UNITS: dict[str, float] = {
    "kg": 1.0, "kgs": 1.0, "kgm": 1.0, "kilo": 1.0, "kilos": 1.0,
    "kilogram": 1.0, "kilograms": 1.0,
    "lb": 0.45359237, "lbs": 0.45359237, "pound": 0.45359237,
    "pounds": 0.45359237, "lbr": 0.45359237,
    "g": 0.001, "gram": 0.001, "grams": 0.001,
    "mt": 1000.0, "t": 1000.0, "ton": 1000.0, "tons": 1000.0,
    "tonne": 1000.0, "tonnes": 1000.0, "metric ton": 1000.0,
}

_UNIT_IN_VALUE = re.compile(r"([a-z][a-z\s]*)$", re.I)


def parse_weight_kg(raw: str | None, unit: str | None = None) -> float | None:
    """
    Parse a weight and return KILOGRAMS.

    The unit may sit in its own column or be appended to the value. Stripping
    it and keeping the number — which is what this used to do — overstates
    every pound figure by a factor of 2.2, silently, with nothing to notice it
    downstream.

    An unrecognised unit returns None rather than a number of unknown scale. A
    weight that might be pounds or kilograms is not a weight.
    """
    if raw is None:
        return None

    text = str(raw).strip()
    if not text:
        return None

    # A unit appended to the value wins over the column, since it travels with
    # the number: "158277 LB" is pounds even if the column header says KG.
    embedded = _UNIT_IN_VALUE.search(text)
    unit_token = (embedded.group(1) if embedded else unit) or unit

    digits = re.sub(r"[^\d.]", "", text)
    if not digits or digits.count(".") > 1:
        return None
    try:
        value = float(digits)
    except ValueError:
        return None
    if value <= 0:
        return None

    if unit_token is None:
        # No unit anywhere. Manifest weights are overwhelmingly kilograms, and
        # refusing every unitless row would discard most exports.
        return value

    key = str(unit_token).strip().lower().rstrip(".")
    multiplier = _WEIGHT_UNITS.get(key)
    if multiplier is None:
        return None

    return round(value * multiplier, 3)


# Freight forwarders, carriers, consolidators and customs brokers routinely
# appear in the consignee field instead of the company that actually bought the
# goods. A real sample carried "EFL CONTAINER LINES LLC" and "EXPOLANKA FREIGHT
# VIETNAM" as consignees for women's dresses.
#
# This matters commercially, not just cosmetically. Selling a shipping line to
# an Indian exporter as "a US buyer of your product" is the kind of error a
# customer spots on the first row, and it is the fastest way to a refund and a
# bad review.
_LOGISTICS_MARKERS = (
    "container line", "container lines", "container shipping",
    "shipping line", "steamship", "ocean line",
    "freight", "forwarder", "forwarding", "logistics", "nvocc",
    "customs broker", "customhouse", "customs house", "cargo services",
    "transport services", "consolidator", "consolidation",
    "supply chain solutions", "3pl", "warehousing",
    "express worldwide", "air cargo", "shipping agency", "shipping agencies",
)

# Names that are logistics-adjacent but often ARE the buyer, so they do not
# trigger on their own — "Trading", "Sourcing", "Imports" are normal for
# genuine importers.
_LOGISTICS_SAFE = ("import", "trading", "apparel", "garment", "fashion", "brand")

# Forwarders and carriers whose names carry no linguistic clue. "Flexport
# International LLC" reads exactly like an importer; only knowing the company
# tells you otherwise.
_KNOWN_LOGISTICS = (
    "flexport", "expeditors", "kuehne", "nagel", "panalpina", "db schenker",
    "schenker", "dsv air", "dsv ocean", "ch robinson", "c.h. robinson",
    "nippon express", "sinotrans", "yusen", "kerry logistics", "agility",
    "geodis", "bollore", "damco", "ups supply chain", "fedex trade",
    "dhl global", "dhl supply", "maersk", "msc mediterranean", "cma cgm",
    "cosco", "evergreen line", "hapag", "ocean network express",
    "yang ming", "hmm ", "oocl", "zim integrated", "de well",
)


# A parcel consolidator's name gives nothing away — "Stelcore Management
# Services LLC" reads like any other buyer. Its trade does: 51,968 shipments of
# HS 6204 worth $275,311 in total, which is $5 and exactly one piece per
# shipment. Real wholesale buyers in the same list run from $217 to $13,505 per
# shipment. Sorted by shipment count, which is how packs are assembled, that
# company sits at row 1 of every pack unless something catches it.
MIN_SHIPMENTS_TO_JUDGE = 500
MIN_PIECES_PER_SHIPMENT = 2.0
MIN_VALUE_PER_SHIPMENT = 50.0


def looks_like_consolidator(
    shipments: int | None,
    value: float | None = None,
    quantity: float | None = None,
) -> bool:
    """
    True when a company's trade profile reads as parcel consolidation rather
    than wholesale buying.

    Judges only companies with enough shipments for the ratios to mean
    anything. Below that threshold a single mis-keyed declaration swings the
    average, and dropping a real buyer costs more than keeping a bad row: the
    buyer is gone from every pack, silently, with nothing in the output to say
    why.
    """
    if not shipments or shipments < MIN_SHIPMENTS_TO_JUDGE:
        return False

    if quantity and quantity / shipments < MIN_PIECES_PER_SHIPMENT:
        return True
    if value and value / shipments < MIN_VALUE_PER_SHIPMENT:
        return True
    return False


def looks_like_logistics(name: str | None) -> bool:
    """
    True when a consignee name reads as a carrier, forwarder or broker rather
    than the company that bought the goods.

    Conservative by design: a false positive silently drops a real buyer from
    every pack, so a name needs an unambiguous logistics marker and no
    countervailing signal that it trades in its own right.
    """
    if not name:
        return False
    text = _WS.sub(" ", str(name).lower())

    if any(known in text for known in _KNOWN_LOGISTICS):
        return True

    if not any(marker in text for marker in _LOGISTICS_MARKERS):
        return False
    # "Acme Apparel Logistics" is more likely a brand's own arm than a 3PL.
    return not any(safe in text for safe in _LOGISTICS_SAFE)


def clean_state(raw: str | None) -> str | None:
    """Normalise a US state to its two-letter code where we can."""
    if not raw:
        return None
    text = str(raw).strip()
    if len(text) == 2 and text.isalpha():
        return text.upper()
    return _US_STATES.get(text.lower(), text.title() if text else None)


def clean_text(raw: str | None, max_len: int = 500) -> str | None:
    if raw is None:
        return None
    text = _WS.sub(" ", str(raw)).strip()
    if not text or text.lower() in _PLACEHOLDER_NAMES:
        return None
    return text[:max_len]


def row_hash(row: dict[str, object]) -> str:
    """Stable fingerprint of a source row, used to make re-ingest idempotent."""
    payload = "|".join(f"{k}={row[k]}" for k in sorted(row))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


_US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
    "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY", "puerto rico": "PR",
}
