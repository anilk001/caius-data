"""
Derive an HS4 code from a manifest goods description.

The public CBP vessel manifest feed carries no tariff classification — see
19 CFR 103.31(e)(3) — so an HS4 code on a manifest row is always inferred from
free text. This module does that inference and reports how confident it is.

The governing rule is: **never guess**. A wrong HS4 sells a buyer the wrong
companies, and they will notice. Below the confidence floor the answer is None,
and the row is sold by keyword rather than by code.

Usage
-----
    from hs4_classifier import classify_hs4
    result = classify_hs4("WOMENS COTTON WOVEN DRESSES")
    result.hs4          -> "6204"
    result.confidence   -> 0.86
    result.matched      -> ["womens woven dress", "dress"]
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from hs4_lexicon import (
    CHAPTER_HINTS,
    GENDERED_CODES,
    LEXICON,
    MENS_MARKERS,
    NEGATIVE_TERMS,
    WOMENS_MARKERS,
)

# Below this, we report no code rather than a doubtful one.
MIN_CONFIDENCE = 0.45

# An unambiguous win needs to beat the runner-up by this ratio, otherwise the
# description is genuinely ambiguous ("mens and ladies shirts") and we abstain.
MIN_MARGIN = 1.25

_PUNCT = re.compile(r"[^a-z0-9\s]+")
_WS = re.compile(r"\s+")

# Some filers do embed a code in the description: "HS: 6204.42" or "HTS 620442".
_EMBEDDED_HS = re.compile(
    r"\b(?:hs|hts|htsus|tariff)\s*(?:code)?\s*[:.\-#]?\s*(\d{4})(?:[.\s]?\d{2,6})?\b"
)


@dataclass
class Classification:
    hs4: str | None
    confidence: float
    matched: list[str] = field(default_factory=list)
    source: str = "derived"          # "declared" | "derived" | "none"
    sector_hint: str | None = None   # 2-digit chapter when HS4 is unclear
    runner_up: str | None = None

    @property
    def is_confident(self) -> bool:
        return self.hs4 is not None and self.confidence >= MIN_CONFIDENCE


def normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    return _WS.sub(" ", _PUNCT.sub(" ", str(text).lower())).strip()


def classify_hs4(description: str | None) -> Classification:
    """Infer an HS4 code from a goods description."""
    if not description:
        return Classification(None, 0.0, source="none")

    raw = str(description)
    text = normalize(raw)
    if not text:
        return Classification(None, 0.0, source="none")

    # A code the filer typed into the description beats any inference we make.
    embedded = _EMBEDDED_HS.search(text)
    if embedded:
        return Classification(
            hs4=embedded.group(1),
            confidence=1.0,
            matched=[embedded.group(0).strip()],
            source="declared",
        )

    tokens = text.split()
    scores: dict[str, float] = {}
    hits: dict[str, list[str]] = {}

    for hs4, weight, term in LEXICON:
        score = _term_score(term, text, tokens, weight)
        if score:
            scores[hs4] = scores.get(hs4, 0.0) + score
            hits.setdefault(hs4, []).append(term)

    # Veto false friends: "sofa cover" is not a sofa.
    for hs4 in list(scores):
        vetoes = NEGATIVE_TERMS.get(hs4, ())
        if any(v in text for v in vetoes):
            del scores[hs4]
            hits.pop(hs4, None)

    if not scores:
        return Classification(
            None, 0.0, source="none", sector_hint=_sector_hint(text)
        )

    # A description naming both genders ("MENS AND LADIES SHIRTS") spans two
    # HS4 codes. Filing it under one would sell a buyer half the market and
    # call it the whole thing, so drop the gendered candidates entirely.
    if _is_mixed_gender(tokens):
        for hs4 in list(scores):
            if hs4 in GENDERED_CODES:
                del scores[hs4]
                hits.pop(hs4, None)
        if not scores:
            return Classification(
                None, 0.0, source="none", sector_hint=_sector_hint(text)
            )

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best_code, best_score = ranked[0]
    runner_code, runner_score = ranked[1] if len(ranked) > 1 else (None, 0)

    # Confidence blends absolute evidence with how clearly it beat the field.
    # A score of 3 (one decisive phrase) with no rival lands around 0.8.
    strength = min(best_score / 4.0, 1.0)
    margin = 1.0 if not runner_score else min(best_score / max(runner_score, 0.1) / 2.0, 1.0)
    confidence = round(0.55 * strength + 0.45 * margin, 3)

    # Two codes neck and neck means the description genuinely covers both.
    if runner_score and best_score / max(runner_score, 0.1) < MIN_MARGIN:
        return Classification(
            hs4=None,
            confidence=confidence,
            matched=sorted(set(hits.get(best_code, []))),
            source="none",
            sector_hint=_sector_hint(text),
            runner_up=runner_code,
        )

    if confidence < MIN_CONFIDENCE:
        return Classification(
            hs4=None,
            confidence=confidence,
            matched=sorted(set(hits.get(best_code, []))),
            source="none",
            sector_hint=_sector_hint(text),
        )

    return Classification(
        hs4=best_code,
        confidence=confidence,
        matched=sorted(set(hits.get(best_code, [])), key=len, reverse=True),
        source="derived",
        runner_up=runner_code,
    )


def _is_mixed_gender(tokens: list[str]) -> bool:
    """True when a description names both men's and women's apparel."""
    token_set = set(tokens)
    return bool(token_set & set(MENS_MARKERS)) and bool(token_set & set(WOMENS_MARKERS))


def _inflections(word: str) -> set[str]:
    """
    The word and its common English plurals.

    Manifest descriptions pluralise freely — SUITS, DRESSES, BATTERIES — so
    matching has to cope. An explicit inflection set beats prefix matching,
    which would let "led" hit "ledger" and "sled".
    """
    forms = {word, word + "s", word + "es"}
    if word.endswith("y") and len(word) > 2:
        forms.add(word[:-1] + "ies")       # battery -> batteries
    if word.endswith(("s", "x", "ch", "sh")):
        forms.add(word + "es")             # box -> boxes
    if word.endswith("es") and len(word) > 4:
        forms.add(word[:-2])               # clothes -> cloth
    if word.endswith("s") and len(word) > 3:
        forms.add(word[:-1])               # already plural in the lexicon
    if word.endswith("ies") and len(word) > 4:
        forms.add(word[:-3] + "y")
    return forms


def _token_matches(term_token: str, tokens: list[str]) -> bool:
    """Does this term token, in any common inflection, appear in the text?"""
    return bool(_inflections(term_token) & set(tokens))


def _term_score(term: str, text: str, tokens: list[str], weight: int) -> float:
    """
    Score one lexicon term against a description.

    A contiguous phrase match is the strongest signal. But descriptions
    interleave qualifiers — "WOMENS COTTON WOVEN DRESSES" never contains the
    literal phrase "womens woven dress" — so a term whose every token is
    present still earns most of its weight. Scattered tokens are weaker
    evidence than an exact phrase, hence the discount.
    """
    parts = term.split()

    if len(parts) == 1:
        return float(weight) if _token_matches(term, tokens) else 0.0

    if f" {term} " in f" {text} ":
        return float(weight)

    if all(_token_matches(p, tokens) for p in parts):
        # Longer phrases surviving a scattered match are still specific, so
        # they keep more of their weight than a two-word one would.
        return weight * (0.6 + 0.1 * min(len(parts) - 2, 2))

    return 0.0


def _sector_hint(text: str) -> str | None:
    """Best-effort 2-digit chapter when no HS4 is confident enough."""
    for chapter, terms in CHAPTER_HINTS.items():
        if any(t in text for t in terms):
            return chapter
    return None


def classify_many(descriptions: list[str | None]) -> list[Classification]:
    return [classify_hs4(d) for d in descriptions]
