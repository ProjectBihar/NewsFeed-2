"""Unit tests: weights, None handling, numbers, window, assignment (Phase 16)."""

from clustering import (
    WEIGHTS,
    best_match,
    cluster_articles,
    numbers,
    pair_score,
)


def test_weights_sum_to_one():
    assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9


def test_identical_articles_score_one():
    article = {
        "headline": "Cabinet approves metro expansion",
        "body": "Two corridors approved.",
        "entities": ["patna-metro"],
        "districts": ["patna"],
        "event_type": "approval",
        "primary_category": "Infrastructure",
        "published_at": "2026-09-28T10:00:00+05:30",
    }
    score, breakdown = pair_score(article, dict(article))
    assert score == 1.0
    assert breakdown["entity"] == 1.0


def test_missing_fields_degrade_gracefully_not_fatally():
    thin = {"headline": "Something happened", "body": ""}
    score, _ = pair_score(thin, thin)
    assert 0.0 < score < 0.6


def test_numbers_extraction_normalizes():
    assert numbers("Rs 40,000 and 28 km") == {"40000", "28"}
    assert numbers("no digits here") == set()


def test_time_window_blocks_old_pairs():
    old = {
        "headline": "Metro approved", "body": "x",
        "entities": ["patna-metro"], "districts": ["patna"],
        "event_type": "approval", "primary_category": "Infrastructure",
        "published_at": "2026-01-01T10:00:00+05:30",
    }
    new = dict(old, published_at="2026-09-28T10:00:00+05:30")
    assert cluster_articles([old, new]) == [[old], [new]]


def test_best_match_assigns_or_abstains():
    story = [
        {
            "headline": "Metro approved", "body": "Two corridors approved.",
            "entities": ["patna-metro"], "districts": ["patna"],
            "event_type": "approval", "primary_category": "Infrastructure",
            "published_at": "2026-09-28T10:00:00+05:30",
        }
    ]
    member = dict(story[0], headline="Metro corridors cleared")
    loner = {
        "headline": "Cricket thriller ends", "body": "The team won by two runs.",
        "entities": [], "districts": [],
        "event_type": None, "primary_category": None,
        "published_at": "2026-09-28T10:00:00+05:30",
    }
    assert best_match(member, [story])[0] == 0
    assert best_match(loner, [story])[0] is None


def test_empty_input_clustering():
    assert cluster_articles([]) == []
