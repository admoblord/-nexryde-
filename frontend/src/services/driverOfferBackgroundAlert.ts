import { AppState, Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import {
  getDriverOfferSoundModule,
  driverOfferAndroidRawSound,
  driverOfferIosSoundFile,
  type DriverOfferRingtoneId,
} from '@/src/constants/driverOfferSounds';
import { loadDriverOfferSoundPrefs } from '@/src/services/driverOfferSoundPrefs';
import { configureDriverOfferAudioMode } from '@/src/services/driverOfferAudioSession';
import {
  isDriverNativeExperienceAvailable,
  showNativeRideOfferAlert,
  stopNativeRideAlert,
} from '@/src/services/driverNativeExperience';

/** Must match backend notification_catalog.py ride_request channel_id. */
export const DRIVER_OFFERS_CHANNEL = 'driver_offers';

const ALERT_DURATION_MS = 45_000;

let soundRef: Audio.Sound | null = null;
let activeKey: string | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let iosVibRef: ReturnType<typeof setInterval> | null = null;

function clearStopTimer() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
}

export function isDriverOfferBackgroundAlertActive(): boolean {
  return Boolean(activeKey);
}

type StopDriverOfferBackgroundAlertOptions = {
  stopNative?: boolean;
};

export async function stopDriverOfferBackgroundAlert(
  options: StopDriverOfferBackgroundAlertOptions = {}
): Promise<void> {
  clearStopTimer();
  activeKey = null;
  if (options.stopNative !== false) {
    stopNativeRideAlert();
  }
  if (Platform.OS === 'android') {
    try {
      Vibration.cancel();
    } catch {
      /* ignore */
    }
  }
  if (iosVibRef) {
    clearInterval(iosVibRef);
    iosVibRef = null;
  }
  const snd = soundRef;
  soundRef = null;
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

/** Android 8+: channel sound is what the OS plays when app is backgrounded or killed. */
export async function ensureDriverOfferPushChannel(
  ringtoneId?: DriverOfferRingtoneId
): Promise<void> {
  if (Platform.OS !== 'android') return;
  const id = ringtoneId ?? (await loadDriverOfferSoundPrefs()).ringtoneId;
  const rawSound = driverOfferAndroidRawSound(id);
  await Notifications.setNotificationChannelAsync(DRIVER_OFFERS_CHANNEL, {
    name: 'Ride Offers',
    description: 'Incoming ride requests while you are online',
    importance: Notifications.AndroidImportance.MAX,
    sound: rawSound,
    vibrationPattern: [0, 800, 400, 800, 400, 800, 400, 800],
    enableLights: true,
    lightColor: '#FFD700',
    showBadge: true,
    enableVibrate: true,
  });
}

export type DriverOfferAlertParams = {
  offerKey: string;
  title?: string;
  body?: string;
  tripId?: string;
  offerId?: string;
  driverId?: string | null;
  source: 'push' | 'socket' | 'poll';
  /** Uber/inDrive full-screen fields */
  riderName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  fare?: number | string;
  etaMinutes?: number | string;
  distanceKm?: number | string;
};

/**
 * Loop offer ringtone + haptics while the driver is online but outside the app.
 * Foreground alerts are owned by useDriverOfferAlert once the offer modal mounts.
 */
export async function triggerDriverOfferBackgroundAlert(
  params: DriverOfferAlertParams
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!params.offerKey) return;
  if (AppState.currentState === 'active') return;

  if (activeKey === params.offerKey) return;

  await stopDriverOfferBackgroundAlert();
  activeKey = params.offerKey;

  const prefs = await loadDriverOfferSoundPrefs();
  await ensureDriverOfferPushChannel(prefs.ringtoneId);

  // Native full-screen Accept/Decline with rider + pickup → destination + fare.
  showNativeRideOfferAlert(
    {
      id: params.tripId,
      trip_id: params.tripId,
      offer_id: params.offerId,
      rider_name: params.riderName || 'Rider',
      pickup_address: params.pickupAddress || params.body || 'Pickup location',
      dropoff_address: params.dropoffAddress || '',
      destination: params.dropoffAddress || '',
      offered_fare: params.fare,
      fare: params.fare,
      eta_minutes: params.etaMinutes,
      distance_to_pickup_km: params.distanceKm,
    },
    params.driverId,
  );

  if (Platform.OS === 'android' && isDriverNativeExperienceAvailable()) {
    stopTimer = setTimeout(() => void stopDriverOfferBackgroundAlert(), ALERT_DURATION_MS);
    return;
  }

  if (Platform.OS === 'android') {
    Vibration.vibrate([0, 450, 200, 500, 200, 550, 200, 550], true);
  } else {
    Vibration.vibrate(450);
    iosVibRef = setInterval(() => Vibration.vibrate(380), 2350);
  }

  if (prefs.soundEnabled) {
    try {
      await configureDriverOfferAudioMode(true);
      const { sound } = await Audio.Sound.createAsync(getDriverOfferSoundModule(prefs.ringtoneId), {
        shouldPlay: false,
        isLooping: true,
        volume: 1,
      });
      soundRef = sound;
      await sound.playAsync();
    } catch {
      /* OS push channel sound is the fallback when JS audio fails */
    }
  }

  stopTimer = setTimeout(() => void stopDriverOfferBackgroundAlert(), ALERT_DURATION_MS);
}

/** Heads-up when socket delivers an offer but FCM was delayed or dropped. */
export async function presentDriverOfferLocalNotification(params: {
  title: string;
  body: string;
  tripId?: string;
  offerId?: string;
  riderName?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  fare?: number | string;
}): Promise<void> {
  if (AppState.currentState === 'active') return;
  const prefs = await loadDriverOfferSoundPrefs();
  await ensureDriverOfferPushChannel(prefs.ringtoneId);
  const iosSound = driverOfferIosSoundFile(prefs.ringtoneId);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        data: {
          type: 'ride_request',
          trip_id: params.tripId,
          offer_id: params.offerId,
          fullscreen: 'true',
          rider_name: params.riderName || '',
          pickup_address: params.pickupAddress || '',
          dropoff_address: params.dropoffAddress || '',
          fare: params.fare != null ? String(params.fare) : '',
        },
        sound: Platform.OS === 'ios' ? iosSound : true,
        priority: Notifications.AndroidNotificationPriority.MAX,
        ...(Platform.OS === 'android' ? { channelId: DRIVER_OFFERS_CHANNEL } : {}),
      },
      trigger: null,
    });
  } catch {
    /* best effort */
  }
}
