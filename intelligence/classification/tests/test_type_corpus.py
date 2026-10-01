"""Phase 11 completion gate: the type/tier regression corpus passes exactly."""

import json
from pathlib import Path

from classification import classify_article

SET_PATH = Path(__file__).parent / "fixtures" / "article-type-cases.json"


def test_type_corpus_passes():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["cases"]
    assert len(cases) >= 30, "gate needs a substantive regression corpus"
    failures = []
    for case in cases:
        result = classify_article(case["title"], case["body"]).to_dict()
        expected = case["expected"]
        mismatches = [
            f"{key}={result[key]!r} (expected {value!r})"
            for key, value in (
                ("article_type", expected["type"]),
                ("significance_tier", expected["tier"]),
                ("curated", expected["curated"]),
            )
            if result[key] != value
        ]
        if mismatches:
            failures.append(f'{case["id"]}: {"; ".join(mismatches)}')
    assert not failures, "corpus failures:\n" + "\n".join(failures)
