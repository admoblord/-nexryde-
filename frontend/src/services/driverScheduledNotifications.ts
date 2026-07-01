/**
 * Manages the driver's daily scheduled rush-hour notifications.
 *
 * Persists scheduled notification IDs to AsyncStorage so they survive
 * app restarts and can be cancelled/re-scheduled as the driver toggles
 * their online status or changes preferences.
 *
 * Rush schedule (daily, local time):
 *   Morning rush  06:00 — "come online before the morning peak"
 *   Evening rush  17:00 — "come online before the evening peak"
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { notificationService } from './notifications';

const STORAGE_KEY = 'driver_rush_notif_ids';

interface StoredIds {
  morning?: string;
  evening?: string;
}

async function _loadIds(): Promise<StoredIds> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredIds) : {};
  } catch {
    return {};
  }
}

async function _saveIds(ids: StoredIds): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

/**
 * Schedules (or re-schedules) both morning and evening rush notifications.
 * Safe to call multiple times — cancels existing ones first.
 */
export async function enableRushNotifications(): Promise<void> {
  try {
    await disableRushNotifications();
    const [morningId, eveningId] = await Promise.all([
      notificationService.scheduleMorningRush(),
      notificationService.scheduleEveningRush(),
    ]);
    await _saveIds({ morning: morningId ?? undefined, evening: eveningId ?? undefined });
  } catch (err) {
    console.error('[ScheduledNotifs] enableRushNotifications error', err);
  }
}

/**
 * Cancels both rush notifications and clears stored IDs.
 * Call when driver goes online (they don't need reminders)
 * or when they explicitly disable rush alerts in settings.
 */
export async function disableRushNotifications(): Promise<void> {
  try {
    const ids = await _loadIds();
    await Promise.allSettled([
      ids.morning ? notificationService.cancelScheduledNotification(ids.morning) : Promise.resolve(),
      ids.evening ? notificationService.cancelScheduledNotification(ids.evening) : Promise.resolve(),
    ]);
    await _saveIds({});
  } catch (err) {
    console.error('[ScheduledNotifs] disableRushNotifications error', err);
  }
}

/** Returns true if rush notifications are currently scheduled. */
export async function rushNotificationsEnabled(): Promise<boolean> {
  const ids = await _loadIds();
  return Boolean(ids.morning || ids.evening);
}
