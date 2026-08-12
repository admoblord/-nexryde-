#!/usr/bin/env node
/**
 * Static smoke: Uber/Bolt rider-map parity wiring.
 * Run: node scripts/verify_rider_map_parity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const failures = [];

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

function ok(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail = '') {
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function mustInclude(rel, patterns, label) {
  const txt = read(rel);
  if (!txt) {
    fail(label, `missing file ${rel}`);
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

function mustNotInclude(rel, patterns, label) {
  const txt = read(rel);
  if (!txt) {
    fail(label, `missing file ${rel}`);
    return;
  }
  for (const p of patterns) {
    const re = p instanceof RegExp ? p : new RegExp(p);
    if (re.test(txt)) {
      fail(label, `${rel} still has ${re}`);
      return;
    }
  }
  ok(label);
}

console.log('verify_rider_map_parity: files');
const required = [
  'src/components/map/RiderHomeMapStrip.tsx',
  'src/components/map/RiderActiveTripMapPeek.tsx',
  'src/components/map/RiderBookingMapNative.tsx',
  'src/components/map/RiderDemandHeatOverlay.tsx',
  'src/hooks/useRiderDemandZones.ts',
  'src/components/tracking/live/LiveTrackingMap.native.tsx',
  'src/components/tracking/map/MapMarkers.tsx',
  'src/constants/nexrydeMap3d.ts',
  'src/store/appStore.ts',
  'src/components/tracking/types.ts',
  'src/components/tracking/hooks/useRiderTrackingSession.ts',
  'app/rider/book.tsx',
];
for (const f of required) {
  if (fs.existsSync(path.join(ROOT, f))) ok(`exists ${f}`);
  else fail(`missing ${f}`);
}

console.log('\nverify_rider_map_parity: 1) interactive home map');
mustInclude(
  'src/components/map/RiderHomeMapStrip.tsx',
  [/scrollEnabled(?!\s*=\s*\{false\})/, /getAvailableDrivers/, /MapAnimatedTaxiMarker/, /MAP_3D\.homePitch/, /getNexrydeMapStyleAuto/],
  'home: pan/zoom + nearby taxis + pitched sun-auto',
);
{
  const home = read('src/components/map/RiderHomeMapStrip.tsx') || '';
  // Prefer JSX usage (`<MapView\n ...>`), not TypeScript generics like `useRef<MapView>`.
  const mapOpen = home.match(/<MapView[\s\n]([\s\S]*?)(?:\/>|>)/);
  const mapAttrs = mapOpen?.[1] || '';
  if (!mapAttrs) fail('home: not locked lite strip', 'MapView JSX not found');
  else if (/liteMode/.test(mapAttrs)) fail('home: not locked lite strip', 'liteMode on MapView');
  else if (/pointerEvents\s*=\s*["']none["']/.test(mapAttrs)) {
    fail('home: not locked lite strip', 'MapView pointerEvents=none');
  } else if (!/\bscrollEnabled\b/.test(mapAttrs) || /scrollEnabled=\{false\}/.test(mapAttrs)) {
    fail('home: not locked lite strip', 'scroll not enabled on MapView');
  } else ok('home: MapView interactive (overlays may use pointerEvents=none)');
}

console.log('\nverify_rider_map_parity: 2) sun-auto cartography');
mustInclude('src/constants/nexrydeMap3d.ts', [/getNexrydeMapStyleAuto/, /isLocalMapNight/, /homePitch/, /peekPitch/], '3d tokens + sun helpers');
mustInclude(
  'src/components/map/RiderBookingMapNative.tsx',
  [/getBoltRiderCustomMapStyle|getBoltRiderGoogleMapId|BOLT_RIDER_MAP_STYLE|boltMapStyle/],
  'booking uses Bolt light cloud/JSON style',
);
mustInclude(
  'src/components/tracking/live/LiveTrackingMap.native.tsx',
  [/getPerfectTrackingMapStyle\(\)/],
  'live tracking sun-auto (no forced theme)',
);
mustInclude(
  'src/components/tracking/trackingMapTokens.ts',
  [/getNexrydeMapStyleAuto/],
  'tracking tokens delegate to sun-auto',
);
mustInclude(
  'src/components/map/RiderActiveTripMapPeek.tsx',
  [/getNexrydeMapStyleAuto/, /MAP_3D\.peekPitch/],
  'peek sun-auto + pitch',
);

console.log('\nverify_rider_map_parity: 3) surge/demand overlay');
mustInclude(
  'src/components/map/RiderBookingMapNative.tsx',
  [/RiderDemandHeatOverlay/, /useRiderDemandZones/, /demandRatio/, /surgeMultiplier/],
  'booking demand overlay wired',
);
mustInclude(
  'src/hooks/useRiderDemandZones.ts',
  [/driver\/heatmap/, /synthesizeFromFare/, /demandRatio/],
  'demand zones hook: API + fare fallback',
);
mustInclude(
  'app/rider/book.tsx',
  [/demandRatio=\{/, /surgeMultiplier=\{/, /showDemandOverlay/],
  'book.tsx passes fare demand into map',
);

console.log('\nverify_rider_map_parity: 4) multi-stop live tracking');
mustInclude('src/store/appStore.ts', [/stop_location\?:/], 'Trip.stop_location typed');
mustInclude('src/components/tracking/types.ts', [/stops\?:/], 'TrackingMapModel.stops');
mustInclude(
  'src/components/tracking/hooks/useRiderTrackingSession.ts',
  [/stopCoordsList/, /stops:\s*stopCoordsList/],
  'session maps stop_location → model.stops',
);
mustInclude(
  'src/components/tracking/live/LiveTrackingMap.native.tsx',
  [/StopMarker/, /tone="amber"/, /label="Stop"/],
  'live map stop pin + ETA puck',
);
mustInclude(
  'src/components/tracking/map/MapMarkers.tsx',
  [/export function StopMarker/],
  'StopMarker component exists',
);
mustInclude(
  'src/utils/tripCoords.ts',
  [/stop_location:/],
  'status merge preserves stop_location',
);
mustInclude(
  'src/components/map/RiderActiveTripMapPeek.tsx',
  [/stop_location/, /pinStop/],
  'home peek shows intermediate stop',
);

console.log('\nverify_rider_map_parity: 5) pitched language');
mustInclude('src/constants/nexrydeMap3d.ts', [/homePitch:\s*36/, /peekPitch:\s*34/, /riderPitch:\s*42/], 'pitch tokens set');
mustInclude(
  'src/components/map/RiderHomeMapStrip.tsx',
  [/showsBuildings/, /pitchEnabled/, /animateCamera/],
  'home pitched camera + buildings',
);
mustInclude(
  'src/components/map/RiderActiveTripMapPeek.tsx',
  [/showsBuildings/, /pitchEnabled/, /animateCamera/],
  'peek pitched camera + buildings',
);

console.log('\nverify_rider_map_parity: composition');
mustInclude(
  'app/(rider-tabs)/rider-home.tsx',
  [/RiderHomeMapStrip/],
  'rider-home mounts home map',
);
mustInclude(
  'src/components/rider/RiderActiveTripHomePanel.tsx',
  [/RiderActiveTripMapPeek/],
  'active trip panel mounts peek',
);

console.log('\nverify_rider_map_parity: summary');
if (failures.length) {
  console.error(`\nFAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nPASS — rider map parity wiring looks complete.');
process.exit(0);
