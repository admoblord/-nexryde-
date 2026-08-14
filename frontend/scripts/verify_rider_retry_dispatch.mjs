#!/usr/bin/env node
/**
 * Contract guard: "No driver available right now" must actually search again.
 *
 * Run: node frontend/scripts/verify_rider_retry_dispatch.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readRepo = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const screen = read('src/components/tracking/live/LiveTrackingScreen.tsx');
const finding = read('src/components/finding/FindingDriverScreenV2.tsx');
const api = read('src/services/api.ts');
const trips = readRepo('backend/routers/trips.py');

console.log('\n[1] Try Again re-dispatches on the server');

check('client has a retry-dispatch call', api.includes('retryTripDispatch') && api.includes('/retry-dispatch'));
check(
  'Try Again calls it instead of only resetting the clock',
  /noDriversTimedOut\s*\?\s*\(\)\s*=>\s*void runRetryDispatch\(\)/.test(screen),
);
check(
  'the search clock resets only after the server answers',
  /const res = await retryTripDispatch\([\s\S]{0,240}?findingStartRef\.current = Date\.now\(\)/.test(screen),
);
check(
  'the elapsed timer re-reads the anchor so a reset takes effect',
  /const anchor = findingStartRef\.current;\s*if \(anchor == null\) return;/.test(screen),
);
check('double taps are blocked while a retry is in flight', screen.includes('retryBusy'));
check('a failed retry tells the rider', /messageFromAxiosError\(e, 'Could not search again/.test(screen));

console.log('\n[2] Raising the offer keeps the trip');

check(
  'raising no longer cancels the trip and reroutes to booking',
  !/onCancelRide\('Updating my bid'\)/.test(screen),
);
check(
  'raise sends a higher fare through retry-dispatch',
  /runRetryDispatch\(bump\(500\)\)/.test(screen) && /runRetryDispatch\(bump\(1000\)\)/.test(screen),
);
check(
  'the no-driver sheet offers a Raise offer button',
  finding.includes('onRaiseOffer') && finding.includes('Raise offer'),
);
check('the raise button is wired from the screen', /onRaiseOffer=\{matchedBeat \|\| connLost \? undefined : handleUpdateBid\}/.test(screen));

console.log('\n[3] Server endpoint is safe');

check('endpoint exists', trips.includes('/trips/{trip_id}/retry-dispatch'));
check('only the trip owner can retry', /if str\(trip\.get\("rider_id"\) or ""\) != str\(rider_id\):[\s\S]{0,120}?403/.test(trips));
check(
  'only a searching trip can be re-dispatched',
  trips.includes('SEARCHING_TRIP_STATUSES') &&
    /if status not in SEARCHING_TRIP_STATUSES:/.test(trips),
);
check(
  'a trip that already has a driver is rejected',
  /if trip\.get\("driver_id"\):[\s\S]{0,140}?A driver is already on the way/.test(trips),
);
check('the offer can never be lowered', /Your new offer must be at least/.test(trips));
check('the offer is capped', trips.includes('MAX_RETRY_FARE_MULTIPLIER') && /That offer is too high/.test(trips));
check('re-dispatch is rate limited', /check_rate_limit\(request, f"retry_dispatch:\{trip_id\}"\)/.test(trips));
check(
  'a raised fare re-offers even to drivers who declined',
  /if not fare_raised:[\s\S]{0,420}?declined/.test(trips),
);
check('stale offers are superseded before re-broadcast', trips.includes('"status": "superseded"'));
check('re-dispatch reuses the normal dispatch path', /offers = await _create_trip_offers\(trip, blocked_drivers\)/.test(trips));
check('the retry is logged for support', trips.includes('trip_redispatch_requested'));

console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);
