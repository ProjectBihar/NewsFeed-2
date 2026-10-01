"""Unit tests: key normalization, thresholds, decision rules (Phase 14)."""

from dedup import (
    article_keys,
    content_hash,
    deduplicate_batch,
    find_duplicate,
    headline_hash,
)


def test_headline_normalization_collapses_variants():
    assert headline_hash("Metro Expansion Approved") == headline_hash("metro expansion approved")
    assert headline_hash("Metro expansion approved | Test Source") == headline_hash("Metro expansion approved")
    assert headline_hash("BIHAR CABINET MEETS TODAY!") == headline_hash("Bihar cabinet meets today")
    assert headline_hash("") is None
    assert headline_hash("   ") is None


def test_content_hash_threshold_and_safety():
    assert content_hash("x" * 49) is None
    assert content_hash("") is None
    assert content_hash(None) is None
    assert content_hash("word " * 30) == content_hash("word  " * 30)


def test_canonical_match_wins_first():
    keys = article_keys("https://u.example/a?x=1", "https://u.example/a", "T", "body " * 20)
    known = [
        {"id": 1, "source_id": "s", "keys": keys},
    ]
    from dedup import KnownArticle

    known_objs = [KnownArticle(id=1, source_id="s", canonical_url=keys["canonical_url"], content_hash=None, headline_hash=None)]
    result = find_duplicate(keys, "other-source", known_objs)
    assert result.duplicate_of == 1
    assert result.reason == "canonical-url"


def test_cross_source_headline_never_collapses():
    from dedup import KnownArticle

    a = article_keys("https://a.example/1", "https://a.example/1", "Same headline here", "First body text with enough length to hash properly here.")
    b = article_keys("https://b.example/2", "https://b.example/2", "Same headline here", "Second body text with enough length to hash properly there.")
    known = [KnownArticle(id="a", source_id="s1", canonical_url=a["canonical_url"], content_hash=a["content_hash"], headline_hash=a["headline_hash"])]
    result = find_duplicate(b, "s2", known)
    assert result.duplicate_of is None
    assert result.reason == "unique"


def test_batch_links_chains_to_earliest():
    k1 = article_keys("https://q.example/1", "https://q.example/1", "Story one", "Body text number one with sufficient length for hashing.")
    k2 = article_keys("https://q.example/1?x=1", "https://q.example/1", "Story one", "Body text number one with sufficient length for hashing.")
    k3 = article_keys("https://q.example/2", "https://q.example/2", "Other story", "Entirely different body text with sufficient length for hashing.")
    outcome = deduplicate_batch([
        {"id": "r1", "source_id": "s", "keys": k1},
        {"id": "r2", "source_id": "s", "keys": k2},
        {"id": "r3", "source_id": "s", "keys": k3},
    ])
    assert outcome == {"r1": None, "r2": "r1", "r3": None}
