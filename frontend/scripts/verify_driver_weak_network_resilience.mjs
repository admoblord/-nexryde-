#!/usr/bin/env node
/**
 * Weak-network driver contract.
 *
 * Reported from Lagos: tap GO ONLINE → "ERR_NETWORK: Network request failed",
 * driver bounced offline, sometimes signed out, sometimes the app vanished to the
 * home screen. Cancellation also sat spinning. These guards lock in the fixes.
 *
 * Run: node frontend/scripts/verify_driver_weak_network_resilience.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
let failed = 0;
const check = (label, ok, detail = '') => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

const home = read('app/(driver-tabs)/driver-home.tsx');
const coordinator = read('src/services/driverOnlineStatusCoordinator.ts');
const tokenStore = read('src/lib/tokenStore.ts');
const sessionRefresh = read('src/utils/sessionRefresh.ts');
const api = read('src/services/api.ts');
const terms = read('src/services/termsAcceptance.ts');
const nativeExp = read('src/services/driverNativeExperience.ts');
const fgs = read('android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt');

console.log('\n[1] GO ONLINE survives a weak network');

const attempts = Number(/GO_ONLINE_MAX_ATTEMPTS = (\d+)/.exec(coordinator)?.[1] ?? 0);
check('go-online attempt budget raised above the old 2', attempts >= 4, `got ${attempts}`);

const attemptTimeout = Number(
  /GO_ONLINE_ATTEMPT_TIMEOUT_MS = ([\d_]+)/.exec(coordinator)?.[1].replace(/_/g, '') ?? 0,
);
check(
  'per-attempt timeout allows a cold Cloud Run start',
  attemptTimeout >= 10_000,
  `got ${attemptTimeout}ms`,
);

check(
  'connectivity failure is classified separately from a server refusal',
  coordinator.includes('isConnectivityOnlineFailure') &&
    home.includes('isConnectivityOnlineFailure'),
);

check(
  'no-answer PUT keeps the shift and retries instead of going offline',
  home.includes('scheduleGoOnlineReconnect') &&
    /isConnectivityOnlineFailure\([\s\S]{0,60}?\)\s*\)\s*\{[\s\S]{0,400}?scheduleGoOnlineReconnect\(\)/.test(
      home,
    ),
);

check(
  'retry loop fires as soon as connectivity returns',
  home.includes('subscribePlatformConnection') &&
    /subscribePlatformConnection\(\([\s\S]{0,400}?syncOnlineStatusRef\.current/.test(home),
);

check(
  'retry loop is bounded and stops on explicit Go Offline',
  coordinator.includes('GO_ONLINE_RECONNECT_MAX_MS') &&
    /applyLocalOptimisticGoOffline = useCallback\(\(\) => \{[\s\S]{0,300}?clearGoOnlineReconnect\(\)/.test(
      home,
    ),
);

check(
  'go-online PUT sends a freshly resolved bearer, not just the cached one',
  /getValidToken\(\)\.catch\(\(\) => null\)\) \?\? getCachedToken\(\)[\s\S]{0,400}?method: 'PUT'/.test(
    home,
  ),
);

console.log('\n[2] A dead network never signs the driver out');

check(
  'refresh reports why it failed',
  tokenStore.includes('forceRefreshDetailed') &&
    tokenStore.includes("outcome: 'rejected'") &&
    tokenStore.includes("outcome: 'unavailable'"),
);

check(
  'only a 401/403 on the refresh endpoint counts as rejected',
  /const rejected = res\.status === 401 \|\| res\.status === 403/.test(tokenStore),
);

check(
  'network failure during refresh is unavailable, not rejected',
  /catch \(e\) \{[\s\S]{0,220}?outcome: 'unavailable'/.test(tokenStore),
);

check(
  'authedFetch logs out only on a rejected refresh',
  /outcome === 'rejected'[\s\S]{0,200}?logout\(\)/.test(sessionRefresh) &&
    !/const fresh = await forceRefresh\(\);[\s\S]{0,200}?logout\(\)/.test(sessionRefresh),
);

check(
  'axios interceptor logs out only on a rejected refresh',
  api.includes('forceRefreshDetailed') && /outcome === 'rejected'[\s\S]{0,200}?logout\(\)/.test(api),
);

check(
  'terms acceptance no longer logs out on an offline refresh',
  terms.includes("{ offline: true }") && /'offline' in auth/.test(terms),
);

console.log('\n[3] App must not be killed to the home screen');

check(
  'FGS never blocks the main looper on HTTP',
  /Looper\.myLooper\(\) == Looper\.getMainLooper\(\)[\s\S]{0,200}?return false/.test(fgs),
);

check(
  'foreground service starts on the cached token (no refresh before startForeground)',
  /const cached = getCachedToken\(\);[\s\S]{0,260}?startDriverService\?\.\(driverId \?\? null, cached/.test(
    nativeExp,
  ),
);

check(
  'native heartbeat honours a go-online commit grace window',
  fgs.includes('ONLINE_COMMIT_GRACE_MS') && fgs.includes('force_offline_ignored_commit_grace'),
);

check(
  'one stale-token 401 does not end a shift',
  fgs.includes('AUTH_FAILURES_BEFORE_OFFLINE') && fgs.includes('session_refresh_needed'),
);

check(
  'JS answers the native session refresh request',
  home.includes("event.action === 'session_refresh_needed'"),
);

check(
  'critical go-online import chain cannot raise an unhandled rejection',
  /recordOnline\(driverId!\)\)\s*\.catch\(\(\) => \{\}\)/.test(home),
);

console.log('\n[4] Driver cancellation is instant');

const cancelBody = home.slice(
  home.indexOf('const confirmDriverCancel'),
  home.indexOf('const handleTripEmergency'),
);

check('cancel handler is not an awaited async submit', /const confirmDriverCancel = useCallback\(\s*\(reason/.test(home));

check(
  'trip clears before any network call',
  cancelBody.indexOf('setCurrentTrip(null)') > -1 &&
    cancelBody.indexOf('setCurrentTrip(null)') < cancelBody.indexOf('reliableCancel'),
);

check(
  'sheet closes before any network call',
  cancelBody.indexOf('setDriverCancelOpen(false)') > -1 &&
    cancelBody.indexOf('setDriverCancelOpen(false)') < cancelBody.indexOf('reliableCancel'),
);

check(
  'server refusal restores the trip',
  /setCurrentTrip\(trip\);[\s\S]{0,200}?setDriverCancelOpen\(true\)/.test(cancelBody),
);

console.log(`\n═══ Result: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed ? 1 : 0);
