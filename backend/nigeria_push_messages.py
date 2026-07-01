"""
Nigeria push notification messages — plain English, no emojis.

Every message template uses {area}, {city}, and {route} placeholders
that are filled with the user's resolved neighbourhood before sending.

get_message(area_info, role, slot_key, rotation_idx) -> dict[title, body]

Slot keys:
  driver -> "06:00"  "12:00"  "17:00"  "20:00"
  rider  -> "07:30"  "13:00"  "18:00"
"""
from __future__ import annotations
from nigeria_geo_zones import AreaInfo

# ─────────────────────────────────────────────────────────────────────────────
# DRIVER — 06:00 (morning rush)
# ─────────────────────────────────────────────────────────────────────────────
DRIVER_06: list[tuple[str, str]] = [
    ("{area} is waking up",
     "{area} riders are already booking to beat the {route} congestion. Go online now before another driver takes them."),
    ("Morning surge in {area}",
     "High demand, very few drivers online. {area} bookings are live right now. Open NexRyde and pick them up."),
    ("{area} morning rush starts now",
     "Workers heading out of {area} need rides before the road locks down. Be their driver this morning."),
    ("Early risers in {area} are booking",
     "Beat your competition. Go online now and grab the morning trips before 8 AM."),
    ("Your first trip today is waiting",
     "A rider in {area} is searching for a driver right now. Log in and pick up the fare."),
    ("{area} morning rides mean good money",
     "Early drivers in {area} earn more. Clock in before the rush reaches its peak."),
    ("{city} is already moving",
     "{area} riders are heading out early. Short, quick rides are stacking up. Go online now."),
    ("{area} riders are booking now",
     "Morning demand in {area} is at its highest for the day. Do not sit this one out."),
    ("{area} needs drivers right now",
     "Morning bookings are building up in {area}. Go online and be the driver they find first."),
    ("Hit your daily target from {area}",
     "Morning rides in {area} are short, fast, and back to back. Ten trips before noon is possible."),
    ("{route} will jam by 7:30 AM",
     "Beat the congestion. {area} riders are booking now before the road becomes impossible. Go online."),
    ("Riders in {area} prefer NexRyde",
     "They are searching the app right now. Go online and take the trip before someone else does."),
    ("{area} surge window is open",
     "Demand just went up in {area}. Go online and make the most of it while it lasts."),
    ("Smart {city} drivers start early",
     "They know {area} morning bookings are where the real money is. Start before they take all the trips."),
    ("Good morning from {area}",
     "The top earners in {city} are already live. Do not start your day behind. Go online now."),
]

# ─────────────────────────────────────────────────────────────────────────────
# DRIVER — 12:00 (lunch rush)
# ─────────────────────────────────────────────────────────────────────────────
DRIVER_12: list[tuple[str, str]] = [
    ("{area} lunch rush means quick cash",
     "Riders leaving {area} for lunch right now. Two short trips can be done in under an hour."),
    ("Bookings just jumped in {area}",
     "It is midday. {area} demand has spiked. Go online and earn during the lunch hour."),
    ("Still short of your target today",
     "The midday window in {area} will not last. Go online now and close the gap."),
    ("Lunch peak in {area} is right now",
     "Lunchtime is one of the busiest booking hours in {area}. Do not miss this window."),
    ("One hour in {area} pays well now",
     "Just one hour online during the {area} lunch rush will surprise you with how much you earn."),
    ("Top {city} drivers never skip noon",
     "They are live in {area} right now. Be one of them and earn during the midday window."),
    ("{area} workers are on their break",
     "Lunch demand is peaking in {area}. Go online before all the bookings are taken."),
    ("Midday rides in {area} add up fast",
     "Short trips, frequent bookings, solid fares. The {area} lunch hour is worth your time."),
    ("Even 45 minutes in {area} counts",
     "The lunch rush in {area} is short but very profitable. A quick session now pays well."),
    ("{area} trips are short and close",
     "Lunch rides from {area} are usually nearby. Stack them fast and earn more in less time."),
    ("Consistency builds income in {city}",
     "Drivers who go live at noon in {area} earn more per week. Build that habit today."),
    ("Office workers in {area} are booking",
     "Meetings, errands, lunch runs — {area} is busy right now. Be their driver this afternoon."),
    ("You are close to your daily milestone",
     "A few more rides will get you there. {area} midday is the right time to push."),
    ("Unlock your {area} afternoon earnings",
     "Go online now. Afternoon demand in {area} always follows the lunch hour."),
    ("Your {area} earnings are waiting",
     "Check your progress then go earn more in {area}. Lunchtime demand is active right now."),
]

# ─────────────────────────────────────────────────────────────────────────────
# DRIVER — 17:00 (evening rush)
# ─────────────────────────────────────────────────────────────────────────────
DRIVER_17: list[tuple[str, str]] = [
    ("5 PM in {area} — the rush is here",
     "The highest-earning hour in {area} has started. Go online right now or miss it completely."),
    ("Evening surge is live in {area}",
     "Every worker leaving {area} needs a ride home. Your next booking is waiting. Go online."),
    ("{area} at 5 PM is the money slot",
     "More rides, higher fares, less competition. The {area} evening window is yours to take."),
    ("{route} is gridlocked — riders need you",
     "Traffic on {route} is very bad. Riders in {area} are done with taxis. Be the better option."),
    ("Do not miss {area} evening earnings",
     "Top earners in {city} logged in at 5 PM. Where are you in {area} right now?"),
    ("{area} evening rides, strong fares",
     "Evening rush in {area} means back-to-back trips and stacked earnings. Go live now."),
    ("{area} offices just closed",
     "Everyone is leaving their workplace in {area}. Be the driver they find first tonight."),
    ("Your {area} evening target is close",
     "You are close to your daily goal. The {area} rush will help you close it. Go online now."),
    ("Golden earning hour in {area}",
     "5 to 7 PM in {area} is when drivers earn the most per hour. Do not waste it offline."),
    ("Last big {area} window today",
     "After 8 PM things slow down in {area}. Right now it is full speed. Go online now."),
    ("{area} offices closing, rides opening",
     "Evening commuters in {area} are searching for drivers. Be the one they book tonight."),
    ("Every minute offline now costs money",
     "Every minute you stay offline in {area} right now is money left on the table. Go live."),
    ("{city} peaks in the evening",
     "Rush hour in {area} is your time to perform. Go online and make the most of tonight."),
    ("Be the top driver in {area} tonight",
     "High ratings. High demand. High fares. Everything is lined up in {area} right now."),
    ("{area} evening drivers earn the most",
     "Top weekly earners in {city} never skip the 5 PM rush in {area}. Be in that group."),
]

# ─────────────────────────────────────────────────────────────────────────────
# DRIVER — 20:00 (night window)
# ─────────────────────────────────────────────────────────────────────────────
DRIVER_20: list[tuple[str, str]] = [
    ("Less competition in {area} tonight",
     "Most drivers have gone offline in {area}. Stay on and pick up the night premium fares."),
    ("{area} night riders are out there",
     "Restaurants, events, and late gatherings in {area}. Night riders tend to rate better. Log in."),
    ("One more push in {area} tonight",
     "Not yet at your daily goal? {area} night demand is your last window to close it."),
    ("{area} night crowd is booking now",
     "Demand is going up again in {area}. End your day with a strong finish. Go online."),
    ("{area} night rides rate higher",
     "Relaxed passengers, less {route} pressure, better tips. {area} nights are real money."),
    ("Finish your day strong in {area}",
     "Every good earnings day ends with a solid night window. {area} still has active demand."),
    ("{area} night shift means night pay",
     "Fewer cars on {route}, more ride requests per driver online. Log in and earn the premium."),
    ("Late-night {area} crowd is active",
     "Food pickups, social rides, late returns home. {area} night demand never fully stops."),
    ("{area} still needs drivers tonight",
     "One hour online in {area} right now can cover tomorrow morning target. Log in."),
    ("Final push in {area}, final earnings",
     "How your night ends in {area} decides how your week looks. Go online now."),
    ("{area} night drivers lead {city}",
     "They go where others will not in {area}. The reward is better ratings and real naira."),
    ("{area} night rides pay a premium",
     "Late-night trips from {area} pay more. Fewer competitors means a bigger share for you."),
    ("{city} never fully sleeps",
     "Neither should your earning opportunity in {area}. Log in now for the night surge."),
    ("Night in {area} means good pickups",
     "Many people need rides after 8 PM in {area}. Go online and find them tonight."),
    ("{area} after dark is premium territory",
     "Night riders from {area} are among the best-tipping passengers. Do not miss them."),
]

# ─────────────────────────────────────────────────────────────────────────────
# RIDER — 07:30 (morning)
# ─────────────────────────────────────────────────────────────────────────────
RIDER_0730: list[tuple[str, str]] = [
    ("Good morning from {area}",
     "Your NexRyde driver is near {area} right now. Book now and arrive on time without any stress."),
    ("Running late in {area}?",
     "Relax. A NexRyde driver is close by right now. One tap and you are on your way."),
    ("Drivers are live near {area}",
     "No waiting, no price haggling on {route}. Book now and start moving in under 2 minutes."),
    ("Beat {route} traffic this morning",
     "Book NexRyde from {area} and skip the morning congestion. Arrive on time and calm."),
    ("Skip the {area} morning rush",
     "Book now and we will route you around {route}. Start your morning the smart way."),
    ("Trusted ride from {area}",
     "Verified driver. Fixed fare. No surprises. Start your {area} day the NexRyde way."),
    ("{route} is filling up fast",
     "Book your NexRyde from {area} before the road gets impossible. A driver is near you now."),
    ("Safe, verified ride from {area}",
     "Every NexRyde driver is background-checked. Your morning in {area} is safe with us."),
    ("Your driver is near {area}",
     "Live tracking. Real-time arrival updates. Book now and see exactly when they reach you."),
    ("Start your {area} morning right",
     "NexRyde takes you out of {area} without the stress. Every single morning, without fail."),
    ("Most affordable ride in {area}",
     "Better than a taxi from {area}, faster than the bus. Book your NexRyde now."),
    ("Leave {area} on time every day",
     "NexRyde drivers know {city} roads very well. Do not leave your morning commute to chance."),
    ("Your ride is ready in 30 seconds",
     "Open NexRyde, set your destination, tap book. Your driver from {area} is already on the way."),
    ("{city} is moving. Are you?",
     "Morning activity from {area} is underway. Book your NexRyde now and stay ahead of traffic."),
    ("Peace of mind from {area}",
     "Live tracking, SOS button, verified drivers. That is NexRyde every single morning."),
]

# ─────────────────────────────────────────────────────────────────────────────
# RIDER — 13:00 (afternoon)
# ─────────────────────────────────────────────────────────────────────────────
RIDER_1300: list[tuple[str, str]] = [
    ("Lunch break in {area}?",
     "Skip the parking stress near {area}. Book NexRyde and enjoy your full break."),
    ("Heading out from {area} now?",
     "Drivers available near {area} right now. Tap, book, and be there in minutes."),
    ("Quick ride from {area}",
     "Your NexRyde wallet is ready. Book from {area} — fast, safe, and affordable."),
    ("Quick errand from {area}?",
     "NexRyde gets you out of {area} and back without the hassle. Tap to book now."),
    ("Afternoon plans from {area} sorted?",
     "One tap from {area} and your driver is on the way. No overthinking needed."),
    ("Smart {city} riders book ahead",
     "Beat afternoon demand spikes from {area}. Book now before fares go up."),
    ("Afternoon shopping from {area}?",
     "No need to carry bags on a bus. Book NexRyde and ride from {area} in comfort."),
    ("Business meeting from {area}?",
     "Arrive fresh and on time without {route} stress. Book NexRyde and own the afternoon."),
    ("Too hot to walk in {area}?",
     "Stay cool. Book a NexRyde from {area} and let your driver handle the road."),
    ("Make the most of your lunch break",
     "Eat, relax, and still get back on time. NexRyde from {area} makes it easy."),
    ("Afternoon appointment from {area}?",
     "No need to stress about parking in {city}. Book NexRyde and arrive completely relaxed."),
    ("Somewhere to be after {area}?",
     "Your NexRyde driver is already nearby. Tap to book and get there without stress."),
    ("{area} riders are booking now",
     "NexRyde drivers are live near {area}. Book for yourself or share with a colleague."),
    ("Running {area} afternoon errands?",
     "Fast, comfortable, trackable. NexRyde is the smarter way to move around {city}."),
    ("Your {area} afternoon ride waits",
     "Book NexRyde right now and beat the afternoon traffic from {area}. Driver is near you."),
]

# ─────────────────────────────────────────────────────────────────────────────
# RIDER — 18:00 (evening)
# ─────────────────────────────────────────────────────────────────────────────
RIDER_1800: list[tuple[str, str]] = [
    ("Evening ride from {area}?",
     "Your NexRyde driver is nearby. Book now and get home safely without any stress."),
    ("{area} evening rush is here",
     "Beat the {route} traffic tonight. Book your NexRyde now and get moving before it gets worse."),
    ("Heading home from {area}?",
     "NexRyde drivers are available near {area} right now. One tap and you are on your way."),
    ("Evening plans from {area}?",
     "Wherever you are going tonight, book your NexRyde from {area} and relax in the car."),
    ("Skip {area} evening traffic",
     "Book NexRyde now and let your driver handle the evening rush on {route}."),
    ("Safe evening ride from {area}",
     "Live tracking. Verified drivers. Book NexRyde from {area} and arrive home safely tonight."),
    ("No more waiting in {area}",
     "NexRyde drivers are available now near {area}. Book in seconds. No price haggling."),
    ("End your {area} day right",
     "You worked hard all day. Let NexRyde handle your ride home from {area} tonight."),
    ("Book your {area} evening ride now",
     "Book during the evening hours and enjoy a smooth, affordable ride from {area} home."),
    ("Your {area} evening ride is ready",
     "Open NexRyde, set your destination, and your driver from {area} is on the way."),
    ("Get home safely from {area}",
     "Your safety matters. Book a verified NexRyde driver from {area} for your evening trip."),
    ("{area} to anywhere in {city}",
     "NexRyde connects you from {area} to every part of {city} quickly and safely."),
    ("Evening out from {area}?",
     "Book NexRyde for your evening plans in {area}. Your driver will be there in minutes."),
    ("Night out from {area}?",
     "Book your NexRyde before you leave {area} tonight. Your driver will be waiting."),
    ("Comfortable ride from {area}",
     "Air-conditioned, tracked, and verified. That is what every NexRyde evening ride from {area} offers."),
]

# ─────────────────────────────────────────────────────────────────────────────
# Registry
# ─────────────────────────────────────────────────────────────────────────────

_SLOT_MAP: dict[str, list[tuple[str, str]]] = {
    # driver
    "06:00": DRIVER_06,
    "12:00": DRIVER_12,
    "17:00": DRIVER_17,
    "20:00": DRIVER_20,
    # rider
    "07:30": RIDER_0730,
    "13:00": RIDER_1300,
    "18:00": RIDER_1800,
}


def get_message(
    area_info: AreaInfo,
    role: str,
    slot_key: str,
    rotation_idx: int,
) -> dict[str, str]:
    """
    Return a filled {"title": ..., "body": ...} dict for the given slot/rotation.

    Falls back to a safe generic message if the slot key is unknown.
    """
    pool = _SLOT_MAP.get(slot_key, DRIVER_06 if role == "driver" else RIDER_0730)
    title_tpl, body_tpl = pool[rotation_idx % len(pool)]

    # AreaInfo exposes `key_routes` (a list); pick the first road for {route}.
    # Using a hard attribute (.route) here previously crashed every {route} variant,
    # so only the no-{route} messages ever delivered.
    routes = getattr(area_info, "key_routes", None) or []
    route = routes[0] if routes else "the road"

    def fill(t: str) -> str:
        return (
            t.replace("{area}",  area_info.area)
             .replace("{city}",  area_info.city)
             .replace("{route}", route)
        )

    return {"title": fill(title_tpl), "body": fill(body_tpl)}
