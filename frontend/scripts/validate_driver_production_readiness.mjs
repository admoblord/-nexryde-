/**
 * Full driver production-readiness contracts (connections / online / offline).
 * Run: node frontend/scripts/validate_driver_production_readiness.mjs
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
  const home = read('app/(driver-tabs)/driver-home.tsx');
  const store = read('src/store/driverSessionStore.ts');
  const hb = read('src/services/driverHeartbeat.ts');
  const sock = read('src/services/driverOffersSocket.ts');
  const logs = read('src/utils/driverOnlineFlowLog.ts');
  const native = read('src/services/driverNativeExperience.ts');
  const fgs = read(
    'android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt',
  );

  const results = [];

  results.push(
    printRow(
      'P1',
      'Heartbeat starts only on confirmed/reconnecting (not CONNECTING)',
      home.includes("connectionPhase === 'confirmed' || connectionPhase === 'reconnecting'") &&
        home.includes('Never heartbeat during CONNECTING') &&
        hb.includes('Must NOT run during CONNECTING'),
      null,
    ),
  );

  results.push(
    printRow(
      'P2',
      'FORCE_OFFLINE ignored while connecting / toggle in-flight / active trip',
      home.includes("phase === 'offline' || phase === 'connecting'") &&
        home.includes("reason: 'toggle_inflight'") &&
        home.includes("reason: 'active_trip'") &&
        home.includes("driverFlowLog('HEARTBEAT_FORCE_OFFLINE'"),
      null,
    ),
  );

  results.push(
    printRow(
      'P3',
      'Hydrate desync restore + trip-safe server-offline ignore',
      home.includes("action: 'hydrate_restore_online'") &&
        home.includes("action: 'ignore_server_offline_active_trip'") &&
        logs.includes("'GO_ONLINE_DESYNC'"),
      null,
    ),
  );

  results.push(
    printRow(
      'P4',
      'Go-offline blocked on active trip (toggle + notification)',
      home.includes("source: 'notification'") &&
        home.includes("source: 'toggle'") &&
        home.includes('GO_OFFLINE_BLOCKED_ACTIVE_TRIP') &&
        home.includes('Finish your trip before going offline.'),
      null,
    ),
  );

  results.push(
    printRow(
      'P5',
      'Socket only after confirmed; markReconnecting on drop',
      home.includes('Connect only after confirmed') &&
        home.includes('markReconnecting()') &&
        home.includes("connected && phase === 'reconnecting'") &&
        store.includes("if (connectionPhase === 'confirmed')"),
      null,
    ),
  );

  results.push(
    printRow(
      'P6',
      'Offline PUT uses request_id; put-ok-after-abort reconcile',
      home.includes("createStatusRequestId('offline')") &&
        home.includes('reconcileServerOfflineAfterAbort') &&
        home.includes("action: 'put_ok_after_abort'"),
      null,
    ),
  );

  results.push(
    printRow(
      'P7',
      'Native FGS parses FORCE_OFFLINE and emits to JS',
      fgs.includes('heartbeat_force_offline') &&
        fgs.includes('FORCE_OFFLINE') &&
        native.includes("'heartbeat_force_offline'") &&
        home.includes('invokeDriverHeartbeatForceOffline') &&
        hb.includes('invokeDriverHeartbeatForceOffline'),
      null,
    ),
  );

  results.push(
    printRow(
      'P8',
      'Location upload ops signal + socket close codes',
      home.includes("reportNetworkOpsSignal('location_upload'") &&
        sock.includes('code: ev.code') &&
        logs.includes("'HEARTBEAT_FORCE_OFFLINE'"),
      null,
    ),
  );

  results.push(
    printRow(
      'P9',
      'CONNECTING never opens live map dashboard',
      store.includes("operationalState !== 'CONNECTING'") &&
        home.includes('never during CONNECTING'),
      null,
    ),
  );

  results.push(
    printRow(
      'P10',
      'Go-online locks before await (rapid-tap safe)',
      home.includes('Lock BEFORE any await') && home.includes('goOnlineToggleGenRef'),
      null,
    ),
  );

  const all = results.every(Boolean);
  console.log(`\nOverall: ${all ? 'PASS' : 'FAIL'}`);
  process.exit(all ? 0 : 1);
}

main();
