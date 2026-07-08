import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PICKUP_FREE_WAIT_SECONDS,
  PICKUP_FREE_WAIT_URGENT_SEC,
} from '@/src/constants/pickupWaitPolicy';
import { formatCountdownMmSs } from '@/src/components/driver/driverDockUtils';

export type PickupWaitPhase = 'idle' | 'free' | 'billable';

export function parseTripIsoMs(raw: unknown): number {
  if (raw == null || raw === '') return NaN;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : NaN;
}

export type PickupWaitTimerState = {
  phase: PickupWaitPhase;
  totalWaitSec: number;
  freeRemainingSec: number;
  freeTotalSec: number;
  billableWaitSec: number;
  /** 0–1 ring progress through complimentary window */
  freeProgress: number;
  headline: string;
  subline: string;
  mmSs: string;
  isUrgent: boolean;
};

export function computePickupWaitState(
  arrivedAtMs: number,
  nowMs: number,
  freeTotalSec = PICKUP_FREE_WAIT_SECONDS,
): PickupWaitTimerState {
  const elapsed = Math.max(0, Math.floor((nowMs - arrivedAtMs) / 1000));
  const freeRemaining = Math.max(0, freeTotalSec - elapsed);
  const billable = Math.max(0, elapsed - freeTotalSec);
  const phase: PickupWaitPhase = freeRemaining > 0 ? 'free' : 'billable';
  const freeProgress =
    freeTotalSec > 0 ? Math.min(1, Math.max(0, elapsed / freeTotalSec)) : 1;

  if (phase === 'free') {
    const mmSs = formatCountdownMmSs(freeRemaining);
    const urgent = freeRemaining <= PICKUP_FREE_WAIT_URGENT_SEC;
    return {
      phase,
      totalWaitSec: elapsed,
      freeRemainingSec: freeRemaining,
      freeTotalSec,
      billableWaitSec: billable,
      freeProgress,
      headline: urgent ? 'Head to your driver now' : 'Complimentary wait',
      subline: urgent
        ? `${mmSs} left before extra wait time may apply`
        : `${mmSs} of free wait · share your code at the car`,
      mmSs,
      isUrgent: urgent,
    };
  }

  const mmSs = formatCountdownMmSs(billable);
  return {
    phase,
    totalWaitSec: elapsed,
    freeRemainingSec: 0,
    freeTotalSec,
    billableWaitSec: billable,
    freeProgress: 1,
    headline: 'Driver is waiting',
    subline: `Waiting ${mmSs} · extra wait time may be billed after your free window`,
    mmSs,
    isUrgent: billable >= 120,
  };
}

/**
 * Live pickup wait timer anchored on server `arrived_at` (Bolt-style free window + billable wait).
 */
export function usePickupWaitTimer(
  arrivedAtIso: string | null | undefined,
  active: boolean,
  freeTotalSec = PICKUP_FREE_WAIT_SECONDS,
): PickupWaitTimerState {
  const arrivedMs = useMemo(() => parseTripIsoMs(arrivedAtIso), [arrivedAtIso]);
  const anchorRef = useRef<{ key: string; ms: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  return useMemo(() => {
    if (!active) {
      return {
        phase: 'idle' as const,
        totalWaitSec: 0,
        freeRemainingSec: freeTotalSec,
        freeTotalSec,
        billableWaitSec: 0,
        freeProgress: 0,
        headline: '',
        subline: '',
        mmSs: formatCountdownMmSs(freeTotalSec),
        isUrgent: false,
      };
    }

    let anchorMs = arrivedMs;
    const key = arrivedAtIso || 'local';
    if (!Number.isFinite(anchorMs)) {
      if (!anchorRef.current || anchorRef.current.key !== key) {
        anchorRef.current = { key, ms: Date.now() };
      }
      anchorMs = anchorRef.current.ms;
    } else {
      anchorRef.current = { key, ms: anchorMs };
    }

    return computePickupWaitState(anchorMs, nowMs, freeTotalSec);
  }, [active, arrivedMs, arrivedAtIso, nowMs, freeTotalSec]);
}
