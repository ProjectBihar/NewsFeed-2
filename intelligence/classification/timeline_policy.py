"""Reader preference: suppress routine crime, preserve public-interest coverage.

Headline and publisher summary describe the main subject. Body text is only a
short fallback when no summary exists; incidental mentions elsewhere do not
decide timeline admission. This is independent of category/importance tiers.
"""
import re


def _has(pattern, text):
    return bool(re.search(pattern, text, flags=re.IGNORECASE))


CRIME = (
    r"\b(?:murder\w*|rape\w*|robber\w*|theft|kidnap\w*|arrest\w*|"
    r"assault\w*|stab\w*|shot dead|shooting|dacoity|molest\w*|"
    r"drug trafficking|drug bust|heroin|cyber fraud\w*|fraud\w*|scam\w*|"
    r"bail|convict\w*|sentenced|dowry death|sexual abuse)\b|"
    r"हत्या|हत्याकांड|मर्डर|बलात्कार|दुष्कर्म|यौन उत्पीड़न|यौन शोषण|"
    r"लूट|डकैती|अपहरण|गिरफ्तार|गोलीबारी|गोली मार|मार डाला|"
    r"मारपीट|हेरोइन|स्मैक|नशीले पदार्थ|ठगी|धोखाधड़ी|साइबर ठग|साइबर अपराध|"
    r"जमानत|(?:को|की|कैद की) सजा|छात्राओं के साथ.*(?:गलत|छेड़)|"
    r"(?:महिला|बच्ची|छात्रा).*छेड़छाड़"
)
GOVERNMENT = (
    r"\b(?:government|minister|official|civil servant|ADM|DM|CO|MLA|"
    r"municipal|public funds|police officer|revenue|CAG|SVU|vigilance)\b|"
    r"सरकार|मंत्री|विधायक|अधिकारी|सीओ|जिलाधिकारी|राजस्व|सरकारी|"
    r"लोक सेवक|निगरानी|बेतिया राज|नगर निगम"
)
CORRUPTION = (
    r"\b(?:corruption|brib\w*|embezzl\w*|disproportionate assets|"
    r"audit|scam|land fraud|fake mutation|misappropriat\w*)\b|"
    r"भ्रष्टाचार|रिश्वत|घोटाल|गबन|आय से अधिक|अनियमित|फर्जीवाड़|"
    r"फर्जी जमाबंदी|फर्जी.*दाखिल|जमाबंदी पर सवाल"
)


def timeline_policy(title, description=None, body=None):
    title = title or ""
    # Avoid counting a duplicated headline as extra evidence.
    summary = description or (body or "")[:600]
    text = f"{title}\n{summary}"
    reason = None
    if _has(r"\b(?:recruitment.*(?:result|vacanc|notification|rules)|constable.*result|exam.*result|selection list)\b|भर्ती.*(?:परिणाम|रिजल्ट|परीक्षा|सूची|नियम)|नियुक्ति.*(?:परीक्षा|परिणाम|रिजल्ट)|सिपाही.*रिजल्ट", title) and not _has(CRIME, title):
        reason = "public-interest:recruitment"
    elif _has(GOVERNMENT, text) and _has(CORRUPTION, text):
        reason = "public-interest:government-accountability"
    elif _has(r"\b(?:CAG|SVU|vigilance)\b|निगरानी ब्यूरो", title) and _has(r"raid|probe|investigat|छाप|जांच|जाँच", text):
        reason = "public-interest:corruption-investigation"
    elif _has(GOVERNMENT + r"|\bCM\b|मुख्यमंत्री", text) and _has(
        r"\b(?:policy|reform|statewide|law and order|habitual offenders|drug networks)\b|"
        r"नई नीति|कानून.*संशोधन|प्रदेश.*अभियान|पुलिस सुधार|कानून व्यवस्था", title
    ) and _has(r"orders?|direct|announc|adopt|approv|निर्देश|नीति|सुधार|अभियान", text):
        reason = "public-interest:policy"
    elif _has(r"court|judg|अदालत|न्यायालय|हाईकोर्ट|न्यायाधीश", title) and _has(
        r"\b(?:PIL|constitutional|fundamental rights|all trial courts|public interest|"
        r"reservation policy|recruitment rules|appellate procedure)\b|"
        r"जनहित|संवैधानिक|मौलिक अधिकार|आरक्षण नीति|भर्ती नियम|सभी.*अदालत", text
    ) and (not _has(CRIME, title) or _has(r"all trial courts|bail rules|bail guidelines|सभी.*अदालत|जमानत.*नियम", title)):
        reason = "public-interest:broad-court-decision"
    elif _has(r"judg|न्यायाधीश|अदालत|ट्रायल कोर्ट", title) and _has(
        r"judicial misconduct|procedural failure|गंभीर लापरवाही|अदालत.*गंभीर सवाल|कोर्ट.*रिकॉर्ड तलब", text
    ):
        reason = "public-interest:judicial-accountability"
    if reason:
        return {"excluded": False, "reason": reason}
    if _has(CRIME, text):
        return {"excluded": True, "reason": "reader-preference:routine-crime"}
    return {"excluded": False, "reason": "reader-preference:non-crime"}
