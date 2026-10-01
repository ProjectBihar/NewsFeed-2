"""Article-type scoring + significance tiers + curation (Phase 11).

Lexical, deterministic, bilingual. Entity fusion arrives in Phase 26;
statistical learning in Phase 25. This module answers: what kind of
news is this, how consequential is it, and is it curated?
"""

import re
from dataclasses import asdict, dataclass, field

from .lexicons import (
    CONSEQUENCE_MARKERS,
    INFRA_FAILURE_NOUNS,
    MASS_CASUALTY_MIN,
    TYPE_KEYWORDS,
    casualty_count,
)
from .matching import compile_surface, score_presence

BASE_TIER = {
    "development": "A",
    "governance": "A",
    "official_release": "B",
    "court": "B",
    "environmental_event": "B",
    "analysis": "B",
    "opinion": "B",
    "politics": "C",
    "election_campaign": "C",
    "crime": "C",
    "accident": "C",
    "weather": "C",
    "miscellaneous": "C",
    "roundup": "D",
    "sports": "D",
    "entertainment": "D",
    "advertorial": "D",
}

MIN_TYPE_SCORE = 3

# Approval-family markers select B curation but never demote: an approval
# is consequence evidence, not an accountability finding.
_APPROVAL_WORDS = frozenset(
    {
        "approves", "approval", "approved", "sanctioned", "clears",
        "launches", "inaugurat", "मंजूरी", "मंजूर", "स्वीकृत",
        "शुभारंभ", "उद्घाटन",
    }
)


_PATTERNS: dict[str, list] = {
    kind: [compile_surface(phrase) for phrase, _ in items]
    for kind, items in TYPE_KEYWORDS.items()
    if kind != "miscellaneous"
}
_WEIGHTS: dict[str, list[int]] = {
    kind: [weight for _, weight in items]
    for kind, items in TYPE_KEYWORDS.items()
    if kind != "miscellaneous"
}
_MARKER_PATTERNS = [compile_surface(marker) for marker in CONSEQUENCE_MARKERS]
_FAILURE_NOUNS = [compile_surface(noun) for noun in INFRA_FAILURE_NOUNS]


def _type_patterns(kind: str) -> list[tuple]:
    return list(zip(_PATTERNS[kind], _WEIGHTS[kind]))


def score_types(title: str, body: str) -> dict[str, tuple[int, list[str]]]:
    return {kind: score_presence(_type_patterns(kind), title, body) for kind in _PATTERNS}


def find_markers(title: str, body: str) -> list[str]:
    """Consequence-marker surface forms present in the text."""
    found = []
    for marker, pattern in zip(CONSEQUENCE_MARKERS, _MARKER_PATTERNS):
        if (pattern.search(title) if not isinstance(pattern, str) else pattern in title) or (
            pattern.search(body) if not isinstance(pattern, str) else pattern in body
        ):
            found.append(marker)
    return sorted(set(found))


def _mass_casualty(text: str) -> int:
    return casualty_count(text)


def _infra_failure(title: str, body: str) -> bool:
    """Structural collapse of built infrastructure (bridge, building, dam…)."""
    text = f"{title}\n{body}"
    collapse_res = [re.compile(r"\bcollaps(?:e|es|ed)\b", re.IGNORECASE), "ध्वस्त", "ढह"]
    has_collapse = any(
        (rx.search(text) is not None if not isinstance(rx, str) else rx in text)
        for rx in collapse_res
    )
    if not has_collapse:
        return False
    return any(
        (rx.search(text) is not None if not isinstance(rx, str) else rx in text)
        for rx in _FAILURE_NOUNS
    )


def _confidence(winner: int, runner_up: int) -> str:
    if winner < MIN_TYPE_SCORE:
        return "low"
    if runner_up <= 0:
        return "high" if winner >= 6 else "medium"
    ratio = winner / runner_up
    if ratio >= 2.0 and winner >= 6:
        return "high"
    if ratio >= 1.25:
        return "medium"
    return "low"


@dataclass
class ClassificationResult:
    article_type: str
    article_type_confidence: str
    significance_tier: str
    curated: bool
    type_evidence: list[str] = field(default_factory=list)
    tier_evidence: list[str] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def classify_article(title: str, body: str) -> ClassificationResult:
    """Type, tier, and curation; never raises on odd input."""
    title, body = title or "", body or ""
    scores = score_types(title, body)
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1][0], kv[0]))
    best, (best_score, best_evidence) = ranked[0]
    runner_up = ranked[1][1][0] if len(ranked) > 1 else 0

    if best_score < MIN_TYPE_SCORE:
        article_type, type_conf, type_evidence = "miscellaneous", "low", []
    else:
        article_type, type_conf = best, _confidence(best_score, runner_up)
        type_evidence = best_evidence[:6]

    # Kind override: explicit official-communication markers (title + body,
    # or repeated references) describe what the article IS, outranking
    # topic soup. A single incidental mention does not flip the type.
    or_score = scores.get("official_release", (0, []))[0]
    if or_score >= 8 and article_type not in ("advertorial", "roundup"):
        article_type = "official_release"
        type_conf = _confidence(or_score, best_score if best != "official_release" else runner_up)
        type_evidence = scores["official_release"][1][:6]

    markers = find_markers(title, body)
    casualties = _mass_casualty(f"{title}\n{body}")
    failure = _infra_failure(title, body)

    tier = BASE_TIER[article_type]
    tier_evidence = [f"base:{article_type}"]

    if failure and article_type in ("accident", "development", "governance"):
        # Structural failure of built infrastructure reads as an
        # infrastructure/accountability story, not a routine accident.
        if article_type == "accident":
            article_type = "development"
            type_evidence = type_evidence + ["infra-failure-override"]
            tier_evidence.append("override:accident->development")
        tier = "A" if tier == "A" else "B"
        tier_evidence.append("marker:infrastructure-failure")

    accountability = [m for m in markers if m not in _APPROVAL_WORDS]
    if accountability and tier in ("B", "C"):
        tier_evidence.append(f"markers:{','.join(sorted(set(accountability)))}")

    upgraded_by_casualty = False
    if casualties >= MASS_CASUALTY_MIN and article_type in ("crime", "accident", "weather", "environmental_event"):
        tier = "B"
        upgraded_by_casualty = True
        tier_evidence.append(f"mass-casualty:{casualties}")

    if tier == "C" and accountability and article_type in ("crime", "governance", "court", "politics", "environmental_event"):
        tier = "B"
    if tier == "A" and article_type == "governance" and accountability:
        # Accountability findings about governance (CAG-style audits,
        # scams, probes) are public-significance stories, not development.
        tier = "B"
        tier_evidence.append("demotion:governance+accountability")
    if tier == "B" and article_type == "development":
        tier = "A"

    selection_markers = [m for m in markers] + (["mass-casualty"] if upgraded_by_casualty else [])
    curated = tier == "A" or (tier == "B" and len(selection_markers) > 0)

    reason_codes = [f"type:{article_type}", f"tier:{tier}", f"curated:{str(curated).lower()}"]
    reason_codes += [f"marker:{m}" for m in sorted(set(markers))][:8]

    return ClassificationResult(
        article_type=article_type,
        article_type_confidence=type_conf,
        significance_tier=tier,
        curated=curated,
        type_evidence=type_evidence,
        tier_evidence=tier_evidence,
        reason_codes=reason_codes,
    )
