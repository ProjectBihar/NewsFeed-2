"""ProjectBihar Newsfeed V2 — extraction worker package (Phase 7).

Cascade: JSON-LD → OpenGraph → Trafilatura → Readability → adapter.
Parses article content only; never decides relevance or category.
"""

from .cascade import ArticleRecord, extract_article

__version__ = "0.2.0"

__all__ = ["ArticleRecord", "extract_article"]
