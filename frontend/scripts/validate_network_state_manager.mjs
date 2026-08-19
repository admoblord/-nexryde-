/**
 * NetworkStateManager quiet-banner production validation.
 * Run: node frontend/scripts/validate_network_state_manager.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const FAILURES_TO_DEGRADED = 3;
const HIGH_LATENCY_MS = 1_500;
const HIGH_LATENCY_HOLD_MS = 5_000;
const DEGRADED_TO_RECONNECTING_MS = 10_000;
const RECONNECTING_TO_OFFLINE_MS = 20_000;
const PINGS_TO_CONNECTED = 3;
const SILENT_DISMISS_MS = 2_000;
const CONNECTED_BANNER_AFTER_OFFLINE_MS = 30_000;
const TRIP_LOCATION_FAIL_BANNER_MS = 20_000;
const RIDE_OPS_HEALTHY_MS = 20_000;

/**
 * Pure mirror of FSM + quiet banner policy (keep in sync with platformConnectionManager.ts).
 */
function createSim(opts = {}) {
  let state = 'CONNECTED';
  let bannerExposure = 'hidden';
  let consecutiveFailures = 0;
  let consecutiveSuccessPings = 0;
  let lastSuccessAt = opts.lastSuccessAt ?? 0;
  let highLatencySince = null;
  let noConnectivitySince = null;
  let internetOk = true;
  let socketAlive = opts.socketAlive ?? false;
  let lastLocationOkAt = opts.lastLocationOkAt ?? null;
  let lastOfferAt = opts.lastOfferAt ?? null;
  let activeTrip = opts.activeTrip ?? false;
  let appInForeground = opts.appInForeground ?? true;
  let locationUploadFailingSince = null;
  let tripSyncFailing = false;
  let offlineEnteredAt = null;
  let offlineDurationAtRecovery = 0;
  let dismissAt = null;
  let celebrateConnected = false;
  const transitions = [];
  const bannerEvents = [];

  function isRideOpsHealthy(now) {
    if (socketAlive) return true;
    if (lastLocationOkAt != null && now - lastLocationOkAt < RIDE_OPS_HEALTHY_MS) return true;
    if (lastOfferAt != null && now - lastOfferAt < RIDE_OPS_HEALTHY_MS) return true;
    return false;
  }

  function tripBannerAllowed(now) {
    if (!activeTrip) return true;
    if (tripSyncFailing) return true;
    if (
      locationUploadFailingSince != null &&
      now - locationUploadFailingSince >= TRIP_LOCATION_FAIL_BANNER_MS
    ) {
      return true;
    }
    return false;
  }

  function warningAllowed(s, now) {
    if (!appInForeground) return false;
    if (activeTrip && !tripBannerAllowed(now)) return false;
    return true;
  }

  function setBanner(next, now, reason) {
    if (bannerExposure === next) return;
    bannerEvents.push({ from: bannerExposure, to: next, at: now, reason });
    bannerExposure = next;
  }

  function recomputeBanner(now) {
    if (state === 'DEGRADED' || state === 'RECONNECTING' || state === 'OFFLINE') {
      dismissAt = null;
      if (warningAllowed(state, now)) {
        const map = {
          DEGRADED: 'degraded',
          RECONNECTING: 'reconnecting',
          OFFLINE: 'offline',
        };
        setBanner(map[state], now, 'fsm_warning');
      } else {
        setBanner('hidden', now, 'suppressed');
      }
      return;
    }
    if (state === 'CONNECTED') {
      const showingWarn =
        bannerExposure === 'degraded' ||
        bannerExposure === 'reconnecting' ||
        bannerExposure === 'offline';
      if (showingWarn) {
        if (dismissAt == null) {
          celebrateConnected = offlineDurationAtRecovery >= CONNECTED_BANNER_AFTER_OFFLINE_MS;
          dismissAt = now + SILENT_DISMISS_MS;
        }
        // Keep warning visible until dismissAt; do not clear early.
        if (now >= dismissAt) {
          dismissAt = null;
          if (celebrateConnected) setBanner('connected', now, 'offline_gt_30s');
          else setBanner('hidden', now, 'silent_dismiss');
          celebrateConnected = false;
        }
        return;
      }
      if (bannerExposure !== 'connected') setBanner('hidden', now, 'connected_quiet');
    }
  }

  function transitionTo(next, now, reason) {
    if (next === state) return;
    const from = state;
    transitions.push({ from, to: next, at: now, reason });
    if (next === 'OFFLINE' && offlineEnteredAt == null) offlineEnteredAt = now;
    if (from === 'OFFLINE' && next !== 'OFFLINE') {
      offlineDurationAtRecovery =
        offlineEnteredAt != null ? Math.max(0, now - offlineEnteredAt) : 0;
      offlineEnteredAt = null;
    }
    if (next === 'CONNECTED' && from === 'DEGRADED') offlineDurationAtRecovery = 0;
    state = next;
    if (next === 'CONNECTED') consecutiveFailures = 0;
    if (next === 'OFFLINE') consecutiveSuccessPings = 0;
    else if (next === 'RECONNECTING' && from !== 'OFFLINE') consecutiveSuccessPings = 0;
    recomputeBanner(now);
  }

  function evaluate(now) {
    if (internetOk) noConnectivitySince = null;
    else if (noConnectivitySince == null) noConnectivitySince = now;

    const opsHealthy = isRideOpsHealthy(now);
    const highLatencyLongEnough =
      !opsHealthy &&
      highLatencySince != null &&
      now - highLatencySince >= HIGH_LATENCY_HOLD_MS;
    const noSuccessLongEnough =
      lastSuccessAt != null && now - lastSuccessAt >= DEGRADED_TO_RECONNECTING_MS;
    const noConnectivityLongEnough =
      noConnectivitySince != null && now - noConnectivitySince >= RECONNECTING_TO_OFFLINE_MS;

    if (state !== 'CONNECTED' && consecutiveSuccessPings >= PINGS_TO_CONNECTED && internetOk) {
      transitionTo('CONNECTED', now, 'three_successful_pings');
      recomputeBanner(now);
      return;
    }

    if (state === 'CONNECTED') {
      if (consecutiveFailures >= FAILURES_TO_DEGRADED) {
        transitionTo('DEGRADED', now, 'three_consecutive_request_failures');
      } else if (highLatencyLongEnough) {
        transitionTo('DEGRADED', now, 'sustained_high_latency');
      }
    } else if (state === 'DEGRADED') {
      if (noSuccessLongEnough) transitionTo('RECONNECTING', now, 'no_success_for_10s');
    } else if (state === 'RECONNECTING') {
      if (noConnectivityLongEnough) transitionTo('OFFLINE', now, 'no_connectivity_for_20s');
    } else if (state === 'OFFLINE') {
      if (internetOk && consecutiveSuccessPings > 0) {
        transitionTo('RECONNECTING', now, 'connectivity_returned');
      }
    }
    recomputeBanner(now);
  }

  return {
    get state() {
      return state;
    },
    get bannerExposure() {
      return bannerExposure;
    },
    get transitions() {
      return transitions;
    },
    get bannerEvents() {
      return bannerEvents;
    },
    noteFailure(now, reason = 'managed_fetch') {
      if (String(reason).startsWith('health_') && isRideOpsHealthy(now)) {
        evaluate(now);
        return;
      }
      consecutiveFailures += 1;
      consecutiveSuccessPings = 0;
      evaluate(now);
    },
    notePingOk(now, latencyMs) {
      consecutiveFailures = 0;
      lastSuccessAt = now;
      if (latencyMs > HIGH_LATENCY_MS) {
        if (isRideOpsHealthy(now)) {
          highLatencySince = null;
          consecutiveSuccessPings += 1;
        } else {
          if (highLatencySince == null) highLatencySince = now;
          consecutiveSuccessPings = 0;
        }
      } else {
        highLatencySince = null;
        consecutiveSuccessPings += 1;
      }
      evaluate(now);
    },
    setInternet(ok, now) {
      internetOk = ok;
      evaluate(now);
    },
    setSocket(ok) {
      socketAlive = ok;
    },
    setActiveTrip(v) {
      activeTrip = v;
    },
    setForeground(v) {
      appInForeground = v;
    },
    noteLocation(ok, now) {
      if (ok) {
        lastLocationOkAt = now;
        locationUploadFailingSince = null;
        lastSuccessAt = now;
      } else if (locationUploadFailingSince == null) {
        locationUploadFailingSince = now;
      }
      evaluate(now);
    },
    setTripSyncFailing(v, now) {
      tripSyncFailing = v;
      evaluate(now);
    },
    tick(now) {
      evaluate(now);
    },
  };
}

function printRow(id, label, pass, detail) {
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`${mark}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function main() {
  const results = [];
  const mgr = read('src/services/platformConnectionManager.ts');
  const banner = read('src/components/shared/OfflineBanner.tsx');
  const offline = read('src/services/offlineMode.ts');
  const net = read('src/services/networkManager.ts');
  const locPub = read('src/hooks/useDriverTripLocationPublisher.ts');
  const tripSync = read('src/services/activeTripSync.ts');

  const layout = read('app/_layout.tsx');

  function collectTsx(dir, acc = []) {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '.expo') continue;
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) collectTsx(p, acc);
      else if (/\.(tsx|ts)$/.test(name) && !name.endsWith('OfflineBanner.tsx')) acc.push(p);
    }
    return acc;
  }
  const chromeMounts = collectTsx(path.join(root, 'app'))
    .concat(collectTsx(path.join(root, 'src')))
    .filter((p) => {
      const t = fs.readFileSync(p, 'utf8');
      return t.includes('<OfflineBanner') || t.includes("from '@/src/components/OfflineBanner'");
    })
    .map((p) => path.relative(root, p));

  results.push(
    printRow(
      'R0',
      'Global connection strip/pill is removed at source (not screen-by-screen)',
      banner.includes('permanently removed') &&
        banner.includes('() => null') &&
        !banner.includes('styles.strip') &&
        !banner.includes('height: 2') &&
        !layout.includes('<OfflineBanner') &&
        !layout.includes("from '@/src/components/OfflineBanner'") &&
        layout.includes('useConnectivityRecovery') &&
        layout.includes('useOfflineQueueFlush') &&
        chromeMounts.length === 0,
      chromeMounts.length ? chromeMounts.join(', ') : null,
    ),
  );

  // --- R1 Quiet banner (FSM policy; no visual chrome) ---
  results.push(
    printRow(
      'R1a',
      'Quiet policy: no Connected on normal recovery (silent dismiss 2s)',
      mgr.includes('SILENT_DISMISS_MS = 2_000') &&
        mgr.includes('CONNECTED_BANNER_AFTER_OFFLINE_MS = 30_000') &&
        mgr.includes('bannerExposure'),
      null,
    ),
  );

  {
    const sim = createSim({ lastSuccessAt: 0 });
    sim.noteFailure(0);
    sim.noteFailure(1);
    sim.noteFailure(2);
    assert.equal(sim.state, 'DEGRADED');
    assert.equal(sim.bannerExposure, 'degraded');
    sim.notePingOk(100, 50);
    sim.notePingOk(200, 50);
    sim.notePingOk(300, 50);
    assert.equal(sim.state, 'CONNECTED');
    assert.equal(sim.bannerExposure, 'degraded'); // still showing until silent dismiss
    sim.tick(300 + SILENT_DISMISS_MS);
    results.push(
      printRow(
        'R1b',
        'Recovery dismisses warning silently (no Connected)',
        sim.bannerExposure === 'hidden',
        `banner=${sim.bannerExposure}`,
      ),
    );
  }

  {
    const sim = createSim({ lastSuccessAt: 0 });
    sim.noteFailure(0);
    sim.noteFailure(1);
    sim.noteFailure(2);
    sim.tick(12_000);
    assert.equal(sim.state, 'RECONNECTING');
    sim.setInternet(false, 12_000);
    sim.tick(12_000 + RECONNECTING_TO_OFFLINE_MS);
    assert.equal(sim.state, 'OFFLINE');
    // Remain offline past 30s before recovering.
    const recoverAt = 12_000 + RECONNECTING_TO_OFFLINE_MS + CONNECTED_BANNER_AFTER_OFFLINE_MS + 1_000;
    sim.setInternet(true, recoverAt);
    sim.notePingOk(recoverAt + 100, 80);
    sim.notePingOk(recoverAt + 200, 80);
    sim.notePingOk(recoverAt + 300, 80);
    sim.tick(recoverAt + 300 + SILENT_DISMISS_MS);
    results.push(
      printRow(
        'R1c',
        'Connected banner only after OFFLINE > 30s',
        sim.bannerExposure === 'connected' ||
          sim.bannerEvents.some((e) => e.to === 'connected'),
        `banner=${sim.bannerExposure} events=${sim.bannerEvents.map((e) => e.to).join(',')}`,
      ),
    );
  }

  // --- R2 Ignore latency spikes when ops healthy ---
  {
    const sim = createSim({ socketAlive: true, lastSuccessAt: 0 });
    sim.notePingOk(0, 2000);
    sim.tick(6_000);
    results.push(
      printRow(
        'R2a',
        'Latency spikes ignored while WebSocket healthy',
        sim.state === 'CONNECTED' && sim.bannerExposure === 'hidden',
        `state=${sim.state} banner=${sim.bannerExposure}`,
      ),
    );
  }

  {
    const sim = createSim({ socketAlive: true, lastSuccessAt: 0 });
    sim.noteFailure(0, 'health_abort');
    sim.noteFailure(1, 'health_abort');
    sim.noteFailure(2, 'health_abort');
    results.push(
      printRow(
        'R2b',
        'Health ping failures ignored while ride ops healthy',
        sim.state === 'CONNECTED' && sim.bannerExposure === 'hidden',
        `state=${sim.state}`,
      ),
    );
  }

  results.push(
    printRow(
      'R2c',
      'Source wires ride_offer / location_upload / socket signals',
      locPub.includes("reportNetworkOpsSignal('location_upload'") &&
        mgr.includes('isRideOpsHealthy') &&
        mgr.includes("signal === 'ride_offer'"),
      null,
    ),
  );

  // --- R3 Active trip ---
  {
    const sim = createSim({ activeTrip: true, lastSuccessAt: 100_000 });
    sim.noteFailure(100_000);
    sim.noteFailure(100_001);
    sim.noteFailure(100_002);
    assert.equal(sim.state, 'DEGRADED');
    assert.equal(sim.bannerExposure, 'hidden'); // suppressed on trip
    sim.noteLocation(false, 100_100);
    sim.tick(100_100 + TRIP_LOCATION_FAIL_BANNER_MS - 1);
    const midHidden = sim.bannerExposure === 'hidden';
    sim.tick(100_100 + TRIP_LOCATION_FAIL_BANNER_MS);
    const shown =
      sim.bannerExposure === 'degraded' || sim.bannerExposure === 'reconnecting';
    results.push(
      printRow(
        'R3a',
        'Active trip: no banner until location fail ≥20s',
        midHidden && shown,
        `midHidden=${midHidden} later=${sim.bannerExposure}`,
      ),
    );
  }

  {
    const sim = createSim({ activeTrip: true, lastSuccessAt: 0 });
    sim.noteFailure(0);
    sim.noteFailure(1);
    sim.noteFailure(2);
    sim.setTripSyncFailing(true, 50);
    results.push(
      printRow(
        'R3b',
        'Active trip: trip sync failure allows banner',
        sim.bannerExposure === 'degraded',
        `banner=${sim.bannerExposure}`,
      ),
    );
  }

  results.push(
    printRow(
      'R3c',
      'Trip sync + location publisher report ops signals',
      tripSync.includes("reportNetworkOpsSignal('trip_sync'") &&
        tripSync.includes("reportNetworkOpsSignal('active_trip'") &&
        locPub.includes("reportNetworkOpsSignal('location_upload'"),
      null,
    ),
  );

  // --- R4 Background ---
  {
    const sim = createSim({ appInForeground: false, lastSuccessAt: 0 });
    sim.noteFailure(0);
    sim.noteFailure(1);
    sim.noteFailure(2);
    results.push(
      printRow(
        'R4',
        'Background suppresses non-critical banners (still FSM-degraded)',
        sim.state === 'DEGRADED' && sim.bannerExposure === 'hidden',
        `state=${sim.state} banner=${sim.bannerExposure}`,
      ),
    );
  }

  results.push(
    printRow(
      'R4b',
      'AppState wired in NetworkStateManager',
      mgr.includes('AppState.addEventListener') && mgr.includes('appInForeground'),
      null,
    ),
  );

  // --- R5 Logging ---
  results.push(
    printRow(
      'R5',
      'Internal transitions logged; banner gated separately',
      mgr.includes("logNet('state_transition'") &&
        mgr.includes("logNet('banner_exposure'") &&
        mgr.includes('bannerExposure'),
      null,
    ),
  );

  // --- R6 Stability scenarios ---
  {
    const sim = createSim({ socketAlive: true, lastSuccessAt: 0 });
    for (let t = 0; t < 60_000; t += 5_000) {
      sim.notePingOk(t, 40 + (t % 200));
    }
    results.push(
      printRow(
        'R6a',
        'Stable internet → no connection banners',
        sim.bannerExposure === 'hidden' && sim.transitions.length === 0,
        `banner=${sim.bannerExposure} transitions=${sim.transitions.length}`,
      ),
    );
  }

  {
    const sim = createSim({ socketAlive: true, lastSuccessAt: 0 });
    sim.noteFailure(100, 'health_abort');
    sim.notePingOk(200, 1800);
    sim.noteFailure(300, 'health_abort');
    sim.tick(6000);
    results.push(
      printRow(
        'R6b',
        'Brief packet loss → no visible banner',
        sim.bannerExposure === 'hidden',
        `state=${sim.state} banner=${sim.bannerExposure}`,
      ),
    );
  }

  {
    const sim = createSim({ socketAlive: false, lastSuccessAt: 0 });
    sim.notePingOk(0, 2000);
    sim.tick(5_100);
    results.push(
      printRow(
        'R6c',
        'Sustained degradation (no ops health) → Low Connection',
        sim.state === 'DEGRADED' && sim.bannerExposure === 'degraded',
        `state=${sim.state} banner=${sim.bannerExposure}`,
      ),
    );
  }

  {
    const sim = createSim({ lastSuccessAt: 50_000 });
    sim.noteFailure(50_000);
    sim.noteFailure(50_001);
    sim.noteFailure(50_002);
    sim.tick(50_000 + DEGRADED_TO_RECONNECTING_MS);
    assert.equal(sim.state, 'RECONNECTING');
    assert.equal(sim.bannerExposure, 'reconnecting');
    sim.setInternet(false, 60_000);
    sim.tick(60_000 + RECONNECTING_TO_OFFLINE_MS);
    results.push(
      printRow(
        'R6d',
        'Real outage → Reconnecting then Offline',
        sim.state === 'OFFLINE' && sim.bannerExposure === 'offline',
        `state=${sim.state} banner=${sim.bannerExposure}`,
      ),
    );
  }

  {
    const sim = createSim({ activeTrip: true, lastSuccessAt: 0, socketAlive: true });
    sim.notePingOk(0, 2500);
    sim.tick(8_000);
    sim.noteFailure(9_000, 'health_abort');
    results.push(
      printRow(
        'R6e',
        'Active trip not interrupted by transient network changes',
        sim.bannerExposure === 'hidden',
        `state=${sim.state} banner=${sim.bannerExposure}`,
      ),
    );
  }

  // Legacy contracts still hold
  results.push(
    printRow(
      'LEG',
      'Ops online gated only on OFFLINE; no dual NetInfo',
      !offline.includes('NetInfo.addEventListener') &&
        net.includes("state !== 'OFFLINE'") &&
        mgr.includes('export const NetworkStateManager'),
      null,
    ),
  );

  const requirementMap = {
    R0: ['R0'],
    R1: ['R1a', 'R1b', 'R1c'],
    R2: ['R2a', 'R2b', 'R2c'],
    R3: ['R3a', 'R3b', 'R3c'],
    R4: ['R4', 'R4b'],
    R5: ['R5'],
    R6: ['R6a', 'R6b', 'R6c', 'R6d', 'R6e'],
  };

  // Store per-check results by parsing labels - easier: keep parallel array of ids
  const ids = [
    'R0', 'R1a', 'R1b', 'R1c', 'R2a', 'R2b', 'R2c', 'R3a', 'R3b', 'R3c', 'R4', 'R4b', 'R5',
    'R6a', 'R6b', 'R6c', 'R6d', 'R6e', 'LEG',
  ];
  const byId = Object.fromEntries(ids.map((id, i) => [id, results[i]]));

  console.log('\n=== REQUIREMENT SUMMARY ===');
  let allPass = true;
  for (const [req, checks] of Object.entries(requirementMap)) {
    const pass = checks.every((c) => byId[c]);
    allPass = allPass && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${req}`);
  }
  console.log(`${byId.LEG ? 'PASS' : 'FAIL'}  LEG (ops isolation)`);
  console.log(`\nOverall: ${allPass && byId.LEG ? 'PASS' : 'FAIL'}`);

  if (!allPass || !byId.LEG) process.exit(1);
}

main();
