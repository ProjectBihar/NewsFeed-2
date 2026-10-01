"""Stage 5 — source-specific adapters (Phase 7).

Adapters are domain-keyed extractors for publishers whose markup defeats
the generic stages. They run last, and additionally override a
low/failed generic result when they do better. No built-in publisher
adapters ship yet: real ones require real pages and land with
regression fixtures, not guesses.
"""

from collections.abc import Callable
from urllib.parse import urlparse

AdapterFn = Callable[[str, dict], dict | None]
ADAPTERS: dict[str, AdapterFn] = {}


def register_adapter(domain: str, fn: AdapterFn) -> None:
    """Register an extractor for a registrable domain (e.g. "example.com")."""
    ADAPTERS[domain.strip().lower()] = fn


def adapter_for_url(url: str) -> AdapterFn | None:
    """Longest registrable-domain match (subdomains included)."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return None
    best: AdapterFn | None = None
    best_len = -1
    for domain, fn in ADAPTERS.items():
        if host == domain or host.endswith("." + domain):
            if len(domain) > best_len:
                best, best_len = fn, len(domain)
    return best


def extract_with_adapter(html: str, url: str, meta: dict) -> dict | None:
    """Run the domain adapter when one exists; None otherwise."""
    fn = adapter_for_url(url)
    if fn is None:
        return None
    try:
        result = fn(html, meta)
    except Exception:
        return None
    if not isinstance(result, dict):
        return None
    body = result.get("body")
    if not isinstance(body, str) or len(body.strip()) < 50:
        return None
    return result
