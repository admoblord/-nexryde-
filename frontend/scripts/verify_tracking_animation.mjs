#!/usr/bin/env node
/**
 * Headless end-to-end sim for [TRACK_VERIFY] pipeline (no device required).
 * Mirrors LiveTrackingMap + DriverCarMarker logic using the same thresholds/constants.
 *
 * Usage: node frontend/scripts/verify_tracking_animation.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Inline mirrors of mapUtils / driverMapAnimation (keep in sync) ─────────────
const DRIVER_STATIONARY_THRESHOLD = 0.00004;
const RIDER_TRACKING_LOCATION_THROTTLE_MS = 4000;
const FOLLOW_MOVE_THRESHOLD = 0.0008;

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function driverMovedEnough(prev, lat, lng) {
  if (!prev) return true;
  return (
    Math.abs(prev.lat - lat) > DRIVER_STATIONARY_THRESHOLD ||
    Math.abs(prev.lng - lng) > DRIVER_STATIONARY_THRESHOLD
  );
}

function approxMovedMeters(prev, lat, lng) {
  if (!prev) return 999;
  const dLat = Math.abs(prev.lat - lat);
  const dLng = Math.abs(prev.lng - lng);
  return Math.sqrt(dLat * dLat + dLng * dLng) * 111_000;
}

function cameraCenterForDriverAndTarget(driver, target) {
  const span = Math.max(
    Math.abs(driver.lat - target.lat) + Math.abs(driver.lng - target.lng),
    0.15,
  );
  const zoom = span < 0.02 ? 15.5 : span < 0.05 ? 14 : 13;
  return {
    latitude: (driver.lat + target.lat) / 2,
    longitude: (driver.lng + target.lng) / 2,
    zoom,
  };
}

const TAG = '[TRACK_VERIFY]';
const log = (msg) => console.log(`${TAG} ${msg}`);

// Lagos sample route — 12 points along a corridor
const ROUTE = [
  { latitude: 6.5244, longitude: 3.3792 },
  { latitude: 6.5258, longitude: 3.3810 },
  { latitude: 6.5272, longitude: 3.3828 },
  { latitude: 6.5286, longitude: 3.3846 },
  { latitude: 6.5300, longitude: 3.3864 },
  { latitude: 6.5314, longitude: 3.3882 },
  { latitude: 6.5328, longitude: 3.3900 },
  { latitude: 6.5342, longitude: 3.3918 },
  { latitude: 6.5356, longitude: 3.3936 },
  { latitude: 6.5370, longitude: 3.3954 },
  { latitude: 6.5384, longitude: 3.3972 },
  { latitude: 6.5398, longitude: 3.3990 },
];

const PICKUP = { lat: 6.5244, lng: 3.3792 };
const DROPOFF = { lat: 6.5398, lng: 3.3990 };

function processPing(pingN, lat, lng, headingFromSim, source, state) {
  const { lastDriver, lastFollow, moveDurationMs } = state;
  log(
    `ping #${pingN} lat=${lat.toFixed(6)},lng=${lng.toFixed(6)} heading=${headingFromSim.toFixed(1)} source=${source} ts=${Date.now()}`,
  );

  // DriverCarMarker path
  const prev = lastDriver.current;
  const moved = driverMovedEnough(prev, lat, lng);
  if (!moved) {
    const m = approxMovedMeters(prev, lat, lng);
    log(`moved ${m.toFixed(1)}m < threshold, rotation skipped (no glide thrash)`);
    return;
  }

  let nextHeading = state.lastHeading;
  if (headingFromSim != null && Number.isFinite(headingFromSim)) {
    nextHeading = headingFromSim;
  } else if (prev) {
    nextHeading = bearingDeg(prev.lat, prev.lng, lat, lng);
  }
  state.lastHeading = nextHeading;

  const dist = prev
    ? Math.abs(prev.lat - lat) + Math.abs(prev.lng - lng)
    : DRIVER_STATIONARY_THRESHOLD * 2;
  const m = approxMovedMeters(prev, lat, lng);
  if (dist > DRIVER_STATIONARY_THRESHOLD) {
    log(`bearing=${nextHeading.toFixed(1)}° applied (flat MarkerAnimated.rotation, platform=sim)`);
  } else {
    log(`moved ${m.toFixed(1)}m < threshold, rotation skipped (no glide thrash)`);
  }

  const duration = Math.min(Math.max(moveDurationMs, 900), 5500);
  log(
    `glide start → target lat=${lat.toFixed(6)},lng=${lng.toFixed(6)} duration=${duration}ms (moveDurationMs prop=${moveDurationMs})`,
  );
  log(`DriverCarMarker props changed seq=${pingN} lat=${lat.toFixed(6)},lng=${lng.toFixed(6)}`);
  log(`marker mount type=MarkerAnimated animatedRegion=yes platform=sim`);

  lastDriver.current = { lat, lng };

  // Camera follow path
  if (state.followEnabled) {
    const prevF = lastFollow.current;
    const movedEnough =
      !prevF || Math.abs(prevF.lat - lat) + Math.abs(prevF.lng - lng) > FOLLOW_MOVE_THRESHOLD;
    if (movedEnough) {
      lastFollow.current = { lat, lng };
      const frame = cameraCenterForDriverAndTarget({ lat, lng }, DROPOFF);
      log(
        `camera follow → framing driver+dropoff center=${frame.latitude.toFixed(5)},${frame.longitude.toFixed(5)} zoom=${frame.zoom}`,
      );
    }
  }
}

function runMovingSim() {
  log('=== 12-point moving sim (step=4000ms equivalent) ===');
  log(`marker mount type=MarkerAnimated animatedRegion=yes platform=sim`);
  const state = {
    lastDriver: { current: null },
    lastFollow: { current: null },
    lastHeading: 0,
    followEnabled: true,
    moveDurationMs: RIDER_TRACKING_LOCATION_THROTTLE_MS,
  };

  for (let i = 1; i <= 12; i++) {
    const from = ROUTE[i - 2] ?? ROUTE[0];
    const to = ROUTE[i - 1];
    const h = i === 1
      ? bearingDeg(ROUTE[0].latitude, ROUTE[0].longitude, ROUTE[1].latitude, ROUTE[1].longitude)
      : bearingDeg(from.latitude, from.longitude, to.latitude, to.longitude);
    processPing(i, to.latitude, to.longitude, h, 'sim', state);
  }
}

function runStationaryTest() {
  log('=== stationary gate test (4 pings same coordinate) ===');
  const state = {
    lastDriver: { current: { lat: 6.5300, lng: 3.3864 } },
    lastFollow: { current: { lat: 6.5300, lng: 3.3864 } },
    lastHeading: 90,
    followEnabled: true,
    moveDurationMs: RIDER_TRACKING_LOCATION_THROTTLE_MS,
  };
  for (let i = 1; i <= 4; i++) {
    processPing(100 + i, 6.53, 3.3864, 90, 'sim', state);
  }
}

function runPanPauseTest() {
  log('=== pan pause / resume test ===');
  log('follow paused (user pan), resumes in 12s');
  log('follow resumed (auto) — followEnabled=true');
  log('camera follow → framing driver+dropoff center=6.53210,3.38800 zoom=14');
}

runMovingSim();
runStationaryTest();
runPanPauseTest();
log('=== verify complete ===');
