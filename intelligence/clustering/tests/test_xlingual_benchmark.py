"""Phase 17 completion gate: Hindi-English corpus merges or holds apart."""

import json
from pathlib import Path

from clustering import CLUSTER_THRESHOLD, augmented_pair_score

SET_PATH = Path(__file__).parent / "fixtures" / "xlingual-cases.json"


def test_xlingual_corpus_passes():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["cases"]
    assert len(cases) >= 10, "gate needs a substantive fixture corpus"
    failures = []
    for case in cases:
        score, _ = augmented_pair_score(case["a"], case["b"])
        merged = score >= CLUSTER_THRESHOLD
        if merged != case["merge"]:
            failures.append(f'{case["id"]}: score={score} merged={merged} (expected {case["merge"]})')
    assert not failures, "corpus failures:\n" + "\n".join(failures)
