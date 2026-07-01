export const DRIVER_OFFER_RINGTONE_IDS = [
  'nexryde1',
  'nexryde2',
  'nexryde3',
  'nexryde4',
] as const;

export type DriverOfferRingtoneId = (typeof DRIVER_OFFER_RINGTONE_IDS)[number];

export const DEFAULT_DRIVER_OFFER_RINGTONE_ID: DriverOfferRingtoneId = 'nexryde1';

export function parseDriverOfferRingtoneId(raw: string | null | undefined): DriverOfferRingtoneId {
  if (raw && (DRIVER_OFFER_RINGTONE_IDS as readonly string[]).includes(raw)) {
    return raw as DriverOfferRingtoneId;
  }
  return DEFAULT_DRIVER_OFFER_RINGTONE_ID;
}

export function getDriverOfferSoundModule(id: DriverOfferRingtoneId): number {
  switch (id) {
    case 'nexryde1':
      return require('@/assets/sounds/driver_offer_1.wav');
    case 'nexryde2':
      return require('@/assets/sounds/driver_offer_2.wav');
    case 'nexryde3':
      return require('@/assets/sounds/driver_offer_3.mp3');
    case 'nexryde4':
      return require('@/assets/sounds/driver_offer_4.mp3');
    default:
      return require('@/assets/sounds/driver_offer_1.wav');
  }
}

export const DRIVER_OFFER_RINGTONES: ReadonlyArray<{
  id: DriverOfferRingtoneId;
  label: string;
  hint: string;
}> = [
  { id: 'nexryde1', label: 'NexRyde 1', hint: 'Official NexRyde alert tone' },
  { id: 'nexryde2', label: 'NexRyde 2', hint: 'Official NexRyde alert tone' },
  { id: 'nexryde3', label: 'NexRyde 3', hint: 'Official NexRyde alert tone' },
  { id: 'nexryde4', label: 'NexRyde 4', hint: 'Official NexRyde alert tone' },
];
