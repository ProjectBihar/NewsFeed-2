"""Bounded candidate retrieval (Phase 15): LSH banding plus blocking.

Never compare every article against history: LSH bands surface probable
matches in sublinear time, and blocking prefilters (recency window,
location/entity overlap, category/event compatibility) cut the rest.
"""

from dataclasses import dataclass, field


@dataclass
class IndexedArticle:
    id: object
    signature: tuple[int, ...]
    published_at: float | None  # epoch seconds; None disables recency filter
    locations: frozenset = field(default_factory=frozenset)
    entities: frozenset = field(default_factory=frozenset)
    category: str | None = None
    event_type: str | None = None


class LSHIndex:
    """b bands x r rows banding over MinHash signatures.

    Defaults (64x2, S-curve ≈ 0.13) are recall-first: genuine rewrites
    collide with near-certainty while truly dissimilar texts rarely do.
    Blocking plus cosine confirmation downstream restore precision, so
    over-retrieval here is cheap and under-retrieval is the real danger.
    The signature must hold >= bands x rows.
    """

    def __init__(self, bands: int = 64, rows: int = 2) -> None:
        if bands * rows > 1024:
            raise ValueError("bands x rows exceeds signature budget")
        self.bands = bands
        self.rows = rows
        self.tables: list[dict] = [{} for _ in range(bands)]
        self.articles: dict = {}

    def add(self, article: IndexedArticle) -> None:
        self.articles[article.id] = article
        for band in range(self.bands):
            start = band * self.rows
            key = article.signature[start : start + self.rows]
            self.tables[band].setdefault(key, []).append(article.id)

    def candidates(self, signature: tuple[int, ...], exclude_id: object = None) -> set:
        found: set = set()
        for band in range(self.bands):
            start = band * self.rows
            key = signature[start : start + self.rows]
            for article_id in self.tables[band].get(key, []):
                if article_id != exclude_id:
                    found.add(article_id)
        return found

    def __len__(self) -> int:
        return len(self.articles)


def blocking_pass(
    candidate: IndexedArticle,
    others: dict,
    window_hours: float = 72.0,
    require_overlap: bool = True,
) -> list:
    """Recency + overlap + compatibility filters over LSH candidates."""
    passed = []
    for article_id in others:
        other = others[article_id]
        if candidate.published_at is not None and other.published_at is not None:
            if abs(candidate.published_at - other.published_at) > window_hours * 3600:
                continue
        if require_overlap:
            place_overlap = bool(candidate.locations & other.locations)
            entity_overlap = bool(candidate.entities & other.entities)
            compat = (
                candidate.category is not None
                and candidate.category == other.category
                and candidate.event_type is not None
                and candidate.event_type == other.event_type
            )
            if not (place_overlap or entity_overlap or compat):
                continue
        else:
            if (
                candidate.category is not None
                and other.category is not None
                and candidate.category != other.category
            ):
                continue
            if (
                candidate.event_type is not None
                and other.event_type is not None
                and candidate.event_type != other.event_type
            ):
                continue
        passed.append(article_id)
    return passed
