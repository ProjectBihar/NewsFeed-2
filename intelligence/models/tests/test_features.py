"""Unit tests: features fire bilingually and deterministically (Phase 25)."""

import re

from models.features import build_vectorizer


def test_vectorizer_fires_on_hindi_and_english():
    vec = build_vectorizer()
    matrix = vec.fit_transform(
        [
            "The cabinet approved the metro project",
            "कैबिनेट ने मेट्रो परियोजना को मंजूरी दी",
        ]
    )
    assert matrix.shape[0] == 2
    assert matrix.shape[1] > 10
    names = vec.get_feature_names_out()
    assert any("cabinet" in name for name in names)
    # Character (3,5)-grams fire on Devanagari (a 6-char word itself
    # cannot appear, but its fragments must).
    assert any(re.search(r"[\u0900-\u097F]", name) for name in names)
    assert any("मेट" in name for name in names)


def test_vectorizer_deterministic():
    texts = ["Bihar police modernisation funding approved", "पटना में लूट"]
    first = build_vectorizer().fit_transform(texts).toarray().tolist()
    second = build_vectorizer().fit_transform(texts).toarray().tolist()
    assert first == second
