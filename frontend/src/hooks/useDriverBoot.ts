/**
 * Uber-grade driver dashboard boot — RENDER FIRST, enrich in background.
 *
 * 1. Open dashboard gate immediately (cache or safe defaults).
 * 2. All network calls run in background with 5s timeouts.
 * 3. Never block UI on subscription / onboarding fetch.
 * 4. 8s global watchdog only if gate somehow still closed.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL, getDriverSubscriptionStatus } from '@/src/services/api';
import { authedFetch } from '@/src/utils/sessionRefresh';
import {
  readDriverBootCache,
  writeDriverBootCache,
  type DriverBootSnapshot,
} from '@/src/services/driverBootCache';
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
  error: string | null;
  retrying: boolean;
  verificationStatus: string | null;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  lockedPendingApproval: boolean;
  retry: () => void;
  refresh: () => void;
  continueOffline: () => void;
};

const DEFAULT_SNAPSHOT: Omit<DriverBootSnapshot, 'driverId' | 'savedAt'> = {
  verificationStatus: 'approved',
  subscriptionStatus: 'none',
  trialTripsCompleted: 0,
  trialTripsTarget: 20,
  trialExtended: false,
  onboardingCompleted: true,
};

function applySnapshot(
  snap: Pick<
    DriverBootSnapshot,
    | 'verificationStatus'
    | 'subscriptionStatus'
    | 'trialTripsCompleted'
    | 'trialTripsTarget'
    | 'trialExtended'
  >,
  setters: {
    setVerificationStatus: (v: string) => void;
    setSubscriptionStatus: (v: string) => void;
    setTrialTripsCompleted: (n: number) => void;
    setTrialTripsTarget: (n: number) => void;
    setTrialExtended: (b: boolean) => void;
  },
) {
  setters.setVerificationStatus(snap.verificationStatus);
  setters.setSubscriptionStatus(snap.subscriptionStatus);
  setters.setTrialTripsCompleted(snap.trialTripsCompleted);
  setters.setTrialTripsTarget(snap.trialTripsTarget);
  setters.setTrialExtended(snap.trialExtended);
}

export function useDriverBoot({
  driverId,
  enabled = true,
  onRedirect,
}: UseDriverBootArgs): DriverBootState {
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [trialTripsCompleted, setTrialTripsCompleted] = useState(0);
  const [trialTripsTarget, setTrialTripsTarget] = useState(20);
  const [trialExtended, setTrialExtended] = useState(false);
  const [lockedPendingApproval, setLockedPendingApproval] = useState(false);

  const runIdRef = useRef(0);
  const gateOpenRef = useRef(false);
  const onRedirectRef = useRef(onRedirect);
  onRedirectRef.current = onRedirect;

  const openGate = useCallback((cached: boolean) => {
    if (gateOpenRef.current) return;
    gateOpenRef.current = true;
    setIsGateOpen(true);
    setFromCache(cached);
    setError(null);
    startupLog('RENDER_COMPLETE', { fromCache: cached });
  }, []);

  const openGateWithDefaults = useCallback(() => {
    applySnapshot(DEFAULT_SNAPSHOT, {
      setVerificationStatus,
      setSubscriptionStatus,
      setTrialTripsCompleted,
      setTrialTripsTarget,
      setTrialExtended,
    });
    openGate(false);
  }, [openGate]);

  const loadSubscriptionBackground = useCallback(async (locked: boolean, runId: number) => {
    startupLog('SUBSCRIPTION_VERIFY_START');
    const subRes = await timedStartupRequestOrNull(
      'driver_subscription_status',
      () => getDriverSubscriptionStatus(),
      STARTUP_REQUEST_TIMEOUT_MS,
    );
    if (runId !== runIdRef.current) return;
    if (!subRes) {
      startupLog('SUBSCRIPTION_VERIFY_FAILED', { error: 'timeout_or_fail' });
      return;
    }
    const sub = subRes.data || {};
    const status = locked ? 'locked_until_approval' : (sub.status || 'none');
    const tripsCompleted = sub.trial_trips_completed ?? 0;
    const tripsTarget = sub.trial_trips_target ?? 20;
    const extended = sub.trial_extended ?? false;
    if (!locked) setSubscriptionStatus(status);
    setTrialTripsCompleted(tripsCompleted);
    setTrialTripsTarget(tripsTarget);
    setTrialExtended(extended);
    startupLog('SUBSCRIPTION_VERIFY_END', { status });

    // Persist the freshly-verified subscription so the next cold start shows the
    // correct state instantly (e.g. an active trial never flashes "Activate to Drive").
    // Merge with existing cache so we never clobber the verification status.
    if (driverId) {
      void (async () => {
        try {
          const prev = await readDriverBootCache(driverId);
          await writeDriverBootCache({
            driverId,
            verificationStatus:
              prev?.verificationStatus || (locked ? 'pending_review' : 'approved'),
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
      if (!driverId) return;
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

      const vStatus =
        (status.verification_status as string) ||
        (completed && !locked ? 'approved' : 'pending_review');

      if (!completed) {
        setVerificationStatus(vStatus);
        const pendingReviewOnDashboard =
          step === 'documents_review' || step === 'dashboard_limited';
        if (pendingReviewOnDashboard) {
          setLockedPendingApproval(true);
          setSubscriptionStatus('locked_until_approval');
        } else {
          onRedirectRef.current?.({ step, status });
        }
        return;
      }

      setVerificationStatus(
        (status.verification_status as string) || (locked ? 'pending_review' : 'approved'),
      );
      if (locked) setSubscriptionStatus('locked_until_approval');

      void loadSubscriptionBackground(locked, runId);

      await writeDriverBootCache({
        driverId,
        verificationStatus: (status.verification_status as string) || vStatus,
        subscriptionStatus: locked ? 'locked_until_approval' : subscriptionStatus || 'none',
        trialTripsCompleted,
        trialTripsTarget,
        trialExtended,
        onboardingCompleted: true,
      });
    },
    [driverId, loadSubscriptionBackground, subscriptionStatus, trialExtended, trialTripsCompleted, trialTripsTarget],
  );

  const runBoot = useCallback(
    async (isRetry = false) => {
      const runId = ++runIdRef.current;
      setIsRefreshing(true);
      if (isRetry) setRetrying(true);
      setError(null);

      startupLog('APP_START', { driverId, retry: isRetry, mode: 'render_first' });

      if (!driverId || !enabled) {
        openGateWithDefaults();
        setIsRefreshing(false);
        setRetrying(false);
        return;
      }

      const cached = await readDriverBootCache(driverId);
      if (runId !== runIdRef.current) return;

      if (cached?.onboardingCompleted) {
        applySnapshot(cached, {
          setVerificationStatus,
          setSubscriptionStatus,
          setTrialTripsCompleted,
          setTrialTripsTarget,
          setTrialExtended,
        });
        openGate(true);
      } else {
        openGateWithDefaults();
      }

      setIsRefreshing(false);
      setRetrying(false);

      void fetchOnboardingBackground(runId);
      void loadSubscriptionBackground(false, runId);
    },
    [driverId, enabled, fetchOnboardingBackground, loadSubscriptionBackground, openGate, openGateWithDefaults],
  );

  useEffect(() => {
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
    };
  }, [driverId, enabled, runBoot, openGateWithDefaults]);

  const retry = useCallback(() => {
    gateOpenRef.current = false;
    setIsGateOpen(false);
    void runBoot(true);
  }, [runBoot]);

  const refresh = useCallback(() => {
    void fetchOnboardingBackground(++runIdRef.current);
  }, [fetchOnboardingBackground]);

  const continueOffline = useCallback(() => {
    openGateWithDefaults();
    setError(null);
  }, [openGateWithDefaults]);

  return {
    isGateOpen,
    isRefreshing,
    fromCache,
    error,
    retrying,
    verificationStatus,
    subscriptionStatus,
    trialTripsCompleted,
    trialTripsTarget,
    trialExtended,
    lockedPendingApproval,
    retry,
    refresh,
    continueOffline,
  };
}
