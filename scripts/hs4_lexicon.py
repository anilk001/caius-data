"""
Keyword lexicon mapping manifest goods descriptions to HS4 codes.

Why this exists
---------------
19 CFR 103.31(e)(3) lists the 22 data elements CBP releases from the public
vessel manifest feed. An HS code is not among them — the source gives
"Description of goods" as free text and nothing else. Every provider reselling
this data has the same limitation, so an HS4 code on a manifest row is always
*derived*, never declared.

Caius Data is organised around HS4, so we derive it here — and label it as
derived everywhere it surfaces.

Design
------
Deterministic keyword matching, not a model. Manifest data runs to millions of
rows; per-row inference would cost more than the data. Rules are also auditable:
when a buyer disputes a classification we can point at the exact term that
matched.

Each entry is (hs4, weight, term). Longer, more specific phrases carry more
weight than bare words, because "dress" alone is weak evidence and "womens
woven dress" is strong. `NEGATIVE_TERMS` suppress the common false friends —
a "sofa cover" is a furnishing article, not a sofa.
"""

from __future__ import annotations

# (hs4, weight, phrase). Weight 3 = decisive, 2 = strong, 1 = weak supporting.
LEXICON: list[tuple[str, int, str]] = [
    # --- Garments, woven (Ch 62) ------------------------------------------
    ("6204", 3, "womens woven dress"), ("6204", 3, "ladies woven dress"),
    ("6204", 3, "womens suit"), ("6204", 3, "ladies suit"),
    ("6204", 2, "womens dress"), ("6204", 2, "ladies dress"),
    ("6204", 2, "womens skirt"), ("6204", 2, "ladies skirt"),
    ("6204", 2, "womens trouser"), ("6204", 2, "womens jacket"),
    ("6204", 2, "girls dress"), ("6204", 1, "dress"),
    ("6203", 3, "mens woven suit"), ("6203", 2, "mens suit"),
    ("6203", 2, "mens trouser"), ("6203", 2, "mens jacket"),
    ("6203", 2, "mens blazer"), ("6203", 2, "boys trouser"),
    ("6205", 2, "mens shirt"), ("6205", 2, "boys shirt"),
    ("6206", 2, "womens blouse"), ("6206", 2, "ladies blouse"),
    ("6206", 2, "womens shirt"),
    # --- Garments, knitted (Ch 61) ----------------------------------------
    ("6109", 3, "t-shirt"), ("6109", 3, "tshirt"), ("6109", 3, "t shirt"),
    ("6109", 2, "singlet"), ("6109", 2, "tank top"), ("6109", 2, "vest knitted"),
    ("6110", 3, "pullover"), ("6110", 3, "cardigan"), ("6110", 2, "sweater"),
    ("6110", 2, "sweatshirt"), ("6110", 2, "jumper"),
    ("6104", 2, "knitted dress"), ("6104", 2, "knit dress"),
    ("6115", 2, "pantyhose"), ("6115", 2, "sock"), ("6115", 2, "stocking"),
    # --- Home textiles ------------------------------------------------------
    ("6302", 3, "bed linen"), ("6302", 3, "bedsheet"), ("6302", 3, "bed sheet"),
    ("6302", 2, "table linen"), ("6302", 2, "towel"), ("6302", 2, "pillowcase"),
    ("6302", 2, "duvet cover"), ("6302", 2, "kitchen linen"),
    ("6304", 2, "cushion cover"), ("6304", 2, "curtain"),
    ("5208", 2, "woven cotton fabric"), ("5208", 2, "cotton fabric"),
    ("5701", 2, "hand knotted carpet"), ("5702", 2, "woven carpet"),
    ("5703", 3, "tufted carpet"), ("5703", 2, "area rug"), ("5703", 1, "rug"),
    # --- Spices & nuts (Ch 08/09) -------------------------------------------
    ("0904", 3, "black pepper"), ("0904", 3, "chilli"), ("0904", 3, "chili"),
    ("0904", 2, "paprika"), ("0904", 2, "capsicum"), ("0904", 2, "peppercorn"),
    ("0909", 3, "cumin"), ("0909", 3, "coriander seed"), ("0909", 3, "fennel seed"),
    ("0909", 2, "caraway"), ("0909", 2, "anise"),
    ("0910", 3, "turmeric"), ("0910", 3, "curry powder"), ("0910", 3, "curry spice"),
    ("0910", 2, "ginger"), ("0910", 2, "saffron"), ("0910", 2, "masala"),
    ("0908", 3, "cardamom"), ("0908", 2, "nutmeg"), ("0908", 2, "mace"),
    ("0906", 3, "cinnamon"), ("0906", 2, "cassia"),
    ("0907", 3, "clove"),
    ("0801", 3, "cashew"), ("0801", 2, "coconut"), ("0801", 2, "brazil nut"),
    ("0802", 2, "almond"), ("0802", 2, "walnut"), ("0802", 2, "pistachio"),
    ("0902", 3, "black tea"), ("0902", 2, "green tea"),
    ("0901", 3, "coffee bean"), ("0901", 2, "roasted coffee"),
    ("1006", 3, "basmati rice"), ("1006", 2, "rice"),
    # --- Gems & jewellery (Ch 71) -------------------------------------------
    ("7102", 3, "diamond"), ("7102", 2, "rough diamond"),
    ("7103", 2, "precious stone"), ("7103", 2, "semi precious stone"),
    ("7103", 2, "gemstone"), ("7103", 2, "ruby"), ("7103", 2, "sapphire"),
    ("7113", 3, "gold jewellery"), ("7113", 3, "gold jewelry"),
    ("7113", 3, "silver jewellery"), ("7113", 3, "silver jewelry"),
    ("7113", 2, "precious metal jewel"),
    ("7117", 3, "imitation jewellery"), ("7117", 3, "imitation jewelry"),
    ("7117", 2, "fashion jewellery"), ("7117", 2, "costume jewelry"),
    ("7116", 2, "pearl article"),
    # Stones MOUNTED in an article are classified with the article (7113),
    # not as loose stones (7102). Without these the two codes tie and we abstain.
    ("7113", 3, "jewellery set with diamond"), ("7113", 3, "jewelry set with diamond"),
    ("7113", 3, "diamond jewellery"), ("7113", 3, "diamond jewelry"),
    ("7113", 3, "studded jewellery"), ("7113", 3, "gold ornament"),
    # --- Electronics (Ch 85) -------------------------------------------------
    ("8517", 3, "cellular phone"), ("8517", 3, "smartphone"),
    ("8517", 2, "telephone"), ("8517", 2, "router"), ("8517", 2, "network switch"),
    ("8536", 3, "circuit breaker"), ("8536", 2, "electrical switch"),
    ("8536", 2, "relay"), ("8536", 2, "connector"), ("8536", 2, "terminal block"),
    ("8541", 3, "semiconductor"), ("8541", 3, "led module"), ("8541", 3, "led driver"),
    ("8541", 2, "diode"), ("8541", 2, "transistor"), ("8541", 2, "led light"),
    ("8544", 3, "insulated wire"), ("8544", 2, "electric cable"),
    ("8544", 2, "wiring harness"), ("8544", 2, "power cord"),
    ("8504", 3, "transformer"), ("8504", 2, "power supply"), ("8504", 2, "inverter"),
    ("8507", 3, "lithium battery"), ("8507", 2, "battery"), ("8507", 2, "accumulator"),
    ("8414", 3, "ceiling fan"), ("8414", 2, "air compressor"),
    ("8414", 2, "exhaust fan"), ("8414", 2, "vacuum pump"),
    ("8471", 3, "laptop computer"), ("8471", 2, "computer"), ("8471", 2, "keyboard"),
    # --- Chemicals & pharma (Ch 28-38) ---------------------------------------
    ("2933", 3, "heterocyclic compound"), ("2933", 2, "active pharmaceutical"),
    ("2933", 2, "api pharmaceutical"),
    ("2941", 3, "antibiotic"), ("2941", 2, "amoxicillin"), ("2941", 2, "penicillin"),
    ("2942", 2, "organic compound"),
    ("3204", 3, "synthetic organic dye"), ("3204", 2, "reactive dye"),
    ("3204", 2, "disperse dye"), ("3204", 2, "pigment dye"),
    ("3808", 3, "insecticide"), ("3808", 3, "pesticide"), ("3808", 2, "herbicide"),
    ("3808", 2, "fungicide"), ("3808", 2, "agrochemical"),
    ("3824", 2, "chemical preparation"),
    ("3004", 3, "pharmaceutical tablet"), ("3004", 2, "medicament"),
    # --- Furniture & houseware (common in real manifests) --------------------
    ("9401", 3, "office chair"), ("9401", 3, "sofa"), ("9401", 2, "seat"),
    ("9401", 2, "armchair"), ("9401", 2, "recliner"),
    ("9403", 3, "storage box"), ("9403", 2, "cabinet"), ("9403", 2, "bookshelf"),
    ("9403", 2, "wardrobe"), ("9403", 2, "shelving"), ("9403", 2, "desk"),
    ("9404", 3, "mattress"), ("9404", 2, "duvet"), ("9404", 2, "pillow"),
    ("3924", 3, "plastic tableware"), ("3924", 2, "plastic kitchenware"),
    ("3924", 2, "plastic storage"),
    ("7323", 2, "stainless steel cookware"), ("7323", 2, "kitchen utensil"),
    ("9617", 3, "vacuum flask"), ("9617", 3, "thermos"), ("9617", 2, "vacuum cup"),
    ("4202", 3, "handbag"), ("4202", 2, "suitcase"), ("4202", 2, "backpack"),
    ("6403", 3, "leather footwear"), ("6403", 2, "leather shoe"),
    ("6404", 2, "textile footwear"), ("6404", 2, "sneaker"),
]

# Terms that, when present, veto an otherwise-matching HS4. These are the
# false friends that a bare keyword match gets wrong.
NEGATIVE_TERMS: dict[str, tuple[str, ...]] = {
    "9401": ("cover", "slipcover", "cushion only", "part", "leg", "frame only"),
    "5703": ("underlay", "gripper", "cleaner"),
    "0910": ("flavoured drink", "candy", "tea bag"),
    "8507": ("charger", "holder", "case"),
    "7113": ("box", "display", "packaging", "imitation"),
    "6109": ("printing machine", "press"),
    "8414": ("blade only", "part", "motor only"),
}

# Gender markers. A consignment described as covering both men's and women's
# apparel cannot honestly be filed under either gender's HS4, so we abstain
# rather than pick one — see AMBIGUOUS_GENDER_CODES in the classifier.
MENS_MARKERS = ("mens", "men", "boys", "boy", "gents", "gentlemens")
WOMENS_MARKERS = ("womens", "women", "ladies", "lady", "girls", "girl")

# HS4 codes whose definition turns on the wearer's gender.
GENDERED_CODES = frozenset({"6203", "6204", "6205", "6206", "6103", "6104"})

# Chapter-level fallback when nothing specific matches but the chapter is clear.
# Deliberately NOT used to assign an HS4 — only to report a likely sector.
CHAPTER_HINTS: dict[str, tuple[str, ...]] = {
    "62": ("apparel", "garment", "clothing", "woven"),
    "61": ("knitted", "knitwear"),
    "09": ("spice", "seasoning"),
    "71": ("jewellery", "jewelry", "ornament"),
    "85": ("electrical", "electronic"),
    "29": ("chemical", "pharmaceutical"),
}
