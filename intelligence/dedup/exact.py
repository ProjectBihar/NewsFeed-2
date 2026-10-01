"""Exact deduplication decisions (Phase 14).

Technical duplicates collapse; separate publishers covering the same
event never do — even on identical headlines. Rules, in order:

1. canonical_url match → duplicate (tracking/AMP/mobile/queue variants
   that normalised alike, plus repeated ingestion).
2. content_hash match → duplicate (identical syndicated bodies).
3. headline_hash match within the SAME source → duplicate (same publisher
   re-ingesting one story under variant URLs).
4. headline_hash match across DIFFERENT sources → not a duplicate
   (distinct coverage; story clustering's job in Phase 16).
"""

from dataclasses import dataclass, field


@dataclass
class KnownArticle:
    id: object
    source_id: object
    canonical_url: str
    content_hash: str | None
    headline_hash: str | None


@dataclass
class DedupResult:
    duplicate_of: object | None
    reason: str
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "duplicate_of": self.duplicate_of,
            "reason": self.reason,
            "evidence": self.evidence,
        }


def find_duplicate(
    candidate: dict, source_id: object, known: list[KnownArticle]
) -> DedupResult:
    """candidate keys from keys.article_keys(); known in ingestion order."""
    canonical = candidate.get("canonical_url")
    content = candidate.get("content_hash")
    headline = candidate.get("headline_hash")

    for article in known:
        if canonical and article.canonical_url == canonical:
            return DedupResult(article.id, "canonical-url", [f"url={canonical}"])
    if content:
        for article in known:
            if article.content_hash and article.content_hash == content:
                return DedupResult(article.id, "content-hash", ["identical body text"])
    if headline:
        for article in known:
            if (
                article.headline_hash
                and article.headline_hash == headline
                and article.source_id == source_id
            ):
                return DedupResult(
                    article.id, "headline-hash-same-source", ["same headline, same publisher"]
                )
    return DedupResult(None, "unique", [])


def deduplicate_batch(records: list[dict]) -> dict:
    """records: [{id, source_id, keys}]. Returns {record_id: duplicate_of | None}."""
    known: list[KnownArticle] = []
    outcome: dict = {}
    for record in records:
        keys = record["keys"]
        result = find_duplicate(keys, record["source_id"], known)
        outcome[record["id"]] = result.duplicate_of
        if result.duplicate_of is None:
            known.append(
                KnownArticle(
                    id=record["id"],
                    source_id=record["source_id"],
                    canonical_url=keys["canonical_url"],
                    content_hash=keys.get("content_hash"),
                    headline_hash=keys.get("headline_hash"),
                )
            )
    return outcome
