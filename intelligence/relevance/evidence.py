"""Evidence collection (Phase 10): geography, institutions, infrastructure,
datelines, negative signals, and ambiguous-name resolution.
"""

import re

from .knowledge import GEO_TYPES, INFRA_TYPES, INSTITUTION_TYPES, KnowledgeBase

# Surfaces whose Bihar reading needs corroboration (better-known elsewhere).
AMBIGUOUS = {
    "aurangabad": "Aurangabad, Maharashtra (Sambhajinagar)",
    "sambhajinagar": "Aurangabad, Maharashtra (Sambhajinagar)",
    "औरंगाबाद": "Aurangabad, Maharashtra (Sambhajinagar)",
    "rohtas": "Rohtas Fort, Pakistan / Rohtas district",
    "रोहतास": "Rohtas Fort, Pakistan / Rohtas district",
}

# Other-state dateline/city signals (negative evidence). Compact seed of
# capitals and major reporting centres, EN + HI where forms differ.
OTHER_STATE_CITIES = [
    "New Delhi", "Delhi", "नई दिल्ली", "दिल्ली", "Mumbai", "मुंबई", "Lucknow",
    "लखनऊ", "Kolkata", "कोलकाता", "Chennai", "चेन्नई", "Bengaluru",
    "बेंगलुरु", "Hyderabad", "हैदराबाद", "Ahmedabad", "अहमदाबाद", "Jaipur",
    "जयपुर", "Bhopal", "भोपाल", "Ranchi", "रांची", "Raipur", "रायपुर",
    "Chandigarh", "चंडीगढ़", "Shimla", "शिमला", "Dehradun", "देहरादून",
    "Gandhinagar", "गांधीनगर", "Thiruvananthapuram", "Bhubaneswar",
    "भुवनेश्वर", "Guwahati", "गुवाहाटी", "Srinagar", "श्रीनगर", "Jammu",
    "जम्मू", "Panaji", "पणजी", "Agartala", "अगरतला", "Aizawl", "आइजोल",
    "Kohima", "कोहिमा", "Imphal", "इंफाल", "Shillong", "शिलांग", "Itanagar",
    "ईटानगर", "Gangtok", "गंगटोक", "Pune", "पुणे", "Nagpur", "नागपुर",
    "Indore", "इंदौर", "Kanpur", "कानपुर", "Varanasi", "वाराणसी", "Agra",
    "आगरा", "Kochi", "कोच्चि", "Amritsar", "अमृतसर", "Gorakhpur",
    "गोरखपुर", "Prayagraj", "प्रयागराज", "Gwalior", "ग्वालियर", "Jabalpur",
    "जबलपुर", "Dhanbad", "धनबाद", "Jamshedpur", "जमशेदपुर", "Bokaro",
    "बोकारो", "Siliguri", "सिलीगुड़ी", "Darjeeling", "दार्जिलिंग", "Cuttack",
    "कटक", "Noida", "नोएडा", "Gurugram", "गुरुग्राम", "Ghaziabad",
    "गाजियाबाद", "Puducherry", "पुडुचेरी", "Kathmandu", "काठमांडू",
    "Islamabad", "इस्लामाबाद", "Dhaka", "ढाका",
]

_DATELINE_RE = re.compile(
    r"^([A-Z][A-Za-z .()/\-]{1,40}|[\u0900-\u097F .()/\-]{2,24})\s*[:\u2014\u2013\-]\s*",
    re.MULTILINE,
)
_BIHAR_TOKEN_RE = re.compile(r"\bbihar\b", re.IGNORECASE)
_BIHAR_TOKEN_HI = "बिहार"


def _compile_city(city: str):
    if re.search(r"[A-Za-z]", city):
        return re.compile(r"\b" + re.escape(city) + r"\b", re.IGNORECASE)
    return city


_OTHER_CITY_PATTERNS = [(city, _compile_city(city)) for city in OTHER_STATE_CITIES]


def detect_dateline(text: str) -> str | None:
    """Dateline place from the article opening (first 200 chars, any line)."""
    head = text[:200]
    match = _DATELINE_RE.search(head)
    if not match:
        return None
    return match.group(1).strip()


def collect_evidence(title: str, body: str, kb: KnowledgeBase) -> dict:
    """All positive/negative signals with matched entity ids."""
    text = f"{title}\n{body}"
    matched: dict[str, list] = {}  # entity_id -> list of surfaces
    for pattern, entity_id in kb.patterns:
        if isinstance(pattern, str):
            if pattern in text:
                matched.setdefault(entity_id, []).append(pattern)
        elif pattern.search(text):
            matched.setdefault(entity_id, []).append(pattern.pattern)

    # Ambiguous surfaces resolve against Bihar corroboration.
    corroborated = any(
        kb.entities[eid]["type"] in GEO_TYPES | INSTITUTION_TYPES | INFRA_TYPES
        and eid not in _ambiguous_ids(matched, kb)
        for eid in matched
    ) or bool(_BIHAR_TOKEN_RE.search(text)) or _BIHAR_TOKEN_HI in text
    ambiguous_hits = [
        eid for eid in matched if _is_ambiguous_entity(eid, kb)
    ]
    resolved_bihar = [eid for eid in ambiguous_hits if corroborated]
    resolved_other = [eid for eid in ambiguous_hits if not corroborated]
    for eid in resolved_other:
        del matched[eid]

    dateline = detect_dateline(text)
    dateline_bihar = dateline is not None and _dateline_is_bihar(dateline, kb)
    dateline_other = dateline is not None and _dateline_is_other(dateline)

    other_cities = sorted(
        city
        for city, pattern in _OTHER_CITY_PATTERNS
        if (pattern.search(text) if not isinstance(pattern, str) else pattern in text)
    )
    # One signal per place: contained duplicates ("Delhi" in "New Delhi")
    # and the dateline city itself (already counted above) drop out.
    deduped = []
    for city in sorted(other_cities, key=len, reverse=True):
        if any(city.lower() in kept.lower() for kept in deduped):
            continue
        deduped.append(city)
    dateline_norm = (dateline or "").strip().lower()
    other_cities = [
        city
        for city in deduped
        if not dateline_norm
        or (
            city.lower() != dateline_norm
            and city.lower() not in dateline_norm
            and dateline_norm not in city.lower()
        )
    ]

    bihar_tokens = len(_BIHAR_TOKEN_RE.findall(text)) + text.count(_BIHAR_TOKEN_HI)

    return {
        "matched": matched,
        "resolved_bihar": resolved_bihar,
        "resolved_other": resolved_other,
        "dateline": dateline,
        "dateline_bihar": dateline_bihar,
        "dateline_other": dateline_other,
        "other_cities": other_cities,
        "bihar_tokens": bihar_tokens,
    }


def _ambiguous_ids(matched: dict, kb: KnowledgeBase) -> set:
    return {eid for eid in matched if _is_ambiguous_entity(eid, kb)}


def _is_ambiguous_entity(entity_id: str, kb: KnowledgeBase) -> bool:
    entity = kb.entities[entity_id]
    surfaces = (
        [entity["canonical_name"]]
        + entity["aliases"]
        + entity["hindi_names"]
        + entity["romanisations"]
    )
    return any(s.strip().lower() in AMBIGUOUS for s in surfaces)


def _dateline_is_bihar(dateline: str, kb: KnowledgeBase) -> bool:
    norm = dateline.strip().lower()
    if norm in ("bihar", "बिहार"):
        return True
    for entity_id, entity in kb.entities.items():
        if entity["type"] not in ("district", "town", "subdivision"):
            continue
        surfaces = (
            [entity["canonical_name"]]
            + entity["aliases"]
            + entity["hindi_names"]
            + entity["romanisations"]
        )
        if any(norm == s.strip().lower() for s in surfaces):
            return True
    return False


def _dateline_is_other(dateline: str) -> bool:
    norm = dateline.strip().lower()
    return any(norm == city.lower() for city in OTHER_STATE_CITIES)
