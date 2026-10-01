"""Hybrid decision engine (Phase 26): entity evidence + rules + statistics.

Fusion policy (same for all three tasks):
- agree  -> agreed label, confidence = mean(rule, stat) + entity boost
- disagree + stat sure (>= 0.8) + rule unsure (<= 0.45) -> stat label (override)
- disagree otherwise -> rule label (deterministic default), low confidence
Every disagreement routes to admin review. Abstentions (None) are never
overridden: the statistical models cannot output None.
"""

import math

RULE_CONF = {"high": 0.85, "medium": 0.65, "low": 0.45}
ENTITY_BOOST = 0.05
CONF_CAP = 0.95
DISAGREE_CONF = 0.40
OVERRIDE_CONF = 0.60
OVERRIDE_STAT_MIN = 0.80
OVERRIDE_RULE_MAX = 0.45
REVIEW_BELOW = 0.60

# KB entity type -> supported primary categories.
CATEGORY_AFFINITY = {
    "university": ["Education"],
    "hospital": ["Healthcare"],
    "river": ["Environment"],
    "place": ["Environment"],
    "airport": ["Infrastructure"],
    "railway_station": ["Infrastructure"],
    "highway": ["Infrastructure"],
    "industrial_area": ["Industry", "Infrastructure"],
    "major_project": ["Infrastructure", "Industry", "Economy"],
    "department": ["Governance"],
    "agency": ["Governance"],
    "corporation": ["Economy", "Industry"],
    "town": [],
    "district": [],
    "subdivision": [],
}

# KB entity type -> supported article types.
TYPE_AFFINITY = {
    "university": ["governance"],
    "hospital": ["governance"],
    "department": ["governance"],
    "agency": ["governance"],
    "corporation": ["governance", "development"],
    "airport": ["development"],
    "railway_station": ["development"],
    "highway": ["development"],
    "industrial_area": ["development"],
    "major_project": ["development"],
    "river": [],
    "place": [],
    "town": [],
    "district": [],
    "subdivision": [],
}


def _softmax(scores):
    peak = max(scores)
    exps = [math.exp(s - peak) for s in scores]
    total = sum(exps)
    return [e / total for e in exps]


def stat_distribution(estimator, text: str) -> dict:
    """Label -> probability for either winner kind (logreg or linear SVC)."""
    if hasattr(estimator, "predict_proba"):
        proba = estimator.predict_proba([text])[0]
        return {str(label): float(p) for label, p in zip(estimator.classes_, proba)}
    decisions = estimator.decision_function([text])
    if decisions.ndim == 1:
        decisions = [[-decisions[0], decisions[0]]]
    proba = _softmax([float(v) for v in decisions[0]])
    return {str(label): p for label, p in zip(estimator.classes_, proba)}


# Relevance backing: any grounded geography or institution backs a
# relevant verdict; nothing backs non-relevant (absence gives no boost).
RELEVANCE_AFFINITY = {
    "geo": ["relevant"],
    "district": ["relevant"],
    "town": ["relevant"],
    "subdivision": ["relevant"],
    "river": ["relevant"],
    "place": ["relevant"],
    "university": ["relevant"],
    "hospital": ["relevant"],
    "department": ["relevant"],
    "agency": ["relevant"],
    "corporation": ["relevant"],
    "airport": ["relevant"],
    "railway_station": ["relevant"],
    "highway": ["relevant"],
    "industrial_area": ["relevant"],
    "major_project": ["relevant"],
}


def entity_support(entity_types: list[str], label: str | None, affinity: dict) -> list[str]:
    """KB entity types backing the label (evidence strings)."""
    if label is None:
        return []
    return sorted({t for t in entity_types if label in affinity.get(t, [])})


def fuse(
    rule_label,
    rule_conf: float,
    stat_dist: dict,
    entity_types: list[str],
    affinity: dict,
    rule_abstains: bool = False,
) -> dict:
    """Combine one rule verdict with one statistical distribution.

    Agreement boosts on entity backing; disagreement defaults to the
    rule label at low confidence (override only when statistics are
    sure and rules unsure); abstentions are never overridden.
    """
    stat_label = max(stat_dist, key=lambda k: stat_dist[k])
    stat_conf = stat_dist[stat_label]
    agreed = (rule_label == stat_label) and not rule_abstains
    if agreed:
        support = entity_support(entity_types, rule_label, affinity)
        confidence = min(CONF_CAP, (rule_conf + stat_conf) / 2 + (ENTITY_BOOST if support else 0.0))
        return {
            "label": rule_label,
            "confidence_score": round(confidence, 3),
            "agreed": True,
            "entity_support": support,
            "needs_review": confidence < REVIEW_BELOW,
            "reason_codes": ["hybrid:agree"] + [f"entity:{t}" for t in support],
        }
    if (
        not rule_abstains
        and stat_conf >= OVERRIDE_STAT_MIN
        and rule_conf <= OVERRIDE_RULE_MAX
    ):
        support = entity_support(entity_types, stat_label, affinity)
        return {
            "label": stat_label,
            "confidence_score": OVERRIDE_CONF,
            "agreed": False,
            "entity_support": support,
            "needs_review": True,
            "reason_codes": ["hybrid:override-stat-sure-rule-unsure"],
        }
    support = entity_support(entity_types, rule_label, affinity)
    return {
        "label": rule_label,
        "confidence_score": DISAGREE_CONF,
        "agreed": False,
        "entity_support": support,
        "needs_review": True,
        "reason_codes": ["hybrid:disagree-rule-default"],
    }
