"""Unit tests: event contract, None fallback, Hindi (Phase 13)."""

from classification import classify_event


def test_output_contract():
    result = classify_event("Cabinet approves metro", "The cabinet approved two corridors.").to_dict()
    assert set(result) >= {"event_type", "event_confidence", "event_evidence", "reason_codes"}
    assert result["event_type"] == "approval"
    assert result["event_confidence"] in ("high", "medium", "low")
    assert result["reason_codes"] == ["event:approval"]


def test_no_event_yields_none():
    result = classify_event("Actor tours cities", "Fans gathered along the route.").to_dict()
    assert result["event_type"] is None
    assert result["event_confidence"] == "low"
    assert result["reason_codes"] == ["event:none"]


def test_empty_input_never_raises():
    result = classify_event("", "").to_dict()
    assert result["event_type"] is None


def test_hindi_end_to_end():
    result = classify_event(
        "पटना मेट्रो विस्तार को मंजूरी", "कैबिनेट ने मंजूरी दी। स्वीकृति मिली।"
    ).to_dict()
    assert result["event_type"] == "approval"


def test_construction_lifecycle_distinct():
    assert classify_event("Work begins on corridor", "Construction begins Monday.").to_dict()["event_type"] == "construction_started"
    assert classify_event("Corridor opens for traffic", "The bridge opened Sunday.").to_dict()["event_type"] == "completion"
    assert classify_event("Varsity inaugurates school", "The school was inaugurated.").to_dict()["event_type"] == "inauguration"
