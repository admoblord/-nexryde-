/**
 * useFloatingDriverBubble
 *
 * Manages the Bolt-style floating driver bubble — a draggable system-overlay
 * icon that sits above all other apps when Nexryde is minimised.
 *
 * Usage:
 *   const { enable, disable, updateStatus, hasPermission, requestPermission } =
 *     useFloatingDriverBubble();
 *
 *   // When driver goes online:
 *   enable('online');
 *
 *   // When a trip is assigned:
 *   updateStatus('on_trip', 'To Marina Beach');
 *
 *   // When driver logs off:
 *   disable();
 */

import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import Bubble, { type BubbleStatus } from '@/src/native/FloatingDriverBubble';

export function useFloatingDriverBubble() {
  const enabledRef  = useRef(false);
  const statusRef   = useRef<BubbleStatus>('online');
  const tripInfoRef = useRef<string | null>(null);

  // ── Hide bubble when app returns to foreground ─────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // App came to foreground — hide the bubble to avoid overlap
        if (enabledRef.current) {
          Bubble.hide();
        }
      } else if (state === 'background' || state === 'inactive') {
        // App went to background — show bubble if driver was enabled
        if (enabledRef.current) {
          Bubble.show(statusRef.current, tripInfoRef.current);
        }
      }
    });

    return () => sub.remove();
  }, []);

  // ── enable: show bubble + mark enabled ────────────────────────────────────
  const enable = useCallback(
    async (status: BubbleStatus = 'online', tripInfo: string | null = null) => {
      if (Platform.OS !== 'android') return;
      const hasPerm = await Bubble.hasPermission();
      if (!hasPerm) {
        Bubble.requestPermission();
        // Permission flow is async — user needs to grant then enable again
        return;
      }
      statusRef.current   = status;
      tripInfoRef.current = tripInfo;
      enabledRef.current  = true;
      // Only actually show the bubble if the app is currently in background
      const currentState = AppState.currentState;
      if (currentState === 'background' || currentState === 'inactive') {
        Bubble.show(status, tripInfo);
      }
    },
    [],
  );

  // ── disable: hide bubble + mark disabled ──────────────────────────────────
  const disable = useCallback(() => {
    enabledRef.current = false;
    Bubble.hide();
  }, []);

  // ── updateStatus: update the bubble label + dot colour ────────────────────
  const updateStatus = useCallback(
    (status: BubbleStatus, tripInfo: string | null = null) => {
      statusRef.current   = status;
      tripInfoRef.current = tripInfo;
      if (enabledRef.current) {
        Bubble.update(status, tripInfo);
      }
    },
    [],
  );

  // ── requestPermission: prompt the system overlay settings page ────────────
  const requestPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return false;
    const already = await Bubble.hasPermission();
    if (!already) Bubble.requestPermission();
    return already;
  }, []);

  const hasPermission = useCallback(async () => {
    if (Platform.OS !== 'android') return false;
    return Bubble.hasPermission();
  }, []);

  return { enable, disable, updateStatus, requestPermission, hasPermission };
}
