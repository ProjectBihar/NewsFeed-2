"""Stage 1 — JSON-LD metadata (Phase 7). Dependency-free (stdlib only)."""

import json

from .helpers import parse_date

ARTICLE_TYPES = {
    "NewsArticle",
    "Article",
    "BlogPosting",
    "ReportageNewsArticle",
    "AnalysisNewsArticle",
    "BackgroundNewsArticle",
    "OpinionNewsArticle",
    "ReviewNewsArticle",
}


def _iter_nodes(payload: object):
    if isinstance(payload, dict):
        if "@graph" in payload and isinstance(payload["@graph"], list):
            yield from payload["@graph"]
        else:
            yield payload
    elif isinstance(payload, list):
        for item in payload:
            yield from _iter_nodes(item)


def _author_name(author: object) -> str | None:
    if isinstance(author, str):
        return author.strip() or None
    if isinstance(author, dict):
        name = author.get("name")
        return name.strip() if isinstance(name, str) and name.strip() else None
    if isinstance(author, list):
        names = [n for n in (_author_name(a) for a in author) if n]
        return ", ".join(names) or None
    return None


def extract_jsonld_metadata(html: str) -> dict:
    """First NewsArticle-like node wins; articleBody kept as a body candidate."""
    meta: dict = {
        "title": None,
        "description": None,
        "author": None,
        "published_at": None,
        "canonical_url": None,
        "body": None,
    }
    start = 0
    while True:
        open_tag = html.find('<script type="application/ld+json"', start)
        if open_tag < 0:
            open_tag = html.find("<script type='application/ld+json'", start)
        if open_tag < 0:
            return meta
        content_start = html.find(">", open_tag) + 1
        close_tag = html.find("</script>", content_start)
        if close_tag < 0:
            return meta
        raw = html[content_start:close_tag]
        start = close_tag + len("</script>")
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            continue
        for node in _iter_nodes(payload):
            if not isinstance(node, dict):
                continue
            node_type = node.get("@type")
            types = {node_type} if isinstance(node_type, str) else set(node_type or [])
            if not (types & ARTICLE_TYPES):
                continue
            headline = node.get("headline")
            if isinstance(headline, str) and headline.strip():
                meta["title"] = headline.strip()
            description = node.get("description")
            if isinstance(description, str) and description.strip() and not meta["description"]:
                meta["description"] = description.strip()
            meta["author"] = meta["author"] or _author_name(node.get("author"))
            if not meta["published_at"]:
                meta["published_at"] = parse_date(node.get("datePublished"))
            for key in ("mainEntityOfPage", "url"):
                value = node.get(key)
                if isinstance(value, dict):
                    value = value.get("@id") or value.get("url")
                if isinstance(value, str) and value.strip() and not meta["canonical_url"]:
                    meta["canonical_url"] = value.strip()
            body = node.get("articleBody")
            if isinstance(body, str) and len(body.strip()) >= 50 and not meta["body"]:
                meta["body"] = body.strip()
            if meta["title"]:
                return meta
        # No article node in this block: keep scanning later scripts.
