/**
 * Boot realtime reliability client: heal + sync on foreground.
 */
import { AppState, type AppStateStatus } from 'react-native';
import { healRealtimeSession, syncLocalEvents } from '@/src/realtime/eventLog';

let started = false;
let sub: { remove: () => void } | null = null;

async function onForeground() {
  await healRealtimeSession('driver');
  await healRealtimeSession('rider');
  await syncLocalEvents();
}

export function startRealtimeReliabilityClient(): void {
  if (started) return;
  started = true;
  void onForeground();
  sub = AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') void onForeground();
  });
}

export function stopRealtimeReliabilityClient(): void {
  started = false;
  sub?.remove();
  sub = null;
}
