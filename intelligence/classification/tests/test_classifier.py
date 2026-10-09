"""Unit tests: contract, fallback, overrides, selection (Phase 11)."""

from classification import classify_article


def test_output_contract():
    result = classify_article("Cabinet approves metro project", "The cabinet approved the metro corridors.")
    payload = result.to_dict()
    assert set(payload) >= {
        "article_type", "article_type_confidence", "significance_tier",
        "curated", "type_evidence", "tier_evidence", "reason_codes",
    }
    assert payload["significance_tier"] in ("A", "B", "C", "D")
    assert payload["article_type_confidence"] in ("high", "medium", "low")
    assert isinstance(payload["curated"], bool)
    assert payload["reason_codes"][0].startswith("type:")


def test_garbage_input_falls_back_without_raising():
    for bad in ("", "   "):
        result = classify_article(bad, bad).to_dict()
        assert result["article_type"] == "miscellaneous"
        assert result["curated"] is False


def test_advertorial_markers_dominate():
    result = classify_article(
        "Best tractor loans", "Sponsored partner content with easy advertisement loans."
    ).to_dict()
    assert result["article_type"] == "advertorial"
    assert result["significance_tier"] == "D"
    assert result["curated"] is False


def test_embedded_ad_slot_does_not_turn_ordinary_reporting_into_an_advertorial():
    title = "Katihar railway officer saves passenger with CPR"
    body = "The officer saved the passenger at Katihar junction."
    baseline = classify_article(title, body).to_dict()
    for banner in ("ADVERTISEMENT", "विज्ञापन"):
        result = classify_article(title, f"{body}\n{banner}\nMedical staff attended the passenger.").to_dict()
        assert result["article_type"] == baseline["article_type"]
        assert result["article_type"] != "advertorial"


def test_mass_casualty_upgrades_accident():
    minor = classify_article("Bus overturns", "Two injured after the bus overturned.").to_dict()
    assert minor["significance_tier"] == "C"
    major = classify_article(
        "Twelve killed as bus overturns",
        "Twelve passengers were killed after the bus overturned.",
    ).to_dict()
    assert major["article_type"] == "accident"
    assert major["significance_tier"] == "B"
    assert major["curated"] is True


def test_infra_failure_overrides_accident():
    result = classify_article(
        "Bridge collapses a year after construction",
        "The bridge collapsed. The construction department ordered a probe.",
    ).to_dict()
    assert result["article_type"] == "development"
    assert result["curated"] is True


def test_court_selection_needs_markers():
    routine = classify_article("Court grants bail", "The court granted bail. The hearing lasted minutes.").to_dict()
    assert routine["article_type"] == "court"
    assert routine["significance_tier"] == "B"
    assert routine["curated"] is False
    directed = classify_article(
        "High Court directs audit", "The High Court directed a forensic audit of civic funds."
    ).to_dict()
    assert directed["curated"] is True


def test_hindi_end_to_end():
    result = classify_article(
        "पटना मेट्रो विस्तार को मंजूरी",
        "कैबिनेट ने मेट्रो परियोजना को मंजूरी दी। निर्माण के लिए निविदाएं आएंगी।",
    ).to_dict()
    assert result["article_type"] == "development"
    assert result["significance_tier"] == "A"
    assert result["curated"] is True
