/**
 * Optimistic Go Offline — apply local offline immediately; API follows in background.
 * Keep this module free of React so timing and rollback can be validated in isolation.
 */

export const GO_OFFLINE_FAIL_MESSAGE =
  'Unable to go offline. Please check your connection and try again.';

/** UI must reflect Offline under this budget (requirement: < 100 ms). */
export const GO_OFFLINE_UI_BUDGET_MS = 100;

export type OptimisticGoOfflineEffects = {
  clearIncomingOffer: () => void;
  confirmOffline: () => void;
  disconnectOffersSocket: () => void;
  stopNativeExperience: () => void;
  stopNativeRideAlert: () => void;
  stopOfferBackgroundAlert: () => void;
  stopOfferAudio: () => void;
  /** Fire-and-forget OK — must not block the sync path. */
  stopBackgroundLocation: () => void;
  persistLocalOffline: () => void;
  resetOfferCountdown?: () => void;
};

export type OptimisticGoOfflineResult = {
  tapToUiMs: number;
  uiBudgetPass: boolean;
};

/**
 * Synchronously stop engagement for new rides and flip session to Offline.
 * Call this before any await / network work.
 */
export function applyOptimisticGoOffline(
  effects: OptimisticGoOfflineEffects,
): OptimisticGoOfflineResult {
  const t0 = Date.now();
  effects.clearIncomingOffer();
  effects.resetOfferCountdown?.();
  effects.confirmOffline();
  effects.disconnectOffersSocket();
  effects.stopNativeExperience();
  effects.stopNativeRideAlert();
  effects.stopOfferBackgroundAlert();
  effects.stopOfferAudio();
  effects.stopBackgroundLocation();
  effects.persistLocalOffline();
  const tapToUiMs = Date.now() - t0;
  return {
    tapToUiMs,
    uiBudgetPass: tapToUiMs < GO_OFFLINE_UI_BUDGET_MS,
  };
}

export type RestoreOnlineAfterOfflineFailureEffects = {
  confirmOnline: () => void;
  connectOffersSocket: () => void;
  fetchIncomingRide: () => void;
  startBackgroundLocation: () => void;
  persistLocalOnline: () => void;
};

/** Re-enable online engagement only after restoring confirmed online state. */
export function restoreOnlineAfterOfflineFailure(
  effects: RestoreOnlineAfterOfflineFailureEffects,
): void {
  effects.confirmOnline();
  effects.connectOffersSocket();
  effects.fetchIncomingRide();
  effects.startBackgroundLocation();
  effects.persistLocalOnline();
}
