/**
 * useTurnByTurnNav.ts
 * Lightweight in-app voice cues — NO Google Directions / Routes calls.
 *
 * Turn-by-turn guidance uses the free Google Maps app deep-link
 * (`google.navigation:q=lat,lng&mode=d`). This hook only announces
 * arrival / status transitions so we never bill per driver ping.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { type NavStep, haversineM } from './navUtils';

const EVAL_MIN_MOVE = 8;

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

export function useTurnByTurnNav(
  driverLat: number | null,
  driverLng: number | null,
  _originLat: number | null,
  _originLng: number | null,
  destLat: number | null,
  destLng: number | null,
  status: string,
): TurnNavState {
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);

  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const prevPosTimeRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const speedKmhRef = useRef<number | null>(null);
  mutedRef.current = muted;

  const speak = useCallback((text: string) => {
    if (mutedRef.current) return;
    Speech.stop();
    Speech.speak(text, { language: 'en-NG', rate: 0.92, pitch: 1.05 });
  }, []);

  useEffect(() => {
    setLoading(false);
  }, [status, destLat, destLng]);

  useEffect(() => {
    if (!driverLat || !driverLng) return;
    const now = Date.now();
    const prev = prevPosRef.current;
    const movedM = prev ? haversineM(prev.lat, prev.lng, driverLat, driverLng) : Infinity;
    if (movedM < EVAL_MIN_MOVE) return;
    if (prev && prevPosTimeRef.current) {
      const elapsed = (now - prevPosTimeRef.current) / 1000;
      if (elapsed > 0.5 && elapsed < 30) {
        speedKmhRef.current = (movedM / elapsed) * 3.6;
      }
    }
    prevPosRef.current = { lat: driverLat, lng: driverLng };
    prevPosTimeRef.current = now;
  }, [driverLat, driverLng]);

  const prevStatusRef = useRef('');
  useEffect(() => {
    if (status === prevStatusRef.current) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (status === 'arrived' && prev === 'accepted') {
      speak(
        'You have arrived at the pickup point. Please wait for your rider and ask for the 4-digit pickup code.',
      );
    } else if (status === 'completed') {
      speak('Trip completed. Excellent work! You can go online for your next trip.');
    } else if (status === 'accepted' || status === 'ongoing') {
      speak('Open Google Maps for turn-by-turn navigation.');
    }
  }, [status, speak]);

  return {
    loading,
    currentStep: null,
    nextStep: null,
    distToStep: null,
    totalRouteM: 0,
    remainingRouteM: null,
    overviewCoords: [],
    stepIndex: 0,
    totalSteps: 0,
    speedKmh: speedKmhRef.current,
    muted,
    toggleMute: () => setMuted((v) => !v),
  };
}
