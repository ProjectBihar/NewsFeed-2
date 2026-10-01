"""Story clustering (Phases 16-17). Distinct reports, one development."""

from .cluster import best_match, cluster_articles
from .scoring import CLUSTER_THRESHOLD, WEIGHTS, numbers, pair_score
from .titles import TitleResult, score_headline, select_title
from .xlingual import (
    augmented_pair_score,
    bridge_entities,
    find_bridges,
    hindi_nouns,
    latin_nouns,
    transliterate,
)

__version__ = "0.2.0"

__all__ = [
    "CLUSTER_THRESHOLD",
    "TitleResult",
    "WEIGHTS",
    "augmented_pair_score",
    "best_match",
    "bridge_entities",
    "cluster_articles",
    "find_bridges",
    "hindi_nouns",
    "latin_nouns",
    "numbers",
    "pair_score",
    "score_headline",
    "select_title",
    "transliterate",
]
