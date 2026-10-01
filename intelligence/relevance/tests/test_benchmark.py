"""Phase 10 completion gate: benchmark precision/recall with FP/FN detail."""

import json
from pathlib import Path

from relevance import assess_relevance

SET_PATH = Path(__file__).parent / "fixtures" / "benchmark.json"


def test_benchmark_meets_thresholds():
    corpus = json.loads(SET_PATH.read_text(encoding="utf-8"))
    thresholds = corpus["thresholds"]
    items = corpus["items"]
    assert len(items) >= 60, "gate needs a substantive benchmark"

    false_positives, false_negatives = [], []
    tp = fp = fn = 0
    for item in items:
        predicted = assess_relevance(item["title"], item["body"]).to_dict()["pass"]
        if predicted and item["expected"]:
            tp += 1
        elif predicted:
            fp += 1
            false_positives.append(item["id"])
        elif item["expected"]:
            fn += 1
            false_negatives.append(item["id"])

    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    assert precision >= thresholds["precision"], f"precision {precision:.3f}; FP: {false_positives}"
    assert recall >= thresholds["recall"], f"recall {recall:.3f}; FN: {false_negatives}"
