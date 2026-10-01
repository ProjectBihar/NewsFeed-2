"""Statistical training harness (Phase 25).

Cheap CPU models (logistic regression vs linear SVC) on TF-IDF word +
character n-grams, measured against the frozen component corpora —
never against live claims. No artifact blobs: candidates refit
deterministically on demand (seconds); intelligence/models/report.json
records versions, data, and cross-validated metrics.

Protocols (honest for small data):
- relevance (60 balanced binary): stratified 5-fold CV, F1.
- article_type (31, some singletons) and primary_category (37):
  leave-one-out CV, macro-F1 (singletons can never be recalled held
  out — pessimistic by construction, stated, not hidden).
"""

import json
import warnings
from datetime import datetime, timezone
from pathlib import Path

from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.svm import LinearSVC

from .features import build_vectorizer

# Benign on our tiny corpora (many classes, few samples each).
warnings.filterwarnings("ignore", message=".*unique classes.*")

ROOT = Path(__file__).resolve().parent.parent.parent
RANDOM_STATE = 7

CANDIDATES = {
    "logistic-regression": lambda: LogisticRegression(max_iter=2000, C=1.0),
    "logistic-balanced": lambda: LogisticRegression(max_iter=2000, C=1.0, class_weight="balanced"),
    "linear-svc": lambda: LinearSVC(C=1.0),
    "linear-svc-balanced": lambda: LinearSVC(C=1.0, class_weight="balanced"),
}


def _load_json(rel: str):
    with open(ROOT / rel, encoding="utf-8") as fh:
        return json.load(fh)


def relevance_data():
    items = _load_json("intelligence/relevance/tests/fixtures/benchmark.json")["items"]
    texts = [f'{i["title"]}\n{i["body"]}' for i in items]
    labels = [bool(i["expected"]) for i in items]
    return texts, labels


def type_data():
    cases = _load_json("intelligence/classification/tests/fixtures/article-type-cases.json")["cases"]
    texts = [f'{c["title"]}\n{c["body"]}' for c in cases]
    labels = [c["expected"]["type"] for c in cases]
    return texts, labels


def category_data():
    cases = _load_json("intelligence/classification/tests/fixtures/topic-cases.json")["cases"]
    kept = [c for c in cases if c["expected"]["primary"] is not None]
    texts = [f'{c["title"]}\n{c["body"]}' for c in kept]
    labels = [c["expected"]["primary"] for c in kept]
    return texts, labels


def _pipeline(kind: str) -> Pipeline:
    return Pipeline([("features", build_vectorizer()), ("clf", CANDIDATES[kind]())])


def cross_validated_f1(texts: list[str], labels: list, kind: str, protocol: str) -> dict:
    """Headline CV metric plus per-fold predictions for inspection.

    Stratified folds average per-fold macro-F1 (standard). Leave-one-out
    scores macro-F1 over the whole prediction vector — averaging per-fold
    0/1s would misreport accuracy as macro-F1.
    """
    estimator = _pipeline(kind)
    if protocol == "stratified-5-fold":
        cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=RANDOM_STATE)
        folds = list(cv.split(texts, labels))
        fold_f1, predictions = [], [None] * len(texts)
        for train_idx, test_idx in folds:
            estimator.fit([texts[i] for i in train_idx], [labels[i] for i in train_idx])
            preds = estimator.predict([texts[i] for i in test_idx])
            for position, pred in zip(test_idx, preds):
                predictions[position] = pred
            fold_f1.append(
                f1_score([labels[i] for i in test_idx], list(preds), average="macro", zero_division=0)
            )
        import statistics

        return {
            "mean": round(statistics.fmean(fold_f1), 3),
            "std": round(statistics.pstdev(fold_f1), 3) if len(fold_f1) > 1 else 0.0,
            "folds": len(fold_f1),
            "predictions": [str(p) for p in predictions],
        }
    if protocol == "leave-one-out":
        predictions = []
        for i in range(len(texts)):
            train_x = [texts[j] for j in range(len(texts)) if j != i]
            train_y = [labels[j] for j in range(len(texts)) if j != i]
            estimator.fit(train_x, train_y)
            predictions.append(estimator.predict([texts[i]])[0])
        mean = f1_score(labels, predictions, average="macro", zero_division=0)
        return {
            "mean": round(float(mean), 3),
            "std": 0.0,
            "folds": len(texts),
            "predictions": [str(p) for p in predictions],
        }
    raise ValueError(f"unknown protocol {protocol}")


TASKS = {
    "relevance": (relevance_data, "stratified-5-fold"),
    "article_type": (type_data, "leave-one-out"),
    "primary_category": (category_data, "leave-one-out"),
}


def train_and_evaluate() -> dict:
    """Fit all candidates per task on the frozen corpora; pick by CV macro-F1.

    Also records train-set fit: ~1.0 means the model can represent the
    task and only data is missing; far below means the approach itself
    is inadequate.
    """
    report = {}
    for task, (loader, protocol) in TASKS.items():
        texts, labels = loader()
        results = {}
        for kind in CANDIDATES:
            cv = cross_validated_f1(texts, labels, kind, protocol)
            estimator = _pipeline(kind)
            estimator.fit(texts, labels)
            fit = f1_score(labels, estimator.predict(texts), average="macro", zero_division=0)
            results[kind] = {**cv, "fit": round(float(fit), 3)}
        winner = max(results, key=lambda k: results[k]["mean"])
        report[task] = {
            "n": len(texts),
            "labels": sorted(set(labels), key=str),
            "protocol": protocol,
            "winner": winner,
            "results": results,
        }
    return report


def write_report(
    path: str | None = None,
    results: dict | None = None,
    production_winners: dict | None = None,
    metadata: dict | None = None,
) -> dict:
    """Evaluate candidates and write report.json.

    production_winners pins each task's production `winner` independent
    of which candidate currently scores best: a fresh evaluation alone
    must never promote a model (Phase 27 — promotion goes through
    models.retrain). Omitted, existing report winners are preserved
    (first run: argmax).
    metadata (e.g. retrain provenance) is merged at the top level.
    """
    models = results if results is not None else train_and_evaluate()
    if production_winners is None:
        production_winners = {}
        target = Path(path) if path else Path(__file__).parent / "report.json"
        if target.exists():
            try:
                existing = json.loads(target.read_text(encoding="utf-8"))
                production_winners = {
                    task: entry["winner"]
                    for task, entry in existing.get("models", {}).items()
                    if "winner" in entry
                }
            except (json.JSONDecodeError, KeyError, OSError):
                production_winners = {}
    for task, winner in production_winners.items():
        # Pin verbatim: if the pinned winner is missing from the fresh
        # candidate set, keep it anyway (loud failure beats silent
        # argmax promotion — models.retrain flags this for review).
        if task in models:
            models[task]["winner"] = winner
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "evaluation-corpus-v1",
        "models": models,
    }
    if metadata:
        report.update(metadata)
    target = Path(path) if path else Path(__file__).parent / "report.json"
    with open(target, "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    return report


def refit(task: str):
    """Refit the winning candidate on the full task corpus (deterministic)."""
    loader, _ = TASKS[task]
    texts, labels = loader()
    report_path = Path(__file__).parent / "report.json"
    winner = "logistic-regression"
    if report_path.exists():
        with open(report_path, encoding="utf-8") as fh:
            winner = json.load(fh)["models"][task]["winner"]
    estimator = _pipeline(winner)
    estimator.fit(texts, labels)
    return estimator


if __name__ == "__main__":
    import pprint

    pprint.pp(write_report())
