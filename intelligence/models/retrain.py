"""Candidate model retraining (Phase 27): controlled self-improvement.

Triggers: weekly, or 100 new reviewed corrections since the last run
(corrections come from the Phase 22 admin review pipeline; None when no
database is configured — weekly still applies, honestly recorded).

A trained candidate never replaces production merely by training.
Production = report.json `winner` per task. Each triggered run compares
the best challenger against production on the frozen corpus and
promotes only when ALL checks pass:

  - explicit improvement >= PROMOTE_MARGIN (0.01 macro-F1)
  - above the Phase 25 tripwire floor for the task
  - train fit >= 0.9 (still represents the task)
  - no important per-class regression (support >= 2, F1 drop > 0.15)
  - the Phase 26 hybrid gate still holds with the challenger seated

Every triggered run appends a ledger entry — model version, training
date, dataset version, metrics, promotion decision — to ledger.json.
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .train import TASKS, train_and_evaluate, write_report

MODELS_DIR = Path(__file__).resolve().parent
CORPUS_FILES = [
    "intelligence/relevance/tests/fixtures/benchmark.json",
    "intelligence/classification/tests/fixtures/article-type-cases.json",
    "intelligence/classification/tests/fixtures/topic-cases.json",
]
ROOT = MODELS_DIR.parents[1]

WEEKLY_DAYS = 7
CORRECTIONS_THRESHOLD = 100
PROMOTE_MARGIN = 0.01
FIT_MIN = 0.9
MIN_SUPPORT = 2
MAX_CLASS_DROP = 0.15

# Phase 25 tripwire floors (mirrors tests/test_models.py): regression
# guards set below measured values, not quality claims.
FLOORS = {
    "relevance": 0.75,
    "article_type": 0.15,
    "primary_category": 0.15,
}


def dataset_version(files: list[str] | None = None) -> str:
    """Content hash of the frozen corpora - the dataset's identity."""
    import hashlib

    digest = hashlib.sha256()
    for rel in files if files is not None else CORPUS_FILES:
        target = Path(rel)
        digest.update((target if target.is_absolute() else ROOT / target).read_bytes())
    return f"evaluation-corpus-v1+sha256:{digest.hexdigest()[:12]}"


def should_retrain(
    now: datetime,
    last_run_at: datetime | None,
    corrections_since_run: int | None = None,
) -> list[str]:
    """Trigger reasons (empty = not due). corrections None = unknown."""
    reasons = []
    if last_run_at is None:
        reasons.append("first-run")
    elif now - last_run_at >= timedelta(days=WEEKLY_DAYS):
        reasons.append("weekly")
    if corrections_since_run is not None and corrections_since_run >= CORRECTIONS_THRESHOLD:
        reasons.append("100-corrections")
    return reasons


def _class_f1(labels: list[str], preds: list[str], cls: str) -> float:
    tp = sum(1 for l, p in zip(labels, preds) if l == cls and p == cls)
    fp = sum(1 for l, p in zip(labels, preds) if l != cls and p == cls)
    fn = sum(1 for l, p in zip(labels, preds) if l == cls and p != cls)
    denom = 2 * tp + fp + fn
    return (2 * tp / denom) if denom else 0.0


def class_regressions(
    labels: list[str],
    production_preds: list[str],
    candidate_preds: list[str],
) -> dict:
    """Classes where the candidate importantly regresses vs production.

    Small classes are noise (singletons can flip by construction), so
    only support >= 2 counts, and only drops > MAX_CLASS_DROP matter.
    """
    regressions = {}
    for cls in sorted(set(labels)):
        support = sum(1 for l in labels if l == cls)
        if support < MIN_SUPPORT:
            continue
        prod_f1 = _class_f1(labels, production_preds, cls)
        cand_f1 = _class_f1(labels, candidate_preds, cls)
        drop = round(prod_f1 - cand_f1, 3)
        if drop > MAX_CLASS_DROP:
            regressions[cls] = {
                "support": support,
                "production_f1": round(prod_f1, 3),
                "candidate_f1": round(cand_f1, 3),
                "drop": drop,
            }
    return regressions


def hybrid_gate(task: str, challenger: str) -> dict:
    """Phase 26 gate with the challenger seated in production."""
    from .evaluate import evaluate_task

    return evaluate_task(task, winner=challenger)


def compare_task(
    task: str,
    results: dict,
    production_winner: str,
    labels: list[str],
    gate_check=None,
) -> dict:
    """Decide promote/hold for one task. Never trusts training success alone."""
    gate_check = gate_check or hybrid_gate
    decision = {
        "task": task,
        "production": production_winner,
        "production_mean": None,
        "challenger": None,
        "challenger_mean": None,
        "delta": None,
        "decision": "hold",
        "reasons": [],
        "class_regressions": {},
        "gate": None,
    }
    if production_winner not in results:
        decision["reasons"].append(
            "production candidate absent from this run; manual review required"
        )
        return decision
    prod = results[production_winner]
    decision["production_mean"] = prod["mean"]
    others = {k: v for k, v in results.items() if k != production_winner}
    if not others:
        decision["reasons"].append("single candidate; nothing to compare")
        return decision
    challenger = max(others, key=lambda k: others[k]["mean"])
    cand = others[challenger]
    decision["challenger"] = challenger
    decision["challenger_mean"] = cand["mean"]
    delta = round(cand["mean"] - prod["mean"], 3)
    decision["delta"] = delta
    if delta < PROMOTE_MARGIN:
        decision["reasons"].append(
            f"improvement {delta:+.3f} below promotion margin {PROMOTE_MARGIN:.2f}"
        )
        return decision
    if cand["mean"] < FLOORS[task]:
        decision["reasons"].append(f"challenger {cand['mean']} below floor {FLOORS[task]}")
        return decision
    if cand.get("fit", 1.0) < FIT_MIN:
        decision["reasons"].append(f"challenger fit {cand.get('fit')} below {FIT_MIN}")
        return decision
    regressions = class_regressions(
        labels, [str(p) for p in prod["predictions"]], [str(p) for p in cand["predictions"]]
    )
    decision["class_regressions"] = regressions
    if regressions:
        decision["reasons"].append(
            f"important class regressions: {', '.join(sorted(regressions))}"
        )
        return decision
    gate = gate_check(task, challenger)
    decision["gate"] = gate
    if not gate.get("holds"):
        decision["reasons"].append("hybrid gate fails with challenger seated")
        return decision
    decision["decision"] = "promote"
    decision["reasons"].append(
        f"challenger beats production by {delta:+.3f} and passes every check"
    )
    return decision


def _load(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def run_retraining(
    now: datetime | None = None,
    corrections_since_run: int | None = None,
    force: bool = False,
    report_path: str | Path | None = None,
    ledger_path: str | Path | None = None,
    gate_check=None,
) -> dict:
    """One full retraining cycle: trigger, train, compare, record.

    Returns the ledger entry (triggered=False when not due). Writes the
    report (winners preserved unless promoted) and appends the ledger
    only when a run happens.
    """
    now = now or datetime.now(timezone.utc)
    report_path = Path(report_path) if report_path else MODELS_DIR / "report.json"
    ledger_path = Path(ledger_path) if ledger_path else MODELS_DIR / "ledger.json"

    ledger = _load(ledger_path, {"runs": []})
    last_run_at = None
    if ledger["runs"]:
        last_run_at = datetime.fromisoformat(ledger["runs"][-1]["training_date"])
    reasons = should_retrain(now, last_run_at, corrections_since_run)
    if force and not reasons:
        reasons = ["force"]
    if not reasons:
        return {"triggered": False, "training_date": now.isoformat(), "reasons": []}

    results = train_and_evaluate()
    existing = _load(report_path, {})
    prior_models = existing.get("models", {})
    production = {
        task: prior_models.get(task, {}).get("winner", results[task]["winner"])
        for task in results
    }
    labels = {}
    for task, (loader, _) in TASKS.items():
        _, task_labels = loader()
        labels[task] = [str(v) for v in task_labels]

    decisions, new_winners = {}, dict(production)
    for task, entry in results.items():
        d = compare_task(
            task, entry["results"], production[task], labels[task], gate_check=gate_check
        )
        decisions[task] = d
        if d["decision"] == "promote":
            new_winners[task] = d["challenger"]

    dsver = dataset_version()
    write_report(
        path=report_path,
        results=results,
        production_winners=new_winners,
        metadata={
            "retrain": {
                "training_date": now.isoformat(),
                "triggered_by": reasons,
                "dataset_version": dsver,
                "decisions": {
                    t: {"decision": d["decision"], "reasons": d["reasons"]}
                    for t, d in decisions.items()
                },
            }
        },
    )

    entry = {
        "training_date": now.isoformat(),
        "triggered_by": reasons,
        "corrections_since_run": corrections_since_run,
        "dataset_version": dsver,
        "metrics": {
            t: {
                "production_mean": d["production_mean"],
                "challenger": d["challenger"],
                "challenger_mean": d["challenger_mean"],
                "delta": d["delta"],
            }
            for t, d in decisions.items()
        },
        "decisions": {
            t: {
                "decision": d["decision"],
                "reasons": d["reasons"],
                "class_regressions": d["class_regressions"],
                "gate": d["gate"],
            }
            for t, d in decisions.items()
        },
        "model_versions": {t: f"{w}@{dsver}" for t, w in new_winners.items()},
        "production": new_winners,
    }
    ledger["runs"].append(entry)
    ledger_path.write_text(
        json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {"triggered": True, **entry}


if __name__ == "__main__":
    import sys

    summary = run_retraining(force="--force" in sys.argv)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
