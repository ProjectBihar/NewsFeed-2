"""Event-type classification (Phase 13): what happened.

22-event bilingual vocabulary, presence scoring shared with Phases 11-12.
No matching event (opinion, gossip, sport, routine notes) yields None
rather than a forced label — disaster-relief scale events are a known
vocabulary gap for a later extension.
"""

from dataclasses import asdict, dataclass, field

from .matching import compile_surface, score_presence

# event -> [(phrase, weight)]
EVENT_KEYWORDS: dict[str, list[tuple[str, int]]] = {
    "announcement": [
        ("announced", 3), ("announces", 3), ("announcement", 3),
        ("release", 2), ("releases", 2), ("released", 2), ("declares", 2),
        ("घोषणा", 3), ("ऐलान", 3), ("जारी", 2),
    ],
    "proposal": [
        ("proposes", 3), ("proposal", 3), ("proposed", 3), ("moots", 3),
        ("draft plan", 3),
        ("प्रस्ताव", 3), ("प्रस्तावित", 3), ("मसौदा", 3),
    ],
    "approval": [
        ("approves", 3), ("approved", 3), ("approval", 3), ("clears", 2),
        ("cleared", 2), ("nod", 2), ("green signal", 4), ("sanctions", 3),
        ("sanctioned", 3),
        ("मंजूरी", 3), ("मंजूर", 3), ("स्वीकृति", 3), ("हरी झंडी", 4),
    ],
    "funding": [
        ("funding", 3), ("funds", 2), ("allocates", 3), ("allocation", 3),
        ("outlay", 2), ("grant", 3), ("financing", 3), ("subsidy", 3),
        ("वित्तपोषण", 3), ("अनुदान", 3), ("आवंटन", 3), ("राशि", 1),
        ("सब्सिडी", 3),
    ],
    "tender": [
        ("tender", 4), ("tenders", 4), ("bids", 3), ("bidding", 3),
        ("floated", 3),
        ("निविदा", 4), ("निविदाएं", 4), ("बोली", 3),
    ],
    "construction_started": [
        ("construction begins", 5), ("work begins", 4),
        ("ground-breaking", 5), ("groundbreaking", 5),
        ("foundation stone", 5),
        ("निर्माण शुरू", 5), ("शिलान्यास", 5), ("आधारशिला", 5),
        ("कार्य आरंभ", 4),
    ],
    "construction_progress": [
        ("under construction", 4), ("work in progress", 4),
        ("percent complete", 4), ("progressing", 2),
        ("निर्माणाधीन", 4), ("कार्य प्रगति", 4),
    ],
    "completion": [
        ("completed", 3), ("completes", 3), ("completion", 3),
        ("opens", 2), ("opened", 2), ("ready", 1), ("finished", 2),
        ("पूर्ण", 2), ("पूरा हुआ", 3), ("तैयार", 1), ("खुला", 2),
    ],
    "inauguration": [
        ("inaugurates", 4), ("inaugurated", 4), ("inauguration", 4),
        ("unveils", 3), ("unveiled", 3), ("dedicates", 3),
        ("उद्घाटन", 4), ("लोकार्पण", 4), ("अनावरण", 3),
    ],
    "delay": [
        ("delayed", 4), ("delay", 3), ("behind schedule", 4),
        ("missed deadline", 4), ("stalled", 3), ("held up", 3),
        ("देरी", 3), ("विलंब", 3), ("समय से पीछे", 4), ("अटका", 3),
    ],
    "cancellation": [
        ("cancelled", 4), ("cancels", 4), ("cancellation", 4),
        ("scrapped", 4), ("shelved", 3),
        ("रद्द", 4), ("निरस्त", 4),
    ],
    "report": [
        ("report", 3), ("reports", 2), ("reveals", 2), ("survey", 2),
        ("white paper", 4), ("findings", 2),
        ("रिपोर्ट", 3), ("खुलासा", 3), ("सर्वेक्षण", 2), ("निष्कर्ष", 2),
    ],
    "audit": [
        ("audit", 3), ("audits", 3), ("CAG", 4), ("auditor", 2),
        ("irregularities", 2),
        ("ऑडिट", 3), ("कैग", 4), ("लेखापरीक्षा", 3),
    ],
    "court_order": [
        ("directs", 3), ("directed", 3), ("orders", 2), ("verdict", 3),
        ("judgment", 2), ("stays", 2), ("quashes", 3), ("conviction", 2),
        ("निर्देश", 3), ("आदेश", 2), ("फैसला", 3),
    ],
    "appointment": [
        ("appointed", 3), ("appoints", 3), ("appointment", 3),
        ("takes charge", 4), ("assumes office", 4), ("transferred", 2),
        ("transfer", 2),
        ("नियुक्त", 3), ("नियुक्ति", 2), ("कार्यभार", 4),
        ("तबादला", 2), ("स्थानांतरण", 2),
    ],
    "recruitment": [
        ("recruitment", 3), ("vacancies", 2), ("applications invited", 4),
        ("apply online", 3), ("admit card", 3), ("hiring", 2),
        ("भर्ती", 3), ("रिक्तियां", 2), ("आवेदन", 2), ("प्रवेश पत्र", 3),
    ],
    "policy_change": [
        ("new policy", 4), ("policy approved", 4), ("rules amended", 4),
        ("amended", 2), ("guidelines", 2), ("framework", 1), ("revised", 2),
        ("नई नीति", 4), ("नियम संशोधन", 4), ("संशोधित", 2),
        ("दिशानिर्देश", 2),
    ],
    "programme_launch": [
        ("launches", 3), ("launched", 3), ("rolls out", 4), ("rollout", 3),
        ("scheme launched", 4),
        ("शुभारंभ", 4), ("योजना शुरू", 4), ("शुरुआत", 2),
    ],
    "protest": [
        ("protest", 3), ("protests", 3), ("demonstration", 3),
        ("demonstrates", 2), ("strike", 3), ("march", 2), ("dharna", 4),
        ("agitates", 3),
        ("विरोध", 3), ("प्रदर्शन", 3), ("हड़ताल", 3), ("धरना", 4),
        ("मार्च", 2), ("आंदोलन", 3),
    ],
    "election_campaign": [
        ("campaigning", 3), ("roadshow", 4), ("nomination", 4),
        ("nominations", 4), ("manifesto", 4), ("polling", 2),
        ("canvassing", 3),
        ("प्रचार", 2), ("नामांकन", 4), ("घोषणापत्र", 4), ("मतदान", 2),
    ],
    "accident": [
        ("accident", 3), ("crash", 3), ("collision", 3), ("overturned", 3),
        ("drowned", 3), ("killed", 1), ("injured", 1),
        ("हादसा", 3), ("दुर्घटना", 3), ("टक्कर", 3), ("घायल", 1),
    ],
    "crime": [
        ("murder", 3), ("robbery", 3), ("arrested", 2), ("FIR", 3),
        ("loot", 2), ("rape", 3), ("theft", 2),
        ("हत्या", 3), ("लूट", 3), ("गिरफ्तारी", 2), ("चोरी", 2),
    ],
}

MIN_EVENT_SCORE = 5

_PATTERNS: dict[str, list] = {
    event: [compile_surface(phrase) for phrase, _ in items]
    for event, items in EVENT_KEYWORDS.items()
}
_WEIGHTS: dict[str, list[int]] = {
    event: [weight for _, weight in items] for event, items in EVENT_KEYWORDS.items()
}


def _event_patterns(event: str) -> list[tuple]:
    return list(zip(_PATTERNS[event], _WEIGHTS[event]))


def _confidence(winner: int, runner_up: int) -> str:
    if winner < MIN_EVENT_SCORE:
        return "low"
    if runner_up <= 0:
        return "high" if winner >= 8 else "medium"
    ratio = winner / runner_up
    if ratio >= 2.0 and winner >= 8:
        return "high"
    if ratio >= 1.25:
        return "medium"
    return "low"


@dataclass
class EventResult:
    event_type: str | None
    event_confidence: str
    event_evidence: list[str] = field(default_factory=list)
    reason_codes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def classify_event(title: str, body: str) -> EventResult:
    """What happened; None when no vocabulary event fits. Never raises."""
    title, body = title or "", body or ""
    scores = {
        event: score_presence(_event_patterns(event), title, body)
        for event in EVENT_KEYWORDS
    }
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1][0], kv[0]))
    best, (best_score, best_evidence) = ranked[0]
    runner_up = ranked[1][1][0]

    if best_score < MIN_EVENT_SCORE:
        return EventResult(
            event_type=None,
            event_confidence="low",
            event_evidence=[],
            reason_codes=["event:none"],
        )
    return EventResult(
        event_type=best,
        event_confidence=_confidence(best_score, runner_up),
        event_evidence=best_evidence[:6],
        reason_codes=[f"event:{best}"],
    )
