"""Phase 15 completion gate: pairwise benchmark with margin discipline."""

import json
from pathlib import Path

from dedup import compare_texts

SET_PATH = Path(__file__).parent / "fixtures" / "neardup-cases.json"


def test_neardup_benchmark_passes_with_margin():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["pairs"]
    assert len(cases) >= 12, "gate needs a substantive benchmark"
    failures, closest_true, closest_false = [], 1.0, 0.0
    for case in cases:
        result = compare_texts(case["a"], case["b"]).to_dict()
        if case["near_duplicate"]:
            closest_true = min(closest_true, result["cosine"])
            if not result["near_duplicate"]:
                failures.append(f'{case["id"]}: missed (cosine={result["cosine"]})')
        else:
            closest_false = max(closest_false, result["cosine"])
            if result["near_duplicate"]:
                failures.append(f'{case["id"]}: false merge (cosine={result["cosine"]})')
    assert not failures, "benchmark failures:\n" + "\n".join(failures)
    # Margin discipline: the closest call on each side must clear 0.05.
    assert closest_true >= 0.65, f"true margin too thin: {closest_true}"
    assert closest_false <= 0.55, f"false margin too thin: {closest_false}"
