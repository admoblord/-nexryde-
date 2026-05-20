/** Display helpers for in-trip (ongoing) rider UI. */

export function formatEtaClockFromSeconds(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || !Number.isFinite(etaSeconds) || etaSeconds <= 0) return '—';
  const d = new Date(Date.now() + Math.floor(etaSeconds) * 1000);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  return `${displayH}:${m} ${period}`;
}

export function formatTripMinutesLabel(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || !Number.isFinite(etaSeconds) || etaSeconds <= 0) return '—';
  const min = Math.max(1, Math.ceil(etaSeconds / 60));
  return `${min} min`;
}

export function journeyProgressPercent(
  totalTripKm: number | null | undefined,
  distanceRemainingKm: number | null | undefined,
): number {
  const total = Number(totalTripKm);
  const remaining = Number(distanceRemainingKm);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(remaining) || remaining < 0) return 0;
  const traveled = Math.max(0, total - remaining);
  return Math.min(100, Math.max(0, (traveled / total) * 100));
}

export function speedGaugeTint(speedKmh: number): string {
  if (speedKmh < 20) return '#22C55E';
  if (speedKmh < 50) return '#FBBF24';
  return '#EF4444';
}
