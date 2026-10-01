"""Phase 13 completion gate: the event-type fixture set passes exactly."""

import json
from pathlib import Path

from classification import classify_event

SET_PATH = Path(__file__).parent / "fixtures" / "event-cases.json"


def test_event_fixture_set_passes():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["cases"]
    assert len(cases) >= 30, "gate needs a substantive fixture set"
    failures = []
    for case in cases:
        result = classify_event(case["title"], case["body"]).to_dict()
        if result["event_type"] != case["expected"]:
            failures.append(
                f'{case["id"]}: event={result["event_type"]!r} (expected {case["expected"]!r})'
            )
    assert not failures, "fixture failures:\n" + "\n".join(failures)
