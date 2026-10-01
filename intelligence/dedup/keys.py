"""Dedup keys (Phase 14): content hash and normalised headline hash.

Canonical URLs arrive already normalised from discovery/enqueue —
normalisation stays TS-side; this module never re-normalises.
"""

import hashlib
import re

_WS_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)


def normalise_headline(headline: str) -> str:
    """Lowercased core without site suffixes or punctuation."""
    core = (headline or "").strip().lower()
    for sep in (" | ", " – ", " — ", " - ", " : ", " :: "):
        if sep in core:
            core = core.split(sep)[0]
    core = _PUNCT_RE.sub("", core)
    return _WS_RE.sub(" ", core).strip()


def headline_hash(headline: str) -> str | None:
    norm = normalise_headline(headline)
    if not norm:
        return None
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


def content_hash(body: str | None) -> str | None:
    """Whitespace-collapsed sha256. Identical syndicated bodies collide;
    rewritten coverage does not (that is Phase 15's job)."""
    if not isinstance(body, str) or not body.strip():
        return None
    collapsed = _WS_RE.sub(" ", body.strip())
    if len(collapsed) < 50:
        return None
    return hashlib.sha256(collapsed.encode("utf-8")).hexdigest()


def article_keys(url: str, canonical_url: str | None, headline: str | None, body: str | None) -> dict:
    return {
        "url": url,
        "canonical_url": canonical_url or url,
        "content_hash": content_hash(body),
        "headline_hash": headline_hash(headline or ""),
    }
