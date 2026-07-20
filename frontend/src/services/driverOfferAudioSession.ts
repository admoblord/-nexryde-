import {
  Audio,
  InterruptionModeAndroid,
  InterruptionModeIOS,
} from 'expo-av';

/**
 * Configure foreground offer-alert audio.
 * Do NOT use staysActiveInBackground — App Store guideline 2.5.4 rejects unused
 * UIBackgroundModes "audio". Background ride alerts use push notification sounds.
 */
export async function configureDriverOfferAudioMode(_staysActiveInBackground = false): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    interruptionModeIOS: InterruptionModeIOS.DoNotMix,
    interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: false,
  });
}
