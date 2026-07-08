#!/usr/bin/env node
/**
 * Run verification scripts for today's driver/session/ringtone fixes.
 * Usage: node ./scripts/verify_today_fixes.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(__dirname, '..');
const BACKEND = path.resolve(FRONTEND, '..', 'backend');

const failures = [];
const passes = [];

function pass(msg) {
  passes.push(msg);
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
}

function runNodeScript(rel, label) {
  console.log(`\n▶ ${label}`);
  const res = spawnSync(process.execPath, [path.join(FRONTEND, rel)], {
    cwd: FRONTEND,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  if (res.status === 0) {
    pass(label);
    return true;
  }
  fail(`${label} (exit ${res.status ?? 'unknown'})`);
  return false;
}

function checkStaticArtifacts() {
  console.log('\n▶ Static checks (background offer alert wiring)');

  const required = [
    'src/services/driverOfferBackgroundAlert.ts',
    'src/hooks/useDriverOfferBackgroundAlert.ts',
    'src/constants/driverOfferSounds.ts',
    'src/hooks/useDriverOfferAlert.ts',
    'src/services/driverSessionKeeper.ts',
    'src/services/driverTripAccept.ts',
    'src/lib/sessionReadiness.ts',
    'src/components/driver/DriverOfferBidActions.tsx',
  ];

  for (const rel of required) {
    const full = path.join(FRONTEND, rel);
    if (!fs.existsSync(full)) {
      fail(`Missing ${rel}`);
    } else {
      pass(`${rel} exists`);
    }
  }

  const appJson = JSON.parse(fs.readFileSync(path.join(FRONTEND, 'app.json'), 'utf8'));
  const sounds = appJson?.expo?.plugins?.find((p) => Array.isArray(p) && p[0] === 'expo-notifications')?.[1]
    ?.sounds;
  if (!Array.isArray(sounds) || sounds.length < 4) {
    fail('app.json expo-notifications sounds array missing 4 driver ringtones');
  } else {
    pass(`app.json bundles ${sounds.length} push sounds`);
  }

  const bgModes = appJson?.expo?.ios?.infoPlist?.UIBackgroundModes ?? [];
  if (!bgModes.includes('audio')) {
    fail('iOS UIBackgroundModes missing audio');
  } else {
    pass('iOS audio background mode enabled');
  }

  const layout = fs.readFileSync(path.join(FRONTEND, 'app/_layout.tsx'), 'utf8');
  if (!layout.includes('useDriverOfferBackgroundAlert')) {
    fail('_layout.tsx missing useDriverOfferBackgroundAlert');
  } else {
    pass('_layout wires background offer alert hook');
  }

  const catalog = fs.readFileSync(path.join(BACKEND, 'notification_catalog.py'), 'utf8');
  if (!catalog.includes('"driver_offers"') || !catalog.includes('driver_offer_1.m4a')) {
    fail('notification_catalog.py missing driver_offers channel + sound');
  } else {
    pass('Backend ride_request uses driver_offers + custom sound');
  }

  const notifSvc = fs.readFileSync(path.join(BACKEND, 'notification_service.py'), 'utf8');
  if (!notifSvc.includes('ride_request') || !notifSvc.includes('payload["sound"]')) {
    fail('notification_service.py missing ride_request sound forwarding');
  } else {
    pass('Backend forwards custom push sound');
  }
}

function checkBackendSyntax() {
  console.log('\n▶ Backend Python syntax');
  const targets = [
    'notification_catalog.py',
    'notification_service.py',
    'routers/driver_control.py',
    'routers/trips.py',
  ];
  for (const rel of targets) {
    const full = path.join(BACKEND, rel);
    if (!fs.existsSync(full)) {
      fail(`Missing backend file ${rel}`);
      continue;
    }
    const res = spawnSync('python3', ['-m', 'py_compile', full], { encoding: 'utf8' });
    if (res.status === 0) {
      pass(`${rel} compiles`);
    } else {
      fail(`${rel} syntax error: ${res.stderr?.trim() || 'unknown'}`);
    }
  }
}

function main() {
  console.log('NexRyde — verify today\'s fixes\n');

  checkStaticArtifacts();
  checkBackendSyntax();

  runNodeScript('scripts/test_session_readiness.mjs', 'Session readiness unit tests');
  runNodeScript('scripts/test_session_refresh.mjs', 'Session refresh unit tests');
  runNodeScript('scripts/verify_driver_offer_ringtones.mjs', 'Driver offer ringtones');

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Passed: ${passes.length}  Failed: ${failures.length}`);
  if (failures.length) {
    console.error('\nFAILED:');
    failures.forEach((f) => console.error(`  • ${f}`));
    process.exit(1);
  }
  console.log('\nAll today\'s fix verifications passed.');
  console.log('Device smoke: go online → background app → trigger offer → hear NexRyde ringtone.');
}

main();
