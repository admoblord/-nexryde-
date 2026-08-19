#!/usr/bin/env node
/** Static contract: Bolt-style finishing-trip offers + longer ring timer. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const FRONTEND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(FRONTEND, '..');
const fails = [];
const ok = (m) => console.log('  ✓', m);
const fail = (m) => {
  fails.push(m);
  console.log('  ✗', m);
};
const read = (r) => {
  const p = path.isAbsolute(r) ? r : path.join(ROOT, r);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
};
const has = (r, re, label) => {
  const t = read(r);
  if (!t) return fail(`missing ${r}`);
  if (!(re instanceof RegExp ? re : new RegExp(re)).test(t)) return fail(label);
  ok(label);
};

console.log('verify_finishing_trip_offers');

has(
  'frontend/src/constants/driverOffer.ts',
  /DRIVER_OFFER_COUNTDOWN_SECONDS = 40/,
  'JS offer countdown is 40s',
);
has(
  'frontend/src/constants/driverOffer.ts',
  /BACKEND_OFFER_TTL_SECONDS = 60/,
  'JS documents 60s backend TTL',
);
has(
  'frontend/android/app/src/main/java/com/nexryde/app/driver/RideAlertManager.kt',
  /OFFER_COUNTDOWN_SECONDS = 40/,
  'native overlay countdown is 40s',
);
has(
  'frontend/android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt',
  /30_000L/,
  'native offer replay stays under the 40s ring',
);
has(
  'backend/realtime_platform/config.py',
  /offer_ttl_sec: int = 60/,
  'realtime offer TTL default is 60s',
);
has(
  'backend/realtime_platform/config.py',
  /max_offers_per_trip: int = 40/,
  'max offers per trip is 40',
);
has(
  'backend/realtime_platform/dispatch_guardian.py',
  /OFFER_ESCALATE_SEC = 60/,
  'guardian escalate window is 60s',
);
has(
  'backend/routers/trips.py',
  /finishing_offer_state|queued_next_trip_id|_promote_or_release_driver_lock/,
  'eligibility/accept/complete wire finishing-trip lock',
);
has(
  'backend/routers/trips.py',
  /merge_driver_profiles/,
  'dispatch unions near+far coverage',
);
has(
  'backend/trip_ws_payload.py',
  /driver_finishing_prior_trip/,
  'rider WS payload includes finishing flag',
);
has(
  'frontend/src/components/driver/DriverMapOfferDock.tsx',
  /Next ride · after you drop off/,
  'driver offer card shows next-ride hint',
);
has(
  'frontend/src/components/finding/FindingDriverScreenV2.tsx',
  /finishing a trip nearby/,
  'finding screen tells rider the driver is finishing nearby',
);
has(
  'frontend/src/components/tracking/live/LiveTrackingScreen.tsx',
  /finishing a trip nearby/,
  'live accept banner uses finishing copy',
);
has(
  'frontend/src/components/tracking/live/LiveDriverSheet.tsx',
  /they'll join you shortly/,
  'driver sheet phase line explains the wait',
);

const offerTs = read('frontend/src/constants/driverOffer.ts') || '';
const countdown = Number((offerTs.match(/DRIVER_OFFER_COUNTDOWN_SECONDS = (\d+)/) || [])[1]);
const ttl = Number((offerTs.match(/BACKEND_OFFER_TTL_SECONDS = (\d+)/) || [])[1]);
if (Number.isFinite(countdown) && Number.isFinite(ttl) && countdown < ttl) {
  ok(`countdown ${countdown}s is shorter than TTL ${ttl}s`);
} else {
  fail('countdown must be shorter than backend TTL');
}

if (fails.length) {
  console.error(`\n${fails.length} check(s) failed`);
  process.exit(1);
}
console.log('\nverify_finishing_trip_offers: OK');
