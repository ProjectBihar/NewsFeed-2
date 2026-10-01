"""Phase 12 completion gate: the topic benchmark passes exactly."""

import json
from pathlib import Path

from classification import classify_topic

SET_PATH = Path(__file__).parent / "fixtures" / "topic-cases.json"


def test_topic_benchmark_passes():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["cases"]
    assert len(cases) >= 30, "gate needs a substantive benchmark"
    failures = []
    for case in cases:
        result = classify_topic(case["title"], case["body"]).to_dict()
        expected = case["expected"]
        problems = []
        if result["primary_category"] != expected["primary"]:
            problems.append(f'primary={result["primary_category"]!r} (expected {expected["primary"]!r})')
        missing = [s for s in expected["secondary"] if s not in result["secondary_topics"]]
        if missing:
            problems.append(f'missing secondary {missing} (got {result["secondary_topics"]})')
        if problems:
            failures.append(f'{case["id"]}: {"; ".join(problems)}')
    assert not failures, "benchmark failures:\n" + "\n".join(failures)
