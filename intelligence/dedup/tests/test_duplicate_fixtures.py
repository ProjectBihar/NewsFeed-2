"""Phase 14 completion gate: known duplicate fixtures collapse correctly."""

import json
from pathlib import Path

from dedup import KnownArticle, article_keys, find_duplicate

SET_PATH = Path(__file__).parent / "fixtures" / "duplicate-cases.json"


def _record(entry):
    keys = article_keys(entry["url"], entry["canonical"], entry["headline"], entry["body"])
    return entry["id"], entry["source"], keys


def test_duplicate_fixtures_collapse_correctly():
    cases = json.loads(SET_PATH.read_text(encoding="utf-8"))["pairs"]
    assert len(cases) >= 14, "gate needs a substantive fixture set"
    failures = []
    for case in cases:
        aid, asource, akeys = _record(case["a"])
        bid, bsource, bkeys = _record(case["b"])
        known = [
            KnownArticle(
                id=aid,
                source_id=asource,
                canonical_url=akeys["canonical_url"],
                content_hash=akeys["content_hash"],
                headline_hash=akeys["headline_hash"],
            )
        ]
        result = find_duplicate(bkeys, bsource, known)
        if case["duplicate"]:
            if result.duplicate_of != aid:
                failures.append(f'{case["id"]}: expected collapse onto {aid}, got {result.to_dict()}')
            elif result.reason != case["reason"]:
                failures.append(
                    f'{case["id"]}: reason {result.reason!r} (expected {case["reason"]!r})'
                )
        elif result.duplicate_of is not None:
            failures.append(f'{case["id"]}: wrongly collapsed: {result.to_dict()}')
    assert not failures, "fixture failures:\n" + "\n".join(failures)
