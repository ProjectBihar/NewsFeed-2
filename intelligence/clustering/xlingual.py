"""Cross-language bridges (Phase 17): Devanagari→Latin transliteration.

No multilingual embeddings — deterministic transliteration plus
approximate matching links पटना मेट्रो to Patna Metro. Mechanical
transliteration keeps schwas (patana), so matching is approximate
(ratio >= 0.8), never exact. Persian-spelling divergences
(Muzaffarpur vs mujappharpur) are a documented limitation for fuzzy
phonetic work, not silent failures: they simply do not bridge.
"""

import re
from difflib import SequenceMatcher

_CONSONANTS = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n",
    "च": "c", "छ": "ch", "ज": "j", "झ": "jh", "ञ": "n",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v",
    "श": "sh", "ष": "sh", "स": "s", "ह": "h",
    "क्ष": "ksh", "त्र": "tr", "ज्ञ": "jn",
    "ड़": "r", "ढ़": "rh",
}
_VOWELS = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
    "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au",
    "अं": "an", "अः": "ah",
}
_SIGNS = {
    "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri",
    "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ं": "n", "ः": "h", "ँ": "n",
}
_VIRAMA = "्"
_NUKTA = "़"
BRIDGE_RATIO = 0.8

_LATIN_NOUN_RE = re.compile(r"[A-Z][a-z]{2,}|[A-Z]{2,}")
_DEVA_WORD_RE = re.compile(r"[\u0900-\u097F]{3,}")


def _hindi_stopwords() -> frozenset[str]:
    from language.profiles import HINDI_FUNCTION_WORDS

    return HINDI_FUNCTION_WORDS


def transliterate(token: str) -> str:
    """Mechanical Devanagari→Latin (schwas kept); lowercase ASCII output."""
    out: list[str] = []
    chars = [c for c in token if c != _NUKTA]
    i = 0
    while i < len(chars):
        ch = chars[i]
        if ch in _CONSONANTS:
            base = _CONSONANTS[ch]
            nxt = chars[i + 1] if i + 1 < len(chars) else ""
            if nxt == _VIRAMA:
                out.append(base)
                i += 2
            elif nxt in _SIGNS:
                out.append(base + _SIGNS[nxt])
                i += 2
            else:
                out.append(base + "a")
                i += 1
        elif ch in _VOWELS:
            out.append(_VOWELS[ch])
            i += 1
        elif ch in _SIGNS:
            out.append(_SIGNS[ch])
            i += 1
        else:
            i += 1
    return "".join(out).lower()


def latin_nouns(text: str) -> set[str]:
    return {m.group(0).lower() for m in _LATIN_NOUN_RE.finditer(text or "")}


def hindi_nouns(text: str) -> set[str]:
    stop = _hindi_stopwords()
    return {
        m.group(0)
        for m in _DEVA_WORD_RE.finditer(text or "")
        if m.group(0) not in stop
    }


def find_bridges(text_a: str, text_b: str) -> list[tuple[str, str, float]]:
    """Symmetric transliteration bridges: (deva token, latin token, ratio)."""
    latin = latin_nouns(text_a) | latin_nouns(text_b)
    deva = hindi_nouns(text_a) | hindi_nouns(text_b)
    bridges = []
    for hi in sorted(deva):
        roman = transliterate(hi)
        if len(roman) < 3:
            continue
        for en in sorted(latin):
            if abs(len(roman) - len(en)) > 3:
                continue
            ratio = SequenceMatcher(None, roman, en).ratio()
            if ratio >= BRIDGE_RATIO:
                bridges.append((hi, en, round(ratio, 3)))
    # One bridge per Devanagari token: keep the strongest match.
    best: dict[str, tuple[str, str, float]] = {}
    for hi, en, ratio in bridges:
        if hi not in best or ratio > best[hi][2]:
            best[hi] = (hi, en, ratio)
    return sorted(best.values())


def bridge_entities(text_a: str, text_b: str) -> set[str]:
    """Shared pseudo-entity ids (xl:slug) both sides earn for scoring."""
    return {f"xl:{en}" for _, en, _ in find_bridges(text_a, text_b)}


def augmented_pair_score(left: dict, right: dict) -> tuple[float, dict]:
    """pair_score with transliteration bridges added to both entity sets.

    Same 0.6 threshold as monolingual scoring: bridges are entity
    evidence, and all other signals (event, category, time, numbers)
    must still agree. Returns (score, breakdown).
    """
    from .scoring import pair_score

    bridges = bridge_entities(
        f"{left.get('headline', '')} {left.get('body', '')}",
        f"{right.get('headline', '')} {right.get('body', '')}",
    )
    enriched_left = dict(left, entities=list(set(left.get("entities") or []) | bridges))
    enriched_right = dict(right, entities=list(set(right.get("entities") or []) | bridges))
    score, breakdown = pair_score(enriched_left, enriched_right)
    if bridges:
        breakdown["bridges"] = sorted(bridges)
    return score, breakdown
