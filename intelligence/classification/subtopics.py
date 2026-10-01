"""Topic taxonomy (Phase 12): eight public categories, ~40 subtopics.

Subtopics carry the nuance the plan forbids forcing into the eight
top-level buckets. Each subtopic has EN + HI phrase families; the
scorer aggregates to primary_category and keeps secondary_topics[].
"""

# subtopic -> (category, [(phrase, weight)])
SUBTOPICS: dict[str, tuple[str, list[tuple[str, int]]]] = {
    "Public Finance": ("Economy", [
        ("fiscal deficit", 4), ("GDP", 4), ("public finance", 4), ("exchequer", 3),
        ("expenditure", 3), ("expenditures", 3), ("audit", 2),
        ("utilisation certificate", 3), ("utilisation certificates", 3),
        ("budget", 2), ("outlay", 2), ("outlays", 2),
        ("राजकोष", 3), ("राजकोषीय घाटा", 4), ("बजट", 2), ("परिव्यय", 2),
        ("व्यय", 2),
    ]),
    "Employment & Jobs": ("Economy", [
        ("employment", 3), ("jobs", 2), ("unemployment", 4), ("vacancies", 3),
        ("recruitment drive", 3), ("rojgar", 3),
        ("रोजगार", 3), ("बेरोजगारी", 4), ("रिक्तियां", 3), ("रिक्त पद", 3),
        ("नौकरियां", 2),
    ]),
    "Banking & Credit": ("Economy", [
        ("bank loan", 3), ("bank", 2), ("banks", 2), ("loan", 2), ("loans", 2),
        ("credit", 2), ("interest subsidy", 4), ("NPA", 3), ("banking", 2),
        ("ऋण", 2), ("ब्याज अनुदान", 4), ("बैंकिंग", 2), ("कर्ज", 2), ("बैंक", 2),
    ]),
    "Prices & Inflation": ("Economy", [
        ("inflation", 4), ("price rise", 4), ("prices", 2), ("MSP", 3),
        ("minimum support price", 4),
        ("महंगाई", 4), ("मुद्रास्फीति", 4), ("कीमतें", 2), ("न्यूनतम समर्थन मूल्य", 4),
    ]),
    "Budget & Taxation": ("Economy", [
        ("tax", 2), ("GST", 3), ("taxation", 3), ("budget allocation", 4),
        ("stamp duty", 3),
        ("कर", 1), ("जीएसटी", 3), ("कराधान", 3), ("स्टांप शुल्क", 3),
    ]),
    "Roads & Bridges": ("Infrastructure", [
        ("road", 2), ("highway", 3), ("bridge", 3), ("flyover", 3),
        ("elevated road", 4), ("bypass", 3), ("road project", 4),
        ("सड़क", 2), ("राजमार्ग", 3), ("पुल", 3), ("फ्लाईओवर", 3),
        ("एलिवेटेड रोड", 4), ("बाइपास", 3),
    ]),
    "Railways": ("Infrastructure", [
        ("railway", 3), ("railways", 3), ("rail line", 4), ("station", 2),
        ("rail bridge", 4), ("train services", 3), ("rail coach", 3),
        ("रेलवे", 3), ("रेल लाइन", 4), ("स्टेशन", 2), ("रेल पुल", 4),
        ("ट्रेन सेवा", 3),
    ]),
    "Metro & Urban Transport": ("Infrastructure", [
        ("metro", 4), ("metro rail", 4), ("urban transport", 4),
        ("city bus", 3), ("e-rickshaw", 2),
        ("मेट्रो", 4), ("मेट्रो रेल", 4), ("शहरी परिवहन", 4),
        ("सिटी बस", 3),
    ]),
    "Airports & Aviation": ("Infrastructure", [
        ("airport", 4), ("aviation", 3), ("terminal", 2), ("runway", 3),
        ("civil enclave", 4), ("UDAN", 3),
        ("हवाई अड्डा", 4), ("विमानन", 3), ("टर्मिनल", 2), ("रनवे", 3),
        ("उड़ान योजना", 3),
    ]),
    "Power & Energy": ("Infrastructure", [
        ("power plant", 4), ("thermal power", 4), ("electricity", 2),
        ("power supply", 3), ("substation", 3), ("electrification", 3),
        ("बिजली संयंत्र", 4), ("ताप विद्युत", 4), ("बिजली", 2),
        ("विद्युत आपूर्ति", 3), ("विद्युतीकरण", 3),
    ]),
    "Water Supply & Sanitation": ("Infrastructure", [
        ("drinking water", 3), ("water supply", 3), ("pipeline", 2),
        ("tap water", 3), ("nal-jal", 4), ("har ghar nal", 4),
        ("sewerage", 3), ("drainage", 2),
        ("पेयजल", 3), ("जलापूर्ति", 3), ("पाइपलाइन", 2), ("नल-जल", 4),
        ("हर घर नल", 4), ("सीवरेज", 3), ("जल निकासी", 2),
    ]),
    "Housing & Urban Development": ("Infrastructure", [
        ("housing", 3), ("urban development", 4), ("smart city", 4),
        ("master plan", 3), ("slum", 2),
        ("आवास", 3), ("नगर विकास", 4), ("स्मार्ट सिटी", 4),
        ("मास्टर प्लान", 3),
    ]),
    "Manufacturing": ("Industry", [
        ("manufacturing", 4), ("factory", 3), ("distillery", 4),
        ("refinery", 4), ("fertilizer plant", 4), ("production unit", 3),
        ("विनिर्माण", 4), ("कारखाना", 3), ("आसवनी", 4), ("रिफाइनरी", 4),
        ("उर्वरक संयंत्र", 4), ("उत्पादन इकाई", 3),
    ]),
    "Food Processing": ("Industry", [
        ("food processing", 5), ("food park", 4), ("packaged food", 3),
        ("खाद्य प्रसंस्करण", 5), ("फूड पार्क", 4),
    ]),
    "Textiles": ("Industry", [
        ("textile", 4), ("textiles", 4), ("garment", 3), ("handloom", 3),
        ("वस्त्र", 4), ("परिधान", 3), ("हथकरघा", 3),
    ]),
    "Ethanol & Sugar": ("Industry", [
        ("ethanol", 4), ("distillery", 3), ("distilleries", 3),
        ("sugar mill", 4), ("molasses", 3),
        ("इथेनॉल", 4), ("चीनी मिल", 4), ("शीरा", 3),
    ]),
    "MSME & Startups": ("Industry", [
        ("MSME", 4), ("startup", 3), ("startups", 3), ("small enterprise", 3),
        ("entrepreneur", 2),
        ("एमएसएमई", 4), ("स्टार्टअप", 3), ("लघु उद्यम", 3), ("उद्यमी", 2),
    ]),
    "Industrial Land & Policy": ("Industry", [
        ("industrial policy", 5), ("plot allotment", 4), ("land allotment", 4),
        ("industrial area", 3), ("industrial park", 3), ("growth centre", 4),
        ("औद्योगिक नीति", 5), ("भूखंड आवंटन", 4), ("भूमि आवंटन", 4),
        ("औद्योगिक क्षेत्र", 3), ("विकास केंद्र", 4),
    ]),
    "Crops & Production": ("Agriculture", [
        ("paddy", 3), ("wheat", 3), ("maize", 3), ("crop", 2), ("seeds", 2),
        ("kharif", 3), ("rabi", 3), ("harvest", 2),
        ("धान", 3), ("गेहूं", 3), ("मक्का", 3), ("फसल", 2), ("बीज", 2),
        ("खरीफ", 3), ("रबी", 3), ("कटाई", 2),
    ]),
    "Irrigation & Water": ("Agriculture", [
        ("irrigation", 4), ("canal", 3), ("tubewell", 3), ("solar pump", 4),
        ("micro-irrigation", 4), ("silt", 1),
        ("सिंचाई", 4), ("नहर", 3), ("नलकूप", 3), ("सोलर पंप", 4),
        ("सूक्ष्म सिंचाई", 4),
    ]),
    "Dairy & Livestock": ("Agriculture", [
        ("dairy", 3), ("milk", 2), ("cattle", 2), ("poultry", 3),
        ("fisheries", 3), ("fish farmers", 3),
        ("डेयरी", 3), ("दूध", 2), ("पशु", 1), ("मुर्गी पालन", 3),
        ("मत्स्य", 3),
    ]),
    "Farm Mechanisation": ("Agriculture", [
        ("farm mechanisation", 5), ("mechanization", 4), ("tractor", 3),
        ("combine harvester", 4), ("custom hiring", 3),
        ("कृषि यंत्रीकरण", 5), ("ट्रैक्टर", 3), ("कंबाइन", 4),
    ]),
    "Markets & MSP": ("Agriculture", [
        ("mandi", 3), ("APMC", 4), ("procurement", 3), ("MSP", 3),
        ("market yard", 3),
        ("मंडी", 3), ("खरीद", 3), ("विपणन", 2),
    ]),
    "School Education": ("Education", [
        ("school", 2), ("schools", 2), ("midday meal", 4), ("enrollment", 3),
        ("dropout", 3), ("classroom", 2), ("teacher", 2),
        ("विद्यालय", 2), ("मध्याह्न भोजन", 4), ("नामांकन", 3),
        ("कक्षा", 2), ("शिक्षक", 2),
    ]),
    "Higher Education": ("Education", [
        ("university", 3), ("college", 2), ("admission", 2), ("campus", 2),
        ("vice-chancellor", 3), ("semester", 2),
        ("विश्वविद्यालय", 3), ("महाविद्यालय", 2), ("दाखिला", 2),
        ("परिसर", 2), ("कुलपति", 3),
    ]),
    "Exams & Recruitment": ("Education", [
        ("examination", 3), ("exam calendar", 4), ("admit card", 4),
        ("recruitment", 2), ("vacancy", 2), ("counselling", 3),
        ("परीक्षा", 3), ("परीक्षा कैलेंडर", 4), ("प्रवेश पत्र", 4),
        ("नियुक्ति", 2), ("काउंसलिंग", 3),
    ]),
    "Hospitals & Infrastructure": ("Healthcare", [
        ("hospital", 3), ("hospitals", 3), ("OPD", 3), ("beds", 2),
        ("trauma centre", 4), ("medical college", 3), ("AIIMS", 3),
        ("अस्पताल", 3), ("ओपीडी", 3), ("बिस्तर", 2), ("ट्रॉमा सेंटर", 4),
        ("मेडिकल कॉलेज", 3), ("एम्स", 3),
    ]),
    "Public Health & Schemes": ("Healthcare", [
        ("public health", 4), ("immunisation", 4), ("vaccination", 4),
        ("Ayushman", 4), ("health scheme", 3), ("ASHA", 3),
        ("सार्वजनिक स्वास्थ्य", 4), ("टीकाकरण", 4), ("आयुष्मान", 4),
        ("स्वास्थ्य योजना", 3), ("आशा कार्यकर्ता", 3),
    ]),
    "Medical Staff": ("Healthcare", [
        ("doctors", 3), ("doctor", 2), ("nurses", 3), ("shortage of doctors", 4),
        ("डॉक्टर", 3), ("चिकित्सक", 3), ("नर्स", 3),
    ]),
    "Disease Control": ("Healthcare", [
        ("outbreak", 4), ("epidemic", 4), ("dengue", 4), ("chikungunya", 4),
        ("AES", 4), ("encephalitis", 4), ("water-borne", 3),
        ("प्रकोप", 4), ("महामारी", 4), ("डेंगू", 4), ("इंसेफेलाइटिस", 4),
        ("जलजनित", 3),
    ]),
    "Rivers & Floods": ("Environment", [
        ("flood", 4), ("floods", 4), ("river", 2), ("embankment", 3),
        ("siltation", 2), ("Ganga", 2),
        ("बाढ़", 4), ("नदी", 2), ("तटबंध", 3), ("गाद", 2), ("गंगा", 2),
    ]),
    "Forests & Wildlife": ("Environment", [
        ("tiger", 4), ("reserve", 2), ("sanctuary", 3), ("forest", 2),
        ("poaching", 3), ("census", 1), ("bird", 2),
        ("बाघ", 4), ("अभयारण्य", 3), ("वन", 1), ("अवैध शिकार", 3),
        ("पक्षी", 2), ("गणना", 1),
    ]),
    "Pollution & Air Quality": ("Environment", [
        ("pollution", 4), ("air quality", 4), ("AQI", 4), ("smog", 3),
        ("dust", 1), ("plastic waste", 3),
        ("प्रदूषण", 4), ("वायु गुणवत्ता", 4), ("धुंध", 3),
        ("प्लास्टिक कचरा", 3),
    ]),
    "Climate & Weather": ("Environment", [
        ("monsoon", 2), ("rainfall", 2), ("heatwave", 3), ("cold wave", 3),
        ("climate", 2),
        ("मानसून", 2), ("वर्षा", 2), ("लू", 2), ("जलवायु", 2),
    ]),
    "Wetlands": ("Environment", [
        ("wetland", 4), ("wetlands", 4), ("oxbow lake", 4), ("migratory birds", 4),
        ("आर्द्रभूमि", 4), ("प्रवासी पक्षी", 4),
    ]),
    "Administration & Services": ("Governance", [
        ("district magistrate", 4), ("DM ", 2), ("commissioner", 2),
        ("secretariat", 3), ("review meeting", 3), ("directive", 2),
        ("जिलाधिकारी", 4), ("आयुक्त", 2), ("सचिवालय", 3),
        ("समीक्षा बैठक", 3),
    ]),
    "Police & Law & Order": ("Governance", [
        ("police", 3), ("law and order", 4), ("policing", 3),
        ("patrolling", 2), ("crime rate", 3), ("CCTV", 2),
        ("पुलिस", 3), ("कानून व्यवस्था", 4), ("गश्त", 2), ("अपराध दर", 3),
    ]),
    "Judiciary & Justice": ("Governance", [
        ("high court", 3), ("supreme court", 3), ("verdict", 3),
        ("judgment", 2), ("tribunal", 3),
        ("उच्च न्यायालय", 3), ("सर्वोच्च न्यायालय", 3), ("फैसला", 3),
        ("अधिकरण", 3),
    ]),
    "Elections & Panchayats": ("Governance", [
        ("panchayat", 3), ("municipal", 2), ("civic polls", 4),
        ("ward", 2), ("Municipal corporation", 3),
        ("पंचायत", 3), ("नगर निगम", 3), ("नगर निकाय चुनाव", 4), ("वार्ड", 2),
    ]),
    "Welfare Schemes": ("Governance", [
        ("welfare scheme", 4), ("pension", 3), ("ration", 3), ("PDS", 3),
        ("beneficiaries", 2), ("DBT", 3),
        ("कल्याण योजना", 4), ("पेंशन", 3), ("राशन", 3), ("लाभार्थी", 2),
        ("डीबीटी", 3),
    ]),
    "Land & Revenue": ("Governance", [
        ("land survey", 4), ("mutation", 4), ("land records", 4),
        ("jamabandi", 4), ("revenue", 1),
        ("भूमि सर्वेक्षण", 4), ("दाखिल-खारिज", 4), ("भू-अभिलेख", 4),
        ("जमाबंदी", 4),
    ]),
    "Disaster Management": ("Governance", [
        ("disaster management", 4), ("relief camp", 4), ("NDRF", 3),
        ("evacuation", 3), ("compensation", 2),
        ("आपदा प्रबंधन", 4), ("राहत शिविर", 4), ("एनडीआरएफ", 3),
        ("मुआवजा", 2),
    ]),
    "Transfers & Appointments": ("Governance", [
        ("transferred", 3), ("transfer order", 4), ("appointed", 2),
        ("posting", 2),
        ("तबादला", 3), ("स्थानांतरण", 3), ("नियुक्त", 2), ("पदस्थापन", 2),
    ]),
}

PUBLIC_CATEGORIES = [
    "Economy", "Infrastructure", "Industry", "Agriculture",
    "Education", "Healthcare", "Environment", "Governance",
]

SUBTOPIC_CATEGORY = {name: category for name, (category, _) in SUBTOPICS.items()}
