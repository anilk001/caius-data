"""
Split a combined US address string into street / city / state / postcode.

Why this exists
---------------
19 CFR 103.31(e)(3) gives "Consignee address" as a single field — there are no
separate city or state elements in the public manifest feed, and providers
resell it as it arrives. Caius Data needs them apart for three reasons:

  * the search dashboard has a US State filter
  * the results table shows "City, State" as Location
  * city and state are part of the key that merges one company's rows together

That last one matters most. Without a city and state, "ACME IMPORTS" in
Los Angeles and "ACME IMPORTS" in Newark are the same grouping key, and two
different buyers get welded into one row with a nonsense shipment count.

Approach
--------
Anchor on the postcode, work leftwards. US addresses in manifest data are
written a dozen ways but nearly always end
`... <city> <STATE> <ZIP>`, with commas optional and inconsistent.

Returns None for any part it cannot read. A wrong city is worse than a blank
one: it splits a company in two, or merges two companies into one.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

STATE_CODES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN",
    "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH",
    "NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT",
    "VT","VA","WA","WV","WI","WY","PR","VI","GU","AS","MP",
}

STATE_NAMES = {
    "alabama":"AL","alaska":"AK","arizona":"AZ","arkansas":"AR","california":"CA",
    "colorado":"CO","connecticut":"CT","delaware":"DE","district of columbia":"DC",
    "florida":"FL","georgia":"GA","hawaii":"HI","idaho":"ID","illinois":"IL",
    "indiana":"IN","iowa":"IA","kansas":"KS","kentucky":"KY","louisiana":"LA",
    "maine":"ME","maryland":"MD","massachusetts":"MA","michigan":"MI",
    "minnesota":"MN","mississippi":"MS","missouri":"MO","montana":"MT",
    "nebraska":"NE","nevada":"NV","new hampshire":"NH","new jersey":"NJ",
    "new mexico":"NM","new york":"NY","north carolina":"NC","north dakota":"ND",
    "ohio":"OH","oklahoma":"OK","oregon":"OR","pennsylvania":"PA",
    "rhode island":"RI","south carolina":"SC","south dakota":"SD",
    "tennessee":"TN","texas":"TX","utah":"UT","vermont":"VT","virginia":"VA",
    "washington":"WA","west virginia":"WV","wisconsin":"WI","wyoming":"WY",
    "puerto rico":"PR",
}

# Country noise that trails manifest addresses: "UNITEDSTATES", "US", "U.S.A."
_COUNTRY_NOISE = re.compile(
    r"[,\s]*(united\s*states(\s*of\s*america)?|unitedstates|u\.?s\.?a\.?|u\.?s\.?)\s*$",
    re.I,
)
_ZIP = re.compile(r"\b(\d{5})(?:-(\d{4}))?\b")
_WS = re.compile(r"\s+")

# Secondary-unit markers. A city is never "Ste 118H".
_UNIT = re.compile(
    r"^(ste|suite|apt|apartment|unit|fl|floor|rm|room|bldg|building|#|no|dept|"
    r"po box|p\.?o\.?\s*box)\b",
    re.I,
)


@dataclass
class ParsedAddress:
    street: str | None = None
    city: str | None = None
    state: str | None = None
    postcode: str | None = None
    raw: str = ""

    @property
    def is_usable(self) -> bool:
        """Enough to group a company on and show a location."""
        return bool(self.city and self.state)


def _clean(text: str) -> str:
    return _WS.sub(" ", text.replace("\n", " ")).strip(" ,;")


def parse_us_address(raw: str | None) -> ParsedAddress:
    if not raw:
        return ParsedAddress(raw="")

    original = str(raw)
    text = _clean(original)
    if not text:
        return ParsedAddress(raw=original)

    # Strip a trailing country before anything else, so it is never read as a city.
    text = _clean(_COUNTRY_NOISE.sub("", text))

    postcode = None
    zip_match = None
    # Keep the LAST 5-digit run, and never the first token: "47548 HALYARD
    # DRIVE" opens with a house number, not a postcode.
    for candidate_zip in _ZIP.finditer(text):
        if candidate_zip.start() == 0:
            continue
        zip_match = candidate_zip
    if zip_match:
        postcode = zip_match.group(1)
        if zip_match.group(2):
            postcode = f"{postcode}-{zip_match.group(2)}"
        # Everything after the postcode is trailing noise.
        text = _clean(text[: zip_match.start()] + " " + text[zip_match.end():])
        text = _clean(_COUNTRY_NOISE.sub("", text))

    state = None
    # Commas are the strongest signal when present.
    parts = [p for p in (_clean(p) for p in text.split(",")) if p]

    state, parts = _extract_state(parts)
    if state is None:
        # No commas, or state not in its own field: fall back to trailing tokens.
        state, parts = _extract_state_from_tail(text)

    city = None
    street = None
    if parts:
        # The field immediately before the state is the city.
        candidate = parts[-1]
        if len(parts) >= 2 and not _UNIT.match(candidate) and not candidate.isdigit():
            city = _titleise(candidate)
            street = _clean(", ".join(parts[:-1])) or None
        elif len(parts) == 1:
            if state:
                if _looks_like_street(candidate):
                    # "490 CHADBOURNE RD A100 FAIRFIELD" — street and city in
                    # one field, which is how most manifest addresses arrive.
                    street, city = _split_street_and_city(candidate)
                else:
                    city, street = _titleise(candidate), None
            else:
                street = _titleise(candidate)
        else:
            street = _clean(", ".join(parts)) or None

    return ParsedAddress(
        street=street or None,
        city=city or None,
        state=state,
        postcode=postcode,
        raw=original,
    )


def _extract_state(parts: list[str]) -> tuple[str | None, list[str]]:
    """Pull a state out of comma-separated fields, right to left."""
    for i in range(len(parts) - 1, -1, -1):
        code = _as_state(parts[i])
        if code:
            return code, parts[:i]
    return None, parts


def _extract_state_from_tail(text: str) -> tuple[str | None, list[str]]:
    """No usable commas — try the last one or two words."""
    tokens = text.split()
    if not tokens:
        return None, []

    # Two-word states first: "NEW YORK", "NORTH CAROLINA".
    if len(tokens) >= 2:
        code = _as_state(" ".join(tokens[-2:]))
        if code:
            return code, [" ".join(tokens[:-2])] if tokens[:-2] else []

    code = _as_state(tokens[-1])
    if code:
        remainder = tokens[:-1]
        if not remainder:
            return code, []
        # Hand the whole remainder back as ONE field. Guessing the city
        # boundary here turns "LOS ANGELES" into "Angeles"; the street-suffix
        # split does it properly.
        return code, [" ".join(remainder)]

    return None, [text]


def _as_state(value: str) -> str | None:
    v = _clean(value).strip(".")
    if not v:
        return None
    if len(v) == 2 and v.upper() in STATE_CODES:
        return v.upper()
    return STATE_NAMES.get(v.lower())


# Street-type tokens. Whatever follows the last one is the city, once any
# secondary unit has been discarded.
_DIRECTIONALS = {"N", "S", "E", "W", "NE", "NW", "SE", "SW"}

_STREET_SUFFIX = {
    "rd", "road", "st", "street", "ave", "avenue", "blvd", "boulevard",
    "ln", "lane", "dr", "drive", "ct", "court", "pl", "place", "way",
    "pkwy", "parkway", "hwy", "highway", "cir", "circle", "ter", "terrace",
    "tpke", "turnpike", "sq", "square", "trl", "trail", "loop", "run", "row",
}


def _is_unit_token(token: str) -> bool:
    """Secondary-unit debris: 'STE', '118H', 'A100', '#4', a bare letter."""
    t = token.strip("#.,").lower()
    if not t:
        return True
    if _UNIT.match(t):
        return True
    if len(t) == 1:
        return True
    # Mixed letters and digits with no vowel is a unit, not a place name.
    if any(c.isdigit() for c in t) and any(c.isalpha() for c in t):
        return True
    return t.isdigit()


def _split_street_and_city(value: str) -> tuple[str | None, str | None]:
    """Split one field holding both a street address and a city."""
    tokens = _clean(value).split()
    last_suffix = None
    for i, tok in enumerate(tokens):
        if tok.strip(".,").lower() in _STREET_SUFFIX:
            last_suffix = i

    if last_suffix is None or last_suffix == len(tokens) - 1:
        return _titleise(value), None

    tail = tokens[last_suffix + 1:]
    # Drop unit debris and the directional that belongs to the street:
    # "NEW YORK AVE NW WASHINGTON" is Washington, not NW Washington.
    #
    # This does clip genuine directionals in city names — West Palm Beach
    # becomes Palm Beach. That is an acceptable trade, because grouping cares
    # far more about every row for one company parsing IDENTICALLY than about
    # the label being perfect. An inconsistent city splits a company in two;
    # a consistently-shortened one does not.
    while tail and (_is_unit_token(tail[0]) or tail[0].strip(".,").upper() in _DIRECTIONALS):
        tail.pop(0)

    if not tail:
        return _titleise(value), None

    street = " ".join(tokens[: len(tokens) - len(tail)])
    return _titleise(street), _titleise(" ".join(tail))


def _looks_like_street(value: str) -> bool:
    return bool(re.match(r"^\d", value.strip())) or bool(_UNIT.match(value))


def _titleise(value: str) -> str:
    """
    Normalise casing so one company's rows group together.

    Manifest addresses arrive SHOUTED, lowercased, or mixed depending on who
    filed them. All-upper and all-lower are both normalised; genuinely mixed
    case is left alone, because someone typed it deliberately.
    """
    v = _clean(value)
    if not (v.isupper() or v.islower()):
        return v
    out = []
    for word in v.split():
        if word in {"NE", "NW", "SE", "SW", "N", "S", "E", "W"}:
            out.append(word)
        elif len(word) <= 3 and not any(c in "aeiouAEIOU" for c in word):
            out.append(word.upper())
        else:
            out.append(word.capitalize())
    return " ".join(out)
