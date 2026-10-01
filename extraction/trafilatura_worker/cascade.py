"""Extraction cascade orchestrator (Phase 7).

Order: JSON-LD → OpenGraph → Trafilatura → Readability → adapter.
Metadata merges down that priority; the body comes from the first stage
that yields one. Confidence is deterministic points, never a bare flag.

This module parses article content only. It never decides Bihar
relevance, topic, or curation — those are later phases' jobs.
"""

from dataclasses import asdict, dataclass, field

from .adapters import extract_with_adapter
from .body_readability import extract_with_readability
from .body_trafilatura import extract_with_trafilatura
from .helpers import normalise_title, visible_text_length
from .jsonld_meta import extract_jsonld_metadata
from .opengraph_meta import extract_og_metadata

MIN_BODY_CHARS = 50


@dataclass
class ArticleRecord:
    url: str
    canonical_url: str | None
    title: str | None
    description: str | None
    body: str | None
    author: str | None
    published_at: str | None
    extraction_method: str
    extraction_confidence: str
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _paragraphs(body: str) -> list[str]:
    return [line.strip() for line in body.splitlines() if line.strip()]


def score_confidence(
    *,
    title: str | None,
    title_source: str | None,
    published_at: str | None,
    description: str | None,
    body: str | None,
    title_variants: list[str],
    canonical_url: str | None,
    visible_chars: int,
) -> tuple[str, list[str]]:
    """Deterministic points (max 100) → high/medium/low/failed."""
    warnings: list[str] = []
    if not body or len(body.strip()) < MIN_BODY_CHARS:
        return "failed", ["no-usable-body"]
    points = 0
    if title:
        if title_source in ("json-ld", "opengraph", "trafilatura", "readability"):
            points += 20
        else:
            points += 10
            warnings.append("title-from-html-tag-only")
    else:
        warnings.append("no-headline")
    if published_at:
        points += 15
    else:
        warnings.append("no-publication-date")
    if description:
        points += 10
    else:
        warnings.append("no-description")
    length = len(body.strip())
    if length >= 800:
        points += 20
    elif length >= 400:
        points += 15
    elif length >= 200:
        points += 10
    else:
        points += 5
        warnings.append("short-body")
    paras = _paragraphs(body)
    if len(paras) >= 5:
        points += 10
    elif len(paras) >= 3:
        points += 6
    else:
        points += 2
        warnings.append("thin-paragraph-structure")
    ratio = 1.0 - (length / visible_chars) if visible_chars > 0 else 1.0
    ratio = max(0.0, min(1.0, ratio))
    if ratio < 0.3:
        points += 10
    elif ratio < 0.5:
        points += 5
    else:
        warnings.append("high-boilerplate-ratio")
    agreed = {normalise_title(t) for t in title_variants if t}
    if len(agreed) >= 2:
        warnings.append("metadata-disagreement")
    elif len(agreed) == 1 and title:
        points += 10
    elif title:
        points += 3
    if canonical_url:
        points += 5
    else:
        warnings.append("no-canonical-url")
    if points >= 75:
        return "high", warnings
    if points >= 50:
        return "medium", warnings
    if points >= 25:
        return "low", warnings
    return "failed", warnings + ["score-below-floor"]


def extract_article(
    html: str, url: str, source_id: object = None, known_metadata: dict | None = None
) -> ArticleRecord:
    """Run the cascade over raw HTML; always returns a record, never raises."""
    known_metadata = known_metadata or {}
    if not isinstance(html, str) or not html.strip():
        return ArticleRecord(
            url=url,
            canonical_url=None,
            title=None,
            description=None,
            body=None,
            author=None,
            published_at=None,
            extraction_method="failed",
            extraction_confidence="failed",
            warnings=["empty-html"],
        )

    meta_ld = extract_jsonld_metadata(html)
    meta_og = extract_og_metadata(html)
    meta_trafi = extract_with_trafilatura(html, url) or {}
    meta_read = extract_with_readability(html) or {}

    title_variants = [
        meta_ld.get("title"),
        meta_og.get("title"),
        meta_trafi.get("title") if isinstance(meta_trafi, dict) else None,
        meta_read.get("title") if isinstance(meta_read, dict) else None,
    ]
    title = next((t for t in title_variants if t), None) or meta_og.get("title_tag")
    title_source = next(
        (
            stage
            for stage, t in zip(
                ("json-ld", "opengraph", "trafilatura", "readability"), title_variants
            )
            if t
        ),
        "html-tag" if meta_og.get("title_tag") else None,
    )

    def published_str(value: object) -> str | None:
        if value is None:
            return None
        if hasattr(value, "isoformat"):
            return value.isoformat()  # type: ignore[union-attr]
        return str(value)

    published_at = (
        published_str(meta_ld.get("published_at"))
        or published_str(meta_og.get("published_at"))
        or published_str(meta_trafi.get("published_at") if isinstance(meta_trafi, dict) else None)
        or published_str(known_metadata.get("published_at"))
    )
    description = (
        meta_ld.get("description")
        or meta_og.get("description")
        or (meta_trafi.get("description") if isinstance(meta_trafi, dict) else None)
    )
    author = (
        meta_ld.get("author")
        or meta_og.get("author")
        or (meta_trafi.get("author") if isinstance(meta_trafi, dict) else None)
        or (meta_read.get("author") if isinstance(meta_read, dict) else None)
        or known_metadata.get("author")
    )
    canonical_url = (
        meta_ld.get("canonical_url")
        or meta_og.get("canonical_url")
        or known_metadata.get("canonical_url")
    )

    body, method = None, "failed"
    for stage, candidate in (
        ("json-ld", meta_ld.get("body")),
        ("trafilatura", meta_trafi.get("body") if isinstance(meta_trafi, dict) else None),
        ("readability", meta_read.get("body") if isinstance(meta_read, dict) else None),
    ):
        if isinstance(candidate, str) and len(candidate.strip()) >= MIN_BODY_CHARS:
            body, method = candidate.strip(), stage
            break

    # Adapter override: a domain adapter replaces a missing or weak
    # generic result when it does better. Real adapters land with
    # real-page fixtures; the hook itself is always available.
    # (No-op when no adapter is registered for the domain.)
    adapted = extract_with_adapter(
        html,
        url,
        {"title": title, "description": description, "author": author},
    )
    if adapted and isinstance(adapted.get("body"), str):
        adapted_body = adapted["body"].strip()
        if method == "failed" or len(adapted_body) > len((body or "")):
            body, method = adapted_body, "adapter"
            if adapted.get("title"):
                title, title_source = adapted["title"], "adapter"
                title_variants.append(adapted["title"])

    confidence, warnings = score_confidence(
        title=title,
        title_source=title_source,
        published_at=published_at,
        description=description,
        body=body,
        title_variants=[t for t in title_variants if t],
        canonical_url=canonical_url,
        visible_chars=visible_text_length(html),
    )
    if method == "failed":
        confidence = "failed"
        if "no-usable-body" not in warnings:
            warnings = ["no-usable-body"] + warnings

    return ArticleRecord(
        url=url,
        canonical_url=canonical_url,
        title=title,
        description=description,
        body=body,
        author=author,
        published_at=published_at,
        extraction_method=method,
        extraction_confidence=confidence,
        warnings=warnings,
    )
