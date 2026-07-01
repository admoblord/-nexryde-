import type { FareEstimateResponse } from '@/src/services/api';

export type FareLineItem = { label: string; amount: number };

export function buildFareBreakdownLines(fd: FareEstimateResponse | null | undefined): FareLineItem[] {
  if (!fd) return [];
  const lines: FareLineItem[] = [];
  const base = Number(fd.base_fare ?? fd.base_price ?? 0);
  const dist = Number(fd.distance_fee ?? 0);
  const time = Number(fd.time_fee ?? 0);
  const subtotal = Number(fd.subtotal ?? fd.total_fare ?? 0);
  const surgeMult = Number(fd.surge_multiplier ?? 1);
  if (base > 0) lines.push({ label: 'Base', amount: Math.round(base) });
  if (dist > 0) lines.push({ label: 'Distance', amount: Math.round(dist) });
  else if (Number(fd.distance_km) > 0 && subtotal > 0 && base === 0) {
    const est = Math.round(subtotal * 0.65);
    if (est > 0) lines.push({ label: 'Distance', amount: est });
  }
  if (time > 0) lines.push({ label: 'Time', amount: Math.round(time) });
  if (surgeMult > 1.02 && subtotal > 0) {
    const surgeAmt = Math.round(subtotal * (surgeMult - 1));
    if (surgeAmt > 0) lines.push({ label: 'Surge', amount: surgeAmt });
  }
  if (lines.length === 0 && subtotal > 0) {
    lines.push({ label: 'Trip fare', amount: Math.round(subtotal) });
  }
  return lines;
}

export function bidAdjustStep(currentFare: number): number {
  if (currentFare >= 20000) return 5000;
  if (currentFare >= 5000) return 500;
  return 100;
}

export function shortPlaceLabel(addr: string, maxLen = 16): string {
  const t = (addr || '').split(',')[0]?.trim() || addr.trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}
