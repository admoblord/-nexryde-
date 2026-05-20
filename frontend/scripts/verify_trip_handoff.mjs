#!/usr/bin/env node
/**
 * Static checks for rider book → tracking handoff (coords + route files).
 * Run: node scripts/verify_trip_handoff.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function parseTripCoords(value) {
  if (!value || typeof value !== 'object') return null;
  const latRaw = value.lat ?? value.latitude;
  const lngRaw = value.lng ?? value.longitude;
  const lat =
    typeof latRaw === 'number'
      ? latRaw
      : typeof latRaw === 'string'
        ? Number(latRaw.trim())
        : NaN;
  const lng =
    typeof lngRaw === 'number'
      ? lngRaw
      : typeof lngRaw === 'string'
        ? Number(lngRaw.trim())
        : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
  return { lat, lng };
}

function tripLocationRecord(apiLoc, fallback, address) {
  const coords = parseTripCoords(apiLoc) ?? parseTripCoords(fallback);
  return {
    lat: coords?.lat ?? 0,
    lng: coords?.lng ?? 0,
    address: address || '',
  };
}

let failed = 0;
let passed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    passed += 1;
  }
}

// Coord parser edge cases (known crash vectors)
assert(parseTripCoords({ lat: NaN, lng: 3.4 }) === null, 'NaN lat rejected');
assert(parseTripCoords({ lat: 0, lng: 0 }) === null, 'null island rejected');
assert(parseTripCoords({ lat: '6.52', lng: '3.37' })?.lat === 6.52, 'string coords accepted');
const lagos = parseTripCoords({ lat: 6.5244, lng: 3.3792 });
assert(lagos?.lat === 6.5244, 'valid Lagos coords');

// Tracking map gate: both ends must be valid (not 0,0 store artifact)
const stored = tripLocationRecord(null, null, 'addr');
const pickup = parseTripCoords(stored);
const dropoff = parseTripCoords({ lat: 6.6, lng: 3.4 });
assert(pickup === null && dropoff !== null, '0,0 store does not open map alone');
assert(Boolean(pickup && dropoff) === false, 'map mount guard safe when pickup invalid');

// Route files exist
const trackingRoute = path.join(ROOT, 'app', 'rider', 'tracking.tsx');
assert(fs.existsSync(trackingRoute), 'tracking screen exists');

const trackingSrc = fs.readFileSync(trackingRoute, 'utf8');
assert(trackingSrc.includes('parseTripCoords'), 'tracking uses parseTripCoords');
assert(trackingSrc.includes('parseTrackingPing'), 'tracking uses parseTrackingPing for live sync');
assert(trackingSrc.includes('openShareTrip'), 'tracking uses openShareTrip helper');
assert(trackingSrc.includes('setTripDriverCache'), 'tracking caches driver for share fallback');
assert(trackingSrc.includes("from '@/src/components/RideMap'"), 'tracking imports RideMap resolver');
assert(!trackingSrc.includes("require('@/src/components/RideMap.native')"), 'no dynamic RideMap require');
assert(
  !trackingSrc.match(/router\.push\(['"]\/rider\/share-trip['"]/),
  'tracking does not bare-push share-trip without tripId',
);

const shareRoute = path.join(ROOT, 'app', 'rider', 'share-trip.tsx');
const shareSrc = fs.readFileSync(shareRoute, 'utf8');
assert(shareSrc.includes('getTripDriverCache'), 'share-trip reads trip driver cache');
assert(shareSrc.includes('useTripShareData'), 'share-trip uses share data hook');
assert(shareSrc.includes('TripProfileAvatar'), 'share-trip uses TripProfileAvatar');

const liveSync = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'riderTripLiveSync.ts'), 'utf8');
assert(liveSync.includes('distance_remaining'), 'parseTrackingPing handles distance_remaining alias');

const ongoingDock = fs.readFileSync(
  path.join(ROOT, 'src', 'components', 'driver', 'DriverOngoingTripDock.tsx'),
  'utf8',
);
assert(ongoingDock.includes('fixedFooter'), 'ongoing dock pins Complete Trip footer');
assert(ongoingDock.includes('COMPLETE TRIP'), 'ongoing dock has complete CTA label');
assert(ongoingDock.includes('tripProgressPercent'), 'ongoing dock shows journey progress');

const driverMap = fs.readFileSync(path.join(ROOT, 'src', 'components', 'DriverLiveMapView.tsx'), 'utf8');
assert(driverMap.includes('ongoingTripProgressPercent'), 'driver map computes trip progress');
assert(driverMap.includes('ongoingCollapsedComplete'), 'collapsed ongoing keeps complete button');

const ongoingDisplay = fs.readFileSync(
  path.join(ROOT, 'src', 'utils', 'driverOngoingDisplay.ts'),
  'utf8',
);
assert(ongoingDisplay.includes('driverTripProgressPercent'), 'driver ongoing display helpers exist');

const rideMapNative = fs.readFileSync(path.join(ROOT, 'src', 'components', 'RideMap.native.tsx'), 'utf8');
assert(rideMapNative.includes('if (!pickupLL)'), 'RideMap guards missing pickup');
assert(
  rideMapNative.includes('!suppressDriverOverlay') && rideMapNative.includes('assignmentSheet'),
  'assignment sheet respects suppressDriverOverlay',
);
assert(rideMapNative.includes('if (!MarkerAnimated)'), 'Marker.Animated fallback');

const bookSrc = fs.readFileSync(path.join(ROOT, 'app', 'rider', 'book.tsx'), 'utf8');
assert(bookSrc.includes('tripLocationRecord'), 'book uses tripLocationRecord');
assert(bookSrc.includes('navigateToLiveTracking'), 'book navigates to tracking on accept');

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log(`OK: trip handoff static checks passed (${passed} assertions).`);
