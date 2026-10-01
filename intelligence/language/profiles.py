"""Language profiles (Phase 8).

A profile is a script prior plus a function-word list. New languages
(ur, mai, bho, mag, …) arrive as new profiles + tests — the articles
schema never changes (language is free TEXT).
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class LanguageProfile:
    code: str
    scripts: tuple[str, ...]
    function_words: frozenset[str] = field(default_factory=frozenset)


ENGLISH_FUNCTION_WORDS = frozenset(
    """
    the be to of and a in that have it for not on with as you do at
    this but his by from they we say her she or an will my one all would
    there their what so up out if about who get which go me when make can
    like time just him know take into year your good some could them see
    other than then now look only come its over think also back after use
    two how our work first well way even new want because any these give
    day most us is are was were has had been being does did shall should
    may might must ought such nor too very more said says will would can
    """.split()
)

HINDI_FUNCTION_WORDS = frozenset(
    """
    के का की में है हैं और से को पर यह वह जो तो भी ने तक लिए द्वारा
    हुआ हुई हुए गया गई गए करता करते किया किए होगा होगी सकते अपना अपनी
    अपने इस उस इन उन क्या कब कहाँ जैसे तथा एवं या लेकिन मगर अगर जब तब
    अब यहाँ वहाँ सभी बहुत अधिक नया नई बड़े समेत तहत बीच प्रति साथ
    वाले वाली वाला जिन जिनमें जिसके जिसकी
    """.split()
)

PROFILES: dict[str, LanguageProfile] = {
    "en": LanguageProfile(code="en", scripts=("Latn",), function_words=ENGLISH_FUNCTION_WORDS),
    "hi": LanguageProfile(code="hi", scripts=("Deva",), function_words=HINDI_FUNCTION_WORDS),
}


def register_language(profile: LanguageProfile) -> None:
    """Add a future language (ur, mai, bho, mag, …) without schema change."""
    if not profile.code or not profile.function_words:
        raise ValueError("Language profile needs a code and function words")
    PROFILES[profile.code] = profile
