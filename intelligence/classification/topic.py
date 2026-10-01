"""Topic scoring (Phase 12): primary_category + secondary_topics[].

Subtopic matches aggregate to their category; the winner is primary.
No substantive signal (best category below threshold) yields primary
None rather than a forced bucket — entertainment and sport need no
economic domain. Reason codes carry the secondary list for
classification_results until the schema grows a column.
"""

from dataclasses import asdict, dataclass, field

from .matching import compile_surface, score_presence
from .subtopics import PUBLIC_CATEGORIES, SUBTOPIC_CATEGORY, SUBTOPICS

MIN_CATEGORY_SCORE = 4
MIN_SECONDARY_SCORE = 3
MAX_SECONDARY = 4

_PATTERNS: dict[str, list] = {
    name: [compile_surface(phrase) for phrase, _ in keywords]
    for name, (_, keywords) in SUBTOPICS.items()
}
_WEIGHTS: dict[str, list[int]] = {
    name: [weight for _, weight in keywords]
    for name, (_, keywords) in SUBTOPICS.items()
}


def _subtopic_patterns(name: str) -> list[tuple]:
    return list(zip(_PATTERNS[name], _WEIGHTS[name]))


def score_subtopics(title: str, body: str) -> dict[str, tuple[int, list[str]]]:
    return {name: score_presence(_subtopic_patterns(name), title, body) for name in SUBTOPICS}


def _confidence(winner: int, runner_up: int) -> str:
    if winner < MIN_CATEGORY_SCORE:
        return "low"
    if runner_up <= 0:
        return "high" if winner >= 8 else "medium"
    ratio = winner / runner_up
    if ratio >= 2.0 and winner >= 8:
        return "high"
    if ratio >= 1.25:
        return "medium"
    return "low"


@dataclass
class TopicResult:
    primary_category: str | None
    category_confidence: str
    secondary_topics: list[str] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def classify_topic(title: str, body: str) -> TopicResult:
    """Primary domain plus ranked secondary topics; never raises."""
    title, body = title or "", body or ""
    subtopic_scores = {
        name: score_presence(_subtopic_patterns(name), title, body)
        for name in SUBTOPICS
    }
    category_scores: dict[str, int] = {category: 0 for category in PUBLIC_CATEGORIES}
    for name, (score, _) in subtopic_scores.items():
        category_scores[SUBTOPIC_CATEGORY[name]] += score

    ranked = sorted(category_scores.items(), key=lambda kv: (-kv[1], kv[0]))
    best_category, best_score = ranked[0]
    runner_up = ranked[1][1]

    secondaries = sorted(
        (
            (name, score)
            for name, (score, _) in subtopic_scores.items()
            if score >= MIN_SECONDARY_SCORE
        ),
        key=lambda kv: (-kv[1], kv[0]),
    )[:MAX_SECONDARY]

    if best_score < MIN_CATEGORY_SCORE:
        return TopicResult(
            primary_category=None,
            category_confidence="low",
            secondary_topics=[name for name, _ in secondaries],
            reason_codes=["category:none"],
        )

    reason_codes = [f"category:{best_category}"]
    reason_codes += [f"secondary:{name}" for name, _ in secondaries]
    return TopicResult(
        primary_category=best_category,
        category_confidence=_confidence(best_score, runner_up),
        secondary_topics=[name for name, _ in secondaries],
        reason_codes=reason_codes,
    )
