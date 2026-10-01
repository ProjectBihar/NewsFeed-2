"""Deterministic language detection (Phase 8).

Function-word evidence decides; script is recorded, never equated with
language — an English article mentioning पटना stays English. Every
decision carries evidence and a calibrated confidence.

Output contract (mirrors the articles columns):
  language, language_confidence, script_mix (+ evidence, inspectable).
"""

import re
from dataclasses import asdict, dataclass, field

from .profiles import PROFILES, register_language  # noqa: F401 (re-exported)

_LATIN_WORD = re.compile(r"[A-Za-z]+")
_DEVANAGARI_WORD = re.compile(r"[\u0900-\u097F]+")
_DANDA = "\u0964\u0965"

# Script blocks counted over letters only (digits/punctuation are neutral).
_SCRIPT_RANGES: tuple[tuple[str, str], ...] = (
    ("Latn", "A-Za-z\u00c0-\u024f\u1e00-\u1eff"),
    ("Deva", "\u0900-\u097f"),
    ("Arab", "\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff"),
)


@dataclass
class LanguageResult:
    language: str
    language_confidence: float
    script_mix: str
    evidence: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def _script_counts(text: str) -> tuple[dict[str, int], int]:
    import re as _re

    counts: dict[str, int] = {}
    total = 0
    for name, chars in _SCRIPT_RANGES:
        n = sum(len(m.group(0)) for m in _re.compile(f"[{chars}]+").finditer(text))
        if n:
            counts[name] = n
            total += n
    return counts, total


def script_mix(text: str) -> dict[str, float]:
    """Share of letters per script, rounded to 2dp, most common first."""
    counts, total = _script_counts(text)
    if not total:
        return {}
    return {
        name: round(n / total, 2)
        for name, n in sorted(counts.items(), key=lambda kv: -kv[1])
    }


def format_script_mix(mix: dict[str, float]) -> str:
    if not mix:
        return "none"
    return ",".join(f"{name}:{share:.2f}" for name, share in mix.items())


def _tokens(text: str) -> tuple[list[str], list[str]]:
    latin = [t.lower() for t in _LATIN_WORD.findall(text)]
    deva = [t.rstrip(_DANDA) for t in _DEVANAGARI_WORD.findall(text)]
    return latin, [t for t in deva if t]


def detect_language(text: str) -> LanguageResult:
    """Best-guess language with confidence; never raises on odd input."""
    if not isinstance(text, str) or not text.strip():
        return LanguageResult(
            language="en",
            language_confidence=0.0,
            script_mix="none",
            evidence=["empty-input: defaulted with zero confidence"],
        )
    mix = script_mix(text)
    latin_tokens, deva_tokens = _tokens(text)
    hits = {
        code: sum(1 for t in latin_tokens if t in profile.function_words)
        + sum(1 for t in deva_tokens if t in profile.function_words)
        for code, profile in PROFILES.items()
    }
    total = sum(hits.values())
    evidence = [
        f"function-word hits: {', '.join(f'{c}={hits[c]}' for c in sorted(hits))}",
        f"scripts: {format_script_mix(mix) or 'none'}",
    ]

    if total == 0:
        # No lexical evidence: weak script fallback, explicitly labelled.
        dominant = next(iter(mix), None)
        for code, profile in PROFILES.items():
            if dominant and dominant in profile.scripts:
                evidence.append(f"script-fallback: no function words, dominant {dominant}")
                return LanguageResult(code, 0.35, format_script_mix(mix), evidence)
        evidence.append("script-fallback: no function words, unknown dominant script")
        return LanguageResult("en", 0.2, format_script_mix(mix), evidence)

    ranked = sorted(hits.items(), key=lambda kv: (-kv[1], kv[0]))
    winner, runner_up = ranked[0][0], (ranked[1][1] if len(ranked) > 1 else 0)
    confidence = ranked[0][1] / total
    _, letters = _script_counts(text)
    if letters < 150:
        confidence = min(confidence, 0.8)
        evidence.append("short-text confidence cap")
    if total < 3:
        confidence = min(confidence, 0.6)
        evidence.append("thin-evidence confidence cap")
    if ranked[0][1] == runner_up and len(ranked) > 1:
        # Tie: dominant script breaks it, confidence stays at the tie level.
        dominant = next(iter(mix), None)
        for code, profile in PROFILES.items():
            if dominant and dominant in profile.scripts:
                winner = code
                break
        evidence.append("tie broken by dominant script")
    evidence.append(f"decision: {winner} at {round(confidence, 2)}")
    return LanguageResult(winner, round(confidence, 2), format_script_mix(mix), evidence)
