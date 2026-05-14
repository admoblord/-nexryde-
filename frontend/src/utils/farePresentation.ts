/** Mirrors backend `SHORT_TRIP_KM_THRESHOLD` for UI hints only. */
export const SHORT_TRIP_KM_THRESHOLD = 5;

export type SurgeFactorRow = { label?: string; multiplier?: number };

export function formatRouteKmMin(distanceKm: unknown, durationMin: unknown): string | null {
  const km = Number(distanceKm);
  const min = Number(durationMin);
  const kmOk = Number.isFinite(km) && km > 0;
  const minOk = Number.isFinite(min) && min > 0;
  if (!kmOk && !minOk) return null;
  const kmPart = kmOk ? `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km` : '';
  const minPart = minOk ? `~${Math.round(min)} min` : '';
  if (kmOk && minOk) return `${kmPart} · ${minPart}`;
  return kmOk ? kmPart : minPart;
}

export function isShortTripFare(bucket: unknown, distanceKm: unknown): boolean {
  if (String(bucket || '').toLowerCase() === 'short') return true;
  const km = Number(distanceKm);
  return Number.isFinite(km) && km > 0 && km < SHORT_TRIP_KM_THRESHOLD;
}

/** Returns display label when surge is meaningfully above 1. */
export function formatSurgeMultiplierLabel(mult: unknown): string | null {
  const m = Number(mult);
  if (!Number.isFinite(m) || m <= 1.02) return null;
  return `${m.toFixed(m >= 10 ? 0 : 1)}×`;
}

export function surgeFactorChipLabels(factors: unknown, max = 2): string[] {
  if (!Array.isArray(factors)) return [];
  const out: string[] = [];
  for (const raw of factors) {
    if (out.length >= max) break;
    const f = raw as SurgeFactorRow;
    const lbl = String(f?.label || '').trim();
    if (!lbl) continue;
    const mult = Number(f?.multiplier);
    const tail = Number.isFinite(mult) && mult > 1.001 ? ` ×${mult.toFixed(2)}` : '';
    out.push(`${lbl}${tail}`);
  }
  return out;
}

/** Strip trailing " ×1.30" style tails when the headline already shows the multiplier. */
export function stripSurgeFactorMultiplierTail(line: string): string {
  return String(line || '')
    .trim()
    .replace(/\s*×\s*[\d.]+\s*$/i, '')
    .trim();
}

/**
 * Single rider-facing surge line (e.g. "1.5× · Morning peak") to avoid duplicate
 * peak / surge / factor chips.
 */
export function buildCompactSurgeChipText(fd: {
  surge_multiplier?: unknown;
  multiplier?: unknown;
  is_peak?: boolean;
  peak_type?: string | null;
  surge_factors?: unknown;
}): string | null {
  const m = Number(fd.surge_multiplier ?? fd.multiplier ?? 1);
  if (!Number.isFinite(m) || m <= 1.02) return null;
  const multStr = m >= 10 ? `${Math.round(m)}×` : `${Number(m.toFixed(1))}×`;

  if (fd.is_peak) {
    const w =
      fd.peak_type === 'morning_rush'
        ? 'Morning peak'
        : fd.peak_type === 'evening_peak'
          ? 'Evening peak'
          : 'Peak hours';
    return `${multStr} · ${w}`;
  }

  const extras = surgeFactorChipLabels(fd.surge_factors, 6);
  const first = extras.find((t) => !/^normal\b/i.test(t));
  if (!first) return multStr;
  const cleaned = stripSurgeFactorMultiplierTail(first);
  if (!cleaned || /^peak hours$/i.test(cleaned)) return multStr;
  return `${multStr} · ${cleaned}`;
}

/** Replace internal Lagos zone keys in API breakdown lines with plain area names. */
export function humanizeFareBreakdownLine(line: string): string {
  return String(line || '').replace(/\[(lagride_[^\]]+)\]/gi, (_full, zone: string) => {
    const core = String(zone)
      .replace(/^lagride_t[12]_/i, '')
      .replace(/_/g, ' ');
    const titled = core.replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
    return `[${titled}]`;
  });
}
