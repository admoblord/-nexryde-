/**
 * NEXRYDE Scheduled Offer and Engagement Notifications
 *
 * Delivers daily local notifications to every logged-in driver and rider.
 * Messages are plain Nigeria English — no emojis — so they display correctly
 * on every Android and iOS device, including older hardware.
 *
 * Location-aware: resolves the device's last known GPS to a Nigerian
 * neighbourhood at schedule time, then inserts the real area name and road
 * into the message (e.g. "Lekki Phase 1", "Allen Avenue", "Maitama").
 *
 * 15 rotating message variants per daily slot × 7 slots = 105 unique copies.
 * Rotation index = day-of-year mod 15, so copy never repeats within 2 weeks.
 *
 * Driver daily slots : 06:00  12:00  17:00  20:00  (WAT)
 * Rider daily slots  : 07:30  13:00  18:00         (WAT)
 *
 * Android: all scheduled notifications use the "offers" channel
 *          (importance HIGH — appears in notification bar, no bypass).
 * iOS    : uses default presentation (badge + alert + sound).
 */

import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const STORAGE_KEY = '@nexryde_sched_ids_v5';

// ─── Nigeria area resolver ─────────────────────────────────────────────────────

interface AreaInfo {
  area: string;
  city: string;
  route: string;
  citySlug: string;
}

type Zone = [number, number, number, number, string, string, string];
const ZONES: Zone[] = [
  [6.417, 6.450, 3.395, 3.440, 'Lagos', 'Victoria Island',       'Ozumba Mbadiwe'],
  [6.437, 6.460, 3.420, 3.465, 'Lagos', 'Ikoyi',                 'Bourdillon Road'],
  [6.440, 6.475, 3.455, 3.500, 'Lagos', 'Lekki Phase 1',         'Lekki-Epe Expressway'],
  [6.445, 6.482, 3.500, 3.630, 'Lagos', 'Ajah',                  'Lekki-Epe Expressway'],
  [6.444, 6.478, 3.378, 3.415, 'Lagos', 'Lagos Island',          'Carter Bridge'],
  [6.580, 6.625, 3.325, 3.365, 'Lagos', 'Ikeja',                 'Allen Avenue'],
  [6.558, 6.590, 3.348, 3.382, 'Lagos', 'Maryland',              'Ikorodu Road'],
  [6.540, 6.568, 3.318, 3.358, 'Lagos', 'Oshodi',                'Oshodi-Apapa Expressway'],
  [6.490, 6.525, 3.330, 3.378, 'Lagos', 'Surulere',              'Bode Thomas Street'],
  [6.500, 6.535, 3.368, 3.400, 'Lagos', 'Yaba',                  'Herbert Macaulay Way'],
  [6.455, 6.490, 3.250, 3.290, 'Lagos', 'Festac',                'Festac Link Road'],
  [6.440, 6.476, 3.350, 3.390, 'Lagos', 'Apapa',                 'Creek Road'],
  [6.610, 6.650, 3.290, 3.330, 'Lagos', 'Agege',                 'Agege Motor Road'],
  [6.580, 6.640, 3.490, 3.540, 'Lagos', 'Ikorodu',               'Ikorodu Road'],
  [6.507, 6.548, 3.335, 3.372, 'Lagos', 'Mushin',                'Agege Motor Road'],
  [9.078, 9.122, 7.448, 7.498, 'Abuja', 'Maitama',               'Adetokunbo Ademola Street'],
  [9.065, 9.098, 7.452, 7.492, 'Abuja', 'Wuse 2',                'Aminu Kano Crescent'],
  [9.050, 9.080, 7.477, 7.515, 'Abuja', 'Garki',                 'Shehu Shagari Way'],
  [9.038, 9.080, 7.518, 7.562, 'Abuja', 'Asokoro',               'Asokoro Crescent'],
  [9.118, 9.162, 7.375, 7.428, 'Abuja', 'Gwarinpa',              '3rd Avenue Gwarinpa'],
  [9.138, 9.182, 7.318, 7.365, 'Abuja', 'Kubwa',                 'Kubwa Expressway'],
  [9.078, 9.115, 7.416, 7.455, 'Abuja', 'Jabi',                  'Airport Road'],
  [8.988, 9.032, 7.430, 7.472, 'Abuja', 'Lugbe',                 'Airport Road'],
  [4.775, 4.815, 7.008, 7.045, 'Port Harcourt', 'GRA Port Harcourt', 'Peter Odili Road'],
  [4.815, 4.855, 6.985, 7.022, 'Port Harcourt', 'Rumuokoro',     'East-West Road'],
  [4.752, 4.788, 6.992, 7.028, 'Port Harcourt', 'Diobu',         'Aba Road'],
  [4.808, 4.842, 7.012, 7.048, 'Port Harcourt', 'Trans Amadi',   'Trans Amadi Road'],
  [7.385, 7.440, 3.880, 3.945, 'Ibadan', 'Bodija',               'Iwo Road'],
  [7.360, 7.400, 3.900, 3.965, 'Ibadan', 'Dugbe',                'Lebanon Street'],
  [11.990, 12.060, 8.510, 8.580, 'Kano', 'Sabon Gari',           'Bompai Road'],
  [6.435, 6.490, 7.490, 7.570, 'Enugu', 'Independence Layout',   'Okpara Avenue'],
  [6.320, 6.380, 5.590, 5.660, 'Benin City', 'Ring Road',        'Airport Road Benin'],
  [5.500, 5.545, 5.720, 5.780, 'Warri', 'Effurun',               'NPA Road'],
  [4.940, 4.975, 8.315, 8.360, 'Calabar', 'Marian',              'Marian Road'],
];

function resolveArea(lat: number, lng: number): AreaInfo {
  for (const [lo, hi, lo2, hi2, city, area, route] of ZONES) {
    if (lat >= lo && lat <= hi && lng >= lo2 && lng <= hi2)
      return { area, city, route, citySlug: city.toLowerCase().replace(/ /g, '_') };
  }
  let best: AreaInfo | null = null;
  let bestDist = Infinity;
  for (const [lo, hi, lo2, hi2, city, area, route] of ZONES) {
    const d = Math.hypot(lat - (lo + hi) / 2, lng - (lo2 + hi2) / 2);
    if (d < bestDist) { bestDist = d; best = { area, city, route, citySlug: city.toLowerCase().replace(/ /g, '_') }; }
  }
  if (best && bestDist < 0.27) return best;
  return { area: 'your area', city: 'Nigeria', route: 'the road', citySlug: 'nigeria' };
}

async function getAreaInfo(): Promise<AreaInfo> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('no permission');
    const loc = await Location.getLastKnownPositionAsync();
    if (loc) return resolveArea(loc.coords.latitude, loc.coords.longitude);
    const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest });
    return resolveArea(fresh.coords.latitude, fresh.coords.longitude);
  } catch {
    return { area: 'your area', city: 'Nigeria', route: 'the road', citySlug: 'nigeria' };
  }
}

// ─── Message templates — plain Nigeria English, no emojis ─────────────────────

type Msg = [string, string]; // [title, body]

const DRIVER_06: Msg[] = [
  ['{area} is waking up',             '{area} riders are already booking to beat the {route} traffic. Go online now before another driver takes them.'],
  ['Morning surge in {area}',         'High demand, few drivers online. {area} bookings are live right now. Open NEXRYDE and take them.'],
  ['{area} morning rush starts now',   'Workers heading out of {area} need rides before the road locks up. Be their driver this morning.'],
  ['Early risers in {area} are booking','Beat your competition. Go online now and grab the morning trips before 8 AM.'],
  ['Your first trip today is waiting', 'A rider in {area} is looking for a driver right now. Log in and pick up the fare.'],
  ['{area} morning rides mean good money','Early drivers in {area} earn more. Clock in before the rush gets to its peak.'],
  ['{city} is moving already',         '{area} riders are heading out early. Short, quick rides are stacking up. Go online now.'],
  ['{area} riders are booking now',    'Morning demand in {area} is at its highest point for the day. Do not sit this one out.'],
  ['{area} needs drivers right now',   'Morning bookings are building up in {area}. Go online and be the driver they find first.'],
  ['Hit your daily target from {area}','Morning rides in {area} are short, fast, and come back to back. Ten trips before noon is possible.'],
  ['{route} will be gridlocked by 7:30','Beat the jam. {area} riders are booking now before the road becomes impossible. Go online.'],
  ['Riders in {area} prefer NEXRYDE',  'They are searching the app right now. Go online and take the trip before someone else does.'],
  ['{area} surge window is open now',  'Demand just went up in {area}. Go online now and make the most of it while it lasts.'],
  ['Smart {city} drivers start early', 'They know {area} morning bookings are where the real money is. Start before they take all the trips.'],
  ['Good morning from {area}',         'The top earners in {city} are already live. Do not start your day behind. Go online now.'],
];

const DRIVER_12: Msg[] = [
  ['{area} lunch rush means quick cash','Riders leaving {area} for lunch right now. Two short trips can be done in one hour.'],
  ['Bookings just jumped in {area}',   'It is midday. {area} demand has spiked. Go online and make the most of the lunch surge.'],
  ['Still short of your target today', 'The midday window in {area} will not last long. Go online now and close the gap.'],
  ['Lunch peak in {area} is right now','Lunchtime is one of the biggest booking hours in {area}. Do not miss this window.'],
  ['One hour in {area} pays well',     'Just one hour online during the {area} lunch rush will surprise you with how much you earn.'],
  ['Top {city} drivers do not skip noon','They are live in {area} right now. Be one of them and earn during the midday window.'],
  ['{area} workers are on lunch break','Lunch demand is peaking in {area}. Go online before all the bookings are taken.'],
  ['Midday rides in {area} add up fast','Short trips, frequent bookings, solid fares. The {area} lunch hour is worth your time.'],
  ['Even 45 minutes in {area} counts', 'The lunch rush in {area} is short but very profitable. A quick session now pays off.'],
  ['{area} trips are short and close',  'Lunch rides from {area} are usually nearby. Stack them fast and earn more in less time.'],
  ['Consistency builds income in {city}','Drivers who go online at noon in {area} earn more per week. Build that habit today.'],
  ['Office workers in {area} are booking','Meetings, errands, lunch runs — {area} is busy right now. Be their driver this afternoon.'],
  ['You are close to your daily milestone','A few more rides will get you there. {area} midday is the right time to push.'],
  ['Unlock your {area} afternoon earnings','Go online now. Afternoon demand in {area} always follows the lunch hour.'],
  ['Your earnings dashboard is waiting', 'Check your progress, then go earn more in {area}. Lunchtime demand is active right now.'],
];

const DRIVER_17: Msg[] = [
  ['5 PM in {area} — the rush is here',  'The highest-earning hour in {area} has arrived. Go online right now or miss it completely.'],
  ['Evening surge is live in {area}',    'Every worker leaving {area} needs a ride home. Your next booking is waiting. Go online.'],
  ['{area} at 5 PM is the money slot',   'More rides, higher fares, less competition. The {area} evening window is yours to take.'],
  ['{route} is gridlocked — riders need you','Traffic on {route} is very bad. Riders in {area} are done with taxis. Be the better option.'],
  ['Do not miss {area} evening earnings','Top earners in {city} logged in at 5 PM. Where are you in {area} right now?'],
  ['{area} evening rides, good fares',   'Evening rush in {area} means back-to-back trips and stacked earnings. Go live now.'],
  ['{area} offices just closed',         'Everyone is leaving their workplace in {area}. Be the driver they find first.'],
  ['Your {area} evening target is close','You are close to your daily goal. The {area} rush will help you close it. Go online.'],
  ['Golden earning hour in {area}',      '5 to 7 PM in {area} is when drivers earn the most per hour. Do not waste it offline.'],
  ['Last big {area} earning window today','After 8 PM things slow down in {area}. Right now it is full speed. Go online now.'],
  ['{area} offices closing, rides opening','Evening commuters in {area} are searching for drivers. Be the one they book tonight.'],
  ['Every minute offline costs you money','Every minute offline in {area} right now is money left on the table. Go live.'],
  ['{city} peaks in the evening',        'Rush hour in {area} is your time to perform. Go online and make the most of tonight.'],
  ['Be the top driver in {area} tonight','High ratings. High demand. High fares. Everything is lined up in {area} right now.'],
  ['{area} evening drivers earn the most','Top weekly earners in {city} never skip the 5 PM rush in {area}. Be in that group.'],
];

const DRIVER_20: Msg[] = [
  ['Less competition in {area} tonight','Most drivers have gone offline in {area}. Stay on and pick up the night premium fares.'],
  ['{area} night riders need you',       'Restaurants, events, and late gatherings in {area}. Night riders tend to rate better. Log in.'],
  ['One more push in {area} tonight',   'Not yet at your daily goal? {area} night demand is your last window to close it.'],
  ['{area} night crowd is booking now', 'Demand is going up again in {area}. End your day with a strong finish. Go online.'],
  ['{area} night rides rate higher',    'Relaxed passengers, less {route} pressure, better tips. {area} nights are real money.'],
  ['Finish your day strong in {area}',  'Every good earnings day ends with a solid night window. {area} still has active demand.'],
  ['{area} night shift, night pay',     'Fewer cars on {route}, more ride requests per driver. Log in and earn the night premium.'],
  ['Late-night {area} crowd is active', 'Food pickups, social rides, late returns home. {area} night demand never really stops.'],
  ['{area} still needs drivers tonight','One hour online in {area} right now can cover tomorrow morning target. Log in.'],
  ['Final push in {area}, final earnings','How your night ends in {area} decides how your week looks. Go online now.'],
  ['{area} night drivers lead {city}',  'They go where others will not in {area}. The reward is better ratings and real naira.'],
  ['{area} night rides pay a premium',  'Late-night trips from {area} pay more per trip. Fewer competitors mean a bigger share.'],
  ['{city} never fully sleeps',         'Neither should your earning opportunity in {area}. Log in now for the night surge.'],
  ['Night in {area} means good pickups','You would be surprised how many people need rides after 8 PM in {area}. Go find out.'],
  ['{area} after dark is premium territory','Night riders from {area} are among the best tipping passengers. Do not miss them.'],
];

const RIDER_0730: Msg[] = [
  ['Good morning from {area}',         'Your NEXRYDE driver is near {area} right now. Book now and arrive on time without any stress.'],
  ['Running late in {area}?',          'Relax. A NEXRYDE driver is close by right now. One tap and you are on your way.'],
  ['Drivers are live near {area}',     'No waiting, no price haggling on {route}. Book now and start moving in under 2 minutes.'],
  ['Beat {route} traffic this morning','Book NEXRYDE from {area} and skip the morning congestion. Arrive on time and calm.'],
  ['Skip the {area} morning rush',     'Book now and we will route you around {route}. Start your morning the smart way.'],
  ['Trusted ride from {area}',         'Verified driver. Fixed fare. No surprises. Start your {area} day the NEXRYDE way.'],
  ['{route} is filling up fast',       'Book your NEXRYDE from {area} before the road gets impossible. A driver is near you now.'],
  ['Safe, verified ride from {area}',  'Every NEXRYDE driver is background-checked. Your morning in {area} is safe with us.'],
  ['Your driver is near {area}',       'Live tracking. Real-time arrival updates. Book now and see exactly when they reach you.'],
  ['Start your {area} morning right',  'NEXRYDE takes you out of {area} without the stress. Every single morning, without fail.'],
  ['Most affordable ride in {area}',   'Better than a taxi, faster than the bus. Book your NEXRYDE from {area} now.'],
  ['Leave {area} on time every day',   'NEXRYDE drivers know {city} roads very well. Do not leave your morning to chance.'],
  ['Your ride is 30 seconds away',     'Open NEXRYDE, set your destination, tap book. Your driver from {area} is already coming.'],
  ['{city} is moving. Are you?',        'Morning activity from {area} is underway. Book your NEXRYDE now and stay ahead.'],
  ['Peace of mind from {area}',        'Live tracking, SOS button, verified drivers. That is NEXRYDE every single morning.'],
];

const RIDER_1300: Msg[] = [
  ['Lunch break in {area}?',           'Skip the parking stress near {area}. Book NEXRYDE and enjoy your full break.'],
  ['Heading out from {area} now?',     'Drivers available near {area} right now. Tap, book, and be there in minutes.'],
  ['Quick ride from {area}',           'Your NEXRYDE wallet is ready. Book from {area} — fast, safe, and affordable.'],
  ['Quick errand from {area}?',        'NEXRYDE gets you out of {area} and back without the hassle. Tap to book.'],
  ['Afternoon plans from {area} sorted?','One tap from {area} and your driver is on the way. No overthinking needed.'],
  ['Smart {city} riders book ahead',   'Beat afternoon demand spikes from {area}. Book now before fares go up.'],
  ['Afternoon shopping from {area}?',  'No need to carry bags on a bus. Book NEXRYDE and ride from {area} in comfort.'],
  ['Business meeting from {area}?',    'Arrive fresh and on time without {route} stress. Book NEXRYDE and own the afternoon.'],
  ['Too hot to walk in {area}?',       'Stay cool. Book a NEXRYDE from {area} and let your driver handle the road.'],
  ['Make the most of your lunch break','Eat, relax, and still get back on time. NEXRYDE from {area} makes it easy.'],
  ['Afternoon appointment from {area}?','Do not stress about parking in {city}. Book NEXRYDE and arrive completely relaxed.'],
  ['Somewhere to be after {area}?',    'Your NEXRYDE driver is already nearby. Tap to book and get there without stress.'],
  ['{area} riders are booking now',    'NEXRYDE drivers are live near {area}. Book for yourself or share with a colleague.'],
  ['Running {area} afternoon errands?','Fast, comfortable, trackable. NEXRYDE is the smarter way to move around {city}.'],
  ['Your {area} afternoon ride waits', 'Book NEXRYDE right now and beat the afternoon traffic from {area}. Driver is near you.'],
];

const RIDER_1800: Msg[] = [
  ['Evening ride from {area}?',        'Your NEXRYDE driver is nearby. Book now and get home safely without any stress.'],
  ['{area} evening rush is here',      'Beat the {route} traffic tonight. Book your NEXRYDE now and get moving first.'],
  ['Heading home from {area}?',        'NEXRYDE drivers are available near {area} right now. One tap and you are on your way.'],
  ['Evening plans from {area}?',       'Wherever you are going tonight, book your NEXRYDE from {area} and relax in the car.'],
  ['Skip {area} evening traffic',      'Book NEXRYDE now and let your driver handle the evening rush on {route}.'],
  ['Safe evening ride from {area}',    'Live tracking. Verified drivers. Book NEXRYDE from {area} and arrive home safely tonight.'],
  ['No more waiting in {area}',        'NEXRYDE drivers are available now near {area}. Book in seconds. No haggling on price.'],
  ['End your {area} day right',        'You worked hard all day. Let NEXRYDE handle your ride home from {area} tonight.'],
  ['Evening discount for {area} riders','Book now during the evening hours and enjoy a smooth, affordable ride from {area}.'],
  ['Your {area} evening ride is ready','Open NEXRYDE, set your destination, and your driver from {area} is on the way.'],
  ['Get home safely from {area}',      'Your safety matters. Book a verified NEXRYDE driver from {area} for your evening trip.'],
  ['{area} to anywhere in {city}',     'NEXRYDE connects you from {area} to every part of {city} quickly and safely.'],
  ['Weekend evening in {area}?',       'Book NEXRYDE for your evening out in {area}. Your driver will be there in minutes.'],
  ['Night out from {area}?',           'Book your NEXRYDE before you leave {area} tonight. Your driver will be waiting.'],
  ['Comfortable ride from {area}',     'Air-conditioned, tracked, verified. That is what every NEXRYDE evening ride from {area} offers.'],
];

// ─── Slot registry ─────────────────────────────────────────────────────────────

type SlotKey = 'D06' | 'D12' | 'D17' | 'D20' | 'R0730' | 'R1300' | 'R1800';

interface Slot {
  key: SlotKey;
  role: 'driver' | 'rider';
  hour: number;
  minute: number;
  messages: Msg[];
}

const SLOTS: Slot[] = [
  { key: 'D06',   role: 'driver', hour: 6,  minute: 0,  messages: DRIVER_06   },
  { key: 'D12',   role: 'driver', hour: 12, minute: 0,  messages: DRIVER_12   },
  { key: 'D17',   role: 'driver', hour: 17, minute: 0,  messages: DRIVER_17   },
  { key: 'D20',   role: 'driver', hour: 20, minute: 0,  messages: DRIVER_20   },
  { key: 'R0730', role: 'rider',  hour: 7,  minute: 30, messages: RIDER_0730  },
  { key: 'R1300', role: 'rider',  hour: 13, minute: 0,  messages: RIDER_1300  },
  { key: 'R1800', role: 'rider',  hour: 18, minute: 0,  messages: RIDER_1800  },
];

function fillTemplate(template: string, area: AreaInfo): string {
  return template
    .replace(/\{area\}/g, area.area)
    .replace(/\{city\}/g, area.city)
    .replace(/\{route\}/g, area.route);
}

function rotationIdx(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / 86_400_000);
  return dayOfYear % 15;
}

// ─── Android channel setup ─────────────────────────────────────────────────────

async function ensureOffersChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('offers', {
    name: 'NEXRYDE Offers and Tips',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 150, 300],
    lightColor: '#00D47E',
    enableLights: true,
    enableVibrate: true,
    showBadge: true,
  });
}

// ─── Scheduling logic ─────────────────────────────────────────────────────────

async function cancelPreviousNotifications(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
  } catch {}
}

async function scheduleForRole(role: 'driver' | 'rider', area: AreaInfo): Promise<string[]> {
  const idx   = rotationIdx();
  const slots = SLOTS.filter((s) => s.role === role);
  const ids: string[] = [];

  for (const slot of slots) {
    const [title, body] = slot.messages[idx % slot.messages.length];
    const content: Notifications.NotificationContentInput = {
      title: fillTemplate(title, area),
      body:  fillTemplate(body, area),
      sound: true,
      badge: 1,
      data: { type: 'engagement', role, slot: slot.key },
      ...(Platform.OS === 'android' ? { categoryIdentifier: 'offers' } : {}),
    };
    const trigger: Notifications.DailyTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour:   slot.hour,
      minute: slot.minute,
    };
    try {
      const id = await Notifications.scheduleNotificationAsync({ content, trigger });
      ids.push(id);
    } catch (err) {
      // Non-fatal: one slot failing should not block others
      console.warn(`[NEXRYDE] Failed to schedule slot ${slot.key}:`, err);
    }
  }

  return ids;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Engagement/offer pushes are now delivered by the SERVER
 * (backend/engagement_push_service.py), which re-resolves the driver/rider
 * location and rotates a different message variant on every send.
 *
 * The old on-device DAILY scheduling baked one variant + one area at login and
 * repeated that exact text forever (frozen "Ajah" copy + duplicate of the server
 * push). This function now ONLY tears down any previously-scheduled local copies
 * so existing installs self-heal on the next login / session restore.
 */
export async function scheduleOfferNotificationsForRole(_role: 'driver' | 'rider'): Promise<void> {
  try {
    await cancelPreviousNotifications();
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[NEXRYDE] scheduleOfferNotificationsForRole cleanup error:', err);
  }
}

/**
 * Cancel all scheduled offer notifications (call on logout).
 */
export async function cancelOfferNotifications(): Promise<void> {
  try {
    await cancelPreviousNotifications();
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export async function scheduleDriverOfferNotifications(): Promise<void> {
  return scheduleOfferNotificationsForRole('driver');
}

export async function scheduleRiderOfferNotifications(): Promise<void> {
  return scheduleOfferNotificationsForRole('rider');
}
