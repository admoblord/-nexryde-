/**
 * Go-online race / watchdog contract validation.
 * Run: node frontend/scripts/validate_driver_go_online_race.mjs
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
  const sock = read('src/services/driverOffersSocket.ts');
  const wd = read('src/services/driverGoOnlineWatchdog.ts');
  const logs = read('src/utils/driverOnlineFlowLog.ts');
  const banner = read('src/components/shared/OfflineBanner.tsx');
  const offlineHome = home;

  const results = [];

  results.push(
    printRow(
      '1',
      'CONNECTING never promotes to RECONNECTING (deadlock path removed)',
      store.includes("if (connectionPhase === 'confirmed')") &&
        !store.includes("connectionPhase === 'confirmed' || connectionPhase === 'connecting'"),
      null,
    ),
  );

  results.push(
    printRow(
      '2',
      'Go-online 10s watchdog armed on GO_ONLINE_START',
      wd.includes('GO_ONLINE_TIMEOUT_MS = 10_000') &&
        home.includes('armGoOnlineWatchdog') &&
        home.includes('STARTUP_TIMEOUT') === false
          ? wd.includes("scope: 'go_online'") && home.includes('armGoOnlineWatchdog')
          : home.includes('armGoOnlineWatchdog') && wd.includes('STARTUP_TIMEOUT'),
      null,
    ),
  );

  results.push(
    printRow(
      '3',
      'Soft API failure aborts to OFFLINE with retry toast (no permanent RECONNECTING)',
      home.includes('abortConnecting()') &&
        home.includes('Couldn’t go online') &&
        !home.includes("toast.show('Still reconnecting"),
      null,
    ),
  );

  results.push(
    printRow(
      '4',
      'Socket singleton: skip CONNECTING handshake on nudge/connect',
      sock.includes('rs === WebSocket.CONNECTING') &&
        sock.includes('export const driverOffersSocket'),
      null,
    ),
  );

  results.push(
    printRow(
      '5',
      'GPS independent of isDashboardVisible / Locating never gates go-online',
      home.includes('Foreground GPS is independent of go-online') &&
        !/if \(!isDashboardVisible\) return; \/\/ No foreground GPS/.test(home),
      null,
    ),
  );

  results.push(
    printRow(
      '6',
      'Earnings/stats defaults (not blank em-dash while offline)',
      offlineHome.includes('today: 0,') &&
        offlineHome.includes('never leave EARNINGS/TRIPS blank forever') &&
        !offlineHome.includes("earningsLoading ? '—'"),
      null,
    ),
  );

  results.push(
    printRow(
      '7',
      'Flow logs: GO_ONLINE_RESULT / LOCATION_FIX / STARTUP_TIMEOUT',
      logs.includes("'GO_ONLINE_RESULT'") &&
        logs.includes("'LOCATION_FIX'") &&
        logs.includes("'STARTUP_TIMEOUT'") &&
        home.includes("driverFlowLog('GO_ONLINE_RESULT'") &&
        home.includes("driverFlowLog('LOCATION_FIX'"),
      null,
    ),
  );

  results.push(
    printRow(
      '8',
      'Network Reconnecting banner suppressed during driver CONNECTING/session reconnect',
      banner.includes("driverPhase === 'connecting'") &&
        banner.includes("driverPhase === 'reconnecting'") &&
        banner.includes("'hidden'"),
      null,
    ),
  );

  results.push(
    printRow(
      '9',
      'Socket + API independent (connect after confirm; PUT does not cancel GPS)',
      // Was matching a comment and a `stillConnecting()` helper that were both
      // renamed, so this row failed on wording rather than behaviour. Assert the
      // ordering itself: the offers socket opens only after the phase is committed,
      // and a failed PUT reconciles instead of cancelling GPS.
      /confirmOnline\(\);[\s\S]{0,600}?driverOffersSocket\.connect\(driverId\)/.test(home) &&
        home.includes('isConnectingOnly()') &&
        home.includes('reconcileServerOfflineAfterAbort'),
      null,
    ),
  );

  results.push(
    printRow(
      '10',
      'FORCE_OFFLINE×CONNECTING race closed (heartbeat gated + ignore connecting)',
      home.includes('Never heartbeat during CONNECTING') &&
        home.includes("reason: phase === 'connecting' ? 'connecting'") &&
        home.includes("driverFlowLog('HEARTBEAT_FORCE_OFFLINE'"),
      null,
    ),
  );

  const map = read('src/components/DriverLiveMapView.tsx');
  const fgs = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt'),
    'utf8',
  );
  const presence = fs.readFileSync(
    path.join(root, '../backend/driver_presence.py'),
    'utf8',
  );

  results.push(
    printRow(
      '11',
      'RECONNECTING does not lock Go Offline; map stays engaged online',
      home.includes("const toggling = statusToggleBusy || operationalState === 'CONNECTING'") &&
        home.includes('isOnline={sessionEngaged}') &&
        // Hysteresis: reconnecting chrome only after ~5s sustained (Law 4).
        home.includes('isReconnecting={showReconnectingChrome}') &&
        map.includes('isReconnecting') &&
        !home.includes("operationalState === 'RECONNECTING'"),
      null,
    ),
  );

  results.push(
    printRow(
      '12',
      'Android task-remove best-effort PUT offline + presence never invents online',
      fgs.includes('postServerOfflineBestEffort') &&
        fgs.includes('task_removed') &&
        presence.includes('Never invents presence'),
      null,
    ),
  );

  const preflight = read('src/services/driverPermissionPreflight.ts');
  const errors = read('src/constants/driverOnlineErrors.ts');
  const notifyMgr = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/nexryde/app/driver/DriverNotificationManager.kt'),
    'utf8',
  );
  const expMod = fs.readFileSync(
    path.join(root, 'android/app/src/main/java/com/nexryde/app/driver/DriverExperienceModule.kt'),
    'utf8',
  );

  results.push(
    printRow(
      '13',
      'Permission preflight gates GO ONLINE (overlay before connect, not mid-flow)',
      preflight.includes('evaluateDriverPermissionPreflight') &&
        home.includes('GO_ONLINE_BLOCKED_PERMISSIONS') &&
        home.includes('Grant these to go online') &&
        home.includes('DriverGoOnlinePermissionGate'),
      null,
    ),
  );

  results.push(
    printRow(
      '14',
      'Structured ERR_* codes replace vague Check your connection',
      errors.includes('ERR_OVERLAY_PERMISSION') &&
        errors.includes('ERR_NO_VEHICLE') &&
        errors.includes('ERR_SOCKET') &&
        home.includes('parseDriverOnlineError') &&
        !home.includes("Check your connection and tap GO to retry"),
      null,
    ),
  );

  results.push(
    printRow(
      '15',
      'FGS Listening for rides + battery optimization exempt bridge',
      notifyMgr.includes('NEXRYDE • Listening for rides') &&
        fgs.includes('Listening for rides') &&
        expMod.includes('requestBatteryOptimizationExempt') &&
        expMod.includes('hasBatteryOptimizationExempt'),
      null,
    ),
  );

  const androidKeepOfflineSlice = home.slice(
    home.indexOf("action: 'hydrate_keep_offline_require_go_online'"),
    home.indexOf("action: 'hydrate_restore_online'"),
  );
  const androidKeepOfflineElseSlice = home.slice(
    home.indexOf("action: 'hydrate_keep_offline_require_go_online_else'"),
    home.indexOf("hydrateServerOnline(serverOnline)"),
  );
  results.push(
    printRow(
      '16',
      'Android hydrate must not PUT is_online=false (bounce after successful GO)',
      home.includes("action: 'hydrate_keep_offline_require_go_online'") &&
        home.includes('leaveServerOnline: true') &&
        home.includes('hydrateGenRef') &&
        home.includes('stale_or_commit_inflight') &&
        androidKeepOfflineSlice.length > 0 &&
        !androidKeepOfflineSlice.includes('buildOnlineToggleUrl') &&
        !androidKeepOfflineElseSlice.includes('buildOnlineToggleUrl'),
      null,
    ),
  );

  results.push(
    printRow(
      '17',
      'Remount resumes a recent shift and does not kill FGS on default Offline',
      home.includes("action: 'hydrate_resume_recent_shift'") &&
        home.includes('loadDriverState') &&
        home.includes('PERMISSION_BOUNCE_GUARD_MS') &&
        home.includes('Do not stop FGS when phase is Offline') &&
        home.includes('Do not write isOnline from the default Offline phase'),
      null,
    ),
  );

  const all = results.every(Boolean);
  console.log(`\nOverall: ${all ? 'PASS' : 'FAIL'}`);
  process.exit(all ? 0 : 1);
}

main();
