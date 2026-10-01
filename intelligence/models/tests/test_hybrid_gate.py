"""Phase 26 completion gate: hybrid improves-or-holds on frozen corpora.

Statistics are held-out per item (leave-one-out refits): the gate
measures generalization, never memorization. Asserts per task:
hybrid accuracy >= rule-only AND >= stat-only, and every hybrid error
routes to admin review. Entity evidence rides the relevance task via
assess_relevance outputs; type/category run entity-free (unit-covered).

Evaluation logic lives in models/evaluate.py (shared with Phase 27).
"""

import json
from pathlib import Path

from models.evaluate import ROOT, evaluate_task

TASKS = ("relevance", "article_type", "primary_category")


def test_hybrid_holds_or_improves_per_task():
    for task in TASKS:
        result = evaluate_task(task)
        assert result["hybrid_acc"] >= result["rule_acc"], f"{task}: hybrid regressed vs rules"
        assert result["hybrid_acc"] >= result["stat_acc"], f"{task}: hybrid regressed vs statistics"
        assert result["errors_reviewed"], f"{task}: some hybrid errors skip review"


def test_abstention_survives_hybrid():
    from models.decide import hybrid_category

    cases = json.loads(
        (ROOT / "intelligence" / "classification" / "tests" / "fixtures" / "topic-cases.json").read_text(
            encoding="utf-8"
        )
    )["cases"]
    abstentions = [c for c in cases if c["expected"]["primary"] is None]
    assert len(abstentions) >= 2
    for case in abstentions:
        out = hybrid_category(case["title"], case["body"])
        assert out["primary_category"] is None
        assert out["needs_review"] is True
