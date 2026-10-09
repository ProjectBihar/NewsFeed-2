"""Database-free bridge to the existing extraction and intelligence libraries."""
import json
import os
from pathlib import Path
import sys

# Library notices must not corrupt the single JSON response on stdout.
PROTOCOL_STDOUT = os.fdopen(os.dup(sys.stdout.fileno()), "w", encoding="utf-8")
# Also redirect notices written directly by native libraries to descriptor 1.
os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
sys.stdout = sys.stderr

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "extraction"), str(ROOT / "intelligence")]

from trafilatura_worker import extract_article
from official_document import extract_official_pdf
from language import detect_language
from relevance import assess_relevance
from relevance.knowledge import get_knowledge_base
from classification import classify_article, classify_topic, classify_event
from classification.timeline_policy import timeline_policy
from dedup.keys import article_keys
from dedup.exact import find_duplicate, KnownArticle
from dedup.lsh import LSHIndex, IndexedArticle
from dedup.near_dup import QueryArticle, find_near_duplicates, index_signature
from dedup.signatures import simhash
from clustering.scoring import _parse_time, CLUSTER_THRESHOLD
from clustering.xlingual import augmented_pair_score
from clustering.titles import select_title

VERSION = "rules-v1-pipeline-20261010-crime-preference"


def analyze(request):
    if request["html"].startswith("PROJECTBIHAR_PDF_V1:"):
        article = extract_official_pdf(request["html"], request["url"], request.get("discovery_metadata") or {})
    else:
        article = extract_article(request["html"], request["url"]).to_dict()
    title, body = article.get("title") or "", article.get("body") or ""
    language = detect_language(body).to_dict()
    relevance = assess_relevance(title, body).to_dict()
    kind = classify_article(title, body).to_dict()
    if (request.get("discovery_metadata") or {}).get("summary_only"):
        article["extraction_method"] = "publisher-rss-summary"
        article["warnings"].append("publisher-rss-summary-only")
        kind["curated"] = False
        kind["reason_codes"].append("summary-only-not-curated")
    topic = classify_topic(title, body).to_dict()
    event = classify_event(title, body).to_dict()
    # Resolve the evidence's canonical names back to the KB's stable IDs.
    kb = get_knowledge_base()
    names = {e["name"] for e in relevance["locations"] + relevance["entities"]}
    entities = [e for e in kb.entities.values() if e["canonical_name"] in names]
    districts = sorted({e["district"] for e in relevance["locations"] if e.get("district")})
    fingerprint = json.dumps({"minhash": index_signature(body), "simhash": str(simhash(body))})
    return {
        "article": article, "language": language, "relevance": relevance,
        "classification": kind, "topic": topic, "event": event,
        "timeline": timeline_policy(title, article.get("description"), body),
        "entities": entities, "districts": districts,
        "keys": article_keys(request["url"], article.get("canonical_url"), title, body),
        "fingerprint": fingerprint, "classifier_version": VERSION,
    }


def assign(request):
    candidate, others = request["candidate"], request["others"]
    candidate["source_id"] = str(candidate["source_id"])
    for other in others:
        other["source_id"] = str(other["source_id"])
    keys = {k: candidate.get(k) for k in ("canonical_url", "content_hash", "headline_hash")}
    exact = find_duplicate(keys, candidate["source_id"], [KnownArticle(
        id=o["id"], source_id=o["source_id"], canonical_url=o["canonical_url"],
        content_hash=o.get("content_hash"), headline_hash=o.get("headline_hash")
    ) for o in others])
    if exact.duplicate_of is not None:
        return {"duplicate_of": exact.duplicate_of, "reason": exact.reason}

    # Near-duplicate collapse is limited to the same publisher. Independent
    # rewritten coverage remains a report and is grouped by story clustering.
    index, texts = LSHIndex(), {}
    for other in others:
        if other["source_id"] != candidate["source_id"] or not other.get("body"):
            continue
        signature = json.loads(other.get("similarity_fingerprint") or "{}").get("minhash")
        if not signature:
            signature = index_signature(other["body"])
        index.add(IndexedArticle(
            id=other["id"], signature=tuple(signature), published_at=_parse_time(other.get("published_at")),
            locations=frozenset(other.get("districts") or []), entities=frozenset(other.get("entities") or []),
            category=other.get("primary_category"), event_type=other.get("event_type"),
        ))
        texts[other["id"]] = other["body"]
    near = find_near_duplicates(QueryArticle(
        id=None, text=candidate.get("body") or "", published_at=_parse_time(candidate.get("published_at")),
        locations=frozenset(candidate.get("districts") or []), entities=frozenset(candidate.get("entities") or []),
        category=candidate.get("primary_category"), event_type=candidate.get("event_type"),
    ), index, texts)
    if near:
        best = sorted(near, key=lambda x: (-x[1].cosine, x[0]))[0]
        return {"duplicate_of": best[0], "reason": "near-duplicate-same-source", "evidence": best[1].to_dict()}

    best_story, best_score, evidence = None, 0.0, {}
    stamp = _parse_time(candidate.get("published_at"))
    for other in others:
        other_stamp = _parse_time(other.get("published_at"))
        if stamp is not None and other_stamp is not None and abs(stamp - other_stamp) > 168 * 3600:
            continue
        score, signals = augmented_pair_score(candidate, other)
        if other.get("story_id") is not None and score > best_score:
            best_story, best_score, evidence = other["story_id"], score, signals
    return {"story_id": best_story if best_score >= CLUSTER_THRESHOLD else None,
            "cluster_score": best_score, "evidence": evidence}


def handle(request):
    if request["operation"] == "analyze":
        return analyze(request)
    if request["operation"] == "assign":
        return assign(request)
    if request["operation"] == "title":
        return select_title(request["members"], request.get("override")).to_dict()
    raise ValueError("Unknown worker operation")


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(handle(payload), ensure_ascii=False, allow_nan=False), file=PROTOCOL_STDOUT)
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
