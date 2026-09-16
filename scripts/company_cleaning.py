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
    # "ATTN : KRISTIN SHEELER" is a person, not a company. Cutting from "attn"
    # leaves nothing, and nothing is the right answer: we sell companies.
    r"\battn\b\s*[:.\-]?.*$",
    r"^\s*individual\b.*$",
    # "KATE QUINN ORGANICS INC WAREHOUSE" is the buyer's own warehouse, so the
    # word is trailing noise. "INTERNATIONAL WAREHOUSE GROUP" is a 3PL and is
    # caught by looks_like_logistics instead, which is why only a trailing
    # "warehouse" is cut here.
    r"\s+warehouse\s*(?:#\s*)?\d*$",
)

_PLACEHOLDER_NAMES = {
    "", "n/a", "na", "none", "unknown", "to order", "to the order of",
    "same as consignee", "consignee", "not available", "notify party",
    # Job titles and catch-alls filers type when they have no company to name.
    # All of these arrived on real HS 620442 records.
    "individual", "boutique manager", "store manager", "manager", "owner",
    "customer", "walk in customer", "cash customer", "warehouse",
    "to be advised", "tba", "various", "misc", "miscellaneous",
    "personal effects", "sample", "samples", "no name", "test",
}

# "PVT.LTD." and "URBAN OUTFITTERS,INC" are each one token to a title-caser,
# which renders them "Pvt.ltd" and "Outfitters,inc" — not names to put in front
# of a paying customer. Split a full stop or comma sitting between two letters,
# but only when what follows is a word rather than an initial, so "PVT.LTD"
# opens up while "J.P. MORGAN" and "U.S.A." are left alone.
# A domain in the name is not a glued suffix: "CBAZAAR.COM" must not open up
# into "Cbazaar. Com". Real buyers file under their web address often enough
# that this is worth an exception rather than a shrug.
# Punctuation is noise when matching a name against a marker list: a comma
# before a legal suffix is a filer's habit, not a difference in the company.
_MATCH_PUNCT = re.compile(r"[.,;:()\[\]/\\'\"]+")

_TLDS = "com|net|org|io|biz|info|shop|store"
_GLUED_SUFFIX = re.compile(
    rf"(?<=[A-Za-z])([.,])(?!(?:{_TLDS})\b)(?=[A-Za-z]{{2,}})",
    re.IGNORECASE,
)

# Manifest names are filed with brackets left open: "LAST BRAND INC (QUINCE".
# The bracketed part is usually the brand a buyer is known by, so it is closed
# rather than discarded.
_UNBALANCED_OPEN = re.compile(r"\([^()]*$")

# A bracket left opening onto nothing, once a noise clause has been cut away.
_TRAILING_OPEN = re.compile(r"\s*\(\s*$")

# Dotted initials: U.S.A., J.P., A.B.C. A plain title-caser lower-cases
# everything after the first letter and yields "U.s.a.".
# "L.P." and also "L.P.1600", where a suite number has been glued on by the
# filer. Either way the letters are initials and belong in capitals.
_DOTTED_INITIALS = re.compile(r"^(?:[A-Za-z]\.){2,}(?:[A-Za-z]\.?|\d+)?$")

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


# A name short enough that an accidental fold would be wrong. "HO HO" tiles as
# "HO"; "OLD NAVY, LLC OLD NAVY, LLC" does not fold by accident.
MIN_REPEATED_UNIT = 6


def collapse_doubled(name: str) -> str:
    """
    Fold a name the filer typed twice.

    Real records carry "OLD NAVY, LLC OLD NAVY, LLC" — one company, keyed in
    once for the consignee and once for the notify party and concatenated on
    the way out. Only exact tiling is folded, and only of a unit long enough
    that the repetition cannot be a coincidence.
    """
    # The copies are separated by one space and the last has none, so a name
    # made of k copies of a unit of length n (the unit carrying its separator)
    # is k * n - 1 characters long.
    length = len(name) + 1
    for size in range(MIN_REPEATED_UNIT, length // 2 + 1):
        if length % size:
            continue
        unit = name[:size]
        if not unit.endswith(" "):
            continue
        copies = length // size
        if unit * (copies - 1) + unit[:-1] == name:
            return unit[:-1]
    return name


def clean_company_name(raw: str | None) -> str | None:
    """Return a display-ready company name, or None if the value is junk."""
    if not raw:
        return None

    name = _WS.sub(" ", _GLUED_SUFFIX.sub(r"\1 ", str(raw))).strip()
    name = collapse_doubled(name)
    if name.lower() in _PLACEHOLDER_NAMES:
        return None

    name = _resolve_care_of(name)

    # Drop trailing broker noise before anything else.
    lowered = name.lower()
    for pattern in _NOISE_PATTERNS:
        match = re.search(pattern, lowered)
        if match:
            name = name[: match.start()].strip(" ,-")
            lowered = name.lower()

    if not name or lowered in _PLACEHOLDER_NAMES:
        return None

    # Brackets are repaired after the noise clauses are gone, not before.
    # "COACH SERVICES INC (DBA COACH) CCLS" is balanced until "DBA…" is cut,
    # and cutting it leaves "Coach Services Inc (" — a bracket opening onto
    # nothing.
    name = _TRAILING_OPEN.sub("", name).strip(" ,-")
    if _UNBALANCED_OPEN.search(name):
        name = f"{name})"

    # ALL CAPS is the manifest norm and reads as shouting in a CSV. Title-case
    # it, but leave names that already have mixed case alone — someone filed
    # those deliberately.
    if name.isupper():
        name = _title_case(name)

    name = _trim_after_suffix(name)

    name = name.strip(" ,.-")
    return name or None


# A legal suffix normally ends a company name. When a word or two follows it,
# that is usually the filer adding who to ask for or where to send it:
# "RETAILVISOR LLC TERRY GRANT", "WAL-MART STORES, INC USA".
MAX_WORDS_AFTER_SUFFIX = 2

# Only the incorporation words, not the descriptive ones. `_SUFFIXES` also
# holds "international", "group" and "holdings", which sit mid-name constantly:
# trimming on those turned "LEVEL LLC INTERNATIONAL FOLK ART" into "Level LLC
# International" and "SMARTMODE INTERNATIONAL LOGISTICS L" into "Smartmode
# International" — half-names, and one of them hid a forwarder from the filter.
_LEGAL_SUFFIXES = frozenset({
    "co", "company", "corp", "corporation", "inc", "incorporated",
    "l l c", "llc", "llp", "lp", "ltd", "limited", "plc", "pllc",
    "private", "pte", "pvt",
})


def _trim_after_suffix(name: str) -> str:
    """
    Cut a short tail that follows a legal suffix.

    Deliberately short-sighted. Two words is the limit because longer tails are
    usually part of the name — "Level LLC International Folk Art" is one
    company however oddly it is written, and truncating it would put a
    half-name in front of a paying customer.
    """
    words = name.split(" ")
    for index in range(len(words) - 1 - MAX_WORDS_AFTER_SUFFIX, len(words) - 1):
        if index < 1:
            continue
        if words[index].strip(".,").lower() not in _LEGAL_SUFFIXES:
            continue
        tail = words[index + 1 :]
        if any(word.strip(".,").lower() in _SUFFIXES for word in tail):
            continue
        # "LAST BRAND INC (QUINCE" is the buyer plus the brand it sells under,
        # which is worth more to a customer than the legal name alone. Only a
        # tail of plain words is filer noise.
        if not all(re.fullmatch(r"[A-Za-z][A-Za-z.,'-]*", word) for word in tail):
            continue
        return " ".join(words[: index + 1])
    return name


# Tokens with a fixed presentation. Legal suffixes read as words, not shouts:
# "Acme Imports Inc", never "Acme Imports INC".
_FIXED_CASE = {
    "llc": "LLC", "l.l.c": "LLC", "llp": "LLP", "lp": "LP", "plc": "PLC",
    "pllc": "PLLC", "usa": "USA", "us": "US", "uk": "UK", "na": "NA",
    "inc": "Inc", "ltd": "Ltd", "corp": "Corp", "co": "Co", "intl": "Intl",
    "pvt": "Pvt", "pte": "Pte", "private": "Private",
    "and": "and", "of": "of", "the": "the", "for": "for", "de": "de",
    "by": "by",
}

# Kept lowercase unless they lead the name.
_MINOR_WORDS = {"and", "of", "the", "for", "de", "a", "an", "by"}


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

        # "WAL-MART" is two words to a reader and one token to a title-caser,
        # which renders it "Wal-mart". An ampersand joins words the same way:
        # "H&M HENNES&MAURITZ" is "H&m Hennes&mauritz" without this.
        words.append(_split_capitalise(word))

    return " ".join(words)


def _split_capitalise(word: str) -> str:
    """Capitalise each part of a token joined by a hyphen or an ampersand."""
    return "-".join(
        "&".join(_capitalise(piece) for piece in part.split("&"))
        for part in word.split("-")
    )


_CARE_OF = re.compile(r"\bc\s*/\s*o\b", re.IGNORECASE)


def _resolve_care_of(name: str) -> str:
    """
    Pick the buyer out of a "X C/O Y" consignee, whichever side it is on.

    The filer's order is not reliable. Both of these are real:

        WEAR PACT, LLC C/O FLEXPORT      -> the buyer leads
        SHIPMONK C/O SOFT SURROUNDINGS   -> the forwarder leads

    Cutting at "C/O" unconditionally gets the first right and the second
    exactly backwards, selling a fulfilment warehouse as a buyer of women's
    dresses and losing the brand that actually bought them. So the sides are
    judged rather than assumed, and only a clear swap — logistics on the left,
    something else on the right — changes the answer.
    """
    match = _CARE_OF.search(name)
    if not match:
        return name

    head = name[: match.start()].strip(" ,-")
    tail = name[match.end() :].strip(" ,-")
    if head and tail and looks_like_logistics(head) and not looks_like_logistics(tail):
        return tail
    return name


def _capitalise(word: str) -> str:
    """
    Upper-case the first LETTER, not the first character.

    str.capitalize() uppercases position zero, so a name filed as
    "(QUINCE" comes back as "(quince" — the bracket takes the capital and the
    brand loses it.
    """
    lowered = word.lower()
    match = re.search(r"[a-z]", lowered)
    if not match:
        return lowered
    index = match.start()
    return lowered[:index] + lowered[index].upper() + lowered[index + 1 :]


# Short vowel-free tokens are read as acronyms, which is right for NY, CPW and
# PVH and wrong for these. "WEST BY CPW LLC" came back as "West BY CPW LLC" and
# "LIZA BYRD BOUTIQUE" as "Liza BYRD Boutique" until this list existed.
_NOT_ACRONYMS = {
    "by", "my", "byrd", "wynn", "lynn", "lynx", "myth", "gym", "dry", "fly",
    "fry", "sky", "sly", "spy", "sty", "try", "why", "wry", "cry", "shy",
}


def _looks_like_acronym(word: str) -> bool:
    if word in _NOT_ACRONYMS:
        return False
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
#
# Every marker below was put there by a name that reached the KEPT list on real
# HS 620442 records and should not have: Pegasus Maritime, Swift Cargo,
# Olympiad Line LLC, AJ Worldwide Services, International Warehouse Group.
#
# Matching happens against a copy of the name with full stops and commas turned
# into spaces, so "Olympiad Line, LLC" and "Olympiad Line LLC" are the same
# string to a marker.
_LOGISTICS_MARKERS = (
    "container line", "container lines", "container shipping",
    "shipping line", "steamship", "ocean line", "maritime",
    "freight", "forwarder", "forwarding", "logistics", "nvocc",
    "customs broker", "customhouse", "customs house", "cargo",
    "transport services", "consolidator", "consolidation",
    "supply chain solutions", "3pl", "warehousing", "drayage",
    "express worldwide", "air cargo", "shipping agency", "shipping agencies",
    "worldwide services", "fulfillment", "fulfilment",
    # All four reached a real pack preview: "3 PL Warehouseing & Distribution
    # NJ" (the filer's spelling), "J&S Supply Chain Management", "Bergen
    # Receiving", "Shipmonk".
    "3 pl", "supply chain", "receiving", "warehouseing",
    "warehouse group", "warehouse services", "warehouse distribution",
    "distribution services", "trucking", "haulage", "courier",
    # A shipping line files as "<something> Line LLC". A buyer does not name
    # itself that, and bare "line" is far too common in apparel to use alone.
    "line llc", "line inc", "line ltd", "line corp",
    "lines llc", "lines inc", "lines ltd",
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
    "intoglo", "crane worldwide", "rhenus", "hellmann", "dachser",
    "dimerco", "shipco transport", "gxo ", "smartmode",
    # Not Stelcore. Its name gives nothing away — that is the whole reason
    # looks_like_consolidator judges on ratios, and naming it here would hide
    # the only test that proves the ratios still work.
    "shipmonk", "dash fulfillment",
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

# The quantity unit is not trustworthy. One search-filters response listed a
# hundred of them — PCS, PIECE, Pieces, PCE, DOZ, DOZEN, SET, CARTON, KG, шт —
# so "one unit per shipment" might be one garment or one carton of them. A
# buyer shipping a dozen at a time would otherwise read as a parcel courier
# and vanish from every pack.
#
# Value settles it. Every parcel shipper found so far runs well under this per
# shipment: Stelcore $5, AA Brands $5, Ethnovog $28, Cbazaar $61. A wholesale
# buyer whose unit we have merely misread does not.
MAX_VALUE_FOR_PARCEL_SHIPMENT = 500.0


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

    per_shipment_value = value / shipments if value else None

    # Almost nothing per shipment, whatever the unit means.
    if per_shipment_value is not None and per_shipment_value < MIN_VALUE_PER_SHIPMENT:
        return True

    # One unit a shipment AND too little money for that unit to be a carton.
    if quantity and quantity / shipments < MIN_PIECES_PER_SHIPMENT:
        return (
            per_shipment_value is not None
            and per_shipment_value < MAX_VALUE_FOR_PARCEL_SHIPMENT
        )

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
    # "Olympiad Line, LLC" and "DSV Air & Sea, Inc." must read the same as the
    # comma-free spellings, so punctuation becomes whitespace before matching.
    text = _WS.sub(" ", _MATCH_PUNCT.sub(" ", str(name).lower())).strip()

    if any(known in text for known in _KNOWN_LOGISTICS):
        return True

    if not any(marker in text for marker in _LOGISTICS_MARKERS):
        return False
    # "Acme Apparel Logistics" is more likely a brand's own arm than a 3PL.
    return not any(safe in text for safe in _LOGISTICS_SAFE)


# The country field arrives spelled every way a filer can spell it. A pack sold
# as "US importers" is filtered on this column, so an unrecognised spelling of
# the United States would drop real buyers out of every pack, silently. One
# normalisation at the boundary means the database only ever holds ISO codes
# and the filter can be an equality test.
_COUNTRY_CODES = {
    "us": "US", "usa": "US", "u s a": "US", "u s": "US",
    "united states": "US", "united states of america": "US",
    "america": "US", "united states minor outlying islands": "US",
    "ca": "CA", "can": "CA", "canada": "CA",
    "mx": "MX", "mex": "MX", "mexico": "MX",
    "in": "IN", "ind": "IN", "india": "IN",
    "cn": "CN", "china": "CN", "peoples republic of china": "CN",
    "vn": "VN", "vietnam": "VN", "viet nam": "VN",
    "sg": "SG", "singapore": "SG",
    "my": "MY", "malaysia": "MY",
    "gb": "GB", "uk": "GB", "united kingdom": "GB",
    "pr": "PR", "puerto rico": "PR",
}


def clean_country(raw: str | None) -> str | None:
    """
    Normalise a country to its ISO two-letter code where we can.

    An unrecognised value is handed back unchanged rather than guessed at. A
    wrong guess here relabels a buyer's nationality, which is the one claim the
    front page makes.
    """
    if not raw:
        return None
    text = _WS.sub(" ", str(raw)).strip()
    if not text or text.lower() in _PLACEHOLDER_NAMES:
        return None
    key = _WS.sub(" ", re.sub(r"[^a-z ]+", " ", text.lower())).strip()
    if key in _COUNTRY_CODES:
        return _COUNTRY_CODES[key]
    if len(text) == 2 and text.isalpha():
        return text.upper()
    return text


# A company can be a foreign arm and still land its goods in the United States.
# "AMERICAN EAGLE OUTFITTERS CANADA" arrived on a real record unlading in New
# York, so the port of unlading cannot see it and the name is the only signal.
#
# Only Canada and Mexico are read this way, and only in the three shapes a
# corporate arm is actually named. Widening the vocabulary would be the
# expensive kind of wrong: "Global India Trading Inc" is a normal US importer,
# and reading "India" out of its name would drop it from every pack silently.
_ARM_COUNTRIES = {"canada": "CA", "mexico": "MX"}

# Words that follow a country in the name of a subsidiary rather than of a
# brand: "SML Canada Acquisition Corp" is Canadian, "Canada Goose" is not.
_ARM_FOLLOWERS = {
    "acquisition", "acquisitions", "holding", "holdings", "operations",
    "retail", "sourcing", "services", "trading", "distribution", "company",
}


def country_from_name(name: str | None) -> str | None:
    """
    The country a company name declares itself to belong to, if it does.

    None means the name says nothing, which is the usual answer.
    """
    if not name:
        return None

    text = _WS.sub(" ", str(name).lower())

    # "GAP (CANADA) INC" — the standard way a subsidiary is written.
    for country, code in _ARM_COUNTRIES.items():
        if f"({country})" in text:
            return code

    tokens = [t for t in _WS.sub(" ", _PUNCT.sub(" ", text)).split(" ") if t]
    # A leading country word is part of a brand — Canada Goose, Canada Dry.
    for index, token in enumerate(tokens[1:], start=1):
        code = _ARM_COUNTRIES.get(token)
        if not code:
            continue
        # "NEW MEXICO" is in the United States.
        if token == "mexico" and tokens[index - 1] == "new":
            continue

        rest = tokens[index + 1 :]
        # "AMERICAN EAGLE OUTFITTERS CANADA", "PVH CANADA, INC" — the country
        # ends the name, give or take a legal suffix.
        if all(word in _SUFFIXES for word in rest):
            return code
        # "SML CANADA ACQUISITION CORP".
        if rest and rest[0] in _ARM_FOLLOWERS:
            return code

    return None


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
