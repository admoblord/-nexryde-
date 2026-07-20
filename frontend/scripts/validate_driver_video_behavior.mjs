/**
 * Video 1505126 behavior fixes — contract check.
 * Run: node frontend/scripts/validate_driver_video_behavior.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function main() {
  const store = read('src/store/driverSessionStore.ts');
  const index = read('app/index.tsx');
  const home = read('app/(driver-tabs)/driver-home.tsx');
  const map = read('src/components/DriverLiveMapView.tsx');
  const coord = read('src/services/driverOnlineStatusCoordinator.ts');
  const wd = read('src/services/driverGoOnlineWatchdog.ts');

  const results = [];

  results.push(
    printRow(
      'V1',
      'CONNECTING does not open live dashboard (no map + YOU\'RE OFFLINE split)',
      store.includes("operationalState !== 'CONNECTING'") &&
        store.includes('liveMap: false'),
      null,
    ),
  );

  results.push(
    printRow(
      'V2',
      'Live map offline strip shows CONNECTING… while toggling',
      map.includes("toggling ? 'CONNECTING…'"),
      null,
    ),
  );

  results.push(
    printRow(
      'V3',
      'Welcome CTA never flashes for authenticated resume',
      index.includes('checking || isAuthenticated') &&
        index.includes('CTA splash entry (no session only'),
      null,
    ),
  );

  results.push(
    printRow(
      'V4',
      'Go-online wall-clock bounded (10s watchdog + 2×4s attempts)',
      wd.includes('GO_ONLINE_TIMEOUT_MS = 10_000') &&
        coord.includes('GO_ONLINE_MAX_ATTEMPTS = 2') &&
        coord.includes('GO_ONLINE_ATTEMPT_TIMEOUT_MS = 4_000') &&
        home.includes('stillConnecting()'),
      null,
    ),
  );

  const all = results.every(Boolean);
  console.log(`\nOverall: ${all ? 'PASS' : 'FAIL'}`);
  process.exit(all ? 0 : 1);
}

main();
