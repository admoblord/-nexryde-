/**
 * Voice cues for an already-fetched Directions step list (no second API fetch).
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as Speech from 'expo-speech';
import type { NavStep } from '@/src/navigation/navUtils';
import { fmtDistanceVoice } from '@/src/navigation/navUtils';

function lc(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function useNavVoiceFromSteps(opts: {
  active: boolean;
  currentStep: NavStep | null;
  nextStep: NavStep | null;
  distToStepM: number | null;
  stepIndex: number;
  tripStatus: string;
}) {
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const announcedRef = useRef<Set<string>>(new Set());
  mutedRef.current = muted;

  const speak = useCallback((text: string) => {
    if (mutedRef.current || !text) return;
    try {
      Speech.stop();
      Speech.speak(text, { language: 'en-NG', rate: 0.92, pitch: 1.05 });
    } catch {
      /* speech unavailable */
    }
  }, []);

  useEffect(() => {
    if (!opts.active) {
      announcedRef.current.clear();
      try {
        Speech.stop();
      } catch {
        /* ignore */
      }
    }
  }, [opts.active]);

  useEffect(() => {
    if (!opts.active || !opts.currentStep) return;
    const key = `step-${opts.stepIndex}`;
    if (announcedRef.current.has(key)) return;
    announcedRef.current.add(key);
    const then =
      opts.nextStep && opts.nextStep.distanceM < 200
        ? `, then ${lc(opts.nextStep.instruction)}`
        : '';
    speak(`${opts.currentStep.instruction}${then}`);
  }, [opts.active, opts.stepIndex, opts.currentStep, opts.nextStep, speak]);

  useEffect(() => {
    if (!opts.active || !opts.currentStep || opts.distToStepM == null) return;
    const d = opts.distToStepM;
    const bands: Array<{ key: string; max: number; min: number; final?: boolean }> = [
      { key: `${opts.stepIndex}-mid`, max: 180, min: 100 },
      { key: `${opts.stepIndex}-near`, max: 55, min: 25, final: true },
    ];
    for (const b of bands) {
      if (d <= b.max && d >= b.min && !announcedRef.current.has(b.key)) {
        announcedRef.current.add(b.key);
        if (b.final) {
          speak(`${opts.currentStep.instruction} now`);
        } else {
          speak(`In ${fmtDistanceVoice(d)}, ${lc(opts.currentStep.instruction)}`);
        }
        break;
      }
    }
  }, [opts.active, opts.currentStep, opts.distToStepM, opts.stepIndex, speak]);

  useEffect(() => {
    if (opts.tripStatus === 'arrived') {
      const key = 'arrived-once';
      if (!announcedRef.current.has(key)) {
        announcedRef.current.add(key);
        speak('You have arrived at the pickup point. Ask the rider for their pickup code.');
      }
    }
  }, [opts.tripStatus, speak]);

  return {
    muted,
    toggleMute: () => {
      setMuted((v) => {
        const next = !v;
        if (next) {
          try {
            Speech.stop();
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
  };
}
