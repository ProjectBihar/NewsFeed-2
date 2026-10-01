"""Text signatures (Phase 15): shingles, MinHash, SimHash, exact Jaccard.

All hashing is deterministic across processes (sha256-based, fixed
seeds) — Python's salted hash() is never used for signatures.
"""

import hashlib
import re

_WORD_RE = re.compile(r"[A-Za-z]+|[\u0900-\u097F]+", re.UNICODE)
_MERSENNE = (1 << 61) - 1


def tokens(text: str) -> list[str]:
    """Lowercased word tokens, Latin and Devanagari; punctuation dropped."""
    return [t.lower() for t in _WORD_RE.findall(text or "")]


def shingles(text: str, k: int = 5) -> set[str]:
    """Word k-gram shingle set. Short texts yield fewer shingles."""
    toks = tokens(text)
    if len(toks) < k:
        return {" ".join(toks)} if toks else set()
    return {" ".join(toks[i : i + k]) for i in range(len(toks) - k + 1)}


def _shingle_int(shingle: str) -> int:
    return int(hashlib.sha256(shingle.encode("utf-8")).hexdigest(), 16) % _MERSENNE


def _permutation_params(num_perm: int, seed: int) -> list[tuple[int, int]]:
    params, state = [], seed or 0x9E3779B9
    while len(params) < num_perm:
        state = (state * 6364136223846793005 + 1442695040888963407) % _MERSENNE
        a = state % (_MERSENNE - 1) + 1
        state = (state * 6364136223846793005 + 1442695040888963407) % _MERSENNE
        params.append((a, state % _MERSENNE))
    return params


class MinHash:
    """Deterministic MinHash over shingle sets."""

    def __init__(self, num_perm: int = 128, seed: int = 42) -> None:
        self.num_perm = num_perm
        self.params = _permutation_params(num_perm, seed)

    def signature(self, shingle_set: set[str]) -> tuple[int, ...]:
        if not shingle_set:
            return tuple([_MERSENNE] * self.num_perm)
        hashed = [_shingle_int(s) for s in shingle_set]
        return tuple(
            min((a * h + b) % _MERSENNE for h in hashed) for a, b in self.params
        )

    @staticmethod
    def jaccard(sig_a: tuple[int, ...], sig_b: tuple[int, ...]) -> float:
        matches = sum(1 for a, b in zip(sig_a, sig_b) if a == b)
        return matches / max(1, len(sig_a))


def exact_jaccard(set_a: set[str], set_b: set[str]) -> float:
    if not set_a or not set_b:
        return 0.0
    return len(set_a & set_b) / len(set_a | set_b)


def _token_hash(token: str) -> int:
    return int(hashlib.sha256(token.encode("utf-8")).hexdigest(), 16)


def simhash(text: str, bits: int = 64) -> int:
    """Charikar SimHash over token frequencies."""
    from collections import Counter

    weights = Counter(tokens(text))
    vector = [0] * bits
    for token, count in weights.items():
        digest = _token_hash(token)
        for i in range(bits):
            vector[i] += count if (digest >> i) & 1 else -count
    fingerprint = 0
    for i, value in enumerate(vector):
        if value > 0:
            fingerprint |= 1 << i
    return fingerprint


def hamming(a: int, b: int) -> int:
    return bin(a ^ b).count("1")
