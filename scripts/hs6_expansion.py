"""
Expand an HS4 heading into the HS6 subheadings beneath it.

Why this exists
---------------
Caius Data sells at HS4: a pack is "the top N US importers of HS 6204". That is
also how exporters search — nobody googles "620442 importers".

Data vendors query at HS6 or finer. billofladingdata.com rejects anything
shorter than six digits, so "give me HS 6204" has to become "give me these 25
subheadings", and the results are rolled back up to 6204 on the way in.

The six-digit level is the international standard under the WCO Harmonized
System, identical across countries. Digits 7-10 are national (the US HTS adds
its own), which is why the vendor's rows carried both 620462 and 6204522070 —
truncating either to four gives 6204.

Coverage is the five launch sectors. An HS4 with no entry falls back to
querying the HS4 itself, which works for vendors that accept it.
"""

from __future__ import annotations

# HS4 -> the HS6 subheadings beneath it, with what each covers.
HS6_SUBHEADINGS: dict[str, dict[str, str]] = {
    # --- Women's woven outerwear (the flagship niche) ----------------------
    "6204": {
        "620411": "Women's suits, wool",
        "620412": "Women's suits, cotton",
        "620413": "Women's suits, synthetic fibres",
        "620419": "Women's suits, other textiles",
        "620421": "Women's ensembles, wool",
        "620422": "Women's ensembles, cotton",
        "620423": "Women's ensembles, synthetic fibres",
        "620429": "Women's ensembles, other textiles",
        "620431": "Women's jackets/blazers, wool",
        "620432": "Women's jackets/blazers, cotton",
        "620433": "Women's jackets/blazers, synthetic fibres",
        "620439": "Women's jackets/blazers, other textiles",
        "620441": "Women's dresses, wool",
        "620442": "Women's dresses, cotton",
        "620443": "Women's dresses, synthetic fibres",
        "620444": "Women's dresses, artificial fibres",
        "620449": "Women's dresses, other textiles",
        "620451": "Women's skirts, wool",
        "620452": "Women's skirts, cotton",
        "620453": "Women's skirts, synthetic fibres",
        "620459": "Women's skirts, other textiles",
        "620461": "Women's trousers/shorts, wool",
        "620462": "Women's trousers/shorts, cotton",
        "620463": "Women's trousers/shorts, synthetic fibres",
        "620469": "Women's trousers/shorts, other textiles",
    },
    "6203": {
        "620311": "Men's suits, wool",
        "620312": "Men's suits, synthetic fibres",
        "620319": "Men's suits, other textiles",
        "620322": "Men's ensembles, cotton",
        "620323": "Men's ensembles, synthetic fibres",
        "620329": "Men's ensembles, other textiles",
        "620331": "Men's jackets/blazers, wool",
        "620332": "Men's jackets/blazers, cotton",
        "620333": "Men's jackets/blazers, synthetic fibres",
        "620339": "Men's jackets/blazers, other textiles",
        "620341": "Men's trousers/shorts, wool",
        "620342": "Men's trousers/shorts, cotton",
        "620343": "Men's trousers/shorts, synthetic fibres",
        "620349": "Men's trousers/shorts, other textiles",
    },
    "6109": {
        "610910": "T-shirts/singlets, cotton, knitted",
        "610990": "T-shirts/singlets, other textiles, knitted",
    },
    "6110": {
        "611011": "Jerseys/pullovers, wool",
        "611012": "Jerseys/pullovers, Kashmir goats",
        "611019": "Jerseys/pullovers, other fine animal hair",
        "611020": "Jerseys/pullovers, cotton",
        "611030": "Jerseys/pullovers, man-made fibres",
        "611090": "Jerseys/pullovers, other textiles",
    },
    "6302": {
        "630210": "Bed linen, knitted or crocheted",
        "630221": "Bed linen, printed cotton",
        "630222": "Bed linen, printed man-made fibres",
        "630229": "Bed linen, printed other textiles",
        "630231": "Bed linen, cotton, other",
        "630232": "Bed linen, man-made fibres, other",
        "630239": "Bed linen, other textiles",
        "630240": "Table linen, knitted or crocheted",
        "630251": "Table linen, cotton",
        "630253": "Table linen, man-made fibres",
        "630260": "Toilet/kitchen linen, terry cotton",
        "630291": "Toilet/kitchen linen, cotton, other",
    },
    # --- Spices ------------------------------------------------------------
    "0910": {
        "091011": "Ginger, neither crushed nor ground",
        "091012": "Ginger, crushed or ground",
        "091020": "Saffron",
        "091030": "Turmeric (curcuma)",
        "091091": "Mixtures of spices",
        "091099": "Other spices",
    },
    "0904": {
        "090411": "Pepper, neither crushed nor ground",
        "090412": "Pepper, crushed or ground",
        "090421": "Capsicum/pimenta, dried, not crushed",
        "090422": "Capsicum/pimenta, crushed or ground",
    },
    "0909": {
        "090921": "Coriander seeds, not crushed",
        "090922": "Coriander seeds, crushed or ground",
        "090931": "Cumin seeds, not crushed",
        "090932": "Cumin seeds, crushed or ground",
        "090961": "Anise/fennel/caraway seeds, not crushed",
        "090962": "Anise/fennel/caraway seeds, crushed or ground",
    },
    "0801": {
        "080111": "Coconuts, desiccated",
        "080112": "Coconuts, in the inner shell",
        "080119": "Coconuts, other",
        "080131": "Cashew nuts, in shell",
        "080132": "Cashew nuts, shelled",
    },
    # --- Gems and jewellery -------------------------------------------------
    "7113": {
        "711311": "Jewellery of silver",
        "711319": "Jewellery of other precious metal",
        "711320": "Jewellery of base metal clad with precious metal",
    },
    "7102": {
        "710210": "Diamonds, unsorted",
        "710221": "Industrial diamonds, unworked",
        "710229": "Industrial diamonds, other",
        "710231": "Non-industrial diamonds, unworked",
        "710239": "Non-industrial diamonds, other",
    },
    "7117": {
        "711711": "Imitation jewellery, cuff links/studs, base metal",
        "711719": "Imitation jewellery, other, base metal",
        "711790": "Imitation jewellery, other",
    },
    # --- Electronics --------------------------------------------------------
    "8541": {
        "854110": "Diodes, other than photosensitive/LED",
        "854121": "Transistors, dissipation under 1 W",
        "854129": "Transistors, other",
        "854130": "Thyristors, diacs and triacs",
        "854141": "Light-emitting diodes (LED)",
        "854149": "Photosensitive semiconductor devices, other",
        "854151": "Semiconductor-based transducers",
        "854159": "Other semiconductor devices",
        "854190": "Parts of semiconductor devices",
    },
    "8544": {
        "854411": "Winding wire, copper",
        "854419": "Winding wire, other",
        "854420": "Coaxial cable",
        "854442": "Electric conductors fitted with connectors",
        "854449": "Electric conductors, other",
        "854460": "Electric conductors over 1000 V",
        "854470": "Optical fibre cables",
    },
    "8517": {
        "851713": "Smartphones",
        "851714": "Other telephones for cellular networks",
        "851718": "Other telephone sets",
        "851761": "Base stations",
        "851762": "Apparatus for reception/transmission of data",
        "851769": "Other communication apparatus",
        "851771": "Aerials and aerial reflectors",
        "851779": "Other parts",
    },
    # --- Chemicals and pharma ------------------------------------------------
    "2933": {
        "293311": "Phenazone and derivatives",
        "293319": "Other pyrazole-ring compounds",
        "293321": "Hydantoin and derivatives",
        "293329": "Other imidazole-ring compounds",
        "293331": "Pyridine and its salts",
        "293339": "Other pyridine-ring compounds",
        "293341": "Levorphanol and salts",
        "293349": "Other quinoline/isoquinoline compounds",
        "293352": "Malonylurea and salts",
        "293359": "Other pyrimidine-ring compounds",
        "293361": "Melamine",
        "293369": "Other triazine-ring compounds",
        "293371": "6-Hexanelactam (epsilon-caprolactam)",
        "293379": "Other lactams",
        "293391": "Alprazolam, diazepam and similar",
        "293399": "Other heterocyclic nitrogen compounds",
    },
    "3204": {
        "320411": "Disperse dyes and preparations",
        "320412": "Acid dyes and mordant dyes",
        "320413": "Basic dyes and preparations",
        "320414": "Direct dyes and preparations",
        "320415": "Vat dyes and preparations",
        "320416": "Reactive dyes and preparations",
        "320417": "Pigments and preparations",
        "320419": "Other synthetic organic colouring matter",
        "320420": "Synthetic organic fluorescent brighteners",
    },
    "3808": {
        "380852": "DDT, in packings of 300 g or less",
        "380859": "Other goods of subheading note 1",
        "380861": "Goods of subheading note 2, small packings",
        "380862": "Goods of subheading note 2, medium packings",
        "380869": "Goods of subheading note 2, other",
        "380891": "Insecticides, other",
        "380892": "Fungicides, other",
        "380893": "Herbicides and plant-growth regulators",
        "380894": "Disinfectants",
        "380899": "Other pesticide products",
    },
}


def expand_hs4(hs4: str) -> list[str]:
    """
    Every HS6 subheading under an HS4 heading.

    Falls back to the HS4 itself when we have no mapping, which is correct for
    vendors that accept four digits and harmless for those that do not — the
    request simply fails loudly rather than silently returning the wrong goods.
    """
    code = str(hs4).strip()
    return sorted(HS6_SUBHEADINGS.get(code, {})) or [code]


def describe(hs6: str) -> str | None:
    """What a six-digit subheading covers."""
    code = str(hs6).strip()
    parent = code[:4]
    return HS6_SUBHEADINGS.get(parent, {}).get(code)


def to_hs4(code: str | None) -> str | None:
    """Truncate any HS code to its four-digit heading."""
    if not code:
        return None
    digits = "".join(c for c in str(code) if c.isdigit())
    return digits[:4] if len(digits) >= 4 else None


def covered_hs4() -> list[str]:
    return sorted(HS6_SUBHEADINGS)
