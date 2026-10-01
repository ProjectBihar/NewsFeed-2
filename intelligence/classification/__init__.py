"""Article-type classification (Phase 11). Kind, consequence, curation."""

from .classifier import ClassificationResult, classify_article
from .events import EventResult, classify_event
from .topic import TopicResult, classify_topic

__version__ = "0.3.0"

__all__ = [
    "ClassificationResult",
    "EventResult",
    "TopicResult",
    "classify_article",
    "classify_event",
    "classify_topic",
]
