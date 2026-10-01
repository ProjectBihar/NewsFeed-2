"""Unit tests: fusion policy, override bar, abstention (Phase 26)."""

from models.hybrid import (
    CATEGORY_AFFINITY,
    RELEVANCE_AFFINITY,
    TYPE_AFFINITY,
    fuse,
    stat_distribution,
)


def test_agreement_boosts_with_entity_support():
    out = fuse("Governance", 0.78, {"Governance": 0.84, "Economy": 0.16}, ["department"], CATEGORY_AFFINITY)
    assert out["label"] == "Governance"
    assert out["agreed"] is True
    assert out["confidence_score"] == round(min(0.95, (0.78 + 0.84) / 2 + 0.05), 3)
    assert out["needs_review"] is False
    assert "entity:department" in out["reason_codes"]


def test_agreement_without_support_gets_no_boost():
    out = fuse("Governance", 0.78, {"Governance": 0.84, "Economy": 0.16}, [], CATEGORY_AFFINITY)
    assert out["confidence_score"] == round((0.78 + 0.84) / 2, 3)
    assert out["entity_support"] == []


def test_disagreement_defaults_to_rule_at_low_confidence():
    out = fuse("Governance", 0.65, {"Economy": 0.70, "Governance": 0.30}, ["department"], CATEGORY_AFFINITY)
    assert out["label"] == "Governance"
    assert out["agreed"] is False
    assert out["confidence_score"] == 0.40
    assert out["needs_review"] is True
    assert out["reason_codes"] == ["hybrid:disagree-rule-default"]


def test_override_when_statistics_sure_and_rules_unsure():
    out = fuse("miscellaneous", 0.45, {"governance": 0.85, "miscellaneous": 0.15}, [], TYPE_AFFINITY)
    assert out["label"] == "governance"
    assert out["confidence_score"] == 0.60
    assert out["needs_review"] is True


def test_no_override_below_the_bar():
    out = fuse("miscellaneous", 0.45, {"governance": 0.70, "miscellaneous": 0.30}, [], TYPE_AFFINITY)
    assert out["label"] == "miscellaneous"


def test_abstention_never_overridden():
    out = fuse(None, 0.45, {"Governance": 0.95, "Economy": 0.05}, [], CATEGORY_AFFINITY, rule_abstains=True)
    assert out["label"] is None
    assert out["needs_review"] is True


def test_affinity_maps_cover_relevance_and_types():
    assert RELEVANCE_AFFINITY["agency"] == ["relevant"]
    assert TYPE_AFFINITY["airport"] == ["development"]
    assert CATEGORY_AFFINITY["university"] == ["Education"]
    assert CATEGORY_AFFINITY["town"] == []


def test_stat_distribution_sums_to_one_per_kind():
    from sklearn.linear_model import LogisticRegression
    from sklearn.svm import LinearSVC
    from sklearn.pipeline import Pipeline

    from models.features import build_vectorizer

    texts = ["Bihar cabinet approves metro", "Delhi market rally ends", "Patna metro expansion"]
    labels = ["a", "b", "a"]
    for clf in (LogisticRegression(max_iter=500), LinearSVC()):
        pipe = Pipeline([("features", build_vectorizer()), ("clf", clf)])
        pipe.fit(texts, labels)
        dist = stat_distribution(pipe, "metro project approved")
        assert abs(sum(dist.values()) - 1.0) < 1e-6
        assert set(dist) == {"a", "b"}
