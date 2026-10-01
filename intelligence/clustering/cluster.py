"""Story formation (Phase 16): single-linkage union-find over pair scores.

Batch clustering for backfills plus best-match assignment for the live
pipeline. Transitive merges are accepted by design (A~B, B~C → one
story); admin split/merge controls arrive in Phase 22.
"""

from .scoring import CLUSTER_THRESHOLD, TIME_WINDOW_HOURS, _parse_time, pair_score


def _within_window(left: dict, right: dict) -> bool:
    left_t, right_t = _parse_time(left.get("published_at")), _parse_time(right.get("published_at"))
    if left_t is None or right_t is None:
        return True
    return abs(left_t - right_t) / 3600.0 <= TIME_WINDOW_HOURS


def cluster_articles(articles: list[dict], threshold: float = CLUSTER_THRESHOLD) -> list[list[dict]]:
    """Group articles into stories. Deterministic for a given input order."""
    parent = list(range(len(articles)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int) -> None:
        parent[find(i)] = find(j)

    for i in range(len(articles)):
        for j in range(i + 1, len(articles)):
            if not _within_window(articles[i], articles[j]):
                continue
            score, _ = pair_score(articles[i], articles[j])
            if score >= threshold:
                union(i, j)

    groups: dict[int, list[dict]] = {}
    for i, article in enumerate(articles):
        groups.setdefault(find(i), []).append(article)
    # Stable order: earliest article first within and across stories.
    ordered = sorted(groups.values(), key=lambda g: articles.index(g[0]))
    return [sorted(g, key=lambda a: articles.index(a)) for g in ordered]


def best_match(article: dict, stories: list[list[dict]], threshold: float = CLUSTER_THRESHOLD) -> tuple[int | None, float]:
    """Index of the best story for a new article, or (None, best score)."""
    best_index, best_score = None, -1.0
    for index, story in enumerate(stories):
        for member in story:
            if not _within_window(article, member):
                continue
            score, _ = pair_score(article, member)
            if score > best_score:
                best_index, best_score = index, score
    if best_score >= threshold:
        return best_index, round(best_score, 3)
    return None, round(best_score, 3)
