"""Pairwise story signals (Phase 16).

Plan weights as the starting point — explicitly provisional and tuned
against the committed benchmark, never treated as permanent truth:
entity overlap 30%, event match 20%, headline similarity 20%,
location match 15%, category match 10%, temporal proximity 5%.
Shared distinctive numbers add a small bonus on top.
"""

import re
from datetime import datetime, timezone

from dedup import cosine_similarity

# Provisional, benchmark-tuned. Retune with evidence, not instinct.
WEIGHTS = {
    "entity": 0.30,
    "event": 0.20,
    "headline": 0.20,
    "location": 0.15,
    "category": 0.10,
    "temporal": 0.05,
}
NUMBER_BONUS = 0.05
CLUSTER_THRESHOLD = 0.60
TIME_WINDOW_HOURS = 168.0

_NUMBER_RE = re.compile(r"\d[\d,]*")

# Devanagari and Arabic-Indic digits fold to ASCII: ७५० and 750 are the
# same fact in different scripts (Phase 17).
_DIGIT_FOLD = str.maketrans(
    "०१२३४५६७८९٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789",
)


def _parse_time(value: str | None) -> float | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.timestamp()
    except ValueError:
        return None


def _dice(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return 2 * len(a & b) / (len(a) + len(b))


def numbers(text: str) -> set[str]:
    """Normalized digit sequences (commas stripped, scripts folded)."""
    folded = (text or "").translate(_DIGIT_FOLD)
    return {m.group(0).replace(",", "") for m in _NUMBER_RE.finditer(folded)}


def headline_similarity(a: str, b: str) -> float:
    return cosine_similarity(a or "", b or "")


def pair_score(left: dict, right: dict) -> tuple[float, dict]:
    """Cluster affinity in [0, 1] plus per-signal breakdown for evidence."""
    left_entities = set(left.get("entities") or [])
    right_entities = set(right.get("entities") or [])
    left_places = set(left.get("districts") or [])
    right_places = set(right.get("districts") or [])

    entity = _dice(left_entities, right_entities)

    left_event, right_event = left.get("event_type"), right.get("event_type")
    if left_event and right_event:
        event = 1.0 if left_event == right_event else 0.0
    else:
        event = 0.3

    headline = headline_similarity(left.get("headline"), right.get("headline"))

    left_cat, right_cat = left.get("primary_category"), right.get("primary_category")
    if left_cat and right_cat:
        category = 1.0 if left_cat == right_cat else 0.0
    else:
        category = 0.3

    location = _dice(left_places, right_places)

    left_t, right_t = _parse_time(left.get("published_at")), _parse_time(right.get("published_at"))
    if left_t is None or right_t is None:
        temporal = 0.3
    else:
        hours = abs(left_t - right_t) / 3600.0
        temporal = max(0.0, 1.0 - hours / TIME_WINDOW_HOURS)

    breakdown = {
        "entity": round(entity, 3),
        "event": event,
        "headline": round(headline, 3),
        "location": round(location, 3),
        "category": category,
        "temporal": round(temporal, 3),
    }
    score = (
        WEIGHTS["entity"] * entity
        + WEIGHTS["event"] * event
        + WEIGHTS["headline"] * headline
        + WEIGHTS["location"] * location
        + WEIGHTS["category"] * category
        + WEIGHTS["temporal"] * temporal
    )
    shared_numbers = numbers(f'{left.get("headline", "")} {left.get("body", "")}') & numbers(
        f'{right.get("headline", "")} {right.get("body", "")}'
    )
    if shared_numbers:
        score += NUMBER_BONUS
        breakdown["numbers"] = sorted(shared_numbers)[:5]
    if left_places and right_places and not (left_places & right_places):
        # Specified but disjoint districts: usually different developments
        # (Patna robbery vs Gaya robbery). State-level stories carry
        # empty districts and never trip this.
        score -= 0.25
        breakdown["district-mismatch"] = -0.25
    return round(max(0.0, min(1.0, score)), 3), breakdown
