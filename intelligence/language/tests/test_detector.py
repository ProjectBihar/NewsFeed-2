"""Unit tests: scripts, scoring, fallbacks, extensibility (Phase 8)."""

from language import (
    LanguageProfile,
    PROFILES,
    detect_language,
    format_script_mix,
    register_language,
    script_mix,
)


def test_script_mix_counts_letters_only():
    mix = script_mix("Patna 123 पटना!")
    assert set(mix) == {"Latn", "Deva"}
    assert abs(sum(mix.values()) - 1.0) < 0.02
    assert script_mix("123 !!!") == {}
    assert format_script_mix({}) == "none"


def test_english_with_devanagari_entities_stays_english():
    result = detect_language(
        "The Cabinet in पटना approved the metro project on Sunday. "
        "Officials said the report will be ready in three months."
    )
    assert result.language == "en"
    assert result.language_confidence >= 0.8
    assert "Deva" in result.script_mix
    assert result.evidence


def test_hindi_with_latin_loans_stays_hindi():
    result = detect_language(
        "राज्य कैबिनेट ने Patna Metro को मंजूरी दे दी। अधिकारियों के अनुसार "
        "तीन महीने में रिपोर्ट सौंप दी जाएगी।"
    )
    assert result.language == "hi"
    assert "Latn" in result.script_mix


def test_empty_input_defaults_with_zero_confidence():
    for bad in ("", "   ", None, 123):
        result = detect_language(bad)
        assert result.language_confidence == 0.0
        assert result.evidence


def test_headline_only_falls_back_weakly_but_explicitly():
    result = detect_language("Bihar Cabinet approves Patna Metro expansion")
    assert result.language == "en"
    assert result.language_confidence <= 0.4
    assert any("script-fallback" in e for e in result.evidence)


def test_result_serialises_to_articles_columns():
    result = detect_language("The state government approved the project on Monday.")
    payload = result.to_dict()
    assert set(payload) >= {"language", "language_confidence", "script_mix", "evidence"}


def test_new_language_registers_without_schema_change():
    assert "xx" not in PROFILES
    register_language(
        LanguageProfile(code="xx", scripts=("Latn",), function_words=frozenset({"zebra", "quux"}))
    )
    try:
        result = detect_language("zebra quux zebra quux zebra quux zebra quux")
        assert result.language == "xx"
    finally:
        del PROFILES["xx"]


def test_register_language_rejects_empty_profiles():
    import pytest

    with pytest.raises(ValueError):
        register_language(LanguageProfile(code="", scripts=(), function_words=frozenset()))
