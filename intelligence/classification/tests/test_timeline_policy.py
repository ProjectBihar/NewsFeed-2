import pytest
from classification.timeline_policy import timeline_policy


@pytest.mark.parametrize("title", [
    "Police arrest three in Patna murder case",
    "High Court denies bail to murder accused",
    "Bhojpur heroin bust: owners arrested for drug trafficking",
    "Cyber fraudsters misuse fingerprints for fake SIMs",
    "दहेज में चेन नहीं मिली तो विवाहिता को मार डाला, सास-ससुर को सजा",
    "कलयुगी शिक्षक पर एक्शन: छात्राओं के साथ करता था गलत काम",
    "बेगूसराय हत्याकांड का खुलासा, आरोपी गिरफ्तार",
    "MLA's son arrested for kidnapping",  # Official relatives are not an exemption.
    "Recruitment agent arrested for fake job scam",
    "High Court denies murder accused bail",  # Rights quoted in a case do not imply broad impact.
])
def test_routine_crime_is_excluded_even_when_it_mentions_a_court_or_official(title):
    assert timeline_policy(title)["excluded"] is True


@pytest.mark.parametrize("title", [
    "Bihar SVU raid: ADM investigated over disproportionate assets",
    "मुजफ्फरपुर जमीन फर्जीवाड़ा: निलंबित CO गिरफ्तार, विधायक पर जांच",
    "Government audit reveals public funds embezzlement",
    "CM orders statewide action against habitual offenders and drug networks",
    "Bihar police constable recruitment final result released",
    "High Court changes recruitment rules in public interest ruling",
    "High Court sets constitutional safeguards for bail in all trial courts",
    "न्यायाधीश की गंभीर लापरवाही: हाईकोर्ट ने अदालत की कार्यवाही पर सवाल उठाए",
])
def test_selected_public_interest_exceptions_remain(title):
    assert timeline_policy(title)["excluded"] is False


@pytest.mark.parametrize("title,body", [
    ("Bihar railway services resume", "Police previously arrested an offender near the line."),
    ("Minister attacks rival at rally", "Political debate on the economy."),
    ("Katihar RPF officer saves passenger with CPR", "Passenger suffered a heart attack."),
    ("AIIMS improves drug supply", "Medicines arrive today."),
    ("Bihar weather forecast", "Heavy rain expected."),
])
def test_other_news_and_incidental_mentions_are_not_removed(title, body):
    assert timeline_policy(title, "Publisher summary about public services.", body)["excluded"] is False


def test_private_bail_case_does_not_become_a_broad_ruling_from_an_incidental_rights_quote():
    assert timeline_policy("High Court grants bail to murder accused", "Counsel cited fundamental rights.")["excluded"] is True
