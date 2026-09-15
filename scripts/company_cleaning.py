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

    name = _WS.sub(" ", str(raw)).strip()
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


def parse_weight_kg(raw: str | None) -> float | None:
    """Parse a weight, tolerating thousands separators and unit suffixes."""
    if raw is None:
        return None
    text = re.sub(r"[^\d.]", "", str(raw))
    if not text:
        return None
    try:
        value = float(text)
    except ValueError:
        return None
    return value if value > 0 else None


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
