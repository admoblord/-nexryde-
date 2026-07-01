/**
 * Fixed layout dimensions for Tracking V2 — layout must not shift after first paint.
 */
export const TV2_LAYOUT = {
  /** Bottom card stack cap (set in screen; duplicated here for dock math). */
  stackMaxRatio: 0.44,
  /** Individual card heights (px). */
  driverCard: 152,
  tripProgressCard: 132,
  safePickupCard: 172,
  pickupWaitSlot: 76,
  actionCard: 76,
  fareCard: 72,
  bottomBar: 52,
  /** Floating ETA pill — fixed outer box. */
  arrivalCard: 62,
  arrivalMetaWidth: 168,
  /** Map placeholder matches live map footprint. */
  mapPlaceholderMinH: '100%' as const,
} as const;

export const TV2_SKELETON = {
  base: 'rgba(255,255,255,0.08)',
  highlight: 'rgba(255,255,255,0.14)',
} as const;
