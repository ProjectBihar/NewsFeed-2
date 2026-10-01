"""Unit tests: transliteration, bridges, digit folding (Phase 17)."""

from clustering import augmented_pair_score, pair_score
from clustering.scoring import numbers
from clustering.xlingual import (
    bridge_entities,
    find_bridges,
    hindi_nouns,
    latin_nouns,
    transliterate,
)


def test_transliterate_spot_checks():
    assert transliterate("पटना") == "patanaa"
    assert transliterate("मेट्रो") == "metro"
    assert transliterate("बिहटा") == "bihataa"
    assert transliterate("गया") == "gayaa"


def test_find_bridges_links_names_across_scripts():
    bridges = find_bridges("पटना मेट्रो विस्तार", "Patna Metro expansion cleared")
    bridged_en = {en for _, en, _ in bridges}
    assert "patna" in bridged_en
    assert "metro" in bridged_en


def test_persian_spelling_divergence_does_not_bridge():
    # Documented limitation: Muzaffarpur (z) vs mujappharpur (j+ph).
    # Fuzzy phonetic matching is V2.x work; absence here is honest, not a bug.
    bridges = find_bridges("मुजफ्फरपुर में बैठक", "Meeting in Muzaffarpur town hall")
    assert all(en != "muzaffarpur" for _, en, _ in bridges)


def test_devanagari_digits_fold_for_number_overlap():
    assert numbers("७५० करोड़ रुपये") == {"750"}
    assert numbers("Rs 750 crore") == {"750"}


def test_noun_extraction_skips_stopwords():
    assert "के" not in hindi_nouns("विकास के कार्य")
    assert hindi_nouns("पटना मेट्रो विस्तार")


def test_district_disjoint_penalizes_same_crime_pattern():
    patna = {
        "headline": "Robbery in Patna", "body": "Police arrested men.",
        "entities": ["bihar-police"], "districts": ["patna"],
        "event_type": "crime", "primary_category": "Governance",
        "published_at": "2026-09-28T11:00:00+05:30",
    }
    gaya = dict(patna, headline="Robbery in Gaya", districts=["gaya"])
    score, breakdown = pair_score(patna, gaya)
    assert breakdown.get("district-mismatch") == -0.25
    assert score < 0.6


def test_augmented_scoring_uses_same_threshold():
    hi = {
        "headline": "पटना मेट्रो", "body": "बिहटा तक मेट्रो। २८ किलोमीटर।",
        "entities": [], "districts": ["patna"],
        "event_type": "approval", "primary_category": "Infrastructure",
        "published_at": "2026-09-28T15:00:00+05:30",
    }
    en = {
        "headline": "Metro cleared for Bihta", "body": "Two corridors covering 28 kilometres approved.",
        "entities": [], "districts": ["patna"],
        "event_type": "approval", "primary_category": "Infrastructure",
        "published_at": "2026-09-28T12:30:00+05:30",
    }
    plain, _ = pair_score(hi, en)
    augmented, breakdown = augmented_pair_score(hi, en)
    assert augmented >= plain
    assert "bridges" in breakdown
