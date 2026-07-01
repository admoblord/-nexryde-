/**
 * Detects a Google Maps tile load timeout and triggers a fallback.
 *
 * Usage:
 *   const { tilesLoaded, timedOut, reset } = useMapTileGuard({ timeoutMs: 8000 });
 *
 *   Pass `onMapReady` (called by MapView's onMapReady prop) and
 *   when `timedOut` becomes true, show a static fallback or retry prompt.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

type Options = {
  /** How long to wait for tiles before declaring a timeout. Default: 8000 ms. */
  timeoutMs?: number;
};

export function useMapTileGuard({ timeoutMs = 8000 }: Options = {}) {
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!tilesLoaded) {
        setTimedOut(true);
        try {
          const { sentryWarn } = require('@/src/utils/sentryBreadcrumbs');
          sentryWarn('Map tile load timeout', { timeoutMs });
        } catch { /* Sentry not available */ }
      }
    }, timeoutMs);
  }, [timeoutMs, tilesLoaded]);

  const onMapReady = useCallback(() => {
    startTimer();
  }, [startTimer]);

  const onTilesLoaded = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTilesLoaded(true);
    setTimedOut(false);
  }, []);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTilesLoaded(false);
    setTimedOut(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { tilesLoaded, timedOut, onMapReady, onTilesLoaded, reset };
}
