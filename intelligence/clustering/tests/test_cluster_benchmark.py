"""Phase 16 completion gate: the reviewed story benchmark partitions exactly."""

import json
from pathlib import Path

from clustering import best_match, cluster_articles

SET_PATH = Path(__file__).parent / "fixtures" / "story-clusters.json"


def _load():
    return json.loads(SET_PATH.read_text(encoding="utf-8"))["articles"]


def test_story_benchmark_partitions_exactly():
    articles = _load()
    assert len(articles) >= 20, "gate needs a substantive benchmark"
    stories = cluster_articles(articles)
    actual = sorted(sorted(a["id"] for a in story) for story in stories)

    grouped: dict[str, list] = {}
    for article in articles:
        if article["story"] is not None:
            grouped.setdefault(article["story"], []).append(article["id"])
    expected = sorted(
        [sorted(ids) for ids in grouped.values()]
        + [[a["id"]] for a in articles if a["story"] is None]
    )
    assert actual == expected


def test_incremental_assignment_agrees_with_batch():
    articles = _load()
    by_id = {a["id"]: a for a in articles}
    # Late arrivals: a bridge member, a singleton, a metro member.
    late = [by_id["br1b"], by_id["s-fares"], by_id["m1e"]]
    early = [a for a in articles if a["id"] not in {l["id"] for l in late}]
    stories = cluster_articles(early)
    story_of = {}
    for index, story in enumerate(stories):
        for member in story:
            story_of[member["id"]] = index
    for article in late:
        mates = [a["id"] for a in early if a["story"] == article["story"]]
        index, _ = best_match(article, stories)
        if article["story"] is None or not mates:
            assert index is None, article["id"]
        else:
            assert index == story_of[mates[0]], article["id"]
