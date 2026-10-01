"""Unit tests: contract, datelines, ambiguity, incidental mentions (Phase 10)."""

from relevance import assess_relevance
from relevance.evidence import detect_dateline


def test_output_contract_never_bare_boolean():
    result = assess_relevance("Bihar Cabinet meets", "The cabinet met in Patna.")
    payload = result.to_dict()
    assert set(payload) == {"pass", "score", "confidence", "evidence", "locations", "entities"}
    assert isinstance(payload["pass"], bool)
    assert 0.0 <= payload["score"] <= 1.0
    assert payload["confidence"] in ("high", "medium", "low")
    assert payload["evidence"]


def test_empty_input_fails_with_evidence():
    result = assess_relevance("", "")
    assert result.to_dict()["pass"] is False
    assert result.to_dict()["evidence"]


def test_dateline_detection():
    assert detect_dateline("PATNA: Something happened.") == "PATNA"
    assert detect_dateline("New Delhi: Something happened.") == "New Delhi"
    assert detect_dateline("पटना: कुछ हुआ।") == "पटना"
    assert detect_dateline("No dateline here, just text.") is None


def test_bihar_dateline_with_content_passes():
    result = assess_relevance("Cabinet meeting ends", "PATNA: The cabinet cleared three proposals on Monday.")
    assert result.to_dict()["pass"] is True


def test_other_state_dateline_counts_negative():
    result = assess_relevance("Farm package approved", "NEW DELHI: The union cabinet approved a farm package.")
    assert result.to_dict()["pass"] is False
    assert any("dateline" in e for e in result.to_dict()["evidence"])


def test_aurangabad_without_context_resolves_other():
    result = assess_relevance(
        "Civic polls announced", "The municipal corporation of Aurangabad announced ward reservations."
    )
    assert result.to_dict()["pass"] is False
    assert any("ambiguous" in e for e in result.to_dict()["evidence"])


def test_aurangabad_with_bihar_context_resolves_bihar():
    result = assess_relevance(
        "Bypass sanctioned",
        "The road construction department sanctioned a bypass for Aurangabad town in Bihar. Officials in Patna confirmed.",
    )
    assert result.to_dict()["pass"] is True


def test_incidental_single_mention_fails():
    result = assess_relevance(
        "Parliament discusses floods",
        "Members discussed floods in Assam, Bihar and Uttar Pradesh and demanded a national policy.",
    )
    assert result.to_dict()["pass"] is False


def test_routine_crime_is_relevant_but_not_curated_here():
    # Relevance answers centrality only; tiers are Phase 11's job.
    result = assess_relevance(
        "Three arrested after robbery in Patna",
        "PATNA: Police arrested three men for a jewellery shop robbery.",
    )
    assert result.to_dict()["pass"] is True


def test_acronym_codes_match_case_sensitively():
    # "gay" the English word must not fire the Gaya airport code.
    result = assess_relevance("Festival mood", "The atmosphere was cheerful and gay throughout the fair.")
    assert result.to_dict()["pass"] is False
