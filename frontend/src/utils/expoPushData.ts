/**
 * Expo remote notifications stringify every `data` value. Normalize for routing & analytics.
 */
const TRIM_KEYS = new Set([
  'nid',
  'type',
  'action',
  'trip_id',
  'slot',
  'nudge',
  'milestone',
  'driver_id',
  'offer_id',
  'feature_id',
  'rider_name',
  'pickup_address',
  'dropoff_address',
  'destination',
  'fare',
  'distance_to_pickup_km',
  'eta_minutes',
  'fullscreen',
]);

export function normalizeExpoPushData(
  raw: Record<string, unknown> | undefined | null
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && TRIM_KEYS.has(k)) {
      const t = v.trim();
      if (t.length === 0) continue;
      out[k] = t;
      continue;
    }
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}
