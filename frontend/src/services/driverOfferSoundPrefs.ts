import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_DRIVER_OFFER_RINGTONE_ID,
  parseDriverOfferRingtoneId,
  type DriverOfferRingtoneId,
} from '@/src/constants/driverOfferSounds';

const KEY_RING = '@nexryde_driver_offer_ringtone_id';
const KEY_ENABLED = '@nexryde_driver_offer_sound_enabled';

const listeners = new Set<() => void>();

export function subscribeDriverOfferSoundPrefs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export type DriverOfferSoundPrefs = {
  ringtoneId: DriverOfferRingtoneId;
  soundEnabled: boolean;
};

export async function loadDriverOfferSoundPrefs(): Promise<DriverOfferSoundPrefs> {
  const [[, rawId], [, rawEn]] = await AsyncStorage.multiGet([KEY_RING, KEY_ENABLED]);
  const ringtoneId = rawId != null ? parseDriverOfferRingtoneId(rawId) : DEFAULT_DRIVER_OFFER_RINGTONE_ID;
  let soundEnabled = true;
  if (rawEn !== null) {
    soundEnabled = rawEn === '1';
  }
  return { ringtoneId, soundEnabled };
}

export async function saveDriverOfferRingtone(id: DriverOfferRingtoneId): Promise<void> {
  await AsyncStorage.setItem(KEY_RING, id);
  emit();
}

export async function saveDriverOfferSoundEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY_ENABLED, enabled ? '1' : '0');
  emit();
}
