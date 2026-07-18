/**
 * Driver operational state machine — single source of truth for go-online flow.
 *
 * States: OFFLINE | CONNECTING | RECONNECTING | ONLINE | RECEIVING_REQUEST | ON_TRIP
 * RECEIVING_REQUEST and ON_TRIP are derived from offer/trip while connection is confirmed.
 */
import { create } from 'zustand';
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';
import { reportNetworkOpsSignal } from '@/src/services/platformConnectionManager';

export type DriverOperationalState =
  | 'OFFLINE'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'ONLINE'
  | 'RECEIVING_REQUEST'
  | 'ON_TRIP';

type ConnectionPhase = 'offline' | 'connecting' | 'reconnecting' | 'confirmed';

type DriverSessionState = {
  /** Canonical operational state (derived + connection phase). */
  operationalState: DriverOperationalState;
  connectionPhase: ConnectionPhase;

  workZoneActive: boolean;
  workZoneLabel: string;
  workZoneLoaded: boolean;
  workZoneLoadStarted: boolean;

  driverOffersWsConnected: boolean;

  /** True when live map dashboard should be visible (confirmed/reconnecting/trip — not OFFLINE or CONNECTING). */
  isDashboardVisible: boolean;

  beginConnecting: () => void;
  markReconnecting: () => void;
  confirmOnline: () => void;
  abortConnecting: () => void;
  confirmOffline: () => void;
  hydrateServerOnline: (online: boolean) => void;

  setWorkZone: (active: boolean, label: string) => void;
  markWorkZoneLoadStarted: () => boolean;
  markWorkZoneLoaded: () => void;

  setDriverOffersWsConnected: (connected: boolean) => void;

  /** Recompute RECEIVING_REQUEST / ON_TRIP / ONLINE from trip + offer signals. */
  syncTripSignals: (signals: { hasActiveTrip: boolean; hasIncomingOffer: boolean }) => void;
};

function deriveState(
  phase: ConnectionPhase,
  hasActiveTrip: boolean,
  hasIncomingOffer: boolean,
): DriverOperationalState {
  if (phase === 'offline') return 'OFFLINE';
  if (phase === 'connecting') return 'CONNECTING';
  if (phase === 'reconnecting') return 'RECONNECTING';
  if (hasActiveTrip) return 'ON_TRIP';
  if (hasIncomingOffer) return 'RECEIVING_REQUEST';
  return 'ONLINE';
}

function applyDerived(
  phase: ConnectionPhase,
  hasActiveTrip: boolean,
  hasIncomingOffer: boolean,
): Pick<DriverSessionState, 'operationalState' | 'isDashboardVisible'> {
  const operationalState = deriveState(phase, hasActiveTrip, hasIncomingOffer);
  // Live map only after confirmed (or reconnecting while already online).
  // During CONNECTING, stay on offline home so UI never shows map + "YOU'RE OFFLINE".
  const isDashboardVisible =
    operationalState !== 'OFFLINE' && operationalState !== 'CONNECTING';
  return {
    operationalState,
    isDashboardVisible,
  };
}

let _tripSignals = { hasActiveTrip: false, hasIncomingOffer: false };

export const useDriverSessionStore = create<DriverSessionState>((set, get) => ({
  operationalState: 'OFFLINE',
  connectionPhase: 'offline',
  workZoneActive: false,
  workZoneLabel: '',
  workZoneLoaded: false,
  workZoneLoadStarted: false,
  driverOffersWsConnected: false,
  isDashboardVisible: false,

  beginConnecting: () => {
    driverFlowLog('GO_ONLINE_START');
    set({
      connectionPhase: 'connecting',
      ...applyDerived('connecting', _tripSignals.hasActiveTrip, _tripSignals.hasIncomingOffer),
    });
    // Offline home stays mounted during CONNECTING (isDashboardVisible=false).
    driverFlowLog('DASHBOARD_VISIBLE', { phase: 'CONNECTING', liveMap: false });
  },

  confirmOnline: () => {
    set({
      connectionPhase: 'confirmed',
      ...applyDerived('confirmed', _tripSignals.hasActiveTrip, _tripSignals.hasIncomingOffer),
    });
    driverFlowLog('GO_ONLINE_CONFIRMED');
    driverFlowLog('ONLINE_READY');
  },

  markReconnecting: () => {
    // Only after ONLINE (confirmed). Never promote CONNECTING → RECONNECTING —
    // that left the GO button stuck disabled with no timeout escape.
    const { connectionPhase } = get();
    if (connectionPhase === 'confirmed') {
      set({
        connectionPhase: 'reconnecting',
        ...applyDerived('reconnecting', _tripSignals.hasActiveTrip, _tripSignals.hasIncomingOffer),
      });
      driverFlowLog('RECONNECTING');
    }
  },

  abortConnecting: () => {
    driverFlowLog('GO_ONLINE_FAILED');
    set({
      connectionPhase: 'offline',
      ...applyDerived('offline', _tripSignals.hasActiveTrip, _tripSignals.hasIncomingOffer),
    });
  },

  confirmOffline: () => {
    driverFlowLog('GO_OFFLINE');
    set({
      connectionPhase: 'offline',
      driverOffersWsConnected: false,
      ...applyDerived('offline', false, false),
    });
    _tripSignals = { hasActiveTrip: false, hasIncomingOffer: false };
  },

  hydrateServerOnline: (online: boolean) => {
    const { connectionPhase } = get();
    if (connectionPhase === 'connecting') return;
    const phase: ConnectionPhase = online ? 'confirmed' : 'offline';
    set({
      connectionPhase: phase,
      ...applyDerived(phase, _tripSignals.hasActiveTrip, _tripSignals.hasIncomingOffer),
    });
    if (online) driverFlowLog('ONLINE_READY', { source: 'hydrate' });
  },

  setWorkZone: (active, label) => {
    set({ workZoneActive: active, workZoneLabel: label });
  },

  markWorkZoneLoadStarted: () => {
    if (get().workZoneLoadStarted) return false;
    set({ workZoneLoadStarted: true });
    driverFlowLog('WORK_ZONE_LOAD');
    return true;
  },

  markWorkZoneLoaded: () => {
    set({ workZoneLoaded: true });
    driverFlowLog('WORK_ZONE_READY');
  },

  setDriverOffersWsConnected: (connected) => {
    set({ driverOffersWsConnected: connected });
    if (connected) driverFlowLog('SOCKET_CONNECTED');
  },

  syncTripSignals: (signals) => {
    _tripSignals = signals;
    reportNetworkOpsSignal('active_trip', signals.hasActiveTrip);
    const { connectionPhase } = get();
    set(applyDerived(connectionPhase, signals.hasActiveTrip, signals.hasIncomingOffer));
  },
}));

/** Non-offline session (includes CONNECTING). Live map uses isDashboardVisible, not this. */
export function isDriverSessionActive(state: DriverOperationalState): boolean {
  return state !== 'OFFLINE';
}
