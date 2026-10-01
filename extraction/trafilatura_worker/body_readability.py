"""Stage 4 — Mozilla Readability fallback via readabilipy (Phase 7)."""

MIN_BODY_CHARS = 50


def extract_with_readability(html: str) -> dict | None:
    """Readability parse; None when the page yields no substantive text."""
    try:
        from readabilipy import simple_json_from_html_string

        parsed = simple_json_from_html_string(html, use_readability=True)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    title = parsed.get("title")
    chunks = parsed.get("plain_text") or []
    paragraphs = [
        block.get("text", "").strip()
        for block in chunks
        if isinstance(block, dict) and block.get("text", "").strip()
    ]
    # Drop a leading repeat of the headline (Readability includes it).
    if paragraphs and title and paragraphs[0].strip() == str(title).strip():
        paragraphs = paragraphs[1:]
    body = "\n".join(paragraphs)
    if len(body.strip()) < MIN_BODY_CHARS:
        return None
    byline = parsed.get("byline")
    return {
        "title": str(title).strip() if title and str(title).strip() else None,
        "description": None,
        "author": str(byline).strip() if byline and str(byline).strip() else None,
        "published_at": None,
        "body": body.strip(),
    }
