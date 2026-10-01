"""Unit tests: helpers, confidence, merge priority, adapter hook (Phase 7)."""

from trafilatura_worker.adapters import ADAPTERS, register_adapter
from trafilatura_worker.cascade import extract_article, score_confidence
from trafilatura_worker.helpers import normalise_title, parse_date


def test_parse_date_covers_publisher_formats():
    assert parse_date("2026-09-28T10:00:00+05:30") is not None
    assert parse_date("Sun, 28 Sep 2026 10:00:00 +0530") is not None
    assert parse_date("28 SEP 2026 18:00") is not None
    assert parse_date("September 28, 2026") is not None
    assert parse_date("28/09/2026") is not None
    assert parse_date("not a date") is None
    assert parse_date(None) is None


def test_normalise_title_strips_site_suffix():
    assert normalise_title("Bihar Cabinet approves X | Test Source") == "bihar cabinet approves x"
    assert normalise_title("Bihar Cabinet approves X") == "bihar cabinet approves x"


def test_confidence_thresholds():
    body = "\n".join(f"Paragraph {i} with substantive content about the development." for i in range(6))
    level, _ = score_confidence(
        title="T", title_source="json-ld", published_at="2026-09-28",
        description="D", body=body, title_variants=["T"], canonical_url="https://x.example/1",
        visible_chars=len(body) + 100,
    )
    assert level == "high"
    level, _ = score_confidence(
        title=None, title_source=None, published_at=None, description=None,
        body="short", title_variants=[], canonical_url=None, visible_chars=10000,
    )
    assert level == "failed"
    level, warnings = score_confidence(
        title="T", title_source="html-tag", published_at=None, description="D",
        body="A single-paragraph body long enough to clear two hundred characters in total length here for the test. " * 3,
        title_variants=["T", "Something else entirely"], canonical_url=None,
        visible_chars=800,
    )
    assert level == "low"
    assert "metadata-disagreement" in warnings


def test_empty_and_garbage_html_never_raise():
    for bad in ("", "   ", "<html><body>hi</body></html>", "<div>(((</div>"):
        record = extract_article(bad, "https://x.example/bad")
        assert record.extraction_method == "failed"
        assert record.extraction_confidence == "failed"
        assert record.body is None


def test_jsonld_skips_non_article_blocks():
    from trafilatura_worker.jsonld_meta import extract_jsonld_metadata

    html = (
        "<html><head>"
        '<script type="application/ld+json">{"@type": "Organization", "name": "Test"}</script>'
        '<script type="application/ld+json">{"@type": "NewsArticle", '
        '"headline": "Real Headline", "datePublished": "2026-09-28T10:00:00+05:30"}</script>'
        "</head><body></body></html>"
    )
    meta = extract_jsonld_metadata(html)
    assert meta["title"] == "Real Headline"
    assert meta["published_at"] is not None


def test_known_metadata_fills_gaps():
    html = (
        "<html><head><title>Story</title></head><body><article>"
        + "".join(f"<p>Paragraph {i} of the story body text here.</p>" for i in range(5))
        + "</article></body></html>"
    )
    record = extract_article(
        html,
        "https://x.example/story",
        known_metadata={"published_at": "2026-09-28", "canonical_url": "https://x.example/story"},
    )
    assert record.published_at == "2026-09-28"
    assert record.canonical_url == "https://x.example/story"


def test_adapter_override_and_registry():
    ADAPTERS.pop("adapter-demo.example", None)

    def demo_adapter(html, meta):
        return {"body": "Adapter body. " * 40, "title": "Adapter Title"}

    register_adapter("adapter-demo.example", demo_adapter)
    try:
        thin = "<html><head><title>t</title></head><body><p>thin</p></body></html>"
        record = extract_article(thin, "https://news.adapter-demo.example/thin")
        assert record.extraction_method == "adapter"
        assert record.title == "Adapter Title"
        assert record.body is not None and len(record.body) > 500
    finally:
        ADAPTERS.pop("adapter-demo.example", None)


def test_no_adapter_registered_is_noop():
    html = (
        "<html><head><title>Story</title></head><body><article>"
        + "".join(f"<p>Paragraph {i} of the story body text here.</p>" for i in range(5))
        + "</article></body></html>"
    )
    record = extract_article(html, "https://unregistered.example/story")
    assert record.extraction_method in ("trafilatura", "readability")


def test_readability_stage_wins_when_trafilatura_yields_nothing(monkeypatch):
    import trafilatura_worker.cascade as cascade_mod

    monkeypatch.setattr(cascade_mod, "extract_with_trafilatura", lambda html, url=None: None)
    html = (
        "<html><head><title>Fallback Story</title>"
        '<meta property="og:title" content="Fallback Story">'
        '<meta property="article:published_time" content="2026-09-28T10:00:00+05:30">'
        "</head><body><article>"
        + "".join(f"<p>Paragraph {i} of the story body text here for fallback.</p>" for i in range(5))
        + "</article></body></html>"
    )
    record = extract_article(html, "https://x.example/fallback")
    assert record.extraction_method == "readability"
    assert record.title == "Fallback Story"
    assert record.body is not None and len(record.body) > 200
    assert record.published_at is not None
