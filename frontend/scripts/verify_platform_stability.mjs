#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'frontend');
const BACKEND = path.join(ROOT, 'backend');

const failures = [];
const passes = [];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function pass(msg) {
  passes.push(msg);
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

function expectIncludes(rel, needle, label) {
  const src = read(rel);
  if (src.includes(needle)) pass(label);
  else fail(`${label} missing in ${rel}`);
}

function expectNotIncludes(rel, needle, label) {
  const src = read(rel);
  if (!src.includes(needle)) pass(label);
  else fail(`${label} still present in ${rel}`);
}

function checkFrontendInvariants() {
  console.log('\n[1] Frontend connection + ride-state invariants');
  expectNotIncludes(
    'frontend/app/_layout.tsx',
    '<OfflineBanner',
    'Root layout does not mount connection strip/pill'
  );
  expectIncludes(
    'frontend/src/components/shared/OfflineBanner.tsx',
    'permanently removed',
    'OfflineBanner visual chrome is removed at source'
  );
  expectIncludes(
    'frontend/src/services/platformConnectionManager.ts',
    "FAILURES_TO_DEGRADED = 3",
    'Connection manager requires 3 all-signal failures'
  );
  expectIncludes(
    'frontend/src/services/driverHeartbeat.ts',
    '60 * 1000',
    'Driver heartbeat is 60 seconds'
  );
  expectIncludes(
    'frontend/src/store/appStore.ts',
    'shouldApplyTripUpdate',
    'Zustand trip writes ignore stale updates'
  );
  expectIncludes(
    'frontend/src/utils/rideState.ts',
    'ride_version',
    'Client ride version ordering helper exists'
  );

  for (const rel of [
    'frontend/app/(driver-tabs)/driver-home.tsx',
    'frontend/src/components/DriverLiveMapView.tsx',
    'frontend/app/rider/security-code.tsx',
  ]) {
    expectNotIncludes(rel, 'pickup_code_required !== false', `${rel} does not default pickup code to required`);
  }
  expectIncludes(
    'frontend/src/components/driver/DriverArrivedPickupDock.tsx',
    'pickupCodeRequired = false',
    'Arrived dock defaults pickup code off',
  );
}

function checkBackendInvariants() {
  console.log('\n[2] Backend authoritative state + presence invariants');
  expectIncludes('backend/ride_state.py', 'ride_state_inc_fields', 'Backend ride version helper exists');
  expectIncludes('backend/routers/trips.py', 'ride_state_inc_fields()', 'Trip transitions increment ride version');
  expectIncludes('backend/routers/trips.py', 'ride_event_log_data', 'Trip transition logs include old/new state data');
  expectIncludes('backend/driver_presence.py', 'PRESENCE_TTL_SEC = 180', 'Redis driver presence survives short network gaps');
  expectIncludes('backend/routers/driver_control.py', 'heartbeat_interval_sec', 'Heartbeat response publishes cadence');
  expectIncludes('backend/routers/driver_control.py', 'set_driver_online', 'Heartbeat restores Redis presence from Mongo truth');
  expectIncludes(
    'backend/trip_ws_payload.py',
    'pickup_code_required", False)',
    'Realtime payload defaults pickup code off',
  );
  expectIncludes(
    'backend/routers/users.py',
    'pickup_code_enabled", False)',
    'Preferences API defaults pickup code off',
  );
  expectIncludes(
    'backend/routers/trips.py',
    'pickup_code_enabled", False)',
    'Trip booking treats pickup code as opt-in',
  );
}

function checkPythonCompile() {
  console.log('\n[3] Backend compile');
  const res = spawnSync(
    'python3',
    ['-m', 'py_compile', 'ride_state.py', 'routers/trips.py', 'routers/driver_control.py', 'driver_presence.py'],
    { cwd: BACKEND, encoding: 'utf8' }
  );
  if (res.status === 0) pass('Changed backend files compile');
  else fail(res.stderr || res.stdout || 'Backend compile failed');
}

function main() {
  console.log('NexRyde Platform Stability Verification\n');
  checkFrontendInvariants();
  checkBackendInvariants();
  checkPythonCompile();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${passes.length}  Failed: ${failures.length}`);
  if (failures.length) {
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log('\nPlatform stability invariants verified.');
}

main();
