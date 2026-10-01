"""Unit tests: rules, override, ties, empties (Phase 18)."""

from clustering import score_headline, select_title


def test_entity_and_event_signals_win():
    members = [
        {"headline": "Cabinet approves Patna Metro expansion", "entities": ["patna-metro", "bihar-cabinet"]},
        {"headline": "Two metro corridors cleared", "entities": ["patna-metro"]},
    ]
    result = select_title(members).to_dict()
    assert result["canonical_title"] == "Cabinet approves Patna Metro expansion"
    assert result["method"] == "rule"
    assert any("entities" in e for e in result["evidence"])


def test_clickbait_penalty():
    members = [
        {"headline": "You won't believe what the cabinet did!!!", "entities": ["bihar-cabinet"]},
        {"headline": "Cabinet approves metro corridors", "entities": ["bihar-cabinet"]},
    ]
    assert select_title(members).to_dict()["canonical_title"] == "Cabinet approves metro corridors"


def test_conciseness_and_completeness():
    short = score_headline("Metro ok", ["patna-metro"], {})
    full = score_headline("Cabinet approves Patna Metro expansion across the city", ["patna-metro"], {})
    assert full[0] > short[0]
    assert "fragment" in short[1]


def test_tie_break_is_deterministic():
    members = [
        {"headline": "Metro corridors cleared today", "entities": [], "published_at": "2026-09-28T12:00:00+05:30"},
        {"headline": "Metro corridors cleared today", "entities": [], "published_at": "2026-09-28T10:00:00+05:30"},
    ]
    first = select_title(members).to_dict()
    assert first["canonical_title"] == "Metro corridors cleared today"
    assert first["candidate_scores"][0]["headline"] == "Metro corridors cleared today"


def test_override_wins_and_empty_returns_none():
    members = [{"headline": "Adequate headline here today", "entities": []}]
    manual = select_title(members, override="Editor's chosen title").to_dict()
    assert manual["canonical_title"] == "Editor's chosen title"
    assert manual["method"] == "manual"
    empty = select_title([{"headline": "  "}, {}]).to_dict()
    assert empty["canonical_title"] is None
    assert empty["method"] == "none"


def test_source_and_confidence_quality_counts():
    plain = score_headline("Cabinet approves metro corridors in the capital region", ["bihar-cabinet"], {})
    quality = score_headline(
        "Cabinet approves metro corridors in the capital region",
        ["bihar-cabinet"],
        {"extraction_confidence": "high", "source_priority": "high"},
    )
    assert quality[0] > plain[0]
