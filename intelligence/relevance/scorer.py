"""Relevance scoring (Phase 10): weighted evidence, threshold, confidence.

Answers only whether Bihar is substantively central. Never classifies
topic, type, or curation — later phases own those.
"""

from dataclasses import asdict, dataclass, field

from .evidence import AMBIGUOUS, collect_evidence
from .knowledge import (
    GEO_TYPES,
    INFRA_TYPES,
    INSTITUTION_TYPES,
    KnowledgeBase,
    get_knowledge_base,
)

PASS_THRESHOLD = 0.5

# Per-family caps bound keyword stuffing; negatives counterbalance.
WEIGHTS = {
    "dateline_bihar": 0.45,
    "district": (0.35, 2),
    "town": (0.25, 2),
    "place": (0.25, 2),
    "subdivision": (0.20, 1),
    "river": (0.12, 2),
    "institution": (0.40, 2),
    "infrastructure": (0.30, 2),
    "bihar_token": (0.12, 2),
    "dateline_other": -0.30,
    "other_city": (-0.15, 3),
    "ambiguous_other": -0.20,
}


@dataclass
class RelevanceResult:
    passed: bool
    score: float
    confidence: str
    evidence: list[str] = field(default_factory=list)
    locations: list[dict] = field(default_factory=list)
    entities: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "pass": self.passed,
            "score": self.score,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "locations": self.locations,
            "entities": self.entities,
        }


def _family_key(entity: dict) -> str:
    if entity["type"] in INSTITUTION_TYPES:
        return "institution"
    if entity["type"] in INFRA_TYPES:
        return "infrastructure"
    return entity["type"]  # district, town, place, subdivision, river


def assess_relevance(
    title: str, body: str, kb: KnowledgeBase | None = None
) -> RelevanceResult:
    """Score Bihar centrality; always returns the full contract, never a bare bool."""
    kb = kb or get_knowledge_base()
    title, body = title or "", body or ""
    signals = collect_evidence(title, body, kb)

    evidence: list[str] = []
    locations: list[dict] = []
    entities: list[dict] = []
    family_counts: dict[str, int] = {}
    score = 0.0

    def add_family(family: str, note: str) -> bool:
        """Add capped family weight; True when this item counted."""
        nonlocal score
        weight, cap = WEIGHTS[family]
        if family_counts.get(family, 0) >= cap:
            return False
        family_counts[family] = family_counts.get(family, 0) + 1
        score += weight
        evidence.append(note)
        return True

    if signals["dateline_bihar"]:
        score += WEIGHTS["dateline_bihar"]
        evidence.append(f"dateline: {signals['dateline']}")
    if signals["dateline_other"]:
        score += WEIGHTS["dateline_other"]
        evidence.append(f"negative: other-state dateline {signals['dateline']}")

    for entity_id in sorted(signals["matched"]):
        entity = kb.entities[entity_id]
        family = _family_key(entity)
        label = (
            f"{entity['type']}: {entity['canonical_name']}"
            + (f" ({', '.join(entity['hindi_names'][:1])})" if entity["hindi_names"] else "")
        )
        if not add_family(family, label):
            continue
        record = {"name": entity["canonical_name"], "type": entity["type"]}
        if entity["type"] in GEO_TYPES:
            record["district"] = kb.district_of(entity_id)
            locations.append(record)
        else:
            entities.append(record)

    for entity_id in sorted(signals["resolved_bihar"]):
        entity = kb.entities[entity_id]
        if add_family("town", f"district (corroborated): {entity['canonical_name']}"):
            locations.append(
                {"name": entity["canonical_name"], "type": entity["type"], "district": kb.district_of(entity_id)}
            )

    for entity_id in sorted(signals["resolved_other"]):
        entity = kb.entities[entity_id]
        other = next(
            (AMBIGUOUS[s.strip().lower()] for s in [entity["canonical_name"]] if s.strip().lower() in AMBIGUOUS),
            "non-Bihar reading",
        )
        score += WEIGHTS["ambiguous_other"]
        evidence.append(f"negative: ambiguous {entity['canonical_name']!r} resolved {other} (no Bihar context)")

    for _ in range(min(signals["bihar_tokens"], WEIGHTS["bihar_token"][1])):
        score += WEIGHTS["bihar_token"][0]
    if signals["bihar_tokens"]:
        evidence.append(f"bihar mention x{signals['bihar_tokens']}")

    for city in signals["other_cities"][: WEIGHTS["other_city"][1]]:
        score += WEIGHTS["other_city"][0]
        evidence.append(f"negative: other-state signal {city}")

    score = round(max(0.0, min(1.0, score)), 2)
    passed = score >= PASS_THRESHOLD
    n_evidence = len(evidence)

    if n_evidence == 0:
        confidence = "high"
        evidence.append("no Bihar signal")
    elif score < 0.4 or score > 0.6:
        confidence = "high" if n_evidence >= 2 else "medium"
    else:
        confidence = "medium" if n_evidence >= 3 else "low"

    return RelevanceResult(
        passed=passed,
        score=score,
        confidence=confidence,
        evidence=evidence,
        locations=locations,
        entities=entities,
    )
