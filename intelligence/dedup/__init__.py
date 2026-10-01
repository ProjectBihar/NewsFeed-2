"""Near-duplicate detection (Phases 14-15): exact keys, MinHash LSH,
SimHash, cosine confirmation, bounded pipeline."""

from .exact import DedupResult, KnownArticle, deduplicate_batch, find_duplicate
from .keys import article_keys, content_hash, headline_hash, normalise_headline
from .lsh import IndexedArticle, LSHIndex, blocking_pass
from .near_dup import (
    NearDupResult,
    QueryArticle,
    compare_texts,
    content_tokens,
    cosine_similarity,
    find_near_duplicates,
    index_signature,
)
from .signatures import MinHash, exact_jaccard, hamming, shingles, simhash

__version__ = "0.3.0"

__all__ = [
    "DedupResult",
    "IndexedArticle",
    "KnownArticle",
    "LSHIndex",
    "MinHash",
    "NearDupResult",
    "QueryArticle",
    "article_keys",
    "blocking_pass",
    "compare_texts",
    "content_hash",
    "content_tokens",
    "cosine_similarity",
    "deduplicate_batch",
    "exact_jaccard",
    "find_duplicate",
    "find_near_duplicates",
    "hamming",
    "headline_hash",
    "index_signature",
    "normalise_headline",
    "shingles",
    "simhash",
]
