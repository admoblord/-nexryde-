/** Display helpers for driver ongoing-trip dock. */

export function formatDriverTripElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min ${sec} sec`;
}

export function formatDriverRouteSummary(
  tripKm: number | null | undefined,
  distanceToDrop: string,
  etaToDrop: string,
): string {
  const parts: string[] = [];
  if (tripKm != null && Number.isFinite(tripKm) && tripKm > 0) {
    parts.push(`${tripKm < 1 ? `${Math.round(tripKm * 1000)} m` : `${tripKm.toFixed(1)} km`}`);
  } else if (distanceToDrop && distanceToDrop !== '—') {
    parts.push(distanceToDrop);
  }
  if (etaToDrop && etaToDrop !== '—') parts.push(etaToDrop);
  return parts.join(' / ') || 'Live route';
}

export function driverTripProgressPercent(
  totalTripKm: number | null | undefined,
  remainingKm: number | null | undefined,
): number {
  const total = Number(totalTripKm);
  const remaining = Number(remainingKm);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(remaining) || remaining < 0) return 0;
  const traveled = Math.max(0, total - remaining);
  return Math.min(100, Math.max(0, (traveled / total) * 100));
}
