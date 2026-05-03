/**
 * useTurnByTurnNav.ts
 * Intelligent turn-by-turn voice navigation hook.
 *
 * Key behaviours:
 *  - Google Directions fetched ONCE per trip segment (no polling cost)
 *  - Speed-adaptive announcement distances: fast road → announce earlier
 *  - Natural sentence assembly (lowercase mid-sentence, "then" previews)
 *  - Post-step announcement includes the next maneuver when step is short
 *  - Off-route cooldown: 15 s minimum between recalculations (no spam)
 *  - ETA milestones: announces "About X minutes" at 5 km and 2 km remaining
 *  - First maneuver spoken immediately after route loads
 *  - New route first step announced after recalculation
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import {
  type NavStep,
  type DirectionsResult,
  fetchDirections,
  haversineM,
  minDistToPolylineM,
  fmtDistanceVoice,
} from './navUtils';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const OFF_ROUTE_THRESHOLD = 180;    // metres off route before recalculating
const OFF_ROUTE_COOLDOWN_MS = 15000; // min 15 s between recalculations
const EVAL_MIN_MOVE = 8;             // skip re-evaluation if moved < 8 m

// ── Speed-adaptive announcement thresholds ──────────────────────────────────
//  Tier  Speed       Distances (far → near → now)
//  fast  > 65 km/h   600 m / 300 m / 120 m / 40 m
//  med   > 35 km/h   450 m / 220 m /  90 m / 30 m
//  slow  ≤ 35 km/h   300 m / 150 m /  60 m / 20 m
interface Band { key: string; maxD: number; minD: number; isFinal: boolean }

function getBands(speedKmh: number | null, stepIdx: number): Band[] {
  const fast = speedKmh != null && speedKmh > 65;
  const med  = speedKmh != null && speedKmh > 35;
  const i = stepIdx;
  if (fast) return [
    { key: `${i}-far`,  maxD: 660, minD: 490, isFinal: false },
    { key: `${i}-mid`,  maxD: 330, minD: 240, isFinal: false },
    { key: `${i}-near`, maxD: 140, minD: 85,  isFinal: false },
    { key: `${i}-now`,  maxD: 50,  minD: 0,   isFinal: true  },
  ];
  if (med) return [
    { key: `${i}-far`,  maxD: 480, minD: 340, isFinal: false },
    { key: `${i}-mid`,  maxD: 250, minD: 170, isFinal: false },
    { key: `${i}-near`, maxD: 105, minD: 60,  isFinal: false },
    { key: `${i}-now`,  maxD: 35,  minD: 0,   isFinal: true  },
  ];
  return [
    { key: `${i}-far`,  maxD: 340, minD: 230, isFinal: false },
    { key: `${i}-mid`,  maxD: 170, minD: 105, isFinal: false },
    { key: `${i}-near`, maxD: 75,  minD: 40,  isFinal: true  },
    { key: `${i}-now`,  maxD: 22,  minD: 0,   isFinal: true  },
  ];
}

// ── Natural sentence helpers ─────────────────────────────────────────────────
/** Lowercase first letter — used when instruction follows "In X meters, …" */
function lc(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Build a "then X" suffix when the next step is short enough to preview.
 * e.g. "turn left, then in 80 meters, turn right"
 */
function thenSuffix(next: NavStep | undefined): string {
  if (!next) return '';
  if (next.distanceM < 50) return `, then immediately ${lc(next.instruction)}`;
  if (next.distanceM < 200) return `, then in ${fmtDistanceVoice(next.distanceM)}, ${lc(next.instruction)}`;
  return '';
}

// ── ETA from speed or fixed average ─────────────────────────────────────────
function etaMin(metres: number, speedKmh: number | null): number {
  const kmh = speedKmh && speedKmh > 5 ? speedKmh : 28; // default 28 km/h urban
  return Math.round((metres / 1000 / kmh) * 60);
}

// ── Export interface ─────────────────────────────────────────────────────────
export interface TurnNavState {
  loading: boolean;
  currentStep: NavStep | null;
  nextStep: NavStep | null;
  distToStep: number | null;
  totalRouteM: number;
  remainingRouteM: number | null;
  overviewCoords: Array<{ latitude: number; longitude: number }>;
  stepIndex: number;
  totalSteps: number;
  speedKmh: number | null;
  muted: boolean;
  toggleMute: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function useTurnByTurnNav(
  driverLat: number | null,
  driverLng: number | null,
  originLat: number | null,
  originLng: number | null,
  destLat: number | null,
  destLng: number | null,
  status: string,
): TurnNavState {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DirectionsResult | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [recalcToken, setRecalcToken] = useState(0);

  const prevPosRef        = useRef<{ lat: number; lng: number } | null>(null);
  const prevPosTimeRef    = useRef<number | null>(null);
  const announcedRef      = useRef<Set<string>>(new Set());
  const fetchKeyRef       = useRef('');
  const mutedRef          = useRef(false);
  const speedKmhRef       = useRef<number | null>(null);
  const lastOffRouteRef   = useRef<number>(0);
  const etaMilestonesRef  = useRef<Set<string>>(new Set());
  mutedRef.current = muted;

  // ── speak ────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (mutedRef.current) return;
    Speech.stop();
    Speech.speak(text, { language: 'en-NG', rate: 0.92, pitch: 1.05 });
  }, []);

  // ── Fetch directions once per segment ────────────────────────────────────
  useEffect(() => {
    const active = status === 'accepted' || status === 'ongoing';
    if (!active || !originLat || !originLng || !destLat || !destLng || !GOOGLE_KEY) return;

    const key = `${status}|${originLat.toFixed(5)},${originLng.toFixed(5)}|${destLat.toFixed(5)},${destLng.toFixed(5)}|${recalcToken}`;
    if (key === fetchKeyRef.current) return;
    fetchKeyRef.current = key;

    setLoading(true);
    setStepIndex(0);
    setResult(null);
    announcedRef.current.clear();
    etaMilestonesRef.current.clear();

    fetchDirections(originLat, originLng, destLat, destLng, GOOGLE_KEY)
      .then((res) => {
        setLoading(false);
        if (!res || res.steps.length === 0) return;
        setResult(res);

        const dest = status === 'accepted' ? 'pickup location' : 'destination';
        const firstStep = res.steps[0];
        const km = (res.totalDistanceM / 1000).toFixed(1);
        const mins = etaMin(res.totalDistanceM, speedKmhRef.current);

        if (recalcToken === 0) {
          // Initial announcement: distance + first turn
          const firstTurn = firstStep.distanceM > 30
            ? ` In ${fmtDistanceVoice(firstStep.distanceM)}, ${lc(firstStep.instruction)}.`
            : ` ${firstStep.instruction}.`;
          speak(
            `Navigation started. Your ${dest} is ${km} kilometers away, about ${mins} minutes.${firstTurn}`
          );
        } else {
          // Recalculation: announce new first step
          const firstTurn = firstStep.distanceM > 30
            ? `In ${fmtDistanceVoice(firstStep.distanceM)}, ${lc(firstStep.instruction)}.`
            : firstStep.instruction;
          speak(`Route updated. ${firstTurn}`);
        }
      })
      .catch(() => setLoading(false));
  }, [status, originLat, originLng, destLat, destLng, speak, recalcToken]);

  // ── Track position, advance steps, announce ──────────────────────────────
  useEffect(() => {
    if (!driverLat || !driverLng || !result || result.steps.length === 0) return;

    const now = Date.now();
    const prev = prevPosRef.current;
    const movedM = prev ? haversineM(prev.lat, prev.lng, driverLat, driverLng) : Infinity;
    if (movedM < EVAL_MIN_MOVE) return;

    // ── Compute live speed ──────────────────────────────────────────────────
    if (prev && prevPosTimeRef.current) {
      const elapsed = (now - prevPosTimeRef.current) / 1000;
      if (elapsed > 0.5 && elapsed < 30) {
        speedKmhRef.current = (movedM / elapsed) * 3.6;
      }
    }
    prevPosRef.current = { lat: driverLat, lng: driverLng };
    prevPosTimeRef.current = now;

    const steps = result.steps;
    let idx = stepIndex;

    // ── Advance step index ──────────────────────────────────────────────────
    let didAdvance = false;
    while (idx < steps.length - 1) {
      const distToEnd = haversineM(driverLat, driverLng, steps[idx].endLat, steps[idx].endLng);
      if (distToEnd < 25) {
        idx++;
        // Clear all announcement keys for the new step
        const b = getBands(speedKmhRef.current, idx);
        b.forEach((band) => announcedRef.current.delete(band.key));
        didAdvance = true;
      } else {
        break;
      }
    }
    if (idx !== stepIndex) setStepIndex(idx);

    const step = steps[idx];
    const dist = haversineM(driverLat, driverLng, step.endLat, step.endLng);
    const nextStep = steps[idx + 1];
    const isFinalStep = idx === steps.length - 1;

    // ── Post-step-advance announcement ─────────────────────────────────────
    if (didAdvance && idx < steps.length) {
      const advKey = `advance-${idx}`;
      if (!announcedRef.current.has(advKey)) {
        announcedRef.current.add(advKey);
        if (isFinalStep) {
          // Will be caught by the "now" band below
        } else if (step.distanceM < 150) {
          // Very short step — speak it immediately with "then" preview
          speak(`${step.instruction}${thenSuffix(nextStep)}`);
        } else if (step.distanceM < 400 && nextStep) {
          // Medium step — tell driver what's coming soon
          speak(`Continue for ${fmtDistanceVoice(step.distanceM)}, then ${lc(nextStep.instruction)}.`);
        }
        // Long steps don't need an immediate announce — distance bands will handle it
      }
    }

    // ── Distance-band announcements ─────────────────────────────────────────
    const bands = getBands(speedKmhRef.current, idx);
    for (const band of bands) {
      if (dist <= band.maxD && dist >= band.minD && !announcedRef.current.has(band.key)) {
        announcedRef.current.add(band.key);

        let msg: string;
        if (band.isFinal) {
          if (isFinalStep) {
            msg = status === 'accepted'
              ? 'You have arrived at the pickup point. Wait for the rider and ask for their pickup code.'
              : 'You have arrived at your destination. Great job!';
          } else if (dist < 25) {
            // At the turn point
            msg = `${step.instruction} now${thenSuffix(nextStep)}`;
          } else {
            msg = `${step.instruction}${thenSuffix(nextStep)}`;
          }
        } else {
          msg = `In ${fmtDistanceVoice(dist)}, ${lc(step.instruction)}${thenSuffix(nextStep)}`;
        }
        speak(msg);
        break;
      }
    }

    // ── ETA milestones ──────────────────────────────────────────────────────
    const remM = dist + steps.slice(idx + 1).reduce((a, s) => a + s.distanceM, 0);
    const checkMilestones: Array<{ key: string; threshold: number }> = [
      { key: 'eta-5km', threshold: 5000 },
      { key: 'eta-2km', threshold: 2000 },
      { key: 'eta-1km', threshold: 1000 },
    ];
    for (const m of checkMilestones) {
      if (remM < m.threshold && remM > m.threshold * 0.6 && !etaMilestonesRef.current.has(m.key)) {
        etaMilestonesRef.current.add(m.key);
        const mins = etaMin(remM, speedKmhRef.current);
        const dest = status === 'accepted' ? 'pickup' : 'destination';
        speak(`About ${mins} minute${mins !== 1 ? 's' : ''} to ${dest}.`);
        break;
      }
    }

    // ── Off-route detection (with cooldown) ──────────────────────────────────
    const allCoords = result.steps.flatMap((s) => s.stepCoords);
    const offDist = minDistToPolylineM(driverLat, driverLng, allCoords);
    if (offDist > OFF_ROUTE_THRESHOLD && now - lastOffRouteRef.current > OFF_ROUTE_COOLDOWN_MS) {
      lastOffRouteRef.current = now;
      speak('You are off route. Recalculating.');
      setRecalcToken((t) => t + 1);
    }
  }, [driverLat, driverLng, result, stepIndex, status, speak]);

  // ── Status change announcements ───────────────────────────────────────────
  const prevStatusRef = useRef('');
  useEffect(() => {
    if (status === prevStatusRef.current) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    setStepIndex(0);
    announcedRef.current.clear();
    etaMilestonesRef.current.clear();
    lastOffRouteRef.current = 0;

    if (status === 'arrived' && prev === 'accepted') {
      speak('You have arrived at the pickup point. Please wait for your rider and ask for the 4-digit pickup code.');
    } else if (status === 'completed') {
      speak('Trip completed. Excellent work! You can go online for your next trip.');
    }
  }, [status, speak]);

  // ── Derived values ───────────────────────────────────────────────────────
  const steps = result?.steps ?? [];
  const currentStep = steps[stepIndex] ?? null;
  const nextStep    = steps[stepIndex + 1] ?? null;
  const distToStep  = driverLat && driverLng && currentStep
    ? haversineM(driverLat, driverLng, currentStep.endLat, currentStep.endLng)
    : null;
  const remainingRouteM = distToStep != null
    ? distToStep + steps.slice(stepIndex + 1).reduce((a, s) => a + s.distanceM, 0)
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
