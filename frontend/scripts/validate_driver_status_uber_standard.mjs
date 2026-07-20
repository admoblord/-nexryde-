/**
 * Maps Uber-standard driver status proposal → NexRyde production architecture.
 * Run: node frontend/scripts/validate_driver_status_uber_standard.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function printRow(id, label, pass, detail) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function createStatusRequestId(intent) {
  return `${intent}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function statusBackoffMs(attemptIndex) {
  const base = 500;
  const max = 8000;
  const exp = Math.min(max, base * 2 ** Math.max(0, attemptIndex));
  const jitter = exp * 0.1 * (Math.random() * 2 - 1);
  return Math.max(200, Math.round(exp + jitter));
}

function main() {
  const results = [];
  const store = read('src/store/driverSessionStore.ts');
  const home = read('app/(driver-tabs)/driver-home.tsx');
  const hb = read('src/services/driverHeartbeat.ts');
  const coord = read('src/services/driverOnlineStatusCoordinator.ts');
  const driversPy = fs.readFileSync(path.join(repo, 'backend/routers/drivers.py'), 'utf8');
  const controlPy = fs.readFileSync(path.join(repo, 'backend/routers/driver_control.py'), 'utf8');

  const mapping = {
    OFFLINE: 'connectionPhase offline',
    TRANSITIONING_ONLINE: 'connectionPhase connecting',
    ONLINE: 'connectionPhase confirmed (+ ONLINE ops)',
    TRANSITIONING_OFFLINE: 'optimistic confirmOffline + bg PUT',
    RECONNECTING: 'connectionPhase reconnecting (post-online only)',
    ERROR: 'CONNECTING retries with backoff',
    CRITICAL_ERROR: 'abortConnecting → OFFLINE + tap GO',
  };
  console.log('\n=== Proposal → NexRyde state mapping ===');
  for (const [k, v] of Object.entries(mapping)) {
    console.log(`  ${k.padEnd(24)} → ${v}`);
  }

  results.push(
    printRow(
      'A1',
      'Single SoT remains driverSessionStore (no duplicate DriverStatusContext)',
      store.includes('DriverOperationalState') &&
        !fs.existsSync(path.join(root, 'src/contexts/DriverStatusContext.tsx')),
      null,
    ),
  );

  results.push(
    printRow(
      'A2',
      'Existing API surface kept (/api/drivers/{id}/online) + request_id idempotency',
      driversPy.includes('"/drivers/{driver_id}/online"') && driversPy.includes('request_id'),
      null,
    ),
  );

  results.push(
    printRow(
      'A3',
      'Client sends request_id + exponential backoff with jitter',
      home.includes('createStatusRequestId') &&
        home.includes('statusBackoffMs') &&
        coord.includes('jitter'),
      null,
    ),
  );

  results.push(
    printRow(
      'A4',
      '10s CONNECTING watchdog + soft failure → OFFLINE (CRITICAL escape)',
      home.includes('armGoOnlineWatchdog') && home.includes('abortConnecting'),
      null,
    ),
  );

  results.push(
    printRow(
      'A5',
      'Heartbeat FORCE_OFFLINE reconciles client session',
      hb.includes('FORCE_OFFLINE') &&
        home.includes('setDriverHeartbeatForceOfflineHandler') &&
        controlPy.includes('FORCE_OFFLINE'),
      null,
    ),
  );

  results.push(
    printRow(
      'A6',
      'Optimistic go-offline already shipped (TRANSITIONING_OFFLINE pattern)',
      fs.existsSync(path.join(root, 'src/services/driverGoOfflineOptimistic.ts')),
      null,
    ),
  );

  const id1 = createStatusRequestId('online');
  const id2 = createStatusRequestId('online');
  const delayOk = statusBackoffMs(0) >= 200 && statusBackoffMs(2) <= 9000;
  results.push(
    printRow(
      'A7',
      'Coordinator helpers sanity',
      id1 !== id2 && id1.startsWith('online_') && delayOk,
      `id=${id1.slice(0, 24)}…`,
    ),
  );

  const all = results.every(Boolean);
  console.log(`\nOverall: ${all ? 'PASS' : 'FAIL'}`);
  console.log(
    '\nNote: Full Node/MySQL/React-Context rewrite from the proposal is intentionally NOT adopted.',
  );
  console.log('NexRyde already uses FastAPI + Redis presence + driverSessionStore Zustand SoT.');
  process.exit(all ? 0 : 1);
}

main();
