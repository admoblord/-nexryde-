"""Nigerian city detection helpers for fare and demand logic."""

NIGERIAN_CITIES = {
    "lagos": {"lat": 6.5244, "lng": 3.3792, "state": "Lagos", "zones": ["Victoria Island", "Lekki", "Ikeja", "Surulere", "Oshodi", "Apapa"]},
    "abuja": {"lat": 9.0579, "lng": 7.4951, "state": "FCT", "zones": ["Wuse", "Maitama", "Garki", "Asokoro", "Gwarinpa", "Kubwa"]},
    "port harcourt": {"lat": 4.8156, "lng": 7.0498, "state": "Rivers", "zones": ["GRA", "Trans-Amadi", "Rumuola", "D-Line", "Eleme Junction", "Aba Road"]},
    "ibadan": {"lat": 7.3775, "lng": 3.9470, "state": "Oyo", "zones": ["Ring Road", "Challenge", "Dugbe", "Bodija", "UI", "Mokola"]},
    "kano": {"lat": 12.0022, "lng": 8.5920, "state": "Kano", "zones": ["Sabon Gari", "Nasarawa", "Fagge", "Tarauni", "Gwale", "Kumbotso"]},
    "benin": {"lat": 6.3350, "lng": 5.6037, "state": "Edo", "zones": ["Ring Road", "Sapele Road", "Airport Road", "Uselu", "Ugbowo", "GRA"]},
    "enugu": {"lat": 6.4584, "lng": 7.5464, "state": "Enugu", "zones": ["Independence Layout", "New Haven", "Ogui", "GRA", "Trans-Ekulu", "Abakpa"]},
    "owerri": {"lat": 5.4836, "lng": 7.0333, "state": "Imo", "zones": ["Wetheral Road", "Douglas Road", "Orji", "World Bank", "MCC Road", "Aladinma"]},
    "warri": {"lat": 5.5167, "lng": 5.7500, "state": "Delta", "zones": ["Effurun", "Jakpa", "Enerhen", "Airport Road", "PTI", "Ekpan"]},
    "calabar": {"lat": 4.9517, "lng": 8.3220, "state": "Cross River", "zones": ["Marian", "Watt Market", "Ekpo Abasi", "Satellite Town", "Atimbo", "8 Miles"]},
    "kaduna": {"lat": 10.5105, "lng": 7.4165, "state": "Kaduna", "zones": ["Barnawa", "Sabon Tasha", "Kawo", "Tudun Wada", "Rigasa", "Malali"]},
    "jos": {"lat": 9.8965, "lng": 8.8583, "state": "Plateau", "zones": ["Terminus", "Bukuru", "Anglo Jos", "Farin Gada", "Hwolshe", "Rayfield"]},
    "ilorin": {"lat": 8.4966, "lng": 4.5426, "state": "Kwara", "zones": ["GRA", "Tanke", "Fate", "Challenge", "Oja-Oba", "Unity Road"]},
    "abeokuta": {"lat": 7.1475, "lng": 3.3619, "state": "Ogun", "zones": ["Kuto", "Oke-Mosan", "Sapon", "Onikolobo", "Adatan", "Ibara"]},
    "uyo": {"lat": 5.0377, "lng": 7.9128, "state": "Akwa Ibom", "zones": ["Ikot Ekpene Road", "Oron Road", "Abak Road", "Udo Udoma", "IBB Way", "Ring Road"]},
    "asaba": {"lat": 6.1987, "lng": 6.7333, "state": "Delta", "zones": ["Nnebisi Road", "Okpanam Road", "DLA Road", "Summit Road", "Infant Jesus", "Cable Point"]},
}


def detect_city(lat: float = None, lng: float = None, city_name: str = None) -> dict:
    """Detect which Nigerian city applies based on coordinates or name."""
    if city_name:
        key = city_name.lower().strip()
        for city_key, data in NIGERIAN_CITIES.items():
            if key in city_key or city_key in key:
                return {"city": city_key.title(), **data}

    if lat and lng:
        closest = None
        min_dist = float("inf")
        for city_key, data in NIGERIAN_CITIES.items():
            dist = ((lat - data["lat"]) ** 2 + (lng - data["lng"]) ** 2) ** 0.5
            if dist < min_dist:
                min_dist = dist
                closest = {"city": city_key.title(), **data}
        if closest and min_dist < 1.5:
            return closest

    return {"city": "Lagos", **NIGERIAN_CITIES["lagos"]}
