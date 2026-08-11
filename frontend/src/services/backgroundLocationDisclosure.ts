/**
 * Google Play User Data policy — Prominent Disclosure for BACKGROUND_LOCATION.
 *
 * Must show an in-app disclosure (not only Privacy Policy) and get affirmative
 * consent *before* calling Location.requestBackgroundPermissionsAsync().
 *
 * The React host (`BackgroundLocationDisclosureHost`) resolves the pending
 * promise when the driver taps Continue or Not now.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * Returns true only if the driver affirmatively continues.
 *
 * On web / already-showing, resolves false (never auto-accept).
 */
export function promptBackgroundLocationDisclosure(): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(false);
  if (pendingResolve) {
    // Already showing — do not stack; treat as decline for this caller.
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    pendingResolve = resolve;
    visible = true;
    emit();
  });
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
