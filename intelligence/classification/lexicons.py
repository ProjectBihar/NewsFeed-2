"""Type lexicons (Phase 11): EN + HI phrase families with weights.

Multiword phrases carry 3-5 points, single words 1-2. Title matches count
double. Lists are deliberately lexical and auditable — statistical
learning arrives in Phase 25, fusion with entity evidence in Phase 26.
"""

import re

# type -> [(phrase, weight)]
TYPE_KEYWORDS: dict[str, list[tuple[str, int]]] = {
    "development": [
        ("detailed project report", 4), ("foundation stone", 4), ("tender", 3),
        ("tenders", 3), ("industrial park", 4), ("industrial area", 3),
        ("investment", 3), ("allotment", 3), ("corridor", 3), ("corridors", 3), ("metro", 3), ("industrial", 2),
        ("highway", 3), ("expressway", 4), ("airport", 3), ("railway project", 4),
        ("power plant", 4), ("solar", 2), ("startup", 2), ("factory", 3),
        ("plant", 2), ("modernisation", 2), ("modernization", 2), ("construction", 3), ("expansion", 3), ("project", 2),
        ("infrastructure", 3), ("employment", 2), ("jobs", 2),
        ("परियोजना", 3), ("विस्तृत परियोजना रिपोर्ट", 4), ("शिलान्यास", 4),
        ("निविदा", 3), ("निविदाएं", 3), ("औद्योगिक पार्क", 4),
        ("औद्योगिक क्षेत्र", 3), ("निवेश", 3), ("आवंटन", 3), ("कॉरिडोर", 3),
        ("मेट्रो", 3), ("राजमार्ग", 3), ("हवाई अड्डा", 3), ("विद्युत संयंत्र", 4),
        ("सोलर", 2), ("कारखाना", 3), ("संयंत्र", 2), ("निर्माण", 3),
        ("विस्तार", 3), ("बुनियादी ढांचा", 3), ("रोजगार", 2), ("उद्योग", 2),
        ("पुल", 2), ("सड़क", 2),
    ],
    "governance": [
        ("cabinet approves", 5), ("cabinet clears", 5), ("cabinet meeting", 3),
        ("approves", 2), ("approved", 2), ("funding", 2), ("programme", 2),
        ("new policy", 4), ("industrial policy", 4), ("audit", 2), ("CAG", 3),
        ("report", 1), ("committee", 2), ("review meeting", 3), ("directive", 2),
        ("circular", 2), ("budgetary support", 4), ("allocation", 2),
        ("outlay", 2), ("utilisation certificate", 3), ("scheme", 2),
        ("yojana", 2), ("transfers", 2), ("appointed", 2),
        ("कैबिनेट", 3), ("मंजूरी", 3), ("मंजूर", 3), ("नीति", 3),
        ("योजना", 2), ("विभाग", 2), ("आदेश", 1), ("निर्देश", 2),
        ("बैठक", 2), ("समिति", 2), ("बजट", 2), ("आवंटन", 2),
        ("कैग", 3), ("रिपोर्ट", 1), ("समीक्षा", 2),
    ],
    "politics": [
        ("BJP", 3), ("JD(U)", 3), ("JDU", 3), ("RJD", 3), ("Congress", 3),
        ("CPI", 2), ("AIMIM", 3), ("party", 2), ("rally", 2), ("rallies", 2),
        ("opposition", 2), ("alliance", 2), ("MLA", 2), ("MP ", 2),
        ("membership", 1), ("defection", 3), ("resignation", 2),
        ("attacked", 2), ("slammed", 2), ("hit out", 3), ("rhetoric", 2),
        ("भाजपा", 3), ("जदयू", 3), ("राजद", 3), ("कांग्रेस", 3),
        ("पार्टी", 2), ("रैली", 2), ("विपक्ष", 2), ("गठबंधन", 2),
        ("विधायक", 2), ("सांसद", 2), ("बयानबाजी", 3), ("आरोप", 2),
        ("पलटवार", 2), ("कार्यकर्ता", 1), ("चुनावी रैली", 3),
    ],
    "election_campaign": [
        ("nomination", 4), ("nominations", 4), ("manifesto", 4),
        ("roadshow", 4), ("road show", 4), ("polling", 3), ("voting day", 4),
        ("exit poll", 4), ("campaigning", 3), ("campaign trail", 4),
        ("star campaigner", 4), ("model code", 4),
        ("नामांकन", 4), ("घोषणापत्र", 4), ("रोड शो", 4), ("मतदान", 3),
        ("प्रचार", 2), ("चुनाव प्रचार", 4), ("स्टार प्रचारक", 4),
        ("आदर्श आचार संहिता", 4),
    ],
    "crime": [
        ("murder", 3), ("murdered", 3), ("robbery", 3), ("robbed", 3),
        ("theft", 2), ("loot", 3), ("looted", 3), ("rape", 4),
        ("kidnapping", 4), ("kidnapped", 4), ("firing", 3), ("shot dead", 4),
        ("gang", 2), ("communal", 3), ("violence", 2), ("clashes", 2),
        ("clash", 2), ("accused", 2), ("arrested", 2), ("arrest", 2),
        ("FIR", 3), ("jail", 1), ("dacoity", 4),
        ("हत्या", 3), ("लूट", 3), ("चोरी", 2), ("गिरफ्तारी", 3),
        ("गिरफ्तार", 2), ("अपहरण", 4), ("सांप्रदायिक", 3), ("हिंसा", 2),
        ("झड़प", 2), ("गोलीबारी", 3), ("गिरोह", 2),
        ("आरोपी", 2), ("प्राथमिकी", 3), ("जेल", 1), ("डकैती", 4),
        ("बलात्कार", 4), ("हत्याकांड", 4),
    ],
    "accident": [
        ("road accident", 5), ("train accident", 5), ("collision", 3),
        ("killed", 2), ("injured", 1),
        ("truck collision", 4), ("overturned", 3), ("drowned", 3),
        ("drowning", 3), ("derailed", 4), ("stampede", 4),
        ("cylinder blast", 4), ("wall collapse", 3),
        ("सड़क हादसा", 5), ("हादसा", 3), ("दुर्घटना", 3), ("टक्कर", 3),
        ("घायल", 2),
        ("पलट", 3), ("डूबने", 3), ("डूब", 2), ("पटरी से उतरी", 4),
        ("भगदड़", 4), ("सिलेंडर विस्फोट", 4),
    ],
    "court": [
        ("high court", 4), ("supreme court", 4), ("patna high court", 5),
        ("verdict", 4), ("judgment", 3), ("judgement", 3), ("court order", 4),
        ("court directs", 4), ("court directed", 4), ("petition", 2),
        ("hearing", 2), ("bail", 2), ("sentenced", 3), ("conviction", 4),
        ("bench", 2), ("judge", 2), ("PIL", 3), ("forensic audit", 3),
        ("अदालत", 3), ("उच्च न्यायालय", 4), ("सर्वोच्च न्यायालय", 4),
        ("फैसला", 3), ("याचिका", 2), ("सुनवाई", 2), ("जमानत", 2),
        ("सजा", 3), ("न्यायाधीश", 2), ("खंडपीठ", 2), ("न्यायालय", 2),
    ],
    "weather": [
        ("forecast", 3), ("rainfall", 2), ("heavy rain", 3), ("monsoon", 2),
        ("temperature", 2), ("heatwave", 3), ("heat wave", 3),
        ("cold wave", 3), ("coldwave", 3), ("weather update", 4),
        ("IMD", 3), ("alert", 1), ("maximum temperature", 3),
        ("बारिश", 2), ("मानसून", 2), ("पूर्वानुमान", 3), ("तापमान", 2),
        ("लू", 2), ("शीतलहर", 3), ("मौसम अपडेट", 4), ("मौसम विभाग", 3),
        ("हल्की बारिश", 3),
    ],
    "environmental_event": [
        ("flood", 4), ("floods", 4), ("flooding", 4), ("drought", 4),
        ("waterlogging", 3), ("embankment breach", 5), ("tiger", 3),
        ("wetland", 3), ("migratory", 3), ("census", 2), ("pollution", 2),
        ("earthquake", 4), ("tremors", 3), ("cyclone", 4), ("landslide", 3),
        ("बाढ़", 4), ("सूखा", 4), ("जलजमाव", 3), ("तटबंध टूट", 5),
        ("बाघ", 3), ("आर्द्रभूमि", 3), ("प्रदूषण", 2), ("भूकंप", 4),
        ("चक्रवात", 4), ("भूस्खलन", 3),
    ],
    "sports": [
        ("cricket", 3), ("football", 3), ("hockey", 3), ("match", 2),
        ("tournament", 3), ("medal", 3), ("championship", 3), ("stadium", 2),
        ("innings", 3), ("wicket", 3), ("century", 3), ("IPL", 3),
        ("Ranji", 3), ("score", 1),
        ("क्रिकेट", 3), ("फुटबॉल", 3), ("हॉकी", 3), ("मैच", 2),
        ("टूर्नामेंट", 3), ("पदक", 3), ("स्टेडियम", 2), ("पारी", 3),
        ("विकेट", 3), ("शतक", 3),
    ],
    "entertainment": [
        ("film", 2), ("movie", 2), ("actor", 2), ("actress", 2),
        ("song", 1), ("album", 1), ("celebrity", 3), ("celebrities", 3),
        ("Bollywood", 3), ("Bhojpuri film", 4), ("box office", 3),
        ("trailer", 2), ("web series", 3),
        ("horoscope", 3), ("rashifal", 3), ("astrology", 2), ("ज्योतिष", 2),
        ("फिल्म", 2), ("अभिनेता", 2), ("अभिनेत्री", 2), ("गाना", 1),
        ("सेलिब्रिटी", 3), ("बॉलीवुड", 3), ("भोजपुरी फिल्म", 4),
        ("ट्रेलर", 2), ("वेब सीरीज", 3),
    ],
    "opinion": [
        ("opinion", 5), ("editorial", 5), ("guest column", 5),
        ("column:", 5), ("op-ed", 5), ("in my view", 4), ("i argue", 4),
        ("comment:", 4),
        ("राय", 4), ("संपादकीय", 5), ("विचार", 3), ("मेरी राय", 4),
        ("अतिथि लेख", 5),
    ],
    "analysis": [
        ("analysis", 5), ("explainer", 5), ("explained", 4),
        ("what the data", 5), ("data shows", 4), ("deep dive", 4),
        ("in charts", 4), ("study finds", 3),
        ("विश्लेषण", 5), ("व्याख्या", 4), ("आंकड़े बताते", 5),
        ("आंकड़ों में", 4), ("अध्ययन", 2), ("रिपोर्ट बताती", 3),
    ],
    "official_release": [
        ("press release", 5), ("official release", 5), ("said in a release", 5),
        ("release said", 4),
        ("according to a release", 5), ("posted on", 4), ("notification", 3),
        ("PIB", 4),
        ("प्रेस विज्ञप्ति", 5), ("विज्ञप्ति", 4), ("अधिसूचना", 3),
        ("पीआईबी", 4), ("जारी विज्ञप्ति", 5),
    ],
    "roundup": [
        ("in pictures", 5), ("in photos", 5), ("top 10", 4), ("top ten", 4),
        ("as it happened", 5), ("live updates", 5), ("live blog", 5),
        ("photo gallery", 5), ("weekly roundup", 5), ("morning briefing", 4),
        ("evening briefing", 4),
        ("तस्वीरों में", 5), ("लाइव अपडेट", 5), ("सुबह की सुर्खियां", 4),
        ("शाम की सुर्खियां", 4), ("सप्ताह भर", 3),
    ],
    "advertorial": [
        ("sponsored", 6), ("partner content", 6), ("brand post", 6),
        ("advertisement", 5), ("promoted", 4),
        ("प्रायोजित", 6), ("विज्ञापन", 5), ("ब्रांड पोस्ट", 6),
    ],
    "miscellaneous": [],
}

# Consequence markers: accountability / scale / disaster / court-order /
# approval-policy. Presence selects tier-B curation and records evidence.
CONSEQUENCE_MARKERS: list[str] = [
    "collapse", "collapses", "collapsed", "cave-in",
    "caved in", "scam", "irregularit", "embezzle",
    "corrupt", "bribe", "kickback", "CAG",
    "audit finds", "audit flagged", "audit report",
    "charge sheet", "chargesheet", "conviction",
    "fake encounter", "custodial death",
    "directed", "directs", "verdict", "judgment",
    "orders", "stay order", "quashes",
    "protest", "strike", "bandh", "curfew",
    "internet suspended", "lathi", "communal",
    "displaced", "evacuat", "marooned", "relief camp",
    "red alert",
    "approves", "approval", "approved", "sanctioned", "clears",
    "launches", "inaugurat",
    "ध्वस्त", "ढह", "घोटाला", "अनियमितता",
    "भ्रष्टाचार", "रिश्वत", "जांच", "कैग",
    "आरोप पत्र", "सजा", "फर्जी मुठभेड़",
    "निर्देश", "आदेश", "फैसला",
    "विरोध", "हड़ताल", "बंद", "कर्फ्यू",
    "इंटरनेट बंद", "लाठी", "सांप्रदायिक",
    "विस्थापित", "राहत शिविर", "रेड अलर्ट",
    "मंजूरी", "मंजूर", "स्वीकृत", "शुभारंभ",
    "उद्घाटन",
]

# Structural failure nouns: with a consequence marker they read as
# infrastructure failure (development-typed), not routine accident.
INFRA_FAILURE_NOUNS = [
    "bridge", "building", "dam", "embankment", "flyover", "road",
    "पुल", "भवन", "बांध", "तटबंध", "सड़क",
]

# Mass casualty: N killed/dead with N >= 5 upgrades crime/accident to B.
_NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11,
    "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "dozen": 12, "dozens": 24,
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5,
    "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9, "दस": 10,
    "ग्यारह": 11, "बारह": 12, "तेरह": 13, "चौदह": 14, "पंद्रह": 15,
    "सोलह": 16, "सत्रह": 17, "अठारह": 18, "उन्नीस": 19, "बीस": 20,
}
_NUMBER_WORD_ALTS = "|".join(sorted(_NUMBER_WORDS, key=len, reverse=True))
CASUALTY_RES = [
    re.compile(r"(\d[\d,]*)\s+(killed|dead|deaths|died)\b", re.IGNORECASE),
    re.compile(r"(\d[\d,]*)\s*(?:की\s*)?(?:मौत|मरे|मृतक|मृत)"),
    re.compile(
        rf"\b({_NUMBER_WORD_ALTS})\b\s+(killed|dead|deaths|died)\b",
        re.IGNORECASE,
    ),
    re.compile(rf"({_NUMBER_WORD_ALTS})\s*(?:की\s*)?(?:मौत|मरे|मृतक|मृत)"),
]
MASS_CASUALTY_MIN = 5


def casualty_count(text: str) -> int:
    """Worst death toll stated in digits or number words; 0 when none."""
    worst = 0
    for rx in CASUALTY_RES:
        for match in rx.finditer(text):
            raw = match.group(1)
            try:
                value = int(raw.replace(",", ""))
            except ValueError:
                value = _NUMBER_WORDS.get(raw.lower(), 0)
            worst = max(worst, value)
    return worst
