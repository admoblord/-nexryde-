#!/usr/bin/env node
/**
 * Acceptance: rider pickup uses smart GPS — instant cached paint, then
 * high-accuracy convergence to the rider's exact spot; manual pickup wins.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (m) => console.log('  ✓', m);
const fail = (m) => {
  fails.push(m);
  console.log('  ✗', m);
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const has = (rel, re, label) => {
  const t = read(rel);
  if (!(re instanceof RegExp ? re : new RegExp(re)).test(t)) return fail(label);
  ok(label);
};
const missing = (rel, re, label) => {
  const t = read(rel);
  if ((re instanceof RegExp ? re : new RegExp(re)).test(t)) return fail(label);
  ok(label);
};

console.log('verify_smart_pickup_gps');

// Engine invariants
has(
  'src/services/smartPickupGps.ts',
  /getLastKnownPositionAsync/,
  'instant paint from last-known position',
);
has(
  'src/services/smartPickupGps.ts',
  /watchPositionAsync/,
  'streams live fixes instead of one-shot polling',
);
has(
  'src/services/smartPickupGps.ts',
  /BestForNavigation/,
  'live stream runs at best-for-navigation accuracy',
);
has(
  'src/services/smartPickupGps.ts',
  /targetAccuracyM\s*=\s*15/,
  'converges to exact-spot grade (<=15m) by default',
);
has(
  'src/services/smartPickupGps.ts',
  /timeoutMs\s*=\s*12000/,
  'finalizes best fix within 12s (never spins forever)',
);
has(
  'src/services/smartPickupGps.ts',
  /isImprovement/,
  'only an improving fix may replace the current one',
);
has(
  'src/services/smartPickupGps.ts',
  /gps_timeout_no_fix/,
  'timeout with zero fixes reports an error to the caller',
);

// Booking screen wiring
has(
  'app/rider/book.tsx',
  /startSmartPickupGps\(/,
  'book screen uses the smart pickup GPS engine',
);
has(
  'app/rider/book.tsx',
  /startInstantPickupEngine\(/,
  'book screen uses Instant Pickup Detection Engine',
);
missing(
  'app/rider/book.tsx',
  /setPickup\(SAFE_PICKUP_FALLBACK\)|setPickup\(DETECTING_PICKUP\)/,
  'Route pickup field is never filled with Near your location or Detecting…',
);
has(
  'app/rider/book.tsx',
  /applyGpsPickupLabel/,
  'GPS reverse-geocode fills Route pickup while the rider has not typed',
);
has(
  'app/rider/book.tsx',
  /manualPickupRef/,
  'manual pickup selection is never overwritten by GPS',
);
has(
  'src/services/instantPickupEngine.ts',
  /PICKUP_MOVE_THRESHOLD_M\s*=\s*25/,
  'reverse geocode only re-runs on real movement (~25m)',
);
has(
  'src/services/instantPickupEngine.ts',
  /isRawLatLngLabel/,
  'engine rejects raw lat/lng display labels',
);
has(
  'app/rider/book.tsx',
  /cancelSmartGps\?\.\(\)/,
  'GPS stream is cancelled on unmount',
);
missing(
  'app/rider/book.tsx',
  /Location\.Accuracy\.Lowest/,
  'low-accuracy one-shot pickup detection removed',
);
missing(
  'app/rider/book.tsx',
  /toFixed\(4\),\s*`|\$\{fLat\.toFixed/,
  'book screen never falls back to raw lat/lng strings',
);

console.log(fails.length ? `\nFAIL (${fails.length})` : '\nPASS');
process.exit(fails.length ? 1 : 0);
