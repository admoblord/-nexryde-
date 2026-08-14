/**
 * Pure hydrate decision for driver online state.
 *
 * Kept free of React / fetch so we can execute the loopy9ice bounce cases
 * without a phone. driver-home must call this and only PUT is_online=false
 * when the action is `put_offline`.
 */

export type HydratePhase = 'offline' | 'connecting' | 'reconnecting' | 'confirmed';

export type HydrateDecision = {
  action:
    | 'skip'
    | 'put_offline'
    | 'restore_online'
    | 'keep_local_offline_leave_server'
    | 'force_local_offline'
    | 'mark_reconnecting'
    | 'sync';
  reason: string;
  /** True only when hydrate is allowed to PUT /online?is_online=false. */
  putServerOffline: boolean;
};

export type HydrateInput = {
  serverOnline: boolean;
  localPhase: HydratePhase;
  platform: 'android' | 'ios' | 'web';
  toggleInFlight: boolean;
  commitInFlight: boolean;
  stale: boolean;
  desiredOffline: boolean;
  hasLiveTrip: boolean;
  resumeRecentShift: boolean;
};

export function decideHydrateOnlineAction(input: HydrateInput): HydrateDecision {
  if (input.toggleInFlight || input.commitInFlight || input.stale) {
    return { action: 'skip', reason: 'stale_or_commit_inflight', putServerOffline: false };
  }
  if (input.localPhase === 'connecting') {
    return { action: 'skip', reason: 'connecting', putServerOffline: false };
  }

  if (input.serverOnline && input.localPhase === 'offline') {
    if (input.desiredOffline) {
      return { action: 'put_offline', reason: 'desired_offline', putServerOffline: true };
    }
    if (input.platform === 'android') {
      if (input.hasLiveTrip) {
        return { action: 'restore_online', reason: 'android_active_trip', putServerOffline: false };
      }
      if (input.resumeRecentShift) {
        return {
          action: 'restore_online',
          reason: 'android_resume_recent_shift',
          putServerOffline: false,
        };
      }
      return {
        action: 'keep_local_offline_leave_server',
        reason: 'android_require_go_online',
        putServerOffline: false,
      };
    }
    return { action: 'restore_online', reason: 'hydrate_restore_online', putServerOffline: false };
  }

  if (!input.serverOnline && (input.localPhase === 'confirmed' || input.localPhase === 'reconnecting')) {
    if (input.hasLiveTrip) {
      return { action: 'mark_reconnecting', reason: 'active_trip', putServerOffline: false };
    }
    return { action: 'force_local_offline', reason: 'hydrate_force_offline', putServerOffline: false };
  }

  if (
    input.serverOnline &&
    input.platform === 'android' &&
    input.localPhase !== 'confirmed' &&
    input.localPhase !== 'reconnecting'
  ) {
    return {
      action: 'keep_local_offline_leave_server',
      reason: 'android_require_go_online',
      putServerOffline: false,
    };
  }

  return { action: 'sync', reason: 'hydrate_sync', putServerOffline: false };
}

export function shouldResumeRecentShift(opts: {
  persistedOnline: boolean;
  savedAt: number | null | undefined;
  nowMs?: number;
  maxAgeMs?: number;
}): boolean {
  const maxAgeMs = opts.maxAgeMs ?? 15 * 60 * 1000;
  const nowMs = opts.nowMs ?? Date.now();
  return (
    Boolean(opts.persistedOnline) &&
    typeof opts.savedAt === 'number' &&
    nowMs - opts.savedAt < maxAgeMs
  );
}
