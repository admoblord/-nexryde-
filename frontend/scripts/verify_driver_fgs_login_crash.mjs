#!/usr/bin/env node
/**
 * Regression guard: driver login must not process-death on Android 14+.
 *
 * Root causes addressed:
 * 1) Untyped startForeground() with manifest location|dataSync
 * 2) startForegroundService() then bare stopSelf() without startForeground
 * 3) Login hydrate auto-restoring is_online → FGS start
 *
 * Run: node ./scripts/verify_driver_fgs_login_crash.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('\n═══ Driver FGS login crash safety ═══\n');

const fgs = read('android/app/src/main/java/com/nexryde/app/driver/DriverForegroundService.kt');
const home = read('app/(driver-tabs)/driver-home.tsx');
const nav = read('src/components/navigation/DriverGoogleNavigationSession.tsx');
const mapEngines = read('src/constants/mapEngines.ts');
const rnConfig = read('react-native.config.js');
const manifest = read('android/app/src/main/AndroidManifest.xml');

console.log('[1] Native typed startForeground (Android 14+)');
if (fgs.includes('promoteToForeground')) pass('promoteToForeground helper exists');
else fail('promoteToForeground helper missing');

if (fgs.includes('abortForegroundStart')) pass('abortForegroundStart demotes legally');
else fail('abortForegroundStart missing — bare stopSelf after startForegroundService is fatal');

if (fgs.includes('FOREGROUND_SERVICE_TYPE_LOCATION')) {
  pass('uses FOREGROUND_SERVICE_TYPE_LOCATION');
} else {
  fail('missing FOREGROUND_SERVICE_TYPE_LOCATION');
}

if (fgs.includes('FOREGROUND_SERVICE_TYPE_DATA_SYNC')) {
  pass('uses FOREGROUND_SERVICE_TYPE_DATA_SYNC (matches manifest)');
} else {
  fail('missing FOREGROUND_SERVICE_TYPE_DATA_SYNC');
}

const directUntyped = fgs
  .split('\n')
  .filter((line) => /startForeground\(\s*NOTIFICATION_ID/.test(line))
  .filter((line) => !line.includes('FOREGROUND_SERVICE_TYPE'))
  .filter((line) => !/else\s*->/.test(line.trim()) && !line.trim().startsWith('else'))
  .filter((line) => !line.includes('abort_last_resort') && !line.includes('runCatching'));
// Allow last-resort untyped inside abortForegroundStart only.
const abortBlock = fgs.includes('abort_last_resort_startForeground_failed');
if (abortBlock) pass('abort path has last-resort startForeground before stopSelf');
else fail('abort path missing last-resort startForeground');

if (fgs.includes('refuse_start_missing_location_permission')) {
  pass('refuses FGS start without location permission via abortForegroundStart');
} else {
  fail('missing location-permission refuse path');
}

if (fgs.includes('skip_start_foreground_service_no_location')) {
  pass('companion.start skips when location not granted');
} else {
  fail('companion.start missing location gate');
}

if (fgs.includes('skip_stop_service_not_running')) {
  pass('companion.stop no-ops when service process is not alive');
} else {
  fail('companion.stop still starts service on every offline login');
}

if (fgs.includes('start_foreground_service_failed') || fgs.includes('runCatching')) {
  pass('companion.start wraps startForegroundService in runCatching');
} else {
  fail('companion.start not hardened with runCatching');
}

// Offer paths must NOT call context.startForegroundService (re-enters FGS contract).
const showAlertSlice = fgs.slice(fgs.indexOf('fun showRideAlert'), fgs.indexOf('fun stopRideAlert'));
if (/context\.startForegroundService/.test(showAlertSlice)) {
  fail('showRideAlert still uses startForegroundService');
} else if (/context\.startService/.test(showAlertSlice)) {
  pass('showRideAlert uses startService (already foreground)');
} else {
  fail('showRideAlert start path unclear');
}

const acceptSlice = fgs.slice(fgs.indexOf('fun acceptRideAlert'), fgs.indexOf('fun declineRideAlert'));
if (/context\.startForegroundService/.test(acceptSlice)) {
  fail('acceptRideAlert still uses startForegroundService');
} else {
  pass('acceptRideAlert does not use startForegroundService');
}

console.log('\n[2] Manifest FGS type + permissions');
if (manifest.includes('android:foregroundServiceType="location|dataSync"')) {
  pass('manifest declares location|dataSync');
} else {
  fail('manifest missing location|dataSync foregroundServiceType');
}
if (manifest.includes('FOREGROUND_SERVICE_LOCATION')) pass('FOREGROUND_SERVICE_LOCATION permission');
else fail('missing FOREGROUND_SERVICE_LOCATION');
if (manifest.includes('FOREGROUND_SERVICE_DATA_SYNC')) pass('FOREGROUND_SERVICE_DATA_SYNC permission');
else fail('missing FOREGROUND_SERVICE_DATA_SYNC');

console.log('\n[3] Login hydrate must not auto-start FGS on Android');
if (home.includes('hydrate_keep_offline_require_go_online')) {
  pass('Android hydrate keeps offline — requires explicit GO ONLINE');
} else {
  fail('Android hydrate still auto-restores online on login');
}
if (home.includes('leaveServerOnline: true')) {
  pass('Android hydrate leaves server online (does not PUT is_online=false)');
} else {
  fail('Android hydrate may still PUT the server offline after a successful GO');
}
if (home.includes('hydrate_resume_recent_shift')) {
  pass('Android hydrate resumes a recent persisted shift instead of bouncing Offline');
} else {
  fail('Android hydrate does not resume a recent shift after JS remount');
}
if (home.includes('hydrate_restore_online') && home.includes("Platform.OS === 'android'")) {
  // restore online should only be on non-Android branch
  const restoreIdx = home.indexOf("action: 'hydrate_restore_online'");
  const before = home.slice(Math.max(0, restoreIdx - 400), restoreIdx);
  if (before.includes("Platform.OS === 'android'") && before.includes('return;')) {
    pass('hydrate_restore_online is after Android early-return');
  } else if (!before.includes('android')) {
    pass('hydrate_restore_online not on Android auto path');
  } else {
    // Check Android block returns before restore
    if (home.includes('android_require_go_online')) {
      pass('Android require_go_online gate present before restore');
    } else {
      fail('hydrate_restore_online may still run on Android');
    }
  }
}
if (home.includes('FGS_START_BLOCKED_PERMISSIONS')) {
  pass('FGS effect blocks start without preflight');
} else {
  fail('FGS_START_BLOCKED_PERMISSIONS log missing');
}
if (
  home.includes('evaluateDriverPermissionPreflight()') &&
  home.includes('void startNativeDriverExperience(driverId)')
) {
  const fgsEffectIdx = home.indexOf('Keep FGS + token refresh across reconnect blips');
  const slice = fgsEffectIdx >= 0 ? home.slice(fgsEffectIdx, fgsEffectIdx + 2800) : '';
  if (
    slice.includes('evaluateDriverPermissionPreflight') &&
    slice.includes('startNativeDriverExperience') &&
    slice.indexOf('evaluateDriverPermissionPreflight') < slice.indexOf('startNativeDriverExperience')
  ) {
    pass('FGS effect evaluates preflight before startNativeDriverExperience');
  } else {
    fail('FGS effect does not gate startNativeDriverExperience behind preflight');
  }
} else {
  fail('driver-home missing preflight or startNativeDriverExperience');
}

console.log('\n[4] iOS Nav SDK unlink (secondary crash landmine)');
if (rnConfig.includes("'@googlemaps/react-native-navigation-sdk'") && rnConfig.includes('ios: null')) {
  pass('react-native.config.js unlinks Nav SDK on iOS');
} else {
  fail('Nav SDK still linked on iOS');
}
if (mapEngines.includes("Platform.OS === 'ios'") && mapEngines.includes('return false')) {
  pass('isGoogleNavigationEnabled() false on iOS');
} else {
  fail('isGoogleNavigationEnabled not disabled on iOS');
}
if (nav.includes("Platform.OS !== 'android'") && nav.includes('isGoogleNavigationEnabled()')) {
  pass('loadNavSdk guards Android-only before require()');
} else {
  fail('loadNavSdk missing Android/enabled guard');
}

console.log(`\n═══ Result: ${passes.length} passed, ${failures.length} failed ═══\n`);
if (failures.length) {
  process.exit(1);
}
