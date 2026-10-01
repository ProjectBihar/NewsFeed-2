"""Task adapters (Phase 26): rules + statistics + entities per decision.

Public adapters use production refits; the evaluation harness drives
_hybrid directly with held-out distributions (see test_hybrid_gate).
"""

from classification import classify_article, classify_topic
from relevance import assess_relevance

from .hybrid import (
    CATEGORY_AFFINITY,
    RELEVANCE_AFFINITY,
    RULE_CONF,
    TYPE_AFFINITY,
    fuse,
    stat_distribution,
)
from .train import refit

_ESTIMATORS: dict[str, object] = {}


def _estimator(task: str):
    if task not in _ESTIMATORS:
        _ESTIMATORS[task] = refit(task)
    return _ESTIMATORS[task]


def _rule_conf(level: str) -> float:
    return RULE_CONF.get(level, 0.5)


def _entity_types(entities: list[dict] | None) -> list[str]:
    return [e.get("type", "") for e in (entities or []) if isinstance(e, dict) and e.get("type")]


def _hybrid(
    rule_label,
    rule_conf: float,
    stat_dist: dict,
    entity_types: list[str],
    affinity: dict,
    rule_abstains: bool,
    out_key: str,
) -> dict:
    outcome = fuse(rule_label, rule_conf, stat_dist, entity_types, affinity, rule_abstains)
    outcome[out_key] = outcome.pop("label")
    return outcome


def hybrid_relevance(title: str, body: str, entities: list[dict] | None = None) -> dict:
    """Fuse Bihar relevance: rule score, statistical probability, grounding."""
    result = assess_relevance(title or "", body or "").to_dict()
    rule_label = "relevant" if result["pass"] else "non-relevant"
    rule_conf = result["score"] if result["pass"] else 1.0 - result["score"]
    text = f"{title or ''}\n{body or ''}"
    stat_dist = {
        ("relevant" if label == "True" else "non-relevant"): prob
        for label, prob in stat_distribution(_estimator("relevance"), text).items()
    }
    entity_types = (["geo"] if result["locations"] else []) + _entity_types(entities)
    entity_types += [e["type"] for e in result["entities"]]
    return _hybrid(rule_label, rule_conf, stat_dist, entity_types, RELEVANCE_AFFINITY, False, "relevance")


def hybrid_article_type(title: str, body: str, entities: list[dict] | None = None) -> dict:
    """Fuse article type with entity backing."""
    result = classify_article(title or "", body or "").to_dict()
    text = f"{title or ''}\n{body or ''}"
    return _hybrid(
        result["article_type"],
        _rule_conf(result["article_type_confidence"]),
        stat_distribution(_estimator("article_type"), text),
        _entity_types(entities),
        TYPE_AFFINITY,
        False,
        "article_type",
    )


def hybrid_category(title: str, body: str, entities: list[dict] | None = None) -> dict:
    """Fuse primary category; rule abstentions (None) are never overridden."""
    result = classify_topic(title or "", body or "").to_dict()
    text = f"{title or ''}\n{body or ''}"
    return _hybrid(
        result["primary_category"],
        _rule_conf(result["category_confidence"]),
        stat_distribution(_estimator("primary_category"), text),
        _entity_types(entities),
        CATEGORY_AFFINITY,
        result["primary_category"] is None,
        "primary_category",
    )
