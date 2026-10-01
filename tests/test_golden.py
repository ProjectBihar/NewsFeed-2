"""Golden regression gate (Phase 24): every fixed bug stays fixed.

Each file in tests/regression/ pins the behavior that a historical
failure taught us. A bug fix is incomplete until its example lives
here; any change that alters a pinned output fails loudly by design.
"""

import json
from pathlib import Path

REGRESSION_DIR = Path(__file__).parent / "regression"


def _run_case(case: dict) -> dict:
    from relevance import assess_relevance
    from classification import classify_article

    return {
        "relevance": assess_relevance(case["title"], case["body"]).to_dict(),
        "type": classify_article(case["title"], case["body"]).to_dict(),
    }


def test_golden_regressions_hold():
    files = sorted(REGRESSION_DIR.glob("*.json"))
    assert len(files) >= 7, "gate needs the committed historical failures"
    failures = []
    for path in files:
        spec = json.loads(path.read_text(encoding="utf-8"))
        assert spec["id"] and spec["history"] and spec["phase"], path.name
        for position, case in enumerate(spec["cases"]):
            result = _run_case(case)
            context = f'{path.name}[{position}] {case["title"][:60]}'
            expected = case.get("expect", {})
            if "relevance" in expected and result["relevance"]["pass"] != expected["relevance"]["pass"]:
                failures.append(f'{context}: relevance pass={result["relevance"]["pass"]}')
            if "type" in expected:
                for key, value in expected["type"].items():
                    if result["type"][key] != value:
                        failures.append(f"{context}: type.{key}={result['type'][key]!r} (expected {value!r})")
    assert not failures, "golden regressions broke:\n" + "\n".join(failures)
