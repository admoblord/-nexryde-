import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_DRIVER_OFFER_RINGTONE_ID,
  type DriverOfferRingtoneId,
} from '@/src/constants/driverOfferSounds';
import {
  loadDriverOfferSoundPrefs,
  saveDriverOfferRingtone,
  saveDriverOfferSoundEnabled,
  subscribeDriverOfferSoundPrefs,
} from '@/src/services/driverOfferSoundPrefs';
import { ensureDriverOfferPushChannel } from '@/src/services/driverOfferBackgroundAlert';

export function useDriverOfferSoundPrefs() {
  const [ringtoneId, setRingtoneId] = useState<DriverOfferRingtoneId>(DEFAULT_DRIVER_OFFER_RINGTONE_ID);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const refresh = useCallback(async () => {
    const p = await loadDriverOfferSoundPrefs();
    setRingtoneId(p.ringtoneId);
    setSoundEnabled(p.soundEnabled);
  }, []);

  useEffect(() => {
    void refresh();
    return subscribeDriverOfferSoundPrefs(() => {
      void refresh();
    });
  }, [refresh]);

  const setRingtone = useCallback(async (id: DriverOfferRingtoneId) => {
    setRingtoneId(id);
    await saveDriverOfferRingtone(id);
    await ensureDriverOfferPushChannel(id);
  }, []);

  const setSoundEnabledPersisted = useCallback(async (enabled: boolean) => {
    setSoundEnabled(enabled);
    await saveDriverOfferSoundEnabled(enabled);
  }, []);

  return { ringtoneId, soundEnabled, setRingtone, setSoundEnabled: setSoundEnabledPersisted, refresh };
}
