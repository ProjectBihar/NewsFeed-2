"""Phase 27 completion gate: retraining is controlled and reproducible.

The plan's rules, pinned:
- triggers: weekly, or 100 new reviewed corrections (None = honest unknown)
- training success alone never replaces production
- promotion needs explicit improvement + floors + class regression check
  + the Phase 26 hybrid gate with the challenger seated
- every run records model version, training date, dataset version,
  metrics, and the promotion decision
- completion gate: training and evaluation are reproducible
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from models import retrain as retrain_mod
from models.retrain import (
    PROMOTE_MARGIN,
    class_regressions,
    compare_task,
    dataset_version,
    run_retraining,
    should_retrain,
)
from models.train import write_report

NOW = datetime(2026, 9, 30, 12, 0, 0, tzinfo=timezone.utc)

LABELS = ["True"] * 3 + ["False"] * 3


def _results(prod_mean, chall_mean, prod_preds, chall_preds, fit=1.0):
    return {
        "production-model": {
            "mean": prod_mean, "std": 0.0, "folds": 5,
            "predictions": list(prod_preds), "fit": 1.0,
        },
        "challenger-model": {
            "mean": chall_mean, "std": 0.0, "folds": 5,
            "predictions": list(chall_preds), "fit": fit,
        },
    }


CORRECT = ["True", "True", "True", "False", "False", "False"]
WRONG = ["False", "False", "False", "True", "True", "True"]


def test_triggers_first_run_weekly_and_corrections():
    assert should_retrain(NOW, None) == ["first-run"]
    assert should_retrain(NOW, NOW - timedelta(days=8)) == ["weekly"]
    assert should_retrain(NOW, NOW - timedelta(days=1)) == []
    assert should_retrain(NOW, NOW - timedelta(days=1), 100) == ["100-corrections"]
    assert should_retrain(NOW, NOW - timedelta(days=8), 100) == ["weekly", "100-corrections"]
    # Unknown correction count must not invent the correction trigger.
    assert should_retrain(NOW, NOW - timedelta(days=1), None) == []


def test_dataset_version_is_content_addressed():
    first = dataset_version()
    assert first == dataset_version()
    assert first.startswith("evaluation-corpus-v1+sha256:")

    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        corpus = Path(tmp) / "corpus.json"
        corpus.write_text("v1", encoding="utf-8")
        a = dataset_version([str(corpus)])
        corpus.write_text("v2", encoding="utf-8")
        b = dataset_version([str(corpus)])
    assert a != b


def test_class_regressions_flag_drops_but_not_singletons_or_noise():
    # Candidate obliterates class b (support 2): important regression.
    labels = ["a"] * 2 + ["b"] * 2
    regs = class_regressions(labels, ["a", "a", "b", "b"], ["a", "a", "a", "a"])
    assert "b" in regs and regs["b"]["drop"] == 1.0
    # Single-class support never counts (a flipped by noise only).
    assert class_regressions(["c"], ["c"], ["x"]) == {}
    # A 0.1 drop on a large class is inside tolerance.
    big_labels = ["a"] * 10 + ["b"] * 10
    big_prod = ["a"] * 10 + ["b"] * 10
    big_cand = ["a"] * 11 + ["b"] * 9
    assert class_regressions(big_labels, big_prod, big_cand) == {}


def test_promotion_needs_margin_floor_clean_classes_and_gate():
    gates = []
    gate = lambda task, challenger: gates.append(challenger) or {"holds": True}

    promoted = compare_task(
        "relevance", _results(0.70, 0.95, WRONG, CORRECT), "production-model", LABELS,
        gate_check=gate,
    )
    assert promoted["decision"] == "promote"
    assert promoted["delta"] == 0.25
    assert gates == ["challenger-model"]

    # Sub-margin improvement never reaches the gate.
    gates.clear()
    hold = compare_task(
        "relevance", _results(0.70, 0.70 + PROMOTE_MARGIN - 0.005, WRONG, CORRECT),
        "production-model", LABELS, gate_check=gate,
    )
    assert hold["decision"] == "hold"
    assert any("margin" in r for r in hold["reasons"])
    assert gates == []

    # Explicit improvement but below the Phase 25 floor: hold.
    hold = compare_task(
        "relevance", _results(0.50, 0.70, WRONG, CORRECT), "production-model", LABELS,
        gate_check=gate,
    )
    assert hold["decision"] == "hold"
    assert any("floor" in r for r in hold["reasons"])

    # Improvement with weakened fit: hold.
    hold = compare_task(
        "relevance", _results(0.50, 0.95, WRONG, CORRECT, fit=0.5),
        "production-model", LABELS, gate_check=gate,
    )
    assert hold["decision"] == "hold"
    assert any("fit" in r for r in hold["reasons"])

    # Important class regression: hold before the gate is even asked.
    gates.clear()
    regs_labels = ["True"] * 3 + ["False"] * 3
    hold = compare_task(
        "relevance",
        _results(0.50, 0.95, CORRECT, ["True", "True", "True", "True", "True", "True"]),
        "production-model", regs_labels, gate_check=gate,
    )
    assert hold["decision"] == "hold"
    assert any("regression" in r for r in hold["reasons"])
    assert hold["class_regressions"].get("False", {}).get("drop", 0) > 0
    assert gates == []

    # Clean metrics but the hybrid gate fails with the challenger seated: hold.
    hold = compare_task(
        "relevance", _results(0.70, 0.95, WRONG, CORRECT), "production-model", LABELS,
        gate_check=lambda t, c: {"holds": False},
    )
    assert hold["decision"] == "hold"
    assert any("hybrid gate" in r for r in hold["reasons"])


def test_hold_when_production_model_is_gone():
    hold = compare_task(
        "relevance", _results(0.9, 0.95, CORRECT, CORRECT), "removed-model", LABELS,
        gate_check=lambda t, c: pytest.fail("gate must not be consulted"),
    )
    assert hold["decision"] == "hold"
    assert any("absent" in r for r in hold["reasons"])


def test_write_report_pins_existing_winner(tmp_path):
    """A fresh evaluation alone must never change production (Phase 27)."""
    report = tmp_path / "report.json"
    report.write_text(
        json.dumps({"models": {"relevance": {"winner": "pinned-model"}}}), encoding="utf-8"
    )
    fresh = {
        "relevance": {
            "n": 6, "labels": ["False", "True"], "protocol": "stratified-5-fold",
            "winner": "argmax-model",
            "results": {
                "argmax-model": {"mean": 0.9, "predictions": CORRECT, "fit": 1.0},
                "pinned-model": {"mean": 0.7, "predictions": CORRECT, "fit": 1.0},
            },
        }
    }
    out = write_report(path=str(report), results=fresh)
    assert out["models"]["relevance"]["winner"] == "pinned-model"


def _fake_cycle_results(labels_by_task):
    """Synthetic candidates: challenger clearly beats production everywhere."""
    results = {}
    for task, labels in labels_by_task.items():
        results[task] = {
            "n": len(labels),
            "labels": sorted(set(labels)),
            "protocol": "stratified-5-fold",
            "winner": "challenger-model",
            "results": {
                "production-model": {
                    "mean": 0.55, "std": 0.0, "folds": 5,
                    "predictions": ["x"] * len(labels), "fit": 1.0,
                },
                "challenger-model": {
                    "mean": 0.95, "std": 0.0, "folds": 5,
                    "predictions": list(labels), "fit": 1.0,
                },
            },
        }
    return results


def test_promotion_updates_production_and_records_everything(tmp_path, monkeypatch):
    report = tmp_path / "report.json"
    report.write_text(
        json.dumps({"models": {"relevance": {"winner": "production-model"}}}),
        encoding="utf-8",
    )
    ledger = tmp_path / "ledger.json"
    labels = {"relevance": LABELS}
    monkeypatch.setattr(
        retrain_mod, "train_and_evaluate", lambda: _fake_cycle_results(labels)
    )

    entry = run_retraining(
        force=True, report_path=report, ledger_path=ledger,
        gate_check=lambda t, c: {"holds": True, "rule_acc": 1.0, "stat_acc": 0.8,
                                 "hybrid_acc": 1.0, "errors_reviewed": True},
    )

    assert entry["triggered"] is True
    decision = entry["decisions"]["relevance"]
    assert decision["decision"] == "promote"
    assert decision["gate"]["holds"] is True

    # Production actually moved...
    written = json.loads(report.read_text(encoding="utf-8"))
    assert written["models"]["relevance"]["winner"] == "challenger-model"
    # ...and the plan's five record fields are all present.
    assert entry["training_date"]
    assert entry["dataset_version"].startswith("evaluation-corpus-v1+sha256:")
    assert entry["model_versions"]["relevance"].startswith("challenger-model@")
    assert entry["metrics"]["relevance"]["challenger_mean"] == 0.95
    assert entry["decisions"]["relevance"]["decision"] == "promote"
    assert written["retrain"]["triggered_by"] == ["first-run"]

    on_disk = json.loads(ledger.read_text(encoding="utf-8"))
    assert len(on_disk["runs"]) == 1
    assert on_disk["runs"][0]["production"]["relevance"] == "challenger-model"


def test_failing_gate_blocks_promotion(tmp_path, monkeypatch):
    report = tmp_path / "report.json"
    report.write_text(
        json.dumps({"models": {"relevance": {"winner": "production-model"}}}),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        retrain_mod, "train_and_evaluate",
        lambda: _fake_cycle_results({"relevance": LABELS}),
    )
    entry = run_retraining(
        force=True, report_path=report, ledger_path=tmp_path / "ledger.json",
        gate_check=lambda t, c: {"holds": False},
    )
    assert entry["decisions"]["relevance"]["decision"] == "hold"
    written = json.loads(report.read_text(encoding="utf-8"))
    assert written["models"]["relevance"]["winner"] == "production-model"


def test_not_due_writes_nothing(tmp_path):
    ledger = tmp_path / "ledger.json"
    recent = (NOW - timedelta(days=1)).isoformat()
    ledger.write_text(
        json.dumps({"runs": [{"training_date": recent}]}), encoding="utf-8"
    )
    report = tmp_path / "report.json"
    outcome = run_retraining(
        now=NOW, corrections_since_run=10, report_path=report, ledger_path=ledger
    )
    assert outcome["triggered"] is False
    assert not report.exists()
    assert len(json.loads(ledger.read_text(encoding="utf-8"))["runs"]) == 1


def test_training_and_evaluation_are_reproducible(tmp_path):
    """The plan's completion gate: two full cycles, identical output.

    Runs against the real frozen corpora with the committed report as
    production; writes only to tmp paths.
    """
    import shutil

    seed = tmp_path / "report.json"
    shutil.copy(Path(__file__).resolve().parents[2] / "models" / "report.json", seed)

    ledger = tmp_path / "ledger.json"
    runs = []
    for _ in range(2):
        runs.append(
            run_retraining(
                force=True, report_path=seed, ledger_path=ledger,
            )
        )

    assert all(r["triggered"] for r in runs)
    assert runs[0]["dataset_version"] == runs[1]["dataset_version"]
    assert runs[0]["metrics"] == runs[1]["metrics"], "evaluation not reproducible"
    assert runs[0]["decisions"] == runs[1]["decisions"]
    assert runs[0]["production"] == runs[1]["production"]

    # Production (committed winners) survived untouched: no auto-promotion.
    committed = json.loads(
        (Path(__file__).resolve().parents[2] / "models" / "report.json").read_text(
            encoding="utf-8"
        )
    )
    written = json.loads(seed.read_text(encoding="utf-8"))
    for task in committed["models"]:
        assert (
            written["models"][task]["winner"] == committed["models"][task]["winner"]
        ), f"{task}: production replaced without an explicit promotion"
        # Challenger scores are recorded even when it was not promoted.
        assert written["models"][task]["results"]

    stored = json.loads(ledger.read_text(encoding="utf-8"))
    assert len(stored["runs"]) == 2
    for run in stored["runs"]:
        assert run["training_date"]
        assert run["dataset_version"]
        assert run["model_versions"]
        assert run["metrics"]
        assert all(d["decision"] == "hold" for d in run["decisions"].values())
