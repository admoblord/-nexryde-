/**
 * Bolt/Uber-grade driver boot — DISPLAY from local fact, AUTHORIZE at go-online.
 *
 * Once approved locally, the dashboard never blocks on "Checking your account".
 * Background sync may silently apply hard downgrades (suspended/rejected).
 * Go-online still awaits server confirmation at tap time.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL, getDriverProfile, getDriverSubscriptionStatus } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import {
  peekDriverBootCache,
  readDriverBootCache,
  writeDriverBootCache,
  type DriverBootSnapshot,
} from '@/src/services/driverBootCache';
import {
  readDriverVerificationFact,
  writeDriverVerificationFact,
} from '@/src/services/driverVerificationFact';
import { useDriverDisplayStore } from '@/src/store/driverDisplayStore';
import {
  STARTUP_GLOBAL_WATCHDOG_MS,
  STARTUP_REQUEST_TIMEOUT_MS,
} from '@/src/constants/startupPolicy';
import { timedStartupRequestOrNull } from '@/src/utils/startupRequestLog';
import { startupLog } from '@/src/utils/driverStartupTrace';

export type DriverOnboardingStep =
  | 'terms'
  | 'documents'
  | 'documents_rejected'
  | 'documents_review'
  | 'profile'
  | 'approved'
  | 'dashboard_limited'
  | 'error'
  | 'not_found'
  | string;

export type DriverBootRedirect = {
  step: DriverOnboardingStep;
  status: Record<string, unknown>;
};

type UseDriverBootArgs = {
  driverId: string | undefined;
  enabled?: boolean;
  onRedirect?: (redirect: DriverBootRedirect) => void;
};

export type DriverBootState = {
  isGateOpen: boolean;
  isRefreshing: boolean;
  fromCache: boolean;
  /** True once onboarding-status (or equivalent) has answered for this session. */
  verificationConfirmedByServer: boolean;
  error: string | null;
  retrying: boolean;
  verificationStatus: string | null;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  trialDaysRemaining: number | null;
  trialDayLimit: number | null;
  trialEmphasis: 'trips' | 'days';
  trialMessage: string;
  earlySubscribeMessage: string;
  lockedPendingApproval: boolean;
  retry: () => void;
  refresh: () => void;
  /** Await background onboarding refresh (for go-online gate). Returns latest status. */
  refreshAndWait: (timeoutMs?: number) => Promise<{ ok: boolean; verificationStatus: string | null }>;
  continueOffline: () => void;
};

/** Canonical verification: driver_profiles.verification_status (via onboarding-status). */
function resolveVerificationStatus(
  raw: unknown,
  opts: { completed: boolean; locked: boolean },
): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v) return v;
  // Incomplete onboarding without a server status = docs not submitted (not "under review").
  if (!opts.completed) return 'not_submitted';
  if (opts.locked) return 'pending_review';
  return 'pending_review';
}

function syncDisplayStore(
  driverId: string,
  snap: {
    verificationStatus?: string | null;
    subscriptionStatus?: string | null;
    trialTripsCompleted?: number;
    trialTripsTarget?: number;
    trialExtended?: boolean;
    displayHydrated?: boolean;
  },
) {
  useDriverDisplayStore.getState().setDriverDisplay({
    driverId,
    ...snap,
  });
}

export function useDriverBoot({
  driverId,
  enabled = true,
  onRedirect,
}: UseDriverBootArgs): DriverBootState {
  const peeked = driverId ? peekDriverBootCache(driverId) : null;
  const [isGateOpen, setIsGateOpen] = useState(Boolean(peeked));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(Boolean(peeked));
  const [verificationConfirmedByServer, setVerificationConfirmedByServer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(
    peeked?.verificationStatus ?? null,
  );
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    peeked?.subscriptionStatus ?? null,
  );
  const [trialTripsCompleted, setTrialTripsCompleted] = useState(peeked?.trialTripsCompleted ?? 0);
  const [trialTripsTarget, setTrialTripsTarget] = useState(peeked?.trialTripsTarget ?? 15);
  const [trialExtended, setTrialExtended] = useState(peeked?.trialExtended ?? false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [trialDayLimit, setTrialDayLimit] = useState<number | null>(14);
  const [trialEmphasis, setTrialEmphasis] = useState<'trips' | 'days'>('trips');
  const [trialMessage, setTrialMessage] = useState('');
  const [earlySubscribeMessage, setEarlySubscribeMessage] = useState('');
  const [lockedPendingApproval, setLockedPendingApproval] = useState(false);

  const runIdRef = useRef(0);
  const gateOpenRef = useRef(Boolean(peeked));
  const onRedirectRef = useRef(onRedirect);
  onRedirectRef.current = onRedirect;
  const verificationStatusRef = useRef<string | null>(verificationStatus);
  const subscriptionStatusRef = useRef<string | null>(subscriptionStatus);
  const trialTripsCompletedRef = useRef(trialTripsCompleted);
  const trialTripsTargetRef = useRef(trialTripsTarget);
  const trialExtendedRef = useRef(trialExtended);
  const serverConfirmedRef = useRef(false);
  const refreshWaitersRef = useRef<Array<(ok: boolean) => void>>([]);
  /** Guards against double subscription fetches within a single boot run. */
  const subscriptionLoadStartedRef = useRef(false);

  verificationStatusRef.current = verificationStatus;
  subscriptionStatusRef.current = subscriptionStatus;
  trialTripsCompletedRef.current = trialTripsCompleted;
  trialTripsTargetRef.current = trialTripsTarget;
  trialExtendedRef.current = trialExtended;
  serverConfirmedRef.current = verificationConfirmedByServer;

  const resolveRefreshWaiters = useCallback((ok: boolean) => {
    const waiters = refreshWaitersRef.current;
    refreshWaitersRef.current = [];
    waiters.forEach((w) => w(ok));
  }, []);

  const applyLocalSnapshot = useCallback(
    (snap: DriverBootSnapshot, cached: boolean) => {
      setVerificationStatus(snap.verificationStatus);
      setSubscriptionStatus(snap.subscriptionStatus);
      setTrialTripsCompleted(snap.trialTripsCompleted);
      setTrialTripsTarget(snap.trialTripsTarget);
      setTrialExtended(snap.trialExtended);
      if (driverId) {
        syncDisplayStore(driverId, {
          verificationStatus: snap.verificationStatus,
          subscriptionStatus: snap.subscriptionStatus,
          trialTripsCompleted: snap.trialTripsCompleted,
          trialTripsTarget: snap.trialTripsTarget,
          trialExtended: snap.trialExtended,
          displayHydrated: true,
        });
      }
      if (!gateOpenRef.current) {
        gateOpenRef.current = true;
        setIsGateOpen(true);
        setFromCache(cached);
        setError(null);
        startupLog('RENDER_COMPLETE', { fromCache: cached, verificationStatus: snap.verificationStatus });
      } else {
        setFromCache(cached);
      }
    },
    [driverId],
  );

  const openGateWithDefaults = useCallback(() => {
    if (gateOpenRef.current) return;
    gateOpenRef.current = true;
    setIsGateOpen(true);
    setFromCache(false);
    setError(null);
    // Do NOT mark displayHydrated without a known status — that used to flash
    // "Checking your account…" forever when profile sync was slow/offline.
    startupLog('RENDER_COMPLETE', { fromCache: false, verificationStatus: null });
  }, []);

  const loadSubscriptionBackground = useCallback(async (locked: boolean, runId: number) => {
    if (runId !== runIdRef.current) return;
    // One in-flight trial/subscription fetch at a time. Failures clear the latch
    // so a later hydrate/retry path can recover without an app restart.
    if (subscriptionLoadStartedRef.current) return;
    subscriptionLoadStartedRef.current = true;
    startupLog('SUBSCRIPTION_VERIFY_START');

    const attemptFetch = async (attempt: number) => {
      const subRes = await timedStartupRequestOrNull(
        'driver_subscription_status',
        () => getDriverSubscriptionStatus(),
        STARTUP_REQUEST_TIMEOUT_MS,
      );
      if (runId !== runIdRef.current) return null;
      if (subRes) return subRes;
      if (attempt < 2) {
        startupLog('SUBSCRIPTION_VERIFY_RETRY', { attempt, error: 'timeout_or_fail' });
        await new Promise((r) => setTimeout(r, 1500));
        if (runId !== runIdRef.current) return null;
        return attemptFetch(attempt + 1);
      }
      return null;
    };

    const subRes = await attemptFetch(1);
    if (runId !== runIdRef.current) return;
    if (!subRes) {
      // Allow a later boot path / pull-to-retry to try again.
      subscriptionLoadStartedRef.current = false;
      startupLog('SUBSCRIPTION_VERIFY_FAILED', { error: 'timeout_or_fail' });
      return;
    }
    const sub = subRes.data || {};
    const status = locked ? 'locked_until_approval' : (sub.status || 'none');
    const tripsCompleted = sub.trial_trips_completed ?? 0;
    const tripsTarget = sub.trial_trips_target ?? 15;
    const extended = sub.trial_extended ?? false;
    const daysRemaining =
      sub.trial_days_remaining != null
        ? Number(sub.trial_days_remaining)
        : sub.days_remaining != null
          ? Number(sub.days_remaining)
          : null;
    const dayLimit = sub.trial_day_limit != null ? Number(sub.trial_day_limit) : null;
    const emphasis = sub.trial_emphasis === 'days' ? 'days' : 'trips';
    if (!locked) setSubscriptionStatus(status);
    setTrialTripsCompleted(tripsCompleted);
    setTrialTripsTarget(tripsTarget);
    setTrialExtended(extended);
    setTrialDaysRemaining(daysRemaining);
    setTrialDayLimit(dayLimit);
    setTrialEmphasis(emphasis);
    setTrialMessage(String(sub.trial_message ?? ''));
    setEarlySubscribeMessage(String(sub.early_subscribe_message ?? ''));
    startupLog('SUBSCRIPTION_VERIFY_END', { status });

    if (driverId) {
      syncDisplayStore(driverId, {
        subscriptionStatus: status,
        trialTripsCompleted: tripsCompleted,
        trialTripsTarget: tripsTarget,
        trialExtended: extended,
      });
      void (async () => {
        try {
          const prev = await readDriverBootCache(driverId);
          const keepVerification =
            verificationStatusRef.current === 'approved' || prev?.verificationStatus === 'approved'
              ? 'approved'
              : prev?.verificationStatus || verificationStatusRef.current || 'pending_review';
          await writeDriverBootCache({
            driverId,
            verificationStatus: keepVerification,
            subscriptionStatus: status,
            trialTripsCompleted: tripsCompleted,
            trialTripsTarget: tripsTarget,
            trialExtended: extended,
            onboardingCompleted: prev?.onboardingCompleted ?? true,
          });
        } catch {
          /* non-fatal */
        }
      })();
    }
  }, [driverId]);

  const fetchOnboardingBackground = useCallback(
    async (runId: number) => {
      if (!driverId) {
        resolveRefreshWaiters(false);
        return;
      }
      startupLog('PROFILE_FETCH_START', { source: 'useDriverBoot_background' });

      const response = await timedStartupRequestOrNull(
        'driver_onboarding_status',
        async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), STARTUP_REQUEST_TIMEOUT_MS);
          try {
            return await authedFetch(`${BACKEND_URL}/api/drivers/${driverId}/onboarding-status`, {
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timer);
          }
        },
        STARTUP_REQUEST_TIMEOUT_MS,
      );

      if (runId !== runIdRef.current) return;
      if (!response || !response.ok) {
        startupLog('PROFILE_FETCH_FAILED', {
          source: 'useDriverBoot_background',
          status: response?.status,
        });
        // Keep local approved display — do not fall back to Checking.
        resolveRefreshWaiters(false);
        return;
      }

      const status = (await response.json()) as Record<string, unknown>;
      startupLog('PROFILE_FETCH_END', {
        source: 'useDriverBoot_background',
        step: status.step,
        completed: status.completed,
      });

      const completed = status.completed === true;
      const step = String(status.step || '');
      const locked = completed && status.can_go_online === false;
      setLockedPendingApproval(locked);

      const vStatus = resolveVerificationStatus(status.verification_status, {
        completed,
        locked,
      });

      setVerificationConfirmedByServer(true);
      serverConfirmedRef.current = true;

      const wasLocallyApproved = verificationStatusRef.current === 'approved';
      // Server answered — update display (including rare downgrades). Never blocked the UI waiting.
      setVerificationStatus(vStatus);
      syncDisplayStore(driverId, { verificationStatus: vStatus });
      await writeDriverVerificationFact(driverId, vStatus);

      if (!completed) {
        const pendingReviewOnDashboard =
          step === 'documents_review' || step === 'dashboard_limited';
        if (pendingReviewOnDashboard) {
          setLockedPendingApproval(true);
          setSubscriptionStatus('locked_until_approval');
          syncDisplayStore(driverId, { subscriptionStatus: 'locked_until_approval' });
        } else {
          // Docs / profile / terms incomplete — never keep them on Home.
          // Clear poisoned "onboarded" cache from older clients that marked every tab visit complete.
          void import('@/src/utils/sessionRouting').then(({ clearDriverOnboardingCached }) =>
            clearDriverOnboardingCached(driverId),
          );
          // Only skip redirect for a known-approved local fact + unexpected non-docs step
          // (protects against flaky mid-session payloads). Always redirect for documents.
          const mustLeaveHome =
            step === 'documents' ||
            step === 'profile' ||
            step === 'terms' ||
            step === 'documents_rejected' ||
            !wasLocallyApproved;
          if (mustLeaveHome) {
            onRedirectRef.current?.({ step, status });
          }
        }
        resolveRefreshWaiters(true);
        return;
      }

      if (locked) {
        setSubscriptionStatus('locked_until_approval');
        syncDisplayStore(driverId, { subscriptionStatus: 'locked_until_approval' });
      }

      void loadSubscriptionBackground(locked, runId);

      await writeDriverBootCache({
        driverId,
        verificationStatus: vStatus,
        subscriptionStatus: locked
          ? 'locked_until_approval'
          : subscriptionStatusRef.current || 'none',
        trialTripsCompleted: trialTripsCompletedRef.current,
        trialTripsTarget: trialTripsTargetRef.current,
        trialExtended: trialExtendedRef.current,
        onboardingCompleted: true,
      });
      resolveRefreshWaiters(true);
    },
    [driverId, loadSubscriptionBackground, resolveRefreshWaiters],
  );

  /**
   * Boot-level verification populator — runs the SAME fetch the Profile screen uses
   * (GET /api/drivers/{id}/profile) and writes verification into the shared display
   * store, durable fact, and boot cache. This guarantees Home is correct WITHOUT the
   * user ever visiting Profile, and does not depend on onboarding-status succeeding.
   * Runs in parallel with fetchOnboardingBackground; whichever answers first wins.
   */
  const hydrateVerificationFromProfile = useCallback(
    async (runId: number) => {
      if (!driverId) return;
      startupLog('PROFILE_FETCH_START', { source: 'useDriverBoot_profile' });
      const res = await timedStartupRequestOrNull(
        'driver_profile',
        () => getDriverProfile(driverId),
        STARTUP_REQUEST_TIMEOUT_MS,
      );
      if (runId !== runIdRef.current) return;
      if (!res) {
        startupLog('PROFILE_FETCH_FAILED', { source: 'useDriverBoot_profile' });
        return;
      }
      const p = (res.data || {}) as Record<string, unknown>;
      const vStatus = typeof p.verification_status === 'string' ? p.verification_status.trim() : '';
      if (!vStatus) return;

      startupLog('PROFILE_FETCH_END', { source: 'useDriverBoot_profile', verificationStatus: vStatus });
      setVerificationStatus(vStatus);
      syncDisplayStore(driverId, { verificationStatus: vStatus, displayHydrated: true });
      await writeDriverVerificationFact(driverId, vStatus);

      // Open the gate with real status if nothing painted it yet (no cache path).
      if (!gateOpenRef.current) {
        gateOpenRef.current = true;
        setIsGateOpen(true);
        setFromCache(false);
        setError(null);
        startupLog('RENDER_COMPLETE', { fromCache: false, verificationStatus: vStatus });
      }

      // Persist verification into the boot cache WITHOUT clobbering last-known trial counts.
      try {
        const prev = await readDriverBootCache(driverId);
        await writeDriverBootCache({
          driverId,
          verificationStatus: vStatus,
          subscriptionStatus: prev?.subscriptionStatus || subscriptionStatusRef.current || 'trial',
          trialTripsCompleted: prev?.trialTripsCompleted ?? trialTripsCompletedRef.current,
          trialTripsTarget: prev?.trialTripsTarget ?? trialTripsTargetRef.current,
          trialExtended: prev?.trialExtended ?? trialExtendedRef.current,
          onboardingCompleted: prev?.onboardingCompleted ?? true,
        });
      } catch {
        /* non-fatal */
      }

      // Approved drivers: refresh the real trial snapshot now — do not wait on
      // onboarding-status, which is the endpoint that was hanging.
      if (vStatus === 'approved') {
        void loadSubscriptionBackground(false, runId);
      }
    },
    [driverId, loadSubscriptionBackground],
  );

  const runBoot = useCallback(
    async (isRetry = false) => {
      const runId = ++runIdRef.current;
      setIsRefreshing(true);
      if (isRetry) setRetrying(true);
      setError(null);
      // Do NOT clear display verification — only entitlement confirmation resets.
      setVerificationConfirmedByServer(false);
      serverConfirmedRef.current = false;
      subscriptionLoadStartedRef.current = false;

      startupLog('APP_START', { driverId, retry: isRetry, mode: 'local_fact_first' });

      if (!driverId || !enabled) {
        openGateWithDefaults();
        setIsRefreshing(false);
        setRetrying(false);
        return;
      }

      // Sync first paint from memory/fact (no await).
      const peekedSnap = peekDriverBootCache(driverId);
      if (peekedSnap?.verificationStatus) {
        applyLocalSnapshot(peekedSnap, true);
      }

      const cached = await readDriverBootCache(driverId);
      if (runId !== runIdRef.current) return;

      if (cached?.verificationStatus) {
        // Approved (or any known status) paints instantly — do not require onboardingCompleted.
        applyLocalSnapshot(cached, true);
        // Persisted-first trial: refresh the real snapshot in the background so the
        // banner shows server truth (e.g. loopy's grandfathered 20-trip config), while
        // the cached count renders instantly and is NEVER replaced by a 0/fresh default.
        if (cached.verificationStatus === 'approved') {
          void loadSubscriptionBackground(false, runId);
        }
      } else if (!gateOpenRef.current) {
        // No local fact yet — open the shell without a Checking latch. Profile/onboarding
        // hydrate in background; Home shows the map + online switch (tap validates).
        openGateWithDefaults();
      }

      setIsRefreshing(false);
      setRetrying(false);

      // Populate the shared store from the SAME endpoint Profile uses AND the
      // onboarding-status endpoint (for redirect/step logic), in parallel. Home is
      // correct without ever visiting Profile; a hang on one never blocks the other.
      void hydrateVerificationFromProfile(runId);
      void fetchOnboardingBackground(runId);
    },
    [
      driverId,
      enabled,
      fetchOnboardingBackground,
      hydrateVerificationFromProfile,
      loadSubscriptionBackground,
      applyLocalSnapshot,
      openGateWithDefaults,
    ],
  );

  useEffect(() => {
    if (driverId && peeked?.verificationStatus) {
      syncDisplayStore(driverId, {
        verificationStatus: peeked.verificationStatus,
        subscriptionStatus: peeked.subscriptionStatus,
        trialTripsCompleted: peeked.trialTripsCompleted,
        trialTripsTarget: peeked.trialTripsTarget,
        trialExtended: peeked.trialExtended,
        displayHydrated: true,
      });
    }
    // Durable fact may live only in AsyncStorage after process death — warm it
    // before network so approved drivers never paint a Checking latch.
    if (driverId) {
      void readDriverVerificationFact(driverId).then((fact) => {
        if (!fact?.verificationStatus) return;
        if (verificationStatusRef.current === 'approved') return;
        if (
          fact.verificationStatus === 'approved' ||
          verificationStatusRef.current == null
        ) {
          setVerificationStatus(fact.verificationStatus);
          syncDisplayStore(driverId, {
            verificationStatus: fact.verificationStatus,
            displayHydrated: true,
            ...(fact.verificationStatus === 'approved'
              ? { subscriptionStatus: subscriptionStatusRef.current || 'trial' }
              : {}),
          });
        }
      });
    }
    void runBoot(false);
    const watchdog = setTimeout(() => {
      if (!gateOpenRef.current) {
        startupLog('STARTUP_TIMEOUT', { afterMs: STARTUP_GLOBAL_WATCHDOG_MS, phase: 'boot_gate' });
        openGateWithDefaults();
        setError('Some data could not sync. Dashboard loaded with cached defaults.');
      }
    }, STARTUP_GLOBAL_WATCHDOG_MS);

    return () => {
      runIdRef.current += 1;
      clearTimeout(watchdog);
      resolveRefreshWaiters(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once per driver/enabled
  }, [driverId, enabled]);

  const retry = useCallback(() => {
    // Keep local approved visible while retrying network.
    void runBoot(true);
  }, [runBoot]);

  const refresh = useCallback(() => {
    void fetchOnboardingBackground(++runIdRef.current);
  }, [fetchOnboardingBackground]);

  const refreshAndWait = useCallback(
    async (timeoutMs = 6000): Promise<{ ok: boolean; verificationStatus: string | null }> => {
      if (serverConfirmedRef.current) {
        return { ok: true, verificationStatus: verificationStatusRef.current };
      }
      return new Promise((resolve) => {
        const finish = (ok: boolean) => {
          resolve({
            ok: ok || serverConfirmedRef.current,
            verificationStatus: verificationStatusRef.current,
          });
        };
        const timer = setTimeout(() => {
          resolveRefreshWaiters(false);
          finish(serverConfirmedRef.current);
        }, timeoutMs);
        refreshWaitersRef.current.push((ok) => {
          clearTimeout(timer);
          finish(ok);
        });
        void fetchOnboardingBackground(++runIdRef.current);
      });
    },
    [fetchOnboardingBackground, resolveRefreshWaiters],
  );

  const continueOffline = useCallback(() => {
    openGateWithDefaults();
    setError(null);
  }, [openGateWithDefaults]);

  return {
    isGateOpen,
    isRefreshing,
    fromCache,
    verificationConfirmedByServer,
    error,
    retrying,
    verificationStatus,
    subscriptionStatus,
    trialTripsCompleted,
    trialTripsTarget,
    trialExtended,
    trialDaysRemaining,
    trialDayLimit,
    trialEmphasis,
    trialMessage,
    earlySubscribeMessage,
    lockedPendingApproval,
    retry,
    refresh,
    refreshAndWait,
    continueOffline,
  };
}
