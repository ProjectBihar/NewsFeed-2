"""Permanent evaluation runner (Phase 23): all required metrics from the
committed benchmark. Deterministic: same corpus in, same report out.
Run: python -m evaluation.run  (from repo root) or via pytest gate.
"""

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "extraction"))
sys.path.insert(0, str(ROOT / "intelligence"))

from trafilatura_worker import extract_article  # noqa: E402
from language import detect_language  # noqa: E402
from relevance import assess_relevance  # noqa: E402
from classification import classify_article, classify_topic, classify_event  # noqa: E402
from dedup import compare_texts, find_duplicate, KnownArticle, article_keys  # noqa: E402
from clustering import cluster_articles, augmented_pair_score, CLUSTER_THRESHOLD  # noqa: E402


def _load(rel: str):
    with open(ROOT / rel, encoding="utf-8") as fh:
        return json.load(fh)


def _prf(y_true: list, y_pred: list, positive) -> tuple[float, float]:
    tp = sum(1 for t, p in zip(y_true, y_pred) if t == positive and p == positive)
    fp = sum(1 for t, p in zip(y_true, y_pred) if t != positive and p == positive)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t == positive and p != positive)
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    return round(precision, 3), round(recall, 3)


def _macro_f1(y_true: list, y_pred: list) -> float:
    labels = sorted(set(y_true) | set(y_pred), key=str)
    f1s = []
    for label in labels:
        precision, recall = _prf(y_true, y_pred, label)
        f1s.append(0.0 if precision + recall == 0 else 2 * precision * recall / (precision + recall))
    return round(sum(f1s) / len(f1s), 3) if f1s else 1.0


def _accuracy(y_true: list, y_pred: list) -> float:
    return round(sum(1 for t, p in zip(y_true, y_pred) if t == p) / max(1, len(y_true)), 3)


def evaluate() -> dict:
    corpus = _load("evaluation/corpus.json")
    by_id = {c["id"]: c for c in corpus["components"]}
    metrics: dict[str, dict] = {}

    relevance = _load(by_id["relevance"]["path"])["items"]
    rel_true = [i["expected"] for i in relevance]
    rel_pred = [assess_relevance(i["title"], i["body"]).to_dict()["pass"] for i in relevance]
    precision, recall = _prf(rel_true, rel_pred, True)
    metrics["relevance_precision"] = {"value": precision, "n": len(relevance)}
    metrics["relevance_recall"] = {"value": recall, "n": len(relevance)}

    type_cases = _load(by_id["article-type"]["path"])["cases"]
    type_out = [classify_article(c["title"], c["body"]).to_dict() for c in type_cases]
    cur_true = [c["expected"]["curated"] for c in type_cases]
    cur_pred = [o["curated"] for o in type_out]
    precision, recall = _prf(cur_true, cur_pred, True)
    metrics["curated_precision"] = {"value": precision, "n": len(type_cases)}
    metrics["curated_recall"] = {"value": recall, "n": len(type_cases)}
    metrics["article_type_macro_f1"] = {
        "value": _macro_f1([c["expected"]["type"] for c in type_cases], [o["article_type"] for o in type_out]),
        "n": len(type_cases),
    }

    topic_cases = _load(by_id["topic"]["path"])["cases"]
    topic_out = [classify_topic(c["title"], c["body"]).to_dict() for c in topic_cases]
    metrics["category_macro_f1"] = {
        "value": _macro_f1(
            [c["expected"]["primary"] for c in topic_cases],
            [o["primary_category"] for o in topic_out],
        ),
        "n": len(topic_cases),
    }

    event_cases = _load(by_id["event"]["path"])["cases"]
    event_out = [classify_event(c["title"], c["body"]).to_dict() for c in event_cases]
    event_true = [c["expected"] for c in event_cases]
    event_pred = [o["event_type"] for o in event_out]
    metrics["event_accuracy"] = {"value": _accuracy(event_true, event_pred), "n": len(event_cases)}
    metrics["event_macro_f1"] = {"value": _macro_f1(event_true, event_pred), "n": len(event_cases)}

    story = _load(by_id["story"]["path"])["articles"]
    clusters = cluster_articles(story)
    member_cluster = {}
    for index, group in enumerate(clusters):
        for article in group:
            member_cluster[article["id"]] = index
    expected_cluster = {}
    for index, story_id in enumerate(sorted({a["story"] for a in story if a["story"] is not None})):
        for article in [a for a in story if a["story"] == story_id]:
            expected_cluster[article["id"]] = index
    offset = max(expected_cluster.values(), default=-1) + 1
    for article in [a for a in story if a["story"] is None]:
        offset += 1
        expected_cluster[article["id"]] = offset
    pair_true, pair_pred = [], []
    for i in range(len(story)):
        for j in range(i + 1, len(story)):
            pair_true.append(expected_cluster[story[i]["id"]] == expected_cluster[story[j]["id"]])
            pair_pred.append(member_cluster[story[i]["id"]] == member_cluster[story[j]["id"]])
    precision, recall = _prf(pair_true, pair_pred, True)
    metrics["cluster_precision"] = {"value": precision, "n": len(pair_true)}
    metrics["cluster_recall"] = {"value": recall, "n": len(pair_true)}

    manifest = _load(by_id["extraction"]["path"])
    fixtures_dir = ROOT / "extraction" / "tests" / "fixtures"
    succeeded = total = 0
    for entry in manifest["fixtures"]:
        total += 1
        html = (fixtures_dir / entry["file"]).read_text(encoding="utf-8")
        record = extract_article(html, entry["url"])
        if entry["expect"]["body_present"]:
            succeeded += 1 if record.body else 0
        else:
            succeeded += 1 if not record.body else 0
    metrics["extraction_success_rate"] = {"value": round(succeeded / total, 3), "n": total}

    # Bonus metrics beyond the required list (same evidence standard).
    lang_items = _load(by_id["language"]["path"])["items"]
    lang_ok = sum(
        1 for i in lang_items if detect_language(i["text"]).language == i["expected"]
    )
    metrics["language_accuracy"] = {"value": round(lang_ok / len(lang_items), 3), "n": len(lang_items)}

    dup_pairs = _load(by_id["exact-dedup"]["path"])["pairs"]
    dup_ok = 0
    for case in dup_pairs:
        akeys = article_keys(case["a"]["url"], case["a"]["canonical"], case["a"]["headline"], case["a"]["body"])
        bkeys = article_keys(case["b"]["url"], case["b"]["canonical"], case["b"]["headline"], case["b"]["body"])
        known = [
            KnownArticle(id="a", source_id=case["a"]["source"], canonical_url=akeys["canonical_url"],
                         content_hash=akeys["content_hash"], headline_hash=akeys["headline_hash"])
        ]
        got = find_duplicate(bkeys, case["b"]["source"], known).duplicate_of is not None
        dup_ok += 1 if got == case["duplicate"] else 0
    metrics["exact_dedup_accuracy"] = {"value": round(dup_ok / len(dup_pairs), 3), "n": len(dup_pairs)}

    near_pairs = _load(by_id["near-dup"]["path"])["pairs"]
    near_ok = sum(
        1 for c in near_pairs if compare_texts(c["a"], c["b"]).to_dict()["near_duplicate"] == c["near_duplicate"]
    )
    metrics["near_dup_accuracy"] = {"value": round(near_ok / len(near_pairs), 3), "n": len(near_pairs)}

    xl_cases = _load(by_id["xlingual"]["path"])["cases"]
    xl_ok = 0
    for case in xl_cases:
        score, _ = augmented_pair_score(case["a"], case["b"])
        xl_ok += 1 if (score >= CLUSTER_THRESHOLD) == case["merge"] else 0
    metrics["xlingual_accuracy"] = {"value": round(xl_ok / len(xl_cases), 3), "n": len(xl_cases)}

    return metrics


def main() -> None:
    corpus = _load("evaluation/corpus.json")
    metrics = evaluate()
    thresholds = corpus["thresholds"]
    checks = {}
    for name, floor in thresholds.items():
        value = metrics[name]["value"]
        checks[name] = {"value": value, "threshold": floor, "pass": value >= floor}
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "corpus_version": corpus["version"],
        "metrics": metrics,
        "thresholds": checks,
        "overall_pass": all(c["pass"] for c in checks.values()),
    }
    with open(ROOT / "evaluation" / "report.json", "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    failing = [name for name, c in checks.items() if not c["pass"]]
    print(f'metrics: {len(metrics)} computed, thresholds failing: {failing or "none"}')
    if failing:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
