export const DRIVER_OFFER_RINGTONE_IDS = [
  'horizon',
  'aurora',
  'transit',
  'signal',
  'classic',
  'pulse',
  'chime',
  'beacon',
] as const;

export type DriverOfferRingtoneId = (typeof DRIVER_OFFER_RINGTONE_IDS)[number];

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
  { id: 'horizon', label: 'Horizon', hint: 'Nexryde original — bright rising sweep' },
  { id: 'aurora', label: 'Aurora', hint: 'Nexryde original — layered shimmer' },
  { id: 'transit', label: 'Transit', hint: 'Nexryde original — three crisp pings' },
  { id: 'signal', label: 'Signal', hint: 'Nexryde original — short cadence' },
  { id: 'classic', label: 'Classic', hint: 'Original production alert' },
  { id: 'pulse', label: 'Dispatch pulse', hint: 'Rhythmic dual-tone' },
  { id: 'beacon', label: 'Bright beacon', hint: 'Sharp pings for noisy cabins' },
  { id: 'chime', label: 'Soft chime', hint: 'Gentler ascending notes' },
];
