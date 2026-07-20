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
  trialDaysRemaining: number | null;
  trialDayLimit: number | null;
  trialEmphasis: 'trips' | 'days';
  trialMessage: string;
  earlySubscribeMessage: string;
  lockedPendingApproval: boolean;
  retry: () => void;
  refresh: () => void;
  continueOffline: () => void;
};

/** Conservative defaults — never invent "approved" (that caused Activate CTA vs profile Pending). */
const DEFAULT_SNAPSHOT: Omit<DriverBootSnapshot, 'driverId' | 'savedAt'> = {
  verificationStatus: 'pending_review',
  subscriptionStatus: 'none',
  trialTripsCompleted: 0,
  trialTripsTarget: 15,
  trialExtended: false,
  onboardingCompleted: true,
};

/** Canonical verification: driver_profiles.verification_status (via onboarding-status). */
function resolveVerificationStatus(
  raw: unknown,
  opts: { completed: boolean; locked: boolean },
): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (v) return v;
  // Missing field: pending until server confirms — do not assume approved.
  if (opts.locked || !opts.completed) return 'pending_review';
  return 'pending_review';
}

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
  const [trialTripsTarget, setTrialTripsTarget] = useState(15);
  const [trialExtended, setTrialExtended] = useState(false);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null);
  const [trialDayLimit, setTrialDayLimit] = useState<number | null>(14);
  const [trialEmphasis, setTrialEmphasis] = useState<'trips' | 'days'>('trips');
  const [trialMessage, setTrialMessage] = useState('');
  const [earlySubscribeMessage, setEarlySubscribeMessage] = useState('');
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
    const tripsTarget = sub.trial_trips_target ?? 15;
    const extended = sub.trial_extended ?? false;
    const daysRemaining =
      sub.trial_days_remaining != null ? Number(sub.trial_days_remaining) : sub.days_remaining != null ? Number(sub.days_remaining) : null;
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

    // Persist the freshly-verified subscription so the next cold start shows the
    // correct state instantly (e.g. an active trial never flashes "Activate to Drive").
    // Merge with existing cache so we never clobber the verification status.
    if (driverId) {
      void (async () => {
        try {
          const prev = await readDriverBootCache(driverId);
          await writeDriverBootCache({
            driverId,
            // Never invent approved from subscription fetch — onboarding owns verification.
            verificationStatus: prev?.verificationStatus || 'pending_review',
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

      const vStatus = resolveVerificationStatus(status.verification_status, {
        completed,
        locked,
      });

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

      setVerificationStatus(vStatus);
      if (locked) setSubscriptionStatus('locked_until_approval');

      void loadSubscriptionBackground(locked, runId);

      await writeDriverBootCache({
        driverId,
        verificationStatus: vStatus,
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

      // Onboarding owns verification + locked gate; subscription loads from there
      // (or Activate). Avoid racing unlocked subscription before verification resolves.
      void fetchOnboardingBackground(runId);
    },
    [driverId, enabled, fetchOnboardingBackground, openGate, openGateWithDefaults],
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
    trialDaysRemaining,
    trialDayLimit,
    trialEmphasis,
    trialMessage,
    earlySubscribeMessage,
    lockedPendingApproval,
    retry,
    refresh,
    continueOffline,
  };
}
