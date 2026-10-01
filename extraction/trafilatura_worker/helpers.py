"""Shared helpers: dates, titles, visible-text estimates (Phase 7)."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser

_DATE_FORMATS = (
    "%d %b %Y %H:%M",
    "%d %b %Y",
    "%d %B %Y %H:%M",
    "%B %d, %Y",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
)


def parse_date(value: object) -> datetime | None:
    """Best-effort parse of the date strings publishers actually emit."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    try:  # ISO-8601 incl. offsets and trailing Z (3.11+).
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    try:  # RFC-822 (RSS-era pubDates).
        return parsedate_to_datetime(text)
    except (TypeError, ValueError):
        pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def normalise_title(title: str) -> str:
    """Lowercased core used for cross-source agreement checks."""
    core = title.strip().lower()
    for sep in (" | ", " – ", " — ", " - ", " : "):
        if sep in core:
            core = core.split(sep)[0]
    return core.strip(" -–—|: \t")


class _VisibleText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.chars = 0
        self._skip = 0

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag in ("script", "style", "noscript"):
            self._skip += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style", "noscript") and self._skip:
            self._skip -= 1

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self.chars += len(data.strip())


def visible_text_length(html: str) -> int:
    """Rough visible-character count; denominator for the boilerplate ratio."""
    parser = _VisibleText()
    try:
        parser.feed(html)
    except Exception:
        return 0
    return parser.chars
