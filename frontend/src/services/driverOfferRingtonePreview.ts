import { Audio } from 'expo-av';
import type { DriverOfferRingtoneId } from '@/src/constants/driverOfferSounds';
import { getDriverOfferSoundModule } from '@/src/constants/driverOfferSounds';
import { configureDriverOfferAudioMode } from '@/src/services/driverOfferAudioSession';

let previewSound: Audio.Sound | null = null;

export async function playDriverOfferRingtonePreview(ringtoneId: DriverOfferRingtoneId): Promise<void> {
  try {
    await configureDriverOfferAudioMode(false);
    if (previewSound) {
      await previewSound.stopAsync().catch(() => {});
      await previewSound.unloadAsync().catch(() => {});
      previewSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(getDriverOfferSoundModule(ringtoneId), {
      shouldPlay: false,
      volume: 1,
      isLooping: false,
    });
    previewSound = sound;
    await sound.playAsync();
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      sound.unloadAsync().catch(() => {});
      if (previewSound === sound) previewSound = null;
    });
  } catch {
    /* preview is best-effort */
  }
}
