import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const THEME_PREF_STORAGE_KEY = '@nexryde_theme_preference';

export type ThemePreference = 'light' | 'dark' | 'auto';

/** Applies RN appearance override. `auto` clears override so the app follows the OS. */
export function applyThemePreference(pref: ThemePreference): void {
  if (pref === 'auto') {
    Appearance.setColorScheme(null);
  } else {
    Appearance.setColorScheme(pref);
  }
}

export async function persistThemePreference(pref: ThemePreference): Promise<void> {
  await AsyncStorage.setItem(THEME_PREF_STORAGE_KEY, pref);
}

export async function loadStoredThemePreference(): Promise<ThemePreference | null> {
  try {
    const v = await AsyncStorage.getItem(THEME_PREF_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** Call once at app root so the last choice applies before settings screens mount. */
export async function bootstrapThemeFromStorage(): Promise<void> {
  const stored = await loadStoredThemePreference();
  if (stored) applyThemePreference(stored);
}
