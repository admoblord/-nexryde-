import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { BACKEND_URL } from '@/src/services/api';

export type PlatformConnectionState = 'CONNECTED' | 'DEGRADED' | 'RECONNECTING' | 'OFFLINE';
export type PlatformSignalSource = 'internet' | 'backend' | 'socket' | 'heartbeat';

export type PlatformConnectionSnapshot = {
  state: PlatformConnectionState;
  internetReachable: boolean | null;
  backendReachable: boolean | null;
  socketAlive: boolean | null;
  heartbeatAlive: boolean | null;
  consecutiveAllSignalFailures: number;
  updatedAt: number;
};

const OFFLINE_FAILURE_THRESHOLD = 3;
const HEALTH_POLL_MS = 20_000;
const BACKEND_TIMEOUT_MS = 7_000;

let snapshot: PlatformConnectionSnapshot = {
  state: 'CONNECTED',
  internetReachable: null,
  backendReachable: null,
  socketAlive: null,
  heartbeatAlive: null,
  consecutiveAllSignalFailures: 0,
  updatedAt: Date.now(),
};

let started = false;
let healthTimer: ReturnType<typeof setInterval> | null = null;
let netUnsubscribe: (() => void) | null = null;
const listeners = new Set<(snapshot: PlatformConnectionSnapshot) => void>();

function nextStateFromSignals(next: PlatformConnectionSnapshot): PlatformConnectionState {
  const anyServerSignal =
    next.backendReachable === true || next.socketAlive === true || next.heartbeatAlive === true;
  const allSignalsFailed =
    next.internetReachable === false &&
    next.backendReachable !== true &&
    next.socketAlive !== true &&
    next.heartbeatAlive !== true;

  if (anyServerSignal && next.internetReachable !== false) {
    if (next.socketAlive === false || next.heartbeatAlive === false || next.backendReachable === false) {
      return 'DEGRADED';
    }
    return 'CONNECTED';
  }

  if (allSignalsFailed && next.consecutiveAllSignalFailures >= OFFLINE_FAILURE_THRESHOLD) {
    return 'OFFLINE';
  }

  return snapshot.state === 'OFFLINE' ? 'RECONNECTING' : 'RECONNECTING';
}

function publish(partial: Partial<PlatformConnectionSnapshot>) {
  const candidate: PlatformConnectionSnapshot = {
    ...snapshot,
    ...partial,
    updatedAt: Date.now(),
  };
  const allSignalsFailed =
    candidate.internetReachable === false &&
    candidate.backendReachable !== true &&
    candidate.socketAlive !== true &&
    candidate.heartbeatAlive !== true;
  const anySuccess =
    candidate.internetReachable === true ||
    candidate.backendReachable === true ||
    candidate.socketAlive === true ||
    candidate.heartbeatAlive === true;

  candidate.consecutiveAllSignalFailures = allSignalsFailed
    ? snapshot.consecutiveAllSignalFailures + 1
    : anySuccess
      ? 0
      : snapshot.consecutiveAllSignalFailures;
  candidate.state = nextStateFromSignals(candidate);
  snapshot = candidate;
  listeners.forEach((listener) => listener(snapshot));
}

async function pingBackend(): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${BACKEND_URL}/api/health/ready`, {
      method: 'GET',
      signal: controller.signal,
    });
    publish({ backendReachable: res.ok });
  } catch {
    publish({ backendReachable: false });
  } finally {
    clearTimeout(timeout);
  }
}

export function startPlatformConnectionManager(): void {
  if (started) return;
  started = true;
  netUnsubscribe = NetInfo.addEventListener((state) => {
    publish({
      internetReachable: Boolean(state.isConnected) && state.isInternetReachable !== false,
    });
  });
  void NetInfo.fetch().then((state) => {
    publish({
      internetReachable: Boolean(state.isConnected) && state.isInternetReachable !== false,
    });
  });
  void pingBackend();
  healthTimer = setInterval(() => void pingBackend(), HEALTH_POLL_MS);
}

export function stopPlatformConnectionManager(): void {
  started = false;
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = null;
  }
  if (netUnsubscribe) {
    netUnsubscribe();
    netUnsubscribe = null;
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

export function reportPlatformConnectionSignal(source: PlatformSignalSource, ok: boolean): void {
  if (source === 'internet') publish({ internetReachable: ok });
  if (source === 'backend') publish({ backendReachable: ok });
  if (source === 'socket') publish({ socketAlive: ok });
  if (source === 'heartbeat') publish({ heartbeatAlive: ok });
}

export function usePlatformConnectionSnapshot(): PlatformConnectionSnapshot {
  const [value, setValue] = useState(getPlatformConnectionSnapshot());
  useEffect(() => subscribePlatformConnection(setValue), []);
  return value;
}
