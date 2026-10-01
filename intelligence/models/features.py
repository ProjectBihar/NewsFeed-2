"""Text features (Phase 25): word n-grams plus character n-grams.

Character n-grams carry bilingual and spelling-variable material
(Devanagari morphology, transliteration wobble) that word tokens miss.
CPU-only, inexpensive, no neural anything.
"""

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion

WORD_MAX_FEATURES = 5000
CHAR_MAX_FEATURES = 10000


def build_vectorizer(
    word_max: int = WORD_MAX_FEATURES, char_max: int = CHAR_MAX_FEATURES
):
    """Word (1,2)-grams union character (3,5)-grams, sublinear TF."""
    return FeatureUnion(
        [
            (
                "word",
                TfidfVectorizer(
                    analyzer="word",
                    ngram_range=(1, 2),
                    max_features=word_max,
                    min_df=1,
                    sublinear_tf=True,
                ),
            ),
            (
                "char",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    max_features=char_max,
                    min_df=1,
                    sublinear_tf=True,
                ),
            ),
        ]
    )
