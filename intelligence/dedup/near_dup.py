"""Near-duplicate decisions (Phase 15).

Unigram cosine over content tokens decides; stopwords removed. The
threshold (0.6) separates genuine rewrites from same-angle lookalikes
with margin — templates never reach the scorer in production anyway:
blocking (location/entity/category-event) prunes them first, which the
pipeline test proves. MinHash LSH retrieves candidates; SimHash is
recorded for observability and future clustering features.
"""

import math
from collections import Counter
from dataclasses import asdict, dataclass, field

from .signatures import MinHash, hamming, shingles, simhash, tokens

NEAR_DUP_COSINE = 0.60
MIN_CONTENT_TOKENS = 10

_minhash = MinHash(num_perm=128, seed=42)


def index_signature(text: str) -> tuple[int, ...]:
    """Retrieval signature: unigram MinHash (recall-oriented; paraphrases
    collide). Order-sensitive shingles would miss every genuine rewrite."""
    return _minhash.signature(shingles(text, 1))


def _stopwords() -> frozenset[str]:
    from language.profiles import ENGLISH_FUNCTION_WORDS, HINDI_FUNCTION_WORDS

    return ENGLISH_FUNCTION_WORDS | HINDI_FUNCTION_WORDS


def content_tokens(text: str) -> list[str]:
    """Content tokens with function words removed."""
    stop = _stopwords()
    return [t for t in tokens(text) if t not in stop]


def cosine_similarity(a: str, b: str) -> float:
    """Unigram cosine over content tokens (function words removed)."""
    counter_a = Counter(content_tokens(a))
    counter_b = Counter(content_tokens(b))
    if not counter_a or not counter_b:
        return 0.0
    dot = sum(counter_a[t] * counter_b.get(t, 0) for t in counter_a)
    norm = math.sqrt(sum(v * v for v in counter_a.values())) * math.sqrt(
        sum(v * v for v in counter_b.values())
    )
    return round(dot / norm, 3) if norm else 0.0


@dataclass
class NearDupResult:
    near_duplicate: bool
    cosine: float
    jaccard: float
    simhash_distance: int
    reason: str
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def compare_texts(a: str, b: str) -> NearDupResult:
    """Pairwise near-duplicate verdict for two article bodies."""
    if len(content_tokens(a)) < MIN_CONTENT_TOKENS or len(content_tokens(b)) < MIN_CONTENT_TOKENS:
        return NearDupResult(False, 0.0, 0.0, 0, "insufficient-text", [])
    cosine = cosine_similarity(a, b)
    set_a, set_b = shingles(a), shingles(b)
    estimate = round(MinHash.jaccard(_minhash.signature(set_a), _minhash.signature(set_b)), 3)
    distance = hamming(simhash(a), simhash(b))
    evidence = [f"cosine={cosine}", f"minhash={estimate}", f"simhash={distance}"]
    if cosine >= NEAR_DUP_COSINE:
        return NearDupResult(True, cosine, estimate, distance, "high-overlap", evidence)
    return NearDupResult(False, cosine, estimate, distance, "below-threshold", evidence)


@dataclass
class QueryArticle:
    id: object
    text: str
    published_at: float | None = None
    locations: frozenset = frozenset()
    entities: frozenset = frozenset()
    category: str | None = None
    event_type: str | None = None


def find_near_duplicates(
    candidate: QueryArticle,
    index,  # LSHIndex
    texts: dict,
    window_hours: float = 72.0,
) -> list[tuple]:
    """Bounded pipeline: LSH candidates → blocking → confirmation.

    Returns [(article_id, NearDupResult)] for confirmed near-duplicates.
    Bodies come from the caller (the database in production); the index
    holds only signatures and blocking metadata.
    """
    from .lsh import IndexedArticle, blocking_pass

    signature = index_signature(candidate.text)
    probed = IndexedArticle(
        id=candidate.id,
        signature=signature,
        published_at=candidate.published_at,
        locations=candidate.locations,
        entities=candidate.entities,
        category=candidate.category,
        event_type=candidate.event_type,
    )
    candidate_ids = index.candidates(signature, exclude_id=candidate.id)
    shortlisted = blocking_pass(
        probed, {i: index.articles[i] for i in candidate_ids}, window_hours=window_hours
    )
    confirmed = []
    for article_id in shortlisted:
        body = texts.get(article_id)
        if not body:
            continue
        result = compare_texts(candidate.text, body)
        if result.near_duplicate:
            confirmed.append((article_id, result))
    return confirmed
