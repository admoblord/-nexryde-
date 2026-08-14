#!/usr/bin/env node
/**
 * Contract: rider maps use the live raster Cloud Map IDs, never the
 * retired VECTOR IDs that blank Android/iOS.
 *
 * Run: node scripts/verify_bolt_raster_map_id.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPO = path.join(ROOT, '..');
const failures = [];

const RASTER_ANDROID = '8c2cb1bb7947cd4399ec19b0';
const RASTER_IOS = '8c2cb1bb7947cd4382430923';
const VECTOR_ANDROID = '8c2cb1bb7947cd439e2af444';
const VECTOR_IOS = '8c2cb1bb7947cd43c98f73a8';
const STYLE_ID = 'e8c03fd7c78c554bdeb325a0';

function read(rel, base = ROOT) {
  const p = path.join(base, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function mustInclude(rel, patterns, label, base = ROOT) {
  const txt = read(rel, base);
  if (!txt) {
    fail(label, `missing ${rel}`);
    return;
  }
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p);
    if (!re.test(txt)) {
      fail(label, `${rel} missing ${re}`);
      return;
    }
  }
  ok(label);
}

console.log('verify_bolt_raster_map_id: live IDs in source');
mustInclude(
  'src/constants/mapEngines.ts',
  [
    RASTER_ANDROID,
    RASTER_IOS,
    STYLE_ID,
    VECTOR_ANDROID,
    VECTOR_IOS,
    /RETIRED_VECTOR_MAP_IDS/,
    /sanitizeGoogleMapId/,
    /EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED',\s*true/,
  ],
  'mapEngines: raster defaults + vector reject + enabled',
);
mustInclude(
  'app.config.js',
  [RASTER_ANDROID, RASTER_IOS, /EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED/],
  'app.config.js defaults to raster IDs',
);
mustInclude(
  '.env.example',
  [RASTER_ANDROID, RASTER_IOS, /EXPO_PUBLIC_GOOGLE_MAP_ID_ENABLED=true/],
  '.env.example uses raster IDs',
);
mustInclude(
  'docs/BOLT_MAP_CLOUD_STYLE.md',
  [RASTER_ANDROID, RASTER_IOS, /RASTER/, /Retired/],
  'docs list raster as live and vector as retired',
);
{
  const create = read('scripts/create_bolt_cloud_map_style.sh') || '';
  if (create.includes('RASTER') && create.includes('mapType') && create.includes('RASTER for Maps SDK')) {
    ok('create script provisions RASTER Map IDs');
  } else {
    fail('create script provisions RASTER Map IDs');
  }
}

const create = read('scripts/create_bolt_cloud_map_style.sh') || '';
if (/mapType":"VECTOR"/.test(create)) {
  fail('create script must not mint VECTOR Map IDs');
} else ok('create script no longer mints VECTOR');

const example = read('.env.example') || '';
if (example.includes(VECTOR_ANDROID) || example.includes(VECTOR_IOS)) {
  fail('.env.example still ships retired VECTOR IDs as live');
} else ok('.env.example does not ship VECTOR IDs as live');

console.log('\nverify_bolt_raster_map_id: MapView wiring');
for (const rel of [
  'src/components/map/RiderBookingMapNative.tsx',
  'src/components/tracking/live/LiveTrackingMap.native.tsx',
  'src/components/DriverLiveMapView.tsx',
  'src/components/driver/DriverUberStyleOfflineHome.tsx',
]) {
  mustInclude(rel, [/googleMapId=\{googleMapId/, /getBoltRiderGoogleMapId/], `${rel} passes cloud Map ID`);
}

console.log('\nverify_bolt_raster_map_id: summary');
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS — raster Cloud Map IDs are the live mobile IDs.');
process.exit(0);
