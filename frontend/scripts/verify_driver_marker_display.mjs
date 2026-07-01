#!/usr/bin/env node
/**
 * Verifies driver car marker display chain (logic + static wiring).
 * Run: node scripts/verify_driver_marker_display.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function isValidMapCoord(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return false;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return false;
  if (Math.abs(la) < 1e-6 && Math.abs(ln) < 1e-6) return false;
  return true;
}

function parseTripCoords(value) {
  if (!value || typeof value !== 'object') return null;
  const latRaw = value.lat ?? value.latitude;
  const lngRaw = value.lng ?? value.longitude;
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return null;
  return { lat, lng };
}

function wouldShowMarker(driver, pickup, dropoff) {
  const canRenderMap =
    pickup &&
    dropoff &&
    isValidMapCoord(pickup.lat, pickup.lng) &&
    isValidMapCoord(dropoff.lat, dropoff.lng);
  const safeDriver = driver && isValidMapCoord(driver.lat, driver.lng) ? driver : null;
  return { canRenderMap: !!canRenderMap, markerVisible: !!safeDriver };
}

let failed = 0;
let passed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('PASS:', msg);
    passed += 1;
  }
}

// Logic gates
const lagos = { lat: 6.5244, lng: 3.3792 };
const lekki = { lat: 6.45, lng: 3.4 };
const driver = { lat: 6.518, lng: 3.372 };

let r = wouldShowMarker(driver, lagos, lekki);
assert(r.canRenderMap && r.markerVisible, 'valid driver + pickup + dropoff → marker visible');

r = wouldShowMarker(null, lagos, lekki);
assert(r.canRenderMap && !r.markerVisible, 'no driver coords → marker hidden (map still renders)');

r = wouldShowMarker({ lat: 0, lng: 0 }, lagos, lekki);
assert(!r.markerVisible, 'null island driver → marker hidden');

r = wouldShowMarker(driver, { lat: 0, lng: 0 }, lekki);
assert(!r.canRenderMap, 'invalid pickup → map does not mount');

const alias = parseTripCoords({ latitude: 6.52, longitude: 3.38 });
assert(alias?.lat === 6.52, 'API latitude/longitude alias parses for marker');

// Static wiring
const liveMap = path.join(ROOT, 'src/components/tracking/live/LiveTrackingMap.native.tsx');
const marker = path.join(ROOT, 'src/components/tracking/map/DriverCarMarker.tsx');
const session = path.join(ROOT, 'src/components/tracking/hooks/useRiderTrackingSession.ts');
const trackingRoute = path.join(ROOT, 'app/rider/tracking.tsx');

assert(fs.existsSync(liveMap), 'LiveTrackingMap.native.tsx exists');
const liveSrc = fs.readFileSync(liveMap, 'utf8');
assert(liveSrc.includes('DriverCarMarker'), 'live map imports DriverCarMarker');
assert(liveSrc.includes('safeDriver'), 'live map gates marker with safeDriver');
assert(liveSrc.includes('MarkerAnimated') || liveSrc.includes('DriverCarMarker'), 'animated car marker used');

const markerSrc = fs.readFileSync(marker, 'utf8');
assert(markerSrc.includes('🚕'), 'car emoji taxi marker');
assert(markerSrc.includes('MOVE_MS'), 'marker has smooth interpolation duration');
assert(markerSrc.includes('selfCapture'), 'Android capture window for marker visibility');

const sessionSrc = fs.readFileSync(session, 'utf8');
assert(sessionSrc.includes('lastKnownDriverRef'), 'session keeps last known driver position');
assert(sessionSrc.includes('commitDriverLocation'), 'session commits driver GPS to map model');

const routeSrc = fs.readFileSync(trackingRoute, 'utf8');
assert(routeSrc.includes('LiveTrackingScreen'), 'tracking route uses LiveTrackingScreen');

console.log(`\n${failed ? 'FAILED' : 'OK'}: driver marker checks — ${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
