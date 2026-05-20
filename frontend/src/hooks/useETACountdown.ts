import { useEffect, useMemo, useRef, useState } from 'react';

export type ETATrackingStatus = 'en_route' | 'arriving' | 'arrived' | 'unknown';

/**
 * Countdown anchored to the last server ETA snapshot.
 * Between server pings we only subtract elapsed wall-clock time (no independent drift).
 */
export function useETACountdown(
  serverEtaSec: number | null | undefined,
  trackingStatus?: string | null,
) {
  const anchorRef = useRef<{ sec: number; atMs: number } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (serverEtaSec == null || !Number.isFinite(serverEtaSec)) return;
    const sec = Math.max(0, Math.floor(serverEtaSec));
    const prev = anchorRef.current;
    const elapsed = prev ? Math.floor((Date.now() - prev.atMs) / 1000) : 0;
    const displayNow = prev ? Math.max(0, prev.sec - elapsed) : sec;
    const drift = Math.abs(displayNow - sec);
    if (!prev || drift >= 3 || sec < displayNow) {
      anchorRef.current = { sec, atMs: Date.now() };
      setTick((t) => t + 1);
    }
  }, [serverEtaSec]);

  useEffect(() => {
    const st = String(trackingStatus || '').toLowerCase();
    if (st === 'arrived') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [trackingStatus]);

  const displaySec = useMemo(() => {
    const st = String(trackingStatus || '').toLowerCase();
    if (st === 'arrived') return 0;
    const anchor = anchorRef.current;
    if (!anchor) return null;
    const elapsed = Math.floor((Date.now() - anchor.atMs) / 1000);
    return Math.max(0, anchor.sec - elapsed);
  }, [tick, trackingStatus]);

  const status: ETATrackingStatus = useMemo(() => {
    const st = String(trackingStatus || '').toLowerCase();
    if (st === 'arrived' || displaySec === 0) return 'arrived';
    if (st === 'arriving' || (displaySec != null && displaySec < 60)) return 'arriving';
    if (displaySec != null) return 'en_route';
    return 'unknown';
  }, [trackingStatus, displaySec]);

  const etaMinutes = displaySec != null ? Math.max(0, Math.ceil(displaySec / 60)) : null;

  const headline = useMemo(() => {
    if (status === 'arrived') return 'Driver here';
    if (status === 'arriving') return 'Driver arriving';
    if (etaMinutes != null && etaMinutes > 0) return `${etaMinutes} min`;
    return '—';
  }, [status, etaMinutes]);

  const subline = useMemo(() => {
    if (status === 'arrived') return 'Meet your driver at pickup';
    if (status === 'arriving') return 'Almost at your pickup point';
    return 'Live location updates on the map';
  }, [status]);

  const mmSs =
    displaySec != null
      ? `${Math.floor(displaySec / 60)}:${String(displaySec % 60).padStart(2, '0')}`
      : null;

  return {
    etaSeconds: displaySec,
    etaMinutes,
    mmSs,
    status,
    headline,
    subline,
    hasServerAnchor: anchorRef.current != null,
  };
}
