"""Phase 8 completion gate: labelled bilingual set, threshold 0.95."""

import json
from pathlib import Path

from language import detect_language

THRESHOLD = 0.95

SET_PATH = Path(__file__).parent / "fixtures" / "bilingual-test-set.json"


def test_bilingual_accuracy_meets_threshold():
    items = json.loads(SET_PATH.read_text(encoding="utf-8"))["items"]
    assert len(items) >= 40, "gate needs a substantive labelled set"
    misses = []
    for item in items:
        predicted = detect_language(item["text"]).language
        if predicted != item["expected"]:
            misses.append(f'{item["id"]}: expected {item["expected"]}, got {predicted}')
    accuracy = (len(items) - len(misses)) / len(items)
    assert accuracy >= THRESHOLD, f"accuracy {accuracy:.3f} below {THRESHOLD}; misses: {misses}"
