"""Unit tests: deterministic signatures, LSH behavior, blocking (Phase 15)."""

from dedup import (
    IndexedArticle,
    LSHIndex,
    MinHash,
    blocking_pass,
    cosine_similarity,
    exact_jaccard,
    hamming,
    shingles,
    simhash,
)


def test_shingles_stable_and_bounded():
    assert shingles("") == set()
    assert len(shingles("one two three four five six")) == 2
    assert shingles("a b") == {"a b"}


def test_minhash_deterministic_across_calls():
    mh = MinHash()
    text = "the cabinet approved two metro corridors on sunday morning"
    assert mh.signature(shingles(text)) == mh.signature(shingles(text))
    assert MinHash.jaccard(mh.signature(shingles(text)), mh.signature(shingles(text))) == 1.0


def test_minhash_estimate_tracks_exact():
    mh = MinHash()
    a = shingles("the quick brown fox jumps over the lazy dog near the river bank")
    b = shingles("the quick brown fox jumps over the lazy dog near the river side")
    exact = exact_jaccard(a, b)
    estimate = MinHash.jaccard(mh.signature(a), mh.signature(b))
    assert abs(exact - estimate) < 0.25


def test_simhash_orders_by_similarity():
    base = "the cabinet approved two metro corridors to bihta on sunday"
    near = "the cabinet approved two metro corridors to bihta on monday"
    far = "tigers roam the tall grasslands near the nepal border at dawn"
    assert hamming(simhash(base), simhash(near)) < hamming(simhash(base), simhash(far))


def test_cosine_stopwords_and_empty():
    assert cosine_similarity("", "something here") == 0.0
    assert cosine_similarity("the and of", "the and of") == 0.0
    assert cosine_similarity("metro corridors approved sunday", "metro corridors approved sunday") == 1.0


def test_lsh_finds_planted_near_duplicate_without_full_scan():
    mh = MinHash()
    index = LSHIndex()
    base_words = (
        "the state cabinet approved two metro corridors to bihta and fatuha "
        "on sunday morning after a detailed presentation by officials from "
        "the urban development department regarding land acquisition progress"
    )
    base = " ".join(base_words.split())
    texts = {f"bg-{i}": f"unrelated filler story number {i} about distant matters entirely" for i in range(10)}
    texts["target"] = base + " with minor additional wording appended here now"
    for i, (doc_id, text) in enumerate(texts.items()):
        index.add(
            IndexedArticle(
                id=doc_id, signature=mh.signature(shingles(text)), published_at=float(i * 100)
            )
        )
    found = index.candidates(mh.signature(shingles(base)), exclude_id="query")
    assert "target" in found
    assert len(found) < len(index)


def test_blocking_prunes_by_time_place_and_type():
    me = IndexedArticle(
        id="me", signature=(), published_at=1000.0,
        locations=frozenset({"patna"}), entities=frozenset(),
        category="weather", event_type=None,
    )
    others = {
        "old": IndexedArticle(id="old", signature=(), published_at=1000.0 - 200 * 3600, locations=frozenset({"patna"})),
        "elsewhere": IndexedArticle(id="elsewhere", signature=(), published_at=1000.0, locations=frozenset({"gaya"})),
        "close": IndexedArticle(id="close", signature=(), published_at=1100.0, locations=frozenset({"patna"})),
    }
    assert blocking_pass(me, others) == ["close"]
