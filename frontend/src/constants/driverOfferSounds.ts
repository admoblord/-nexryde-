export const DRIVER_OFFER_RINGTONE_IDS = [
  'classic',
  'music',
  'horizon',
  'aurora',
  'transit',
  'signal',
  'pulse',
  'chime',
  'beacon',
] as const;

export type DriverOfferRingtoneId = (typeof DRIVER_OFFER_RINGTONE_IDS)[number];

/** Default: short punchy dispatch ping (loops while offer is open). */
export const DEFAULT_DRIVER_OFFER_RINGTONE_ID: DriverOfferRingtoneId = 'classic';

export function parseDriverOfferRingtoneId(raw: string | null | undefined): DriverOfferRingtoneId {
  if (raw && (DRIVER_OFFER_RINGTONE_IDS as readonly string[]).includes(raw)) {
    return raw as DriverOfferRingtoneId;
  }
  return DEFAULT_DRIVER_OFFER_RINGTONE_ID;
}

/** Bundled assets for Metro `require()` — keep in sync with `assets/sounds/`. */
export function getDriverOfferSoundModule(id: DriverOfferRingtoneId): number {
  switch (id) {
    case 'music':
      return require('@/assets/sounds/driver_offer_music.wav');
    case 'horizon':
      return require('@/assets/sounds/driver_offer_horizon.wav');
    case 'aurora':
      return require('@/assets/sounds/driver_offer_aurora.wav');
    case 'transit':
      return require('@/assets/sounds/driver_offer_transit.wav');
    case 'signal':
      return require('@/assets/sounds/driver_offer_signal.wav');
    case 'classic':
      return require('@/assets/sounds/driver_offer.wav');
    case 'pulse':
      return require('@/assets/sounds/driver_offer_pulse.wav');
    case 'chime':
      return require('@/assets/sounds/driver_offer_chime.wav');
    case 'beacon':
      return require('@/assets/sounds/driver_offer_beacon.wav');
    default:
      return require('@/assets/sounds/driver_offer.wav');
  }
}

export const DRIVER_OFFER_RINGTONES: ReadonlyArray<{
  id: DriverOfferRingtoneId;
  label: string;
  hint: string;
}> = [
  {
    id: 'classic',
    label: 'Dispatch ping',
    hint: 'Short two-tone punch — default',
  },
  {
    id: 'music',
    label: 'Groove loop',
    hint: '~16s looping melody — easier to hear in noisy cabins',
  },
  { id: 'transit', label: 'Bright pings', hint: 'Three quick ascending tones' },
  { id: 'pulse', label: 'Double pulse', hint: 'Double hit then accent tone' },
  { id: 'signal', label: 'Staccato cadence', hint: 'Fast rhythmic beeps' },
  { id: 'horizon', label: 'Rising line', hint: 'Sweep up into settle tone' },
  { id: 'beacon', label: 'High-impact pings', hint: 'Loudest short chirps' },
  { id: 'chime', label: 'Soft chime', hint: 'Gentler pattern, less harsh' },
  { id: 'aurora', label: 'Shimmer pings', hint: 'Triple ping with airy accent' },
];
