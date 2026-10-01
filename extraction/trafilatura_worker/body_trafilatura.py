"""Stage 3 — Trafilatura body + metadata (Phase 7)."""

from .helpers import parse_date


def extract_with_trafilatura(html: str, url: str | None = None) -> dict | None:
    """bare_extraction with metadata; None when nothing usable comes back."""
    try:
        import trafilatura

        doc = trafilatura.bare_extraction(html, url=url, with_metadata=True)
    except Exception:
        return None
    if not doc:
        return None
    get = doc.get if isinstance(doc, dict) else (lambda k: getattr(doc, k, None))
    text = get("text")
    if not isinstance(text, str) or len(text.strip()) < 50:
        return None
    author = get("author")
    return {
        "title": get("title") if isinstance(get("title"), str) else None,
        "description": get("description") if isinstance(get("description"), str) else None,
        "author": author.strip() if isinstance(author, str) and author.strip() else None,
        "published_at": parse_date(get("date")),
        "body": text.strip(),
    }
