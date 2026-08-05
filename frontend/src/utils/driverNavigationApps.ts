/**
 * Which app a driver uses for turn-by-turn guidance.
 *
 * NEXRYDE never picks silently — tapping Navigate asks every time, with the
 * driver's last pick surfaced first so the common case is still a single tap.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { isGoogleNavigationEnabled } from '@/src/constants/mapEngines';
import {
  isNavigationAppId,
  navigationAppIdsForPlatform,
  orderByLastUsed,
  type NavigationAppId,
} from '@/src/utils/navigationAppLinks';
import {
  openAppleMapsNavigation,
  openGoogleMapsNavigation,
  openWazeNavigation,
  type NavigationTarget,
} from '@/src/utils/openExternalNavigation';

export type { NavigationAppId };

export type NavigationAppChoice = {
  id: NavigationAppId;
  label: string;
  description: string;
  icon: 'car-sport' | 'navigate' | 'map';
};

const STORAGE_KEY = '@nexryde_preferred_navigation_app';

/**
 * True when the native Navigation SDK can take over the whole screen. When it
 * cannot (iOS, web, flag off) NEXRYDE still guides the driver with the turn
 * card and voice on the trip map, so in-app stays a real option either way.
 */
export function hasFullScreenInAppNavigation(): boolean {
  return isGoogleNavigationEnabled();
}

const CHOICE_COPY: Record<NavigationAppId, Omit<NavigationAppChoice, 'id' | 'description'>> = {
  in_app: { label: 'NEXRYDE navigation', icon: 'car-sport' },
  google_maps: { label: 'Google Maps', icon: 'navigate' },
  apple_maps: { label: 'Apple Maps', icon: 'map' },
  waze: { label: 'Waze', icon: 'navigate' },
};

const CHOICE_DESCRIPTION: Record<Exclude<NavigationAppId, 'in_app'>, string> = {
  google_maps: 'Live traffic and lane guidance',
  apple_maps: 'Built-in iPhone navigation',
  waze: 'Community alerts for police, traffic and road hazards',
};

export function listNavigationAppChoices(): NavigationAppChoice[] {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  return navigationAppIdsForPlatform(platform).map((id) => ({
    id,
    ...CHOICE_COPY[id],
    description:
      id === 'in_app'
        ? hasFullScreenInAppNavigation()
          ? 'Full-screen turn-by-turn without leaving the app'
          : 'Keep guidance on your trip map with voice directions'
        : CHOICE_DESCRIPTION[id],
  }));
}

/** Put the driver's last pick first so repeat trips stay one tap. */
export function orderChoicesByLastUsed(
  choices: NavigationAppChoice[],
  lastUsed: NavigationAppId | null,
): NavigationAppChoice[] {
  return orderByLastUsed(choices, lastUsed);
}

export async function readLastUsedNavigationApp(): Promise<NavigationAppId | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return isNavigationAppId(raw) ? raw : null;
  } catch {
    return null;
  }
}

export async function saveLastUsedNavigationApp(id: NavigationAppId): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* remembering the pick is a convenience, never block navigation on it */
  }
}

/** Launch an external map app. `in_app` is routed by the caller. */
export function openExternalNavigationApp(
  id: Exclude<NavigationAppId, 'in_app'>,
  target: NavigationTarget,
): void {
  const { lat, lng } = target;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  if (id === 'waze') openWazeNavigation(lat, lng);
  else if (id === 'apple_maps') openAppleMapsNavigation(lat, lng);
  else openGoogleMapsNavigation(lat, lng);
}
