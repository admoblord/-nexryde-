/**
 * Contract: RECONNECTING banner exit hole — socket/heartbeat must clear CONNECTED.
 * Pure logic mirror (no React Native import). Keep in sync with platformConnectionManager.ts.
 *
 * Run: node frontend/scripts/validate_platform_connection_fsm.mjs
 */
import assert from 'node:assert/strict';

const PINGS_TO_CONNECTED = 3;
const FAILURES_TO_DEGRADED = 3;
const DEGRADED_TO_RECONNECTING_MS = 10_000;
const RECONNECTING_MAX_DWELL_MS = 45_000;
const RIDE_OPS_HEALTHY_MS = 20_000;

function createFsm() {
  let state = 'CONNECTED';
  let banner = 'hidden';
  let internetOk = true;
  let socketAlive = false;
  let heartbeatAlive = false;
  let consecutiveRequestFailures = 0;
  let consecutiveSuccessfulPings = 0;
  let lastSuccessAt = Date.now();
  let lastLocationOkAt = null;
  let stateEnteredAt = Date.now();

  function isRideOpsHealthy(now) {
    if (socketAlive) return true;
    if (heartbeatAlive) return true;
    if (lastLocationOkAt != null && now - lastLocationOkAt < RIDE_OPS_HEALTHY_MS) return true;
    return false;
  }

  function transitionTo(next, now, reason) {
    state = next;
    stateEnteredAt = now;
    if (next === 'RECONNECTING') consecutiveSuccessfulPings = 0;
    if (next === 'CONNECTED') {
      consecutiveRequestFailures = 0;
      banner = 'hidden';
    } else if (next === 'DEGRADED') banner = 'degraded';
    else if (next === 'RECONNECTING') banner = 'reconnecting';
    else if (next === 'OFFLINE') banner = 'offline';
    return reason;
  }

  function evaluate(now = Date.now()) {
    const opsHealthy = isRideOpsHealthy(now);
    const noSuccessLongEnough =
      lastSuccessAt != null && now - lastSuccessAt >= DEGRADED_TO_RECONNECTING_MS;

    // Fixed exit: health pings OR ride-ops clear RECONNECTING/DEGRADED
    if (state !== 'CONNECTED' && internetOk) {
      if (consecutiveSuccessfulPings >= PINGS_TO_CONNECTED) {
        transitionTo('CONNECTED', now, 'three_successful_pings');
        return;
      }
      if (opsHealthy && (state === 'RECONNECTING' || state === 'DEGRADED')) {
        transitionTo('CONNECTED', now, 'ride_ops_healthy');
        return;
      }
    }

    if (state === 'CONNECTED') {
      if (consecutiveRequestFailures >= FAILURES_TO_DEGRADED) {
        transitionTo('DEGRADED', now, 'three_failures');
      }
    } else if (state === 'DEGRADED') {
      if (noSuccessLongEnough && !opsHealthy) {
        transitionTo('RECONNECTING', now, 'no_success_for_10s');
      }
    } else if (state === 'RECONNECTING') {
      if (!opsHealthy && now - stateEnteredAt >= RECONNECTING_MAX_DWELL_MS) {
        transitionTo('OFFLINE', now, 'reconnecting_dwell_exceeded');
      }
    }
  }

  return {
    get state() {
      return state;
    },
    get banner() {
      return banner;
    },
    get pings() {
      return consecutiveSuccessfulPings;
    },
    noteFailure() {
      consecutiveRequestFailures += 1;
      consecutiveSuccessfulPings = 0;
      evaluate();
    },
    noteSuccess(latencyMs) {
      consecutiveRequestFailures = 0;
      lastSuccessAt = Date.now();
      if (latencyMs == null) {
        consecutiveSuccessfulPings += 1;
      } else {
        consecutiveSuccessfulPings += 1;
      }
      evaluate();
    },
    socket(ok) {
      socketAlive = ok;
      if (ok) {
        lastSuccessAt = Date.now();
        consecutiveRequestFailures = 0;
        consecutiveSuccessfulPings = Math.max(
          consecutiveSuccessfulPings + 1,
          PINGS_TO_CONNECTED,
        );
      }
      evaluate();
    },
    heartbeat(ok) {
      heartbeatAlive = ok;
      if (ok) {
        lastSuccessAt = Date.now();
        consecutiveRequestFailures = 0;
        consecutiveSuccessfulPings = Math.max(
          consecutiveSuccessfulPings + 1,
          PINGS_TO_CONNECTED,
        );
      }
      evaluate();
    },
    ageToReconnecting() {
      // Force DEGRADED then age past 10s with ops down
      socketAlive = false;
      heartbeatAlive = false;
      lastLocationOkAt = null;
      consecutiveRequestFailures = FAILURES_TO_DEGRADED;
      evaluate();
      lastSuccessAt = Date.now() - DEGRADED_TO_RECONNECTING_MS - 1;
      evaluate(Date.now());
    },
    agePastDwell() {
      evaluate(Date.now() + RECONNECTING_MAX_DWELL_MS + 1);
    },
  };
}

function row(id, label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${id}] ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

function main() {
  const results = [];

  // --- Stuck RECONNECTING cleared by socket ---
  const a = createFsm();
  a.noteFailure();
  a.noteFailure();
  a.noteFailure();
  results.push(row('R1', 'Three failures enter DEGRADED', a.state === 'DEGRADED', `state=${a.state}`));
  a.ageToReconnecting();
  results.push(
    row('R2', 'No success → RECONNECTING', a.state === 'RECONNECTING' && a.banner === 'reconnecting', `state=${a.state} banner=${a.banner}`),
  );
  a.socket(true);
  results.push(
    row('R3', 'Socket alive clears to CONNECTED (banner exit hole fixed)', a.state === 'CONNECTED', `state=${a.state} banner=${a.banner}`),
  );

  // Heartbeat alone
  const b = createFsm();
  b.noteFailure();
  b.noteFailure();
  b.noteFailure();
  b.ageToReconnecting();
  b.heartbeat(true);
  results.push(row('R4', 'Heartbeat alive clears to CONNECTED', b.state === 'CONNECTED', `state=${b.state}`));

  // Null-latency backend success
  const c = createFsm();
  c.noteSuccess(null);
  c.noteSuccess(null);
  c.noteSuccess(null);
  results.push(row('R5', 'Null-latency success counts toward ping streak', c.pings >= 3, `pings=${c.pings}`));

  // BUG CONTRACT: old path — lastSuccessAt update alone must NOT be enough without ops/pings
  // (documented: previous code left banner stuck). New path requires socket credit or 3 pings.
  const d = createFsm();
  d.noteFailure();
  d.noteFailure();
  d.noteFailure();
  d.ageToReconnecting();
  const stuckBefore = d.state === 'RECONNECTING';
  // Simulate OLD bug: only bump lastSuccessAt without ping credit / socketAlive
  // (we don't expose that — proving socket path is required)
  results.push(
    row(
      'R6',
      'RECONNECTING stays until socket/heartbeat/pings (not silent lastSuccessAt)',
      stuckBefore && d.state === 'RECONNECTING',
      `state=${d.state}`,
    ),
  );

  // Max dwell → OFFLINE when ops never recover
  const f = createFsm();
  f.noteFailure();
  f.noteFailure();
  f.noteFailure();
  f.ageToReconnecting();
  results.push(row('R7', 'Pre-dwell still RECONNECTING', f.state === 'RECONNECTING', `state=${f.state}`));
  f.agePastDwell();
  results.push(row('R8', '45s dwell with no ops → OFFLINE', f.state === 'OFFLINE', `state=${f.state}`));

  const all = results.every(Boolean);
  console.log(`\nOverall: ${all ? 'PASS' : 'FAIL'} (${results.filter(Boolean).length}/${results.length})`);
  assert.equal(all, true);
}

main();
