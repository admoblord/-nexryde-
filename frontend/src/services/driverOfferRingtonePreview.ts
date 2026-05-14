import { Audio } from 'expo-av';
import type { DriverOfferRingtoneId } from '@/src/constants/driverOfferSounds';
import { getDriverOfferSoundModule } from '@/src/constants/driverOfferSounds';

let previewSound: Audio.Sound | null = null;

export async function playDriverOfferRingtonePreview(ringtoneId: DriverOfferRingtoneId): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    if (previewSound) {
      await previewSound.stopAsync().catch(() => {});
      await previewSound.unloadAsync().catch(() => {});
      previewSound = null;
    }
    const { sound } = await Audio.Sound.createAsync(getDriverOfferSoundModule(ringtoneId), {
      shouldPlay: true,
      volume: 0.88,
      isLooping: false,
    });
    previewSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!status.isLoaded || !status.didJustFinish) return;
      sound.unloadAsync().catch(() => {});
      if (previewSound === sound) previewSound = null;
    });
  } catch {
    /* preview is best-effort */
  }
}
