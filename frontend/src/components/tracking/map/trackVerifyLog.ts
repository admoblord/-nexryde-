/**
 * DEV-only instrumentation for rider tracking map animation verification.
 * Filter device logs: adb logcat | grep TRACK_VERIFY
 */
import { Platform } from 'react-native';

const TAG = '[TRACK_VERIFY]';

export function trackVerifyLog(message: string): void {
  if (!__DEV__) return;
  console.log(`${TAG} ${message}`);
}

export function trackVerifyPing(
  n: number,
  lat: number,
  lng: number,
  heading: number | null | undefined,
  source: 'stream' | 'sim',
): void {
  const h = heading != null && Number.isFinite(Number(heading)) ? Number(heading).toFixed(1) : '—';
  trackVerifyLog(
    `ping #${n} lat=${lat.toFixed(6)},lng=${lng.toFixed(6)} heading=${h} source=${source} ts=${Date.now()}`,
  );
}

export function trackVerifyGlide(lat: number, lng: number, durationMs: number, moveDurationProp: number): void {
  trackVerifyLog(
    `glide start → target lat=${lat.toFixed(6)},lng=${lng.toFixed(6)} duration=${durationMs}ms (moveDurationMs prop=${moveDurationProp})`,
  );
}

export function trackVerifyRotation(
  bearing: number,
  applied: boolean,
  movedMetersApprox: number,
): void {
  if (applied) {
    trackVerifyLog(
      `bearing=${bearing.toFixed(1)}° applied (flat MarkerAnimated.rotation, platform=${Platform.OS})`,
    );
  } else {
    trackVerifyLog(
      `moved ${movedMetersApprox.toFixed(1)}m < threshold, rotation skipped (no glide thrash)`,
    );
  }
}

export function trackVerifyCamera(
  mode: 'follow' | 'paused' | 'resumed',
  detail: string,
): void {
  trackVerifyLog(
    mode === 'follow'
      ? `camera follow → ${detail}`
      : mode === 'paused'
        ? `follow paused (user pan), resumes in 12s`
        : `follow resumed (auto) — ${detail}`,
  );
}

export function trackVerifyMarkerMount(markerType: 'MarkerAnimated', usesAnimatedRegion: boolean): void {
  trackVerifyLog(
    `marker mount type=${markerType} animatedRegion=${usesAnimatedRegion ? 'yes' : 'NO'} platform=${Platform.OS}`,
  );
}

export function trackVerifyPropsChanged(lat: number, lng: number, seq: number): void {
  trackVerifyLog(`DriverCarMarker props changed seq=${seq} lat=${lat.toFixed(6)},lng=${lng.toFixed(6)}`);
}
