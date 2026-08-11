/**
 * Google Play User Data policy — Prominent Disclosure for BACKGROUND_LOCATION.
 *
 * Must show an in-app disclosure (not only Privacy Policy) and get affirmative
 * consent *before* calling Location.requestBackgroundPermissionsAsync().
 *
 * The React host (`BackgroundLocationDisclosureHost`) resolves the pending
 * promise when the driver taps Continue or Not now.
 *
 * All BACKGROUND_LOCATION requests in the app MUST go through
 * `requestBackgroundLocationWithDisclosure()` — the verify script enforces this.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export const BG_LOCATION_DISCLOSURE_STORAGE_KEY = '@nexryde/bg_location_disclosure_v1';

/** Exact copy reviewers expect on the prominent disclosure surface. */
export const BG_LOCATION_DISCLOSURE = {
  title: 'Allow NEXRYDE to use your location in the background?',
  body:
    'NEXRYDE collects your location data even when the app is closed or not in use.\n\n' +
    'We use this only while you are Online as a driver to:\n' +
    '• Match you with nearby ride requests\n' +
    '• Share your live position with riders during trips\n' +
    '• Show incoming ride alerts when NEXRYDE is in the background\n\n' +
    'You can stop collection anytime by going Offline or turning off location in system settings.',
  acceptLabel: 'Continue',
  declineLabel: 'Not now',
} as const;

type Listener = (visible: boolean) => void;

let visible = false;
/** Shared in-flight consent so concurrent callers wait on one disclosure. */
let pendingConsent: Promise<boolean> | null = null;
let pendingResolve: ((accepted: boolean) => void) | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) {
    try {
      l(visible);
    } catch {
      /* ignore */
    }
  }
}

export function subscribeBackgroundLocationDisclosure(listener: Listener): () => void {
  listeners.add(listener);
  listener(visible);
  return () => {
    listeners.delete(listener);
  };
}

export function isBackgroundLocationDisclosureVisible(): boolean {
  return visible;
}

export function resolveBackgroundLocationDisclosure(accepted: boolean): void {
  if (!pendingResolve) {
    visible = false;
    emit();
    return;
  }
  const resolve = pendingResolve;
  pendingResolve = null;
  pendingConsent = null;
  visible = false;
  emit();
  resolve(accepted);
  if (accepted) {
    void AsyncStorage.setItem(BG_LOCATION_DISCLOSURE_STORAGE_KEY, new Date().toISOString()).catch(
      () => {},
    );
  }
}

/**
 * Show the prominent disclosure and wait for Continue / Not now.
 * Concurrent callers share the same in-flight prompt (do not auto-decline).
 */
export function promptBackgroundLocationDisclosure(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  if (pendingConsent) return pendingConsent;
  pendingConsent = new Promise<boolean>((resolve) => {
    pendingResolve = resolve;
    visible = true;
    emit();
  });
  return pendingConsent;
}

/** Whether the driver previously accepted the in-app disclosure (not the OS grant). */
export async function hasAcceptedBackgroundLocationDisclosure(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(BG_LOCATION_DISCLOSURE_STORAGE_KEY);
    return !!v;
  } catch {
    return false;
  }
}

/**
 * Single choke-point for BACKGROUND_LOCATION.
 * Returns true only after disclosure Continue + OS grant (or already granted).
 */
export async function requestBackgroundLocationWithDisclosure(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) {
    const nextFg = await Location.requestForegroundPermissionsAsync();
    if (!nextFg.granted) return false;
  }

  const current = await Location.getBackgroundPermissionsAsync();
  if (current.granted) return true;

  const accepted = await promptBackgroundLocationDisclosure();
  if (!accepted) return false;

  const next = await Location.requestBackgroundPermissionsAsync();
  return next.granted;
}
