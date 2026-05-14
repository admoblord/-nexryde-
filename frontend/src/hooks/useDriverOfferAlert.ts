import { useEffect, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import { getDriverOfferSoundModule } from '@/src/constants/driverOfferSounds';
import { useDriverOfferSoundPrefs } from '@/src/hooks/useDriverOfferSoundPrefs';

/**
 * Uber/Bolt-style alert while a ride offer modal is visible:
 * looping audio (plays in iOS silent mode) + repeating haptics.
 * Teardown runs automatically when the offer clears (accept / ignore / timeout).
 * Ringtone + mute come from Settings → driver preferences (AsyncStorage).
 */
export function useDriverOfferAlert(enabled: boolean, stableOfferKey: string | null) {
  const { ringtoneId, soundEnabled } = useDriverOfferSoundPrefs();
  const soundRef = useRef<Audio.Sound | null>(null);
  const iosVibRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const snd = soundRef.current;
      soundRef.current = null;
      if (snd) {
        try {
          await snd.stopAsync();
        } catch {
          /* ignore */
        }
        try {
          await snd.unloadAsync();
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
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          staysActiveInBackground: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });

        const { sound } = await Audio.Sound.createAsync(getDriverOfferSoundModule(ringtoneId), {
          shouldPlay: true,
          isLooping: true,
          volume: 0.9,
        });
        if (cancelled) {
          await sound.unloadAsync().catch(() => {});
          return;
        }
        soundRef.current = sound;
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
