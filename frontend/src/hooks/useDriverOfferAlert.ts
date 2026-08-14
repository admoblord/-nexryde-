import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import {
  getDriverOfferSoundModule,
  type DriverOfferRingtoneId,
} from '@/src/constants/driverOfferSounds';
import { useDriverOfferSoundPrefs } from '@/src/hooks/useDriverOfferSoundPrefs';
import { configureDriverOfferAudioMode } from '@/src/services/driverOfferAudioSession';

/**
 * The loaded ringtone is cached across offers.
 *
 * Loading it when the offer arrived cost the first second or two of the
 * countdown, which is when the driver most needs to hear it. It is loaded once
 * per ringtone and then only rewound and replayed.
 */
let cachedSound: Audio.Sound | null = null;
let cachedRingtoneId: DriverOfferRingtoneId | null = null;
let loadInFlight: Promise<Audio.Sound | null> | null = null;

async function loadOfferSound(ringtoneId: DriverOfferRingtoneId): Promise<Audio.Sound | null> {
  if (cachedSound && cachedRingtoneId === ringtoneId) return cachedSound;
  if (loadInFlight) return loadInFlight;
  loadInFlight = (async () => {
    try {
      if (cachedSound) {
        const stale = cachedSound;
        cachedSound = null;
        cachedRingtoneId = null;
        await stale.unloadAsync().catch(() => {});
      }
      const { sound } = await Audio.Sound.createAsync(getDriverOfferSoundModule(ringtoneId), {
        shouldPlay: false,
        isLooping: true,
        volume: 1,
      });
      cachedSound = sound;
      cachedRingtoneId = ringtoneId;
      return sound;
    } catch {
      return null;
    } finally {
      loadInFlight = null;
    }
  })();
  return loadInFlight;
}

/**
 * Ride-offer alert while the modal is visible:
 * looping audio (silent-switch bypass on iOS where OS allows) + repeating haptics.
 * Teardown runs when the offer clears (accept / ignore / timeout).
 */
export function useDriverOfferAlert(enabled: boolean, stableOfferKey: string | null) {
  const { ringtoneId, soundEnabled } = useDriverOfferSoundPrefs();
  const iosVibRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the ringtone resident so an incoming offer never waits on a decode.
  useEffect(() => {
    if (!soundEnabled || Platform.OS === 'web') return;
    void loadOfferSound(ringtoneId);
  }, [ringtoneId, soundEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function teardown() {
      if (Platform.OS === 'android') {
        try {
          Vibration.cancel();
        } catch {
          /* ignore */
        }
      }
      if (iosVibRef.current) {
        clearInterval(iosVibRef.current);
        iosVibRef.current = null;
      }
      const snd = cachedSound;
      if (snd) {
        // Stop and rewind, but keep it loaded for the next offer.
        try {
          await snd.stopAsync();
        } catch {
          /* ignore */
        }
        try {
          await snd.setPositionAsync(0);
        } catch {
          /* ignore */
        }
      }
    }

    if (!enabled || !stableOfferKey || Platform.OS === 'web') {
      void teardown();
      return undefined;
    }

    void (async () => {
      if (!soundEnabled) return;
      try {
        await configureDriverOfferAudioMode(true);
        const sound = await loadOfferSound(ringtoneId);
        if (cancelled || !sound) return;
        await sound.setPositionAsync(0).catch(() => {});
        await sound.playAsync();
      } catch {
        /* Audio is best-effort; vibration still cues the driver */
      }
    })();

    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 450, 200, 500, 200, 550], true);
    } else {
      Vibration.vibrate(450);
      iosVibRef.current = setInterval(() => Vibration.vibrate(380), 2350);
    }

    return () => {
      cancelled = true;
      void teardown();
    };
  }, [enabled, stableOfferKey, ringtoneId, soundEnabled]);
}
