"""Unit tests: topic contract, None fallback, secondary discipline (Phase 12)."""

from classification import classify_topic


def test_output_contract():
    result = classify_topic("Metro expansion approved", "Two metro corridors transform urban transport.").to_dict()
    assert set(result) >= {"primary_category", "category_confidence", "secondary_topics", "reason_codes"}
    assert result["primary_category"] == "Infrastructure"
    assert result["secondary_topics"][0] == "Metro & Urban Transport"
    assert result["category_confidence"] in ("high", "medium", "low")
    assert result["reason_codes"][0] == "category:Infrastructure"


def test_no_domain_yields_none_not_forced_bucket():
    result = classify_topic("Actor tours cities", "Fans gathered as the celebrity motorcade passed.").to_dict()
    assert result["primary_category"] is None
    assert result["secondary_topics"] == []
    assert result["category_confidence"] == "low"


def test_secondary_list_is_capped_and_ranked():
    body = " ".join([
        "metro corridors", "urban transport", "metro rail", "city bus",
        "highway bypass", "elevated road", "bridge", "flyover",
        "airport terminal", "runway", "civil enclave",
    ])
    result = classify_topic("Transport bonanza", body).to_dict()
    assert len(result["secondary_topics"]) <= 4
    assert result["primary_category"] == "Infrastructure"


def test_empty_input_never_raises():
    result = classify_topic("", "").to_dict()
    assert result["primary_category"] is None
    assert result["secondary_topics"] == []


def test_hindi_end_to_end():
    result = classify_topic(
        "पटना मेट्रो विस्तार", "मेट्रो रेल से शहरी परिवहन बदलेगा। निर्माण अगले साल।"
    ).to_dict()
    assert result["primary_category"] == "Infrastructure"
