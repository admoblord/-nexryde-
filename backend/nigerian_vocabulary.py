"""
Nigerian Cities, States, and Custom Vocabulary
For Google Cloud Speech-to-Text
Optimized for NEXRYDE Voice Booking
"""

# All 36 Nigerian States
NIGERIAN_STATES = [
    # South West
    "Lagos", "Ogun", "Oyo", "Osun", "Ondo", "Ekiti",
    
    # South South
    "Rivers", "Bayelsa", "Delta", "Edo", "Cross River", "Akwa Ibom",
    
    # South East
    "Abia", "Anambra", "Ebonyi", "Enugu", "Imo",
    
    # North Central
    "Abuja", "FCT", "Kwara", "Kogi", "Benue", "Plateau", "Nasarawa", "Niger",
    
    # North West
    "Kaduna", "Kano", "Katsina", "Kebbi", "Sokoto", "Zamfara", "Jigawa",
    
    # North East
    "Borno", "Yobe", "Adamawa", "Gombe", "Bauchi", "Taraba",
]

# Major Nigerian Cities (100+)
NIGERIAN_CITIES = [
    # Lagos State (most important - detailed!)
    "Victoria Island", "VI", "Lekki", "Ikoyi", "Surulere", "Yaba", "Ikeja",
    "Festac", "Ajah", "Badagry", "Epe", "Ikorodu", "Oshodi", "Apapa",
    "Marina", "CMS", "Maryland", "Gbagada", "Ojuelegba", "Mushin",
    "Ajegunle", "Ebute Metta", "Costain", "Iyana Ipaja", "Egbeda",
    "Idimu", "Isolo", "Okota", "Ago Palace", "Cele", "Ijesha",
    "Palm Grove", "Onipanu", "Shomolu", "Bariga", "Alapere", "Ketu",
    "Mile 12", "Owode", "Sangotedo", "Agungi", "Chevron",
    "Abraham Adesanya", "Obalende", "Falomo", "Onikan",
    "Tafawa Balewa Square", "Tinubu", "Idumota", "Balogun",
    "Okobaba", "Sabo", "Ebute Ero", "Ijora", "Isale Eko", "Iddo",
    "Oyingbo", "Lawanson", "Itire", "Alimosho", "Ipaja",
    
    # Abuja (FCT) - capital city
    "Wuse", "Garki", "Maitama", "Asokoro", "Gwarinpa", "Kubwa",
    "Nyanya", "Karu", "Lugbe", "Jahi", "Utako", "Life Camp",
    "Guzape", "Katampe", "Jikwoyi", "Kuje", "Gwagwalada", "Suleja",
    "Madalla", "Zuba", "Bwari", "Dutse", "Apo", "Durumi",
    
    # Rivers State
    "Port Harcourt", "PH", "Diobu", "Rumuokoro", "Eliozu",
    "Airport Road", "Aba Road", "Trans Amadi", "GRA", "Old GRA",
    "New GRA", "Rumuola", "Rumueme", "Alakahia", "Choba",
    
    # Kano State
    "Kano", "Sabon Gari", "Fagge", "Kumbotso", "Nassarawa",
    "Gwale", "Tarauni", "Dala",
    
    # Oyo State
    "Ibadan", "Bodija", "Dugbe", "Challenge", "Mokola", "UI", "Ojoo",
    "Sango", "Eleyele", "Jericho", "Ring Road", "Iwo Road",
    
    # Kaduna State
    "Kaduna", "Barnawa", "Sabon Tasha", "Ungwan Rimi", "Kakuri",
    "Kawo", "Tudun Wada", "Zaria", "Samaru",
    
    # Edo State
    "Benin", "Benin City", "Sapele Road", "Ikpoba Hill", "Ugbowo",
    "Uselu", "Airport Road", "Ring Road",
    
    # Delta State
    "Warri", "Asaba", "Sapele", "Ughelli", "Agbor", "Abraka",
    
    # Anambra State
    "Onitsha", "Awka", "Nnewi", "Ekwulobia", "Ihiala",
    
    # Imo State
    "Owerri", "Orlu", "Okigwe", "Mbaise",
    
    # Abia State
    "Aba", "Umuahia", "Ariaria", "Osisioma", "Brass",
    
    # Enugu State
    "Enugu", "Nsukka", "Agbani", "Ninth Mile", "Oji River",
    
    # Cross River State
    "Calabar", "Odukpani", "Ikom", "Ugep",
    
    # Akwa Ibom State
    "Uyo", "Eket", "Ikot Ekpene", "Oron",
    
    # Ogun State
    "Abeokuta", "Ota", "Ijebu Ode", "Shagamu", "Sagamu", "Ilaro",
    "Mowe", "Ibafo", "Magboro",
    
    # Ondo State
    "Akure", "Ondo Town", "Owo", "Ikare",
    
    # Osun State
    "Osogbo", "Ile-Ife", "Ilesha", "Ede", "Iwo",
    
    # Ekiti State
    "Ado Ekiti", "Ikere", "Ijero",
    
    # Kwara State
    "Ilorin", "Offa", "Omu Aran",
    
    # Plateau State
    "Jos", "Bukuru", "Vom",
    
    # Bauchi State
    "Bauchi", "Azare",
    
    # Gombe State
    "Gombe", "Dukku",
    
    # Adamawa State
    "Yola", "Jimeta", "Mubi",
    
    # Borno State
    "Maiduguri", "Bama", "Biu",
    
    # Sokoto State
    "Sokoto", "Gwadabawa",
    
    # Katsina State
    "Katsina", "Daura", "Funtua",
    
    # Niger State
    "Minna", "Suleja", "Bida", "Kontagora",
    
    # Benue State
    "Makurdi", "Otukpo", "Gboko",
    
    # Kogi State
    "Lokoja", "Okene", "Kabba", "Idah",
]

# Nigerian Pidgin Common Words (most used in daily speech)
NIGERIAN_PIDGIN = [
    # Basic words
    "abeg", "abi", "dey", "dem", "dis", "dat", "wetin",
    "una", "shey", "oya", "wahala", "chop", "japa",
    "sabi", "belle", "waka", "yarn", "sharp sharp",
    "small small", "e don do", "no wahala", "i dey come",
    "how far", "i go", "make we", "e be like say",
    
    # Travel-related Pidgin
    "i wan go", "take me go", "where you dey",
    "we dey go", "na so", "e far", "e near",
    "how much", "wetin be price", "how person go take reach",
    
    # Greetings
    "bros", "sis", "oga", "madam", "guy", "babe",
    
    # Time expressions
    "now now", "just now", "later", "today today",
    
    # Agreement/Disagreement
    "ehen", "okay o", "no problem", "e don do",
]

# Common Nigerian Expressions (full phrases)
NIGERIAN_EXPRESSIONS = [
    # Travel phrases
    "I wan go", "I dey come", "where you dey", "how far",
    "no wahala", "na so", "e be like", "make we go",
    "take me go", "abeg take me", "i wan reach",
    
    # Questions
    "how much be am", "how far be the place",
    "wetin be the price", "how person go take reach there",
    
    # Confirmations
    "okay o", "no problem", "e don do", "na so",
]

# Alternative City Names & Abbreviations (very important!)
CITY_ALTERNATIVES = {
    "Victoria Island": ["VI", "V.I.", "Vee Eye", "V I", "Victoria"],
    "Port Harcourt": ["PH", "P.H.", "P H", "Port", "Port H"],
    "Abuja": ["FCT", "Federal Capital", "Federal Capital Territory"],
    "Lagos": ["Eko", "Las Gidi", "Lagos Island"],
    "Lekki": ["Lekky", "Lekki Peninsula"],
    "Ikoyi": ["Ikoyi Island"],
    "Festac": ["Festac Town", "Festac"],
    "Lekki Phase 1": ["Lekki One", "Phase 1", "Phase One"],
    "Ajah": ["Aja", "Ajao"],
}

# Common mispronunciations or variations
CITY_VARIATIONS = {
    "Onitsha": ["Onitcha"],
    "Oshodi": ["Osodi"],
    "Ojuelegba": ["Ojuelegba", "Ojuelegbah"],
    "Ikeja": ["Ikejah"],
}

def get_all_vocabulary():
    """
    Combine all Nigerian vocabulary into one list for Google Cloud Speech
    """
    vocabulary = []
    
    # Add states
    vocabulary.extend(NIGERIAN_STATES)
    
    # Add cities
    vocabulary.extend(NIGERIAN_CITIES)
    
    # Add Pidgin words
    vocabulary.extend(NIGERIAN_PIDGIN)
    
    # Add expressions
    vocabulary.extend(NIGERIAN_EXPRESSIONS)
    
    # Add all alternatives
    for standard_name, alternatives in CITY_ALTERNATIVES.items():
        vocabulary.append(standard_name)
        vocabulary.extend(alternatives)
    
    # Add variations
    for standard_name, variations in CITY_VARIATIONS.items():
        vocabulary.append(standard_name)
        vocabulary.extend(variations)
    
    # Remove duplicates and return
    return list(set(vocabulary))

def normalize_city_name(spoken_text: str) -> str:
    """
    Convert spoken alternatives to standard city names
    
    Examples:
        "VI" → "Victoria Island"
        "PH" → "Port Harcourt"
        "Eko" → "Lagos"
    """
    text_lower = spoken_text.lower().strip()
    
    # Check city alternatives
    for standard_name, alternatives in CITY_ALTERNATIVES.items():
        if text_lower == standard_name.lower():
            return standard_name
        for alt in alternatives:
            if text_lower == alt.lower() or alt.lower() in text_lower:
                return standard_name
    
    # Check city variations
    for standard_name, variations in CITY_VARIATIONS.items():
        if text_lower == standard_name.lower():
            return standard_name
        for var in variations:
            if text_lower == var.lower() or var.lower() in text_lower:
                return standard_name
    
    # Return original if no match
    return spoken_text

def extract_destination_from_pidgin(text: str) -> str:
    """
    Extract destination from Pidgin phrases
    
    Examples:
        "I wan go Lekki" → "Lekki"
        "Take me go VI" → "Victoria Island"
        "Make we go Yaba" → "Yaba"
    """
    text_lower = text.lower().strip()
    
    # Common Pidgin patterns
    patterns = [
        "i wan go ",
        "i want go ",
        "take me go ",
        "make we go ",
        "abeg take me go ",
        "i go ",
        "we dey go ",
    ]
    
    for pattern in patterns:
        if pattern in text_lower:
            # Extract everything after the pattern
            destination = text_lower.split(pattern)[1].strip()
            # Normalize the destination
            return normalize_city_name(destination)
    
    # If no pattern found, try to find any city name in the text
    for city in NIGERIAN_CITIES:
        if city.lower() in text_lower:
            return normalize_city_name(city)
    
    return text

# Get vocabulary list for export
VOCABULARY = get_all_vocabulary()

if __name__ == "__main__":
    # Test the vocabulary
    print(f"Total vocabulary words: {len(VOCABULARY)}")
    print(f"States: {len(NIGERIAN_STATES)}")
    print(f"Cities: {len(NIGERIAN_CITIES)}")
    print(f"Pidgin words: {len(NIGERIAN_PIDGIN)}")
    
    # Test normalization
    print("\nTesting normalization:")
    test_cases = [
        "VI",
        "PH",
        "Eko",
        "I wan go Lekki",
        "Take me go Victoria Island",
    ]
    for test in test_cases:
        normalized = normalize_city_name(test)
        extracted = extract_destination_from_pidgin(test)
        print(f"  '{test}' → normalize: '{normalized}', extract: '{extracted}'")
