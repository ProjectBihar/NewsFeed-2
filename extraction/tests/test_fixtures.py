"""Fixture-corpus regression runner (Phase 7): 30 publishers, one contract each."""

import json
from pathlib import Path

import pytest

from trafilatura_worker import extract_article

FIXTURES_DIR = Path(__file__).parent / "fixtures"
CONFIDENCE_ORDER = {"failed": 0, "low": 1, "medium": 2, "high": 3}

with open(FIXTURES_DIR / "manifest.json", encoding="utf-8") as fh:
    MANIFEST = json.load(fh)["fixtures"]


def _paragraphs(body):
    return [line.strip() for line in body.splitlines() if line.strip()]


@pytest.mark.parametrize("entry", MANIFEST, ids=[m["file"] for m in MANIFEST])
def test_fixture_contract(entry):
    html = (FIXTURES_DIR / entry["file"]).read_text(encoding="utf-8")
    record = extract_article(html, entry["url"])
    expect = entry["expect"]
    tag = entry["file"]

    if expect.get("title_contains"):
        assert record.title and expect["title_contains"] in record.title, tag
    if expect["date_present"]:
        assert record.published_at, f"{tag}: expected a publication date"
    else:
        assert not record.published_at, f"{tag}: expected no publication date, got {record.published_at}"
    if expect["author_present"]:
        assert record.author, f"{tag}: expected an author"
    if expect["canonical_present"]:
        assert record.canonical_url, f"{tag}: expected a canonical URL"
    if expect["body_present"]:
        assert record.body, f"{tag}: expected a body"
        assert len(_paragraphs(record.body)) >= expect["min_paragraphs"], tag
        for marker in expect.get("contains", []):
            assert marker in record.body, f"{tag}: body missing {marker!r}"
        assert record.extraction_method != "failed", tag
    else:
        assert not record.body, f"{tag}: expected no usable body"
        assert record.extraction_method == "failed", tag
        assert record.extraction_confidence == "failed", tag
    floor = CONFIDENCE_ORDER[expect["min_confidence"]]
    actual = CONFIDENCE_ORDER[record.extraction_confidence]
    assert actual >= floor, f"{tag}: confidence {record.extraction_confidence} below {expect['min_confidence']}"
