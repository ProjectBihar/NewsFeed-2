"""Canonical story titles (Phase 18): pick the strongest member headline.

Deterministic quality rules, no LLM. An admin override always wins
(persisted by Phase 22; accepted here as input).
"""

from collections import Counter
from dataclasses import asdict, dataclass, field

ACTION_VERBS = frozenset(
    """
    approves approved clears cleared launches launched opens opened
    arrests arrested announces announced collapses collapsed releases
    directs orders sanctions unveils inaugurates releases
    मंजूरी मंजूर जारी गिरफ्तार उद्घाटन ढहा स्वीकृत शुभारंभ
    """.split()
)

CLICKBAIT_MARKERS = [
    "you won't believe", "shocking", "unbelievable", "viral", "watch video",
    "watch:", "see photos", "see pics", "click here", "doctors hate",
    "सनसनीखेज", "अविश्वसनीय", "वायरल", "देखें वीडियो", "हैरान कर देगा",
]

SOURCE_BONUS = {"high": 5, "medium": 2, "low": 0}
CONFIDENCE_BONUS = {"high": 10, "medium": 5, "low": 0}


def _words(text: str) -> list[str]:
    import re

    return re.findall(r"[A-Za-z]+|[\u0900-\u097F]+", (text or "").lower())


def _is_clickbait(headline: str) -> bool:
    text = headline or ""
    if text.isupper() and len(text) > 15:
        return True
    if text.count("!") + text.count("?") >= 3:
        return True
    lowered = text.lower()
    return any(marker in lowered for marker in CLICKBAIT_MARKERS)


def _conciseness(headline: str) -> int:
    length = len(headline or "")
    if 40 <= length <= 110:
        return 15
    if 25 <= length < 40 or 110 < length <= 140:
        return 8
    return 0


def _entity_parts(entity: str) -> list[str]:
    import re

    return [p for p in re.split(r"[-_\s]+", entity.lower()) if len(p) >= 3]


def score_headline(headline: str, top_entities: list[str], member: dict) -> tuple[int, list[str]]:
    """Points plus human-readable reasons for this candidate."""
    words = set(_words(headline))
    reasons: list[str] = []
    score = 0

    entity_hits = [
        entity
        for entity in top_entities
        if any(part in words for part in _entity_parts(entity))
    ]
    if entity_hits:
        score += 10 * len(entity_hits)
        reasons.append(f"entities:{','.join(entity_hits)}")
    if words & ACTION_VERBS:
        score += 20
        reasons.append("has-event-signal")
    if _is_clickbait(headline):
        score -= 25
        reasons.append("clickbait-penalty")
    concise = _conciseness(headline)
    score += concise
    if concise == 15:
        reasons.append("concise")
    if len(words) >= 5:
        score += 10
        reasons.append("complete")
    else:
        reasons.append("fragment")
    score += CONFIDENCE_BONUS.get((member.get("extraction_confidence") or ""), 0)
    score += SOURCE_BONUS.get((member.get("source_priority") or ""), 0)
    return score, reasons


@dataclass
class TitleResult:
    canonical_title: str | None
    method: str
    evidence: list[str] = field(default_factory=list)
    candidate_scores: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def select_title(members: list[dict], override: str | None = None) -> TitleResult:
    """Strongest headline wins; override short-circuits everything."""
    if override:
        return TitleResult(override, "manual", ["admin-override"], [])
    candidates = [m for m in (members or []) if (m.get("headline") or "").strip()]
    if not candidates:
        return TitleResult(None, "none", ["no-headlines"], [])

    entity_counts: Counter = Counter()
    for member in candidates:
        for entity in member.get("entities") or []:
            entity_counts[entity.lower()] += 1
    top_entities = [entity for entity, _ in entity_counts.most_common(3)]

    scored = []
    for member in candidates:
        headline = member["headline"].strip()
        points, reasons = score_headline(headline, top_entities, member)
        scored.append(
            {
                "headline": headline,
                "score": points,
                "reasons": reasons,
                "published_at": member.get("published_at") or "",
            }
        )
    scored.sort(key=lambda c: (-c["score"], c["published_at"], c["headline"]))
    winner = scored[0]
    return TitleResult(
        canonical_title=winner["headline"],
        method="rule",
        evidence=winner["reasons"],
        candidate_scores=[
            {"headline": c["headline"], "score": c["score"]} for c in scored[:3]
        ],
    )
