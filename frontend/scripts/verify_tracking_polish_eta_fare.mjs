#!/usr/bin/env node
/**
 * Live tracking polish + ETA accuracy + instant fare contract.
 *
 * Run: node frontend/scripts/verify_tracking_polish_eta_fare.mjs
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

const sheet = read('src/components/tracking/live/LiveDriverSheet.tsx');
const book = read('app/rider/book.tsx');
const scheduling = read('src/utils/fareEstimateScheduling.ts');
const tracking = readRepo('backend/services/trip_tracking_service.py');

console.log('\n[1] The driver appears exactly once');

const peek = sheet.slice(sheet.indexOf('styles.collapsed}'), sheet.indexOf('Expanded content'));
const expanded = sheet.slice(sheet.indexOf('Expanded content'));

check('peek row shows the photo', peek.includes('TripProfileAvatar'));
check('peek row shows the name', peek.includes('collapsedName'));
check('expanded card no longer repeats the photo', !expanded.includes('TripProfileAvatar'));
check('expanded card no longer repeats the name', !expanded.includes('expandedName'));
check(
  'only one avatar renders in the whole sheet',
  (sheet.match(/<TripProfileAvatar/g) || []).length === 1,
  `found ${(sheet.match(/<TripProfileAvatar/g) || []).length}`,
);
check('credentials stay available when expanded', expanded.includes('Verified') && expanded.includes('ratingRow'));
check('favourite control survived the move', expanded.includes('onToggleFavorite'));

console.log('\n[2] ETA is road-aware, not straight-line');

check('a winding factor converts chord to road distance', tracking.includes('ROAD_WINDING_FACTOR'));
check('the fallback reports road distance to the rider', /"distance_km": round\(road_km, 3\)/.test(tracking));
check(
  'arrival is still judged on true proximity, not the estimate',
  /if straight_km <= ARRIVED_DISTANCE_KM/.test(tracking),
);
check('zone traffic slows the fallback ETA too', /traffic_factor/.test(tracking) && /get_zone_traffic_factor/.test(tracking));
check(
  'a stopped driver cannot blow up the ETA',
  tracking.includes('resolve_tracking_speed_kmh') && tracking.includes('LIVE_SPEED_WEIGHT'),
);
check('the route polyline still wins when present', /local_tracking_from_polyline/.test(tracking));

console.log('\n[3] Fare prices land as soon as a destination is chosen');

check('scheduling helper exists', scheduling.includes('fareEstimateDelayMs'));
check('book screen uses it instead of a flat timer', book.includes('fareEstimateDelayMs') && !/setTimeout\(run, 400\)/.test(book));
check('a new destination is not debounced', scheduling.includes('FARE_ESTIMATE_INSTANT_MS = 0'));
check('the first price of the session is never delayed', /isFirstEstimate\) return FARE_ESTIMATE_INSTANT_MS/.test(scheduling));
check('coordinate churn is still absorbed', scheduling.includes('FARE_ESTIMATE_SETTLE_MS'));
check('prices are still fetched for all vehicles in one round trip', /await Promise\.all\(\s*availableVehicles\.map/.test(book));

console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);
