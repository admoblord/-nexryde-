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
      return require('@/assets/sounds/driver_offer_1.m4a');
    case 'nexryde2':
      return require('@/assets/sounds/driver_offer_2.m4a');
    case 'nexryde3':
      return require('@/assets/sounds/driver_offer_3.mp3');
    case 'nexryde4':
      return require('@/assets/sounds/driver_offer_4.mp3');
    default:
      return require('@/assets/sounds/driver_offer_1.m4a');
  }
}

/** Android res/raw basename (no extension) — must match files in android/app/src/main/res/raw/ */
export function driverOfferAndroidRawSound(id: DriverOfferRingtoneId): string {
  switch (id) {
    case 'nexryde1':
      return 'nexryde_1';
    case 'nexryde2':
      return 'nexryde_2';
    case 'nexryde3':
      return 'nexryde_3';
    case 'nexryde4':
      return 'nexryde_4';
    default:
      return 'nexryde_1';
  }
}

/** iOS push/local notification sound filename (bundled via expo-notifications plugin). */
export function driverOfferIosSoundFile(id: DriverOfferRingtoneId): string {
  switch (id) {
    case 'nexryde1':
      return 'driver_offer_1.m4a';
    case 'nexryde2':
      return 'driver_offer_2.m4a';
    case 'nexryde3':
      return 'driver_offer_3.mp3';
    case 'nexryde4':
      return 'driver_offer_4.mp3';
    default:
      return 'driver_offer_1.m4a';
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
