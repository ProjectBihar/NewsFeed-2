"""Stage 2 — OpenGraph / meta-tag metadata (Phase 7). Stdlib HTMLParser."""

from html.parser import HTMLParser

from .helpers import parse_date


class _MetaCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.props: dict[str, str] = {}
        self.names: dict[str, str] = {}
        self.title_tag: str | None = None
        self.canonical: str | None = None
        self._in_title = False
        self._title_chunks: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        attrs_d = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta":
            if "property" in attrs_d and "content" in attrs_d:
                self.props.setdefault(attrs_d["property"].strip().lower(), attrs_d["content"].strip())
            elif "name" in attrs_d and "content" in attrs_d:
                self.names.setdefault(attrs_d["name"].strip().lower(), attrs_d["content"].strip())
            elif "itemprop" in attrs_d and "content" in attrs_d:
                self.names.setdefault(attrs_d["itemprop"].strip().lower(), attrs_d["content"].strip())
        elif tag == "link" and attrs_d.get("rel", "").lower() == "canonical":
            self.canonical = attrs_d.get("href", "").strip() or self.canonical
        elif tag == "title":
            self._in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "title" and self._in_title:
            self._in_title = False
            text = "".join(self._title_chunks).strip()
            self.title_tag = text or None
            self._title_chunks = []

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_chunks.append(data)


def extract_og_metadata(html: str) -> dict:
    """og:* first, then plain meta names, then the raw <title> tag."""
    collector = _MetaCollector()
    try:
        collector.feed(html[:500_000])
    except Exception:
        pass
    props, names = collector.props, collector.names
    author = (
        props.get("article:author")
        or names.get("author")
        or props.get("author")
    )
    published = (
        parse_date(props.get("article:published_time"))
        or parse_date(names.get("date"))
        or parse_date(names.get("publish-date"))
        or parse_date(names.get("publishdate"))
    )
    return {
        "title": props.get("og:title") or None,
        "description": props.get("og:description") or names.get("description"),
        "author": author.strip() if author and author.strip() else None,
        "published_at": published,
        "canonical_url": props.get("og:url") or collector.canonical,
        "title_tag": collector.title_tag,
    }
