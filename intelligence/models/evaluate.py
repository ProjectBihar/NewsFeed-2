"""Hybrid gate evaluation (Phase 26, extracted in Phase 27).

Held-out (leave-one-out) statistics vs rules vs hybrid on the frozen
corpora. Shared by the Phase 26 completion gate and the Phase 27
retraining promotion check: a challenger may only become production if
the hybrid gate still holds with it in the production seat.
"""

import json
from pathlib import Path

from .decide import _hybrid
from .hybrid import CATEGORY_AFFINITY, RELEVANCE_AFFINITY, RULE_CONF, TYPE_AFFINITY
from .train import CANDIDATES

ROOT = Path(__file__).resolve().parents[2]

LOO_CACHE: dict = {}


def _production_winners() -> dict:
    """Winners from the committed report (read per call: retraining rewrites it)."""
    report = json.loads((ROOT / "intelligence" / "models" / "report.json").read_text(encoding="utf-8"))
    return {task: report["models"][task]["winner"] for task in report["models"]}


def _loo_dists(kind, texts, labels):
    """Held-out statistical distributions, one refit per item (cached)."""
    from sklearn.pipeline import Pipeline

    from .features import build_vectorizer
    from .hybrid import stat_distribution

    key = (kind, len(texts))
    if key not in LOO_CACHE:
        dists = []
        for i in range(len(texts)):
            pipe = Pipeline([("features", build_vectorizer()), ("clf", CANDIDATES[kind]())])
            pipe.fit(
                [texts[j] for j in range(len(texts)) if j != i],
                [labels[j] for j in range(len(texts)) if j != i],
            )
            dists.append(stat_distribution(pipe, texts[i]))
        LOO_CACHE[key] = dists
    return LOO_CACHE[key]


def _rule_conf(level: str) -> float:
    return RULE_CONF.get(level, 0.5)


def _texts(task):
    if task == "relevance":
        items = json.loads(
            (ROOT / "intelligence" / "relevance" / "tests" / "fixtures" / "benchmark.json").read_text(
                encoding="utf-8"
            )
        )["items"]
        return [(i["title"], i["body"], i["expected"]) for i in items]
    if task == "article_type":
        cases = json.loads(
            (ROOT / "intelligence" / "classification" / "tests" / "fixtures" / "article-type-cases.json").read_text(
                encoding="utf-8"
            )
        )["cases"]
        return [(c["title"], c["body"], c["expected"]["type"]) for c in cases]
    cases = json.loads(
        (ROOT / "intelligence" / "classification" / "tests" / "fixtures" / "topic-cases.json").read_text(
            encoding="utf-8"
        )
    )["cases"]
    # None-expected items train no category model; abstention is asserted
    # separately, so the gate measures the trained distribution.
    cases = [c for c in cases if c["expected"]["primary"] is not None]
    return [(c["title"], c["body"], c["expected"]["primary"]) for c in cases]


def evaluate_task(task: str, winner: str | None = None) -> dict:
    """Rule / stat / hybrid accuracies for one task with a given winner.

    winner=None reads the production winner from report.json. Returns
    `holds` = hybrid >= rule AND hybrid >= stat AND every error reviewed.
    """
    import classification
    import relevance as relevance_mod

    if winner is None:
        winner = _production_winners()[task]

    triples = _texts(task)
    titles = [t for t, _, _ in triples]
    bodies = [b for _, b, _ in triples]
    expected = [e for _, _, e in triples]
    texts = [f"{t}\n{b}" for t, b in zip(titles, bodies)]

    if task == "relevance":
        labels = ["relevant" if v else "non-relevant" for v in expected]
        train_labels = expected
        rule_outs = [
            relevance_mod.assess_relevance(t, b).to_dict() for t, b in zip(titles, bodies)
        ]
        rule_labels = ["relevant" if r["pass"] else "non-relevant" for r in rule_outs]
        rule_confs = [r["score"] if r["pass"] else 1.0 - r["score"] for r in rule_outs]
        entity_typess = [
            (["geo"] if r["locations"] else []) + [e["type"] for e in r["entities"]]
            for r in rule_outs
        ]
        affinity, abstains = RELEVANCE_AFFINITY, [False] * len(texts)
    elif task == "article_type":
        labels = expected
        train_labels = labels
        rule_outs = [
            classification.classify_article(t, b).to_dict() for t, b in zip(titles, bodies)
        ]
        rule_labels = [r["article_type"] for r in rule_outs]
        rule_confs = [_rule_conf(r["article_type_confidence"]) for r in rule_outs]
        entity_typess = [[] for _ in texts]
        affinity, abstains = TYPE_AFFINITY, [False] * len(texts)
    else:
        labels = [v if v is not None else "None" for v in expected]
        rule_outs = [
            classification.classify_topic(t, b).to_dict() for t, b in zip(titles, bodies)
        ]
        rule_labels = [
            r["primary_category"] if r["primary_category"] is not None else "None"
            for r in rule_outs
        ]
        rule_confs = [_rule_conf(r["category_confidence"]) for r in rule_outs]
        entity_typess = [[] for _ in texts]
        affinity, abstains = CATEGORY_AFFINITY, [r["primary_category"] is None for r in rule_outs]
        train_labels = labels

    stat_dists_raw = _loo_dists(winner, texts, train_labels)
    if task == "relevance":
        stat_dists = [
            {("relevant" if k == "True" else "non-relevant"): v for k, v in d.items()}
            for d in stat_dists_raw
        ]
    else:
        stat_dists = stat_dists_raw

    hybrid_labels, reviews, rule_acc_n, stat_acc_n = [], [], 0, 0
    for i in range(len(texts)):
        stat_label = max(stat_dists[i], key=lambda k: stat_dists[i][k])
        rule_acc_n += rule_labels[i] == labels[i]
        stat_acc_n += stat_label == labels[i]
        out = _hybrid(
            rule_labels[i], rule_confs[i], stat_dists[i],
            entity_typess[i], affinity, abstains[i], "label",
        )
        hybrid_labels.append(out["label"])
        reviews.append(out)
    hybrid_acc_n = sum(1 for h, t in zip(hybrid_labels, labels) if h == t)
    errors_reviewed = all(
        r["needs_review"] for h, t, r in zip(hybrid_labels, labels, reviews) if h != t
    )
    return {
        "n": len(texts),
        "rule_acc": rule_acc_n / len(texts),
        "stat_acc": stat_acc_n / len(texts),
        "hybrid_acc": hybrid_acc_n / len(texts),
        "errors_reviewed": errors_reviewed,
        "holds": (
            hybrid_acc_n >= rule_acc_n
            and hybrid_acc_n >= stat_acc_n
            and errors_reviewed
        ),
    }
