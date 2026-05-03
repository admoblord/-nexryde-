/**
 * useTurnByTurnNav.ts
 * Hook for real turn-by-turn navigation.
 * Calls Google Directions API ONCE per trip segment, then tracks
 * driver against steps using haversine — no repeated API calls.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import {
  NavStep,
  DirectionsResult,
  fetchDirections,
  haversineM,
  minDistToPolylineM,
  fmtDistanceVoice,
} from './navUtils';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

/** How far off the route (metres) before we refetch directions */
const OFF_ROUTE_THRESHOLD = 180;
/** Minimum metres driver must move before re-evaluating step */
const EVAL_MIN_MOVE = 8;

export interface TurnNavState {
  loading: boolean;
  currentStep: NavStep | null;
  nextStep: NavStep | null;
  /** Metres to end of current step */
  distToStep: number | null;
  /** Total metres of the whole segment route */
  totalRouteM: number;
  /** Estimated metres remaining to destination (sum of remaining steps) */
  remainingRouteM: number | null;
  /** Full-route overview polyline for MapView */
  overviewCoords: Array<{ latitude: number; longitude: number }>;
  stepIndex: number;
  totalSteps: number;
  /** Driver speed in km/h derived from consecutive GPS positions */
  speedKmh: number | null;
  muted: boolean;
  toggleMute: () => void;
}

export function useTurnByTurnNav(
  driverLat: number | null,
  driverLng: number | null,
  originLat: number | null,
  originLng: number | null,
  destLat: number | null,
  destLng: number | null,
  /** 'accepted' | 'arrived' | 'ongoing' — nav only active when accepted or ongoing */
  status: string,
): TurnNavState {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DirectionsResult | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  // Incrementing this token forces the fetch effect to re-run (off-route recalculation)
  const [recalcToken, setRecalcToken] = useState(0);

  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevPosTimeRef = useRef<number | null>(null);
  const announcedRef = useRef<Set<string>>(new Set());
  const fetchKeyRef = useRef('');
  const mutedRef = useRef(false);
  const speedKmhRef = useRef<number | null>(null);
  mutedRef.current = muted;

  const speak = useCallback((text: string) => {
    if (mutedRef.current) return;
    Speech.stop();
    Speech.speak(text, { language: 'en-NG', rate: 0.91, pitch: 1.0 });
  }, []);

  // ── Fetch directions once per segment (re-runs on recalcToken change for off-route) ──
  useEffect(() => {
    const active = status === 'accepted' || status === 'ongoing';
    if (!active || !originLat || !originLng || !destLat || !destLng || !GOOGLE_KEY) return;

    // Build a stable key; recalcToken forces a fresh fetch after off-route detection
    const key = `${status}|${originLat.toFixed(5)},${originLng.toFixed(5)}|${destLat.toFixed(5)},${destLng.toFixed(5)}|${recalcToken}`;
    if (key === fetchKeyRef.current) return;
    fetchKeyRef.current = key;

    setLoading(true);
    setStepIndex(0);
    setResult(null);
    announcedRef.current.clear();

    fetchDirections(originLat, originLng, destLat, destLng, GOOGLE_KEY)
      .then((res) => {
        setLoading(false);
        if (!res) return;
        setResult(res);
        if (recalcToken === 0) {
          const dest = status === 'accepted' ? 'pickup location' : 'destination';
          const km = (res.totalDistanceM / 1000).toFixed(1);
          speak(`Navigation started. Your ${dest} is ${km} kilometers away. Follow the route.`);
        }
      })
      .catch(() => setLoading(false));
  }, [status, originLat, originLng, destLat, destLng, speak, recalcToken]);

  // ── Track driver position, advance steps, announce ────────────────────────
  useEffect(() => {
    if (!driverLat || !driverLng || !result || result.steps.length === 0) return;

    // Skip if driver barely moved
    const now = Date.now();
    const prev = prevPosRef.current;
    const movedM = prev ? haversineM(prev.lat, prev.lng, driverLat, driverLng) : Infinity;
    if (movedM < EVAL_MIN_MOVE) return;

    // Compute live speed from GPS delta
    if (prev && prevPosTimeRef.current) {
      const elapsedSec = (now - prevPosTimeRef.current) / 1000;
      if (elapsedSec > 0.5 && elapsedSec < 30) {
        speedKmhRef.current = (movedM / elapsedSec) * 3.6;
      }
    }
    prevPosRef.current = { lat: driverLat, lng: driverLng };
    prevPosTimeRef.current = now;

    const steps = result.steps;
    let idx = stepIndex;

    // Advance step index if driver has passed the end of current step
    while (idx < steps.length - 1) {
      const step = steps[idx];
      const distToEnd = haversineM(driverLat, driverLng, step.endLat, step.endLng);
      if (distToEnd < 25) {
        idx++;
        announcedRef.current.delete(`${idx}-400`);
        announcedRef.current.delete(`${idx}-200`);
        announcedRef.current.delete(`${idx}-80`);
        announcedRef.current.delete(`${idx}-now`);
      } else {
        break;
      }
    }
    if (idx !== stepIndex) setStepIndex(idx);

    const step = steps[idx];
    const dist = haversineM(driverLat, driverLng, step.endLat, step.endLng);

    // Voice announcements at 400m / 200m / 80m / now
    const checks: Array<{ key: string; maxD: number; minD: number; msg: () => string }> = [
      {
        key: `${idx}-400`,
        maxD: 450, minD: 300,
        msg: () => `In ${fmtDistanceVoice(dist)}, ${step.instruction}`,
      },
      {
        key: `${idx}-200`,
        maxD: 230, minD: 140,
        msg: () => `In ${fmtDistanceVoice(dist)}, ${step.instruction}`,
      },
      {
        key: `${idx}-80`,
        maxD: 95, minD: 45,
        msg: () => step.instruction,
      },
      {
        key: `${idx}-now`,
        maxD: 30, minD: 0,
        msg: () => {
          // Final step — arrival
          if (idx === steps.length - 1) {
            return status === 'accepted'
              ? 'You have arrived at the pickup point.'
              : 'You have arrived at your destination.';
          }
          return `${step.instruction} now`;
        },
      },
    ];

    for (const c of checks) {
      if (dist <= c.maxD && dist >= c.minD && !announcedRef.current.has(c.key)) {
        announcedRef.current.add(c.key);
        speak(c.msg());
        break;
      }
    }

    // Off-route detection — refetch by bumping recalcToken (triggers the fetch effect)
    const allCoords = result.steps.flatMap((s) => s.stepCoords);
    const offDist = minDistToPolylineM(driverLat, driverLng, allCoords);
    if (offDist > OFF_ROUTE_THRESHOLD) {
      speak('Recalculating route.');
      setRecalcToken((t) => t + 1);
    }
  }, [driverLat, driverLng, result, stepIndex, status, speak]);

  // Reset when status changes segment
  useEffect(() => {
    setStepIndex(0);
    announcedRef.current.clear();
  }, [status]);

  const steps = result?.steps ?? [];
  const currentStep = steps[stepIndex] ?? null;
  const nextStep = steps[stepIndex + 1] ?? null;
  const distToStep =
    driverLat && driverLng && currentStep
      ? haversineM(driverLat, driverLng, currentStep.endLat, currentStep.endLng)
      : null;

  // Remaining route = distance to current step end + all subsequent steps
  const remainingRouteM =
    distToStep != null
      ? distToStep + steps.slice(stepIndex + 1).reduce((acc, s) => acc + s.distanceM, 0)
      : null;

  return {
    loading,
    currentStep,
    nextStep,
    distToStep,
    totalRouteM: result?.totalDistanceM ?? 0,
    remainingRouteM,
    overviewCoords: result?.overviewCoords ?? [],
    stepIndex,
    totalSteps: steps.length,
    speedKmh: speedKmhRef.current,
    muted,
    toggleMute: () => setMuted((v) => !v),
  };
}
