"""Shared phrase matching (Phases 11+): compiled surfaces, span-aware
presence scoring (title x2, longest-first, no double count)."""

import re


def compile_surface(phrase: str):
    if re.search(r"[A-Za-z]", phrase):
        return re.compile(r"\b" + re.escape(phrase) + r"\b", re.IGNORECASE)
    return phrase


def phrase_text(pattern) -> str:
    return pattern if isinstance(pattern, str) else pattern.pattern


def find_spans(pattern, text: str) -> list[tuple[int, int]]:
    if isinstance(pattern, str):
        spans, start = [], 0
        while True:
            i = text.find(pattern, start)
            if i < 0:
                return spans
            spans.append((i, i + len(pattern)))
            start = i + 1
    return [(m.start(), m.end()) for m in pattern.finditer(text)]


def score_presence(patterns: list[tuple], title: str, body: str) -> tuple[int, list[str]]:
    """Presence score per phrase (title x2, body x1); overlapping longer
    phrases consume the span so nested phrases never double-count."""
    score, evidence = 0, []
    used_title: list[tuple[int, int]] = []
    used_body: list[tuple[int, int]] = []
    ordered = sorted(patterns, key=lambda pw: -len(phrase_text(pw[0])))

    def fresh(spans: list[tuple[int, int]], used: list[tuple[int, int]]) -> bool:
        return any(not any(s >= u and e <= v for u, v in used) for s, e in spans)

    for pattern, weight in ordered:
        label = phrase_text(pattern)
        title_spans = find_spans(pattern, title)
        body_spans = find_spans(pattern, body)
        has_title = fresh(title_spans, used_title)
        has_body = fresh(body_spans, used_body)
        if has_title or has_body:
            if has_title:
                used_title += title_spans
            if has_body:
                used_body += body_spans
            score += weight * ((2 if has_title else 0) + (1 if has_body else 0))
            where = "title+body" if has_title and has_body else ("title" if has_title else "body")
            evidence.append(f"{label} ({where})")
    return score, evidence
