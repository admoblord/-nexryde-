/**
 * NetworkStateManager — single source of truth for app connectivity UX.
 *
 * Exported historically as `platformConnectionManager` (keep those APIs).
 * Temporary latency must never equal OFFLINE: ride ops use `state !== 'OFFLINE'`.
 *
 * Driver-facing banners are intentionally quieter than the internal FSM:
 * internal transitions are always logged; banner exposure is gated separately.
 */
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { BACKEND_URL } from '@/src/services/api';

export type NetworkState = 'CONNECTED' | 'DEGRADED' | 'RECONNECTING' | 'OFFLINE';
/** @deprecated Prefer NetworkState — same values. */
export type PlatformConnectionState = NetworkState;

/** What the OfflineBanner is allowed to show to the driver. */
export type BannerExposure = 'hidden' | 'degraded' | 'reconnecting' | 'offline' | 'connected';

export type PlatformSignalSource = 'internet' | 'backend' | 'socket' | 'heartbeat';

export type NetworkOpsSignal =
  | 'location_upload'
  | 'trip_sync'
  | 'ride_offer'
  | 'active_trip'
  | 'app_foreground';

export type PlatformConnectionSnapshot = {
  state: NetworkState;
  /** Debounced / policy-gated banner (legacy field — mirrors bannerExposure mapping). */
  uiState: NetworkState;
  /** Driver-facing banner slot. Prefer this over uiState for UI. */
  bannerExposure: BannerExposure;
  internetReachable: boolean | null;
  backendReachable: boolean | null;
  socketAlive: boolean | null;
  heartbeatAlive: boolean | null;
  consecutiveAllSignalFailures: number;
  consecutiveRequestFailures: number;
  consecutiveSuccessfulPings: number;
  lastLatencyMs: number | null;
  highLatencyStreakMs: number;
  msSinceLastSuccess: number | null;
  msSinceNoConnectivity: number | null;
  activeTrip: boolean;
  appInForeground: boolean;
  updatedAt: number;
  lastTransitionAt: number;
  lastTransitionFrom: NetworkState | null;
};

const HEALTH_POLL_MS = 15_000;
const BACKEND_TIMEOUT_MS = 7_000;
const HIGH_LATENCY_MS = 1_500;
const HIGH_LATENCY_HOLD_MS = 5_000;
const FAILURES_TO_DEGRADED = 3;
const DEGRADED_TO_RECONNECTING_MS = 10_000;
const RECONNECTING_TO_OFFLINE_MS = 20_000;
/** Escape hatch: stuck RECONNECTING with "internet" but no backend/ops → treat as OFFLINE. */
const RECONNECTING_MAX_DWELL_MS = 45_000;
const PINGS_TO_CONNECTED = 3;
const EVAL_TICK_MS = 1_000;
/** Silently dismiss warning after recovery before going fully hidden. */
const SILENT_DISMISS_MS = 2_000;
/** Only celebrate Connected after a prolonged true outage. */
const CONNECTED_BANNER_AFTER_OFFLINE_MS = 30_000;
const CONNECTED_BANNER_VISIBLE_MS = 2_500;
/** Location upload must fail continuously this long before trip banners appear. */
const TRIP_LOCATION_FAIL_BANNER_MS = 20_000;
/** Recent ride-ops success window — suppresses latency-only Low Connection. */
const RIDE_OPS_HEALTHY_MS = 20_000;

type InternalMetrics = {
  consecutiveRequestFailures: number;
  consecutiveSuccessfulPings: number;
  lastLatencyMs: number | null;
  highLatencySince: number | null;
  lastSuccessAt: number | null;
  noConnectivitySince: number | null;
  stateEnteredAt: number;
  lastTransitionFrom: NetworkState | null;
  uiStateCommittedAt: number;
  uiState: NetworkState;
  bannerExposure: BannerExposure;
  offlineEnteredAt: number | null;
  offlineDurationAtRecovery: number;
  lastLocationOkAt: number | null;
  locationUploadFailingSince: number | null;
  tripSyncFailing: boolean;
  lastOfferAt: number | null;
  activeTrip: boolean;
  appInForeground: boolean;
  dismissTimer: ReturnType<typeof setTimeout> | null;
  connectedPulseTimer: ReturnType<typeof setTimeout> | null;
};

let snapshot: PlatformConnectionSnapshot = {
  state: 'CONNECTED',
  uiState: 'CONNECTED',
  bannerExposure: 'hidden',
  internetReachable: null,
  backendReachable: null,
  socketAlive: null,
  heartbeatAlive: null,
  consecutiveAllSignalFailures: 0,
  consecutiveRequestFailures: 0,
  consecutiveSuccessfulPings: 0,
  lastLatencyMs: null,
  highLatencyStreakMs: 0,
  msSinceLastSuccess: null,
  msSinceNoConnectivity: null,
  activeTrip: false,
  appInForeground: true,
  updatedAt: Date.now(),
  lastTransitionAt: Date.now(),
  lastTransitionFrom: null,
};

let metrics: InternalMetrics = {
  consecutiveRequestFailures: 0,
  consecutiveSuccessfulPings: 0,
  lastLatencyMs: null,
  highLatencySince: null,
  lastSuccessAt: Date.now(),
  noConnectivitySince: null,
  stateEnteredAt: Date.now(),
  lastTransitionFrom: null,
  uiStateCommittedAt: Date.now(),
  uiState: 'CONNECTED',
  bannerExposure: 'hidden',
  offlineEnteredAt: null,
  offlineDurationAtRecovery: 0,
  lastLocationOkAt: null,
  locationUploadFailingSince: null,
  tripSyncFailing: false,
  lastOfferAt: null,
  activeTrip: false,
  appInForeground: true,
  dismissTimer: null,
  connectedPulseTimer: null,
};

let started = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let evalTimer: ReturnType<typeof setInterval> | null = null;
let netUnsubscribe: (() => void) | null = null;
let appStateUnsubscribe: { remove: () => void } | null = null;
const listeners = new Set<(snapshot: PlatformConnectionSnapshot) => void>();

function logNet(event: string, extra?: Record<string, unknown>): void {
  const payload = {
    t: Date.now(),
    state: snapshot.state,
    bannerExposure: metrics.bannerExposure,
    latencyMs: metrics.lastLatencyMs,
    failures: metrics.consecutiveRequestFailures,
    successPings: metrics.consecutiveSuccessfulPings,
    activeTrip: metrics.activeTrip,
    foreground: metrics.appInForeground,
    ...extra,
  };
  console.log(`[NetworkStateManager] ${event}`, payload);
}

function notifyListeners(): void {
  listeners.forEach((listener) => listener(snapshot));
}

function clearDismissTimers(): void {
  if (metrics.dismissTimer) {
    clearTimeout(metrics.dismissTimer);
    metrics.dismissTimer = null;
  }
  if (metrics.connectedPulseTimer) {
    clearTimeout(metrics.connectedPulseTimer);
    metrics.connectedPulseTimer = null;
  }
}

function exposureToUiState(exp: BannerExposure): NetworkState {
  if (exp === 'degraded') return 'DEGRADED';
  if (exp === 'reconnecting') return 'RECONNECTING';
  if (exp === 'offline') return 'OFFLINE';
  if (exp === 'connected') return 'CONNECTED';
  return 'CONNECTED';
}

function stateToWarnExposure(state: NetworkState): BannerExposure | null {
  if (state === 'DEGRADED') return 'degraded';
  if (state === 'RECONNECTING') return 'reconnecting';
  if (state === 'OFFLINE') return 'offline';
  return null;
}

function isRideOpsHealthy(now: number = Date.now()): boolean {
  if (snapshot.socketAlive === true) return true;
  if (snapshot.heartbeatAlive === true) return true;
  if (metrics.lastLocationOkAt != null && now - metrics.lastLocationOkAt < RIDE_OPS_HEALTHY_MS) {
    return true;
  }
  if (metrics.lastOfferAt != null && now - metrics.lastOfferAt < RIDE_OPS_HEALTHY_MS) {
    return true;
  }
  return false;
}

function tripBannerAllowed(now: number): boolean {
  if (!metrics.activeTrip) return true;
  if (metrics.tripSyncFailing) return true;
  if (
    metrics.locationUploadFailingSince != null &&
    now - metrics.locationUploadFailingSince >= TRIP_LOCATION_FAIL_BANNER_MS
  ) {
    return true;
  }
  return false;
}

function warningAllowedForDriver(state: NetworkState, now: number): boolean {
  // Background: suppress non-critical banners; keep reconnecting silently.
  if (!metrics.appInForeground) {
    if (state === 'DEGRADED' || state === 'RECONNECTING') return false;
    // OFFLINE in background still suppressed as non-actionable chrome; logged only.
    if (state === 'OFFLINE') return false;
  }
  if (metrics.activeTrip && !tripBannerAllowed(now)) return false;
  return true;
}

function setBannerExposure(next: BannerExposure, now: number, reason: string): void {
  if (metrics.bannerExposure === next) return;
  const prev = metrics.bannerExposure;
  metrics.bannerExposure = next;
  metrics.uiState = next === 'hidden' ? 'CONNECTED' : exposureToUiState(next);
  metrics.uiStateCommittedAt = now;
  snapshot = {
    ...snapshot,
    bannerExposure: next,
    uiState: metrics.uiState,
    updatedAt: now,
  };
  logNet('banner_exposure', { from: prev, to: next, reason });
  notifyListeners();
}

function scheduleSilentDismiss(now: number, celebrateConnected: boolean): void {
  clearDismissTimers();
  metrics.dismissTimer = setTimeout(() => {
    metrics.dismissTimer = null;
    const t = Date.now();
    if (snapshot.state !== 'CONNECTED') {
      // FSM moved again — policy re-applied by evaluate.
      recomputeBannerFromFsm(t);
      return;
    }
    if (celebrateConnected) {
      setBannerExposure('connected', t, 'offline_gt_30s_recovery');
      metrics.connectedPulseTimer = setTimeout(() => {
        metrics.connectedPulseTimer = null;
        if (snapshot.state === 'CONNECTED') {
          setBannerExposure('hidden', Date.now(), 'connected_pulse_done');
        }
      }, CONNECTED_BANNER_VISIBLE_MS);
    } else {
      setBannerExposure('hidden', t, 'silent_dismiss');
    }
  }, SILENT_DISMISS_MS);
}

function recomputeBannerFromFsm(now: number): void {
  const warn = stateToWarnExposure(snapshot.state);
  if (warn) {
    clearDismissTimers();
    if (warningAllowedForDriver(snapshot.state, now)) {
      setBannerExposure(warn, now, 'fsm_warning');
    } else {
      // Keep internal state but hide from driver.
      if (metrics.bannerExposure !== 'hidden' && metrics.bannerExposure !== 'connected') {
        setBannerExposure('hidden', now, 'suppressed');
      } else if (metrics.bannerExposure === 'connected') {
        setBannerExposure('hidden', now, 'suppressed_connected');
      }
    }
    return;
  }

  // CONNECTED — quiet recovery.
  if (snapshot.state === 'CONNECTED') {
    const showingWarn =
      metrics.bannerExposure === 'degraded' ||
      metrics.bannerExposure === 'reconnecting' ||
      metrics.bannerExposure === 'offline';
    if (showingWarn) {
      // Do not reset the 2s dismiss window on every eval tick.
      if (!metrics.dismissTimer) {
        const celebrate = metrics.offlineDurationAtRecovery >= CONNECTED_BANNER_AFTER_OFFLINE_MS;
        scheduleSilentDismiss(now, celebrate);
      }
      return;
    }
    if (metrics.bannerExposure === 'connected') {
      // pulse handled by timer
      return;
    }
    if (metrics.dismissTimer || metrics.connectedPulseTimer) return;
    setBannerExposure('hidden', now, 'connected_quiet');
  }
}

function applyUiDebounce(nextCommitted: NetworkState, now: number): NetworkState {
  // Legacy: uiState is derived from banner exposure, not raw FSM.
  metrics.uiState = metrics.uiState;
  void nextCommitted;
  void now;
  return metrics.uiState;
}

function transitionTo(next: NetworkState, now: number, reason: string): void {
  if (next === snapshot.state) return;
  const from = snapshot.state;
  const recoveryMs =
    next === 'CONNECTED' && from !== 'CONNECTED'
      ? Math.max(0, now - metrics.stateEnteredAt)
      : undefined;

  if (next === 'OFFLINE') {
    if (metrics.offlineEnteredAt == null) metrics.offlineEnteredAt = now;
  }
  if (from === 'OFFLINE' && next !== 'OFFLINE') {
    metrics.offlineDurationAtRecovery =
      metrics.offlineEnteredAt != null ? Math.max(0, now - metrics.offlineEnteredAt) : 0;
    metrics.offlineEnteredAt = null;
  }
  if (next === 'CONNECTED' && from !== 'OFFLINE' && from !== 'RECONNECTING') {
    // Short degradations — no Connected celebration budget.
    if (from === 'DEGRADED') metrics.offlineDurationAtRecovery = 0;
  }

  metrics.lastTransitionFrom = from;
  metrics.stateEnteredAt = now;
  if (next === 'CONNECTED') {
    metrics.consecutiveRequestFailures = 0;
  }
  // Keep recovery ping streak when OFFLINE → RECONNECTING after a successful probe.
  if (next === 'OFFLINE') {
    metrics.consecutiveSuccessfulPings = 0;
  } else if (next === 'RECONNECTING' && from !== 'OFFLINE') {
    metrics.consecutiveSuccessfulPings = 0;
  }

  snapshot = {
    ...snapshot,
    state: next,
    consecutiveRequestFailures: metrics.consecutiveRequestFailures,
    consecutiveSuccessfulPings: metrics.consecutiveSuccessfulPings,
    lastLatencyMs: metrics.lastLatencyMs,
    highLatencyStreakMs:
      metrics.highLatencySince != null ? Math.max(0, now - metrics.highLatencySince) : 0,
    msSinceLastSuccess:
      metrics.lastSuccessAt != null ? Math.max(0, now - metrics.lastSuccessAt) : null,
    msSinceNoConnectivity:
      metrics.noConnectivitySince != null ? Math.max(0, now - metrics.noConnectivitySince) : null,
    activeTrip: metrics.activeTrip,
    appInForeground: metrics.appInForeground,
    bannerExposure: metrics.bannerExposure,
    uiState: metrics.uiState,
    updatedAt: now,
    lastTransitionAt: now,
    lastTransitionFrom: from,
  };
  logNet('state_transition', {
    from,
    to: next,
    reason,
    ...(recoveryMs != null ? { recoveryMs } : {}),
  });
  notifyListeners();
  recomputeBannerFromFsm(now);
}

function refreshSnapshotFields(now: number): void {
  const highLatencyStreakMs =
    metrics.highLatencySince != null ? Math.max(0, now - metrics.highLatencySince) : 0;
  snapshot = {
    ...snapshot,
    consecutiveAllSignalFailures: metrics.consecutiveRequestFailures,
    consecutiveRequestFailures: metrics.consecutiveRequestFailures,
    consecutiveSuccessfulPings: metrics.consecutiveSuccessfulPings,
    lastLatencyMs: metrics.lastLatencyMs,
    highLatencyStreakMs,
    msSinceLastSuccess:
      metrics.lastSuccessAt != null ? Math.max(0, now - metrics.lastSuccessAt) : null,
    msSinceNoConnectivity:
      metrics.noConnectivitySince != null ? Math.max(0, now - metrics.noConnectivitySince) : null,
    activeTrip: metrics.activeTrip,
    appInForeground: metrics.appInForeground,
    bannerExposure: metrics.bannerExposure,
    uiState: metrics.uiState,
    updatedAt: now,
  };
}

function evaluateStateMachine(now: number = Date.now()): void {
  const internetOk = snapshot.internetReachable !== false;
  const internetDown = snapshot.internetReachable === false;

  if (internetDown) {
    if (metrics.noConnectivitySince == null) metrics.noConnectivitySince = now;
  } else {
    metrics.noConnectivitySince = null;
  }

  const opsHealthy = isRideOpsHealthy(now);
  const highLatencyLongEnough =
    !opsHealthy &&
    metrics.highLatencySince != null &&
    now - metrics.highLatencySince >= HIGH_LATENCY_HOLD_MS;
  const noSuccessLongEnough =
    metrics.lastSuccessAt != null && now - metrics.lastSuccessAt >= DEGRADED_TO_RECONNECTING_MS;
  const noConnectivityLongEnough =
    metrics.noConnectivitySince != null &&
    now - metrics.noConnectivitySince >= RECONNECTING_TO_OFFLINE_MS;

  const current = snapshot.state;

  // Health-ping streak OR live ride-ops must clear RECONNECTING/DEGRADED.
  // Previously only consecutiveSuccessfulPings could exit RECONNECTING; socket/heartbeat
  // success updated lastSuccessAt but never the ping counter — banner stuck forever while
  // NetInfo stayed "online" and health failures were ignored when ops looked healthy.
  if (current !== 'CONNECTED' && internetOk) {
    if (metrics.consecutiveSuccessfulPings >= PINGS_TO_CONNECTED) {
      transitionTo('CONNECTED', now, 'three_successful_pings');
      refreshSnapshotFields(now);
      return;
    }
    if (opsHealthy && (current === 'RECONNECTING' || current === 'DEGRADED')) {
      transitionTo('CONNECTED', now, 'ride_ops_healthy');
      refreshSnapshotFields(now);
      return;
    }
  }

  if (current === 'CONNECTED') {
    if (metrics.consecutiveRequestFailures >= FAILURES_TO_DEGRADED) {
      transitionTo('DEGRADED', now, 'three_consecutive_request_failures');
    } else if (highLatencyLongEnough) {
      transitionTo('DEGRADED', now, 'sustained_high_latency');
    }
  } else if (current === 'DEGRADED') {
    // Recover early if ride ops are clearly healthy again after a latency-only degrade.
    if (opsHealthy && metrics.consecutiveRequestFailures === 0) {
      metrics.highLatencySince = null;
    }
    if (noSuccessLongEnough && !opsHealthy) {
      transitionTo('RECONNECTING', now, 'no_success_for_10s');
      logNet('reconnect_attempt', { msSinceLastSuccess: now - (metrics.lastSuccessAt ?? now) });
    }
  } else if (current === 'RECONNECTING') {
    if (noConnectivityLongEnough) {
      transitionTo('OFFLINE', now, 'no_connectivity_for_20s');
    } else if (
      !opsHealthy &&
      now - metrics.stateEnteredAt >= RECONNECTING_MAX_DWELL_MS
    ) {
      // NetInfo can stay "online" while Cloud Run is unreachable — don't banner-stuck forever.
      transitionTo('OFFLINE', now, 'reconnecting_dwell_exceeded');
    }
  } else if (current === 'OFFLINE') {
    if (internetOk && metrics.consecutiveSuccessfulPings > 0) {
      transitionTo('RECONNECTING', now, 'connectivity_returned');
    }
  }

  applyUiDebounce(snapshot.state, now);
  recomputeBannerFromFsm(now);
  refreshSnapshotFields(now);
}

function noteBackendSuccess(latencyMs: number | null): void {
  const now = Date.now();
  metrics.consecutiveRequestFailures = 0;
  metrics.lastSuccessAt = now;
  if (latencyMs != null) {
    metrics.lastLatencyMs = latencyMs;
    if (latencyMs > HIGH_LATENCY_MS) {
      if (isRideOpsHealthy(now)) {
        // Brief / background ping spikes must not become Low Connection while rides work.
        metrics.highLatencySince = null;
        metrics.consecutiveSuccessfulPings += 1;
        logNet('ping_slow_ignored_ops_healthy', { latencyMs });
      } else {
        if (metrics.highLatencySince == null) metrics.highLatencySince = now;
        metrics.consecutiveSuccessfulPings = 0;
        logNet('ping_slow', { latencyMs });
      }
    } else {
      metrics.highLatencySince = null;
      metrics.consecutiveSuccessfulPings += 1;
      logNet('ping_ok', { latencyMs, successPings: metrics.consecutiveSuccessfulPings });
    }
  } else {
    // managed_fetch / backend signals without latency still count toward recovery.
    metrics.highLatencySince = null;
    metrics.consecutiveSuccessfulPings += 1;
    logNet('request_success', { latencyMs: null, successPings: metrics.consecutiveSuccessfulPings });
  }
  evaluateStateMachine(now);
}

function noteBackendFailure(reason: string): void {
  const now = Date.now();
  // Health-only failures while sockets/location/offers are healthy ≠ ride impact.
  if (reason.startsWith('health_') && isRideOpsHealthy(now)) {
    logNet('request_failure_ignored_ops_healthy', { reason });
    evaluateStateMachine(now);
    return;
  }
  metrics.consecutiveRequestFailures += 1;
  metrics.consecutiveSuccessfulPings = 0;
  logNet('request_failure', { reason, failures: metrics.consecutiveRequestFailures });
  evaluateStateMachine(now);
}

async function pingBackend(): Promise<void> {
  // Skip network health probes while backgrounded — sockets/FGS keep ride ops alive.
  if (!metrics.appInForeground) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const res = await fetch(`${BACKEND_URL}/api/health/ready`, {
      method: 'GET',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    snapshot = { ...snapshot, backendReachable: res.ok };
    if (res.ok) {
      noteBackendSuccess(latencyMs);
    } else {
      noteBackendFailure(`health_http_${res.status}`);
    }
  } catch (e) {
    snapshot = { ...snapshot, backendReachable: false };
    noteBackendFailure(e instanceof Error ? `health_${e.name || 'abort'}` : 'health_abort');
  } finally {
    clearTimeout(timeout);
  }
}

function syncHealthTimer(): void {
  if (!started) return;
  if (metrics.appInForeground) {
    if (!healthTimer) {
      healthTimer = setInterval(() => void pingBackend(), HEALTH_POLL_MS);
    }
  } else if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
}

function onAppStateChange(next: AppStateStatus): void {
  const foreground = next === 'active';
  if (metrics.appInForeground === foreground) return;
  metrics.appInForeground = foreground;
  logNet('app_state', { foreground });
  syncHealthTimer();
  if (foreground) {
    void pingBackend();
  }
  evaluateStateMachine();
}

export function startPlatformConnectionManager(): void {
  if (started) return;
  started = true;
  metrics.appInForeground = AppState.currentState === 'active';
  logNet('start');
  appStateUnsubscribe = AppState.addEventListener('change', onAppStateChange);
  netUnsubscribe = NetInfo.addEventListener((state) => {
    const reachable =
      state.isConnected !== false && state.isInternetReachable !== false;
    snapshot = { ...snapshot, internetReachable: reachable, updatedAt: Date.now() };
    logNet('internet_signal', {
      reachable,
      isConnected: state.isConnected,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
    });
    evaluateStateMachine();
  });
  void NetInfo.fetch().then((state) => {
    const reachable =
      state.isConnected !== false && state.isInternetReachable !== false;
    snapshot = { ...snapshot, internetReachable: reachable, updatedAt: Date.now() };
    evaluateStateMachine();
  });
  if (metrics.appInForeground) {
    void pingBackend();
  }
  syncHealthTimer();
  evalTimer = setInterval(() => evaluateStateMachine(), EVAL_TICK_MS);
}

export function stopPlatformConnectionManager(): void {
  started = false;
  clearDismissTimers();
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (evalTimer) {
    clearInterval(evalTimer);
    evalTimer = null;
  }
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
  }
  if (appStateUnsubscribe) {
    appStateUnsubscribe.remove();
    appStateUnsubscribe = null;
  }
}

export function getPlatformConnectionSnapshot(): PlatformConnectionSnapshot {
  return snapshot;
}

export function subscribePlatformConnection(
  listener: (snapshot: PlatformConnectionSnapshot) => void
): () => void {
  startPlatformConnectionManager();
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Report connectivity signals from NetInfo / HTTP / sockets / heartbeat.
 * Socket & heartbeat alone never force DEGRADED — only request/ping metrics do.
 */
export function reportPlatformConnectionSignal(source: PlatformSignalSource, ok: boolean): void {
  startPlatformConnectionManager();
  if (source === 'internet') {
    snapshot = { ...snapshot, internetReachable: ok, updatedAt: Date.now() };
    evaluateStateMachine();
    return;
  }
  if (source === 'socket') {
    snapshot = { ...snapshot, socketAlive: ok, updatedAt: Date.now() };
    if (ok) {
      metrics.lastSuccessAt = Date.now();
      metrics.consecutiveRequestFailures = 0;
      // Credit recovery streak so RECONNECTING can clear even if /health/ready is flaky.
      metrics.consecutiveSuccessfulPings = Math.max(
        metrics.consecutiveSuccessfulPings + 1,
        PINGS_TO_CONNECTED,
      );
    }
    logNet('socket_signal', { ok });
    evaluateStateMachine();
    return;
  }
  if (source === 'heartbeat') {
    snapshot = { ...snapshot, heartbeatAlive: ok, updatedAt: Date.now() };
    if (ok) {
      metrics.lastSuccessAt = Date.now();
      metrics.consecutiveRequestFailures = 0;
      metrics.consecutiveSuccessfulPings = Math.max(
        metrics.consecutiveSuccessfulPings + 1,
        PINGS_TO_CONNECTED,
      );
    }
    logNet('heartbeat_signal', { ok });
    evaluateStateMachine();
    return;
  }
  if (source === 'backend') {
    snapshot = { ...snapshot, backendReachable: ok, updatedAt: Date.now() };
    if (ok) {
      noteBackendSuccess(null);
    } else {
      noteBackendFailure('managed_fetch');
    }
  }
}

/**
 * Ride-context signals — gate banner exposure and latency-only DEGRADED.
 */
export function reportNetworkOpsSignal(signal: NetworkOpsSignal, ok: boolean): void {
  startPlatformConnectionManager();
  const now = Date.now();
  if (signal === 'location_upload') {
    if (ok) {
      metrics.lastLocationOkAt = now;
      metrics.locationUploadFailingSince = null;
      metrics.lastSuccessAt = now;
    } else if (metrics.locationUploadFailingSince == null) {
      metrics.locationUploadFailingSince = now;
    }
    logNet('ops_location_upload', { ok, failingSince: metrics.locationUploadFailingSince });
  } else if (signal === 'trip_sync') {
    metrics.tripSyncFailing = !ok;
    if (ok) metrics.lastSuccessAt = now;
    logNet('ops_trip_sync', { ok });
  } else if (signal === 'ride_offer') {
    if (ok) {
      metrics.lastOfferAt = now;
      metrics.lastSuccessAt = now;
    }
    logNet('ops_ride_offer', { ok });
  } else if (signal === 'active_trip') {
    metrics.activeTrip = ok;
    if (!ok) {
      metrics.locationUploadFailingSince = null;
      metrics.tripSyncFailing = false;
    }
    logNet('ops_active_trip', { active: ok });
  } else if (signal === 'app_foreground') {
    metrics.appInForeground = ok;
    logNet('ops_app_foreground', { foreground: ok });
  }
  evaluateStateMachine(now);
}

export function usePlatformConnectionSnapshot(): PlatformConnectionSnapshot {
  const [value, setValue] = useState(getPlatformConnectionSnapshot());
  useEffect(() => subscribePlatformConnection(setValue), []);
  return value;
}

/** True only for hard offline — temporary latency must not stop ride ops. */
export function isHardOffline(): boolean {
  return getPlatformConnectionSnapshot().state === 'OFFLINE';
}

/** NetworkStateManager facade — same singleton as platformConnectionManager. */
export const NetworkStateManager = {
  start: startPlatformConnectionManager,
  stop: stopPlatformConnectionManager,
  getSnapshot: getPlatformConnectionSnapshot,
  subscribe: subscribePlatformConnection,
  reportSignal: reportPlatformConnectionSignal,
  reportOpsSignal: reportNetworkOpsSignal,
  isHardOffline,
};

function freshMetrics(): InternalMetrics {
  return {
    consecutiveRequestFailures: 0,
    consecutiveSuccessfulPings: 0,
    lastLatencyMs: null,
    highLatencySince: null,
    lastSuccessAt: Date.now(),
    noConnectivitySince: null,
    stateEnteredAt: Date.now(),
    lastTransitionFrom: null,
    uiStateCommittedAt: Date.now(),
    uiState: 'CONNECTED',
    bannerExposure: 'hidden',
    offlineEnteredAt: null,
    offlineDurationAtRecovery: 0,
    lastLocationOkAt: null,
    locationUploadFailingSince: null,
    tripSyncFailing: false,
    lastOfferAt: null,
    activeTrip: false,
    appInForeground: true,
    dismissTimer: null,
    connectedPulseTimer: null,
  };
}

/** Test helper — reset singleton between unit tests. */
export function __resetNetworkStateManagerForTests(): void {
  stopPlatformConnectionManager();
  started = false;
  clearDismissTimers();
  metrics = freshMetrics();
  snapshot = {
    state: 'CONNECTED',
    uiState: 'CONNECTED',
    bannerExposure: 'hidden',
    internetReachable: true,
    backendReachable: true,
    socketAlive: null,
    heartbeatAlive: null,
    consecutiveAllSignalFailures: 0,
    consecutiveRequestFailures: 0,
    consecutiveSuccessfulPings: 0,
    lastLatencyMs: null,
    highLatencyStreakMs: 0,
    msSinceLastSuccess: 0,
    msSinceNoConnectivity: null,
    activeTrip: false,
    appInForeground: true,
    updatedAt: Date.now(),
    lastTransitionAt: Date.now(),
    lastTransitionFrom: null,
  };
}

export const __networkStateTestApi = {
  evaluate: evaluateStateMachine,
  noteSuccess: noteBackendSuccess,
  noteFailure: noteBackendFailure,
  getMetrics: () => ({ ...metrics }),
  recomputeBanner: recomputeBannerFromFsm,
};
