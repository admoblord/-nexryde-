import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const THEME_PREF_STORAGE_KEY = '@nexryde_theme_preference';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

type AppearanceState = {
  preference: ThemePreference;
  setPreference: (pref: ThemePreference) => void;
};

export const useAppearanceStore = create<AppearanceState>((set) => ({
  preference: 'auto',
  setPreference: (preference) => set({ preference }),
}));

export function normalizeThemePreference(raw: unknown): ThemePreference {
  return raw === 'light' || raw === 'dark' || raw === 'auto' ? raw : 'auto';
}

/**
 * Apply Light / Dark / Follow System in JS only.
 *
 * Do NOT call React Native `Appearance.setColorScheme(...)`.
 * On New Architecture iOS, that TurboModule void method mutates
 * `UIWindow.overrideUserInterfaceStyle` and can SIGABRT at launch
 * (especially when clearing with `null` → `"unspecified"`).
 *
 * Theme is resolved via Zustand preference + `useColorScheme()` for `auto`.
 */
export function applyThemePreference(pref: ThemePreference): void {
  const normalized = normalizeThemePreference(pref);
  useAppearanceStore.getState().setPreference(normalized);
}

export async function persistThemePreference(pref: ThemePreference): Promise<void> {
  const normalized = normalizeThemePreference(pref);
  applyThemePreference(normalized);
  try {
    await AsyncStorage.setItem(THEME_PREF_STORAGE_KEY, normalized);
  } catch {
    /* storage unavailable — preference still applied in-memory */
  }
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
  try {
    const stored = await loadStoredThemePreference();
    applyThemePreference(stored || 'auto');
  } catch {
    applyThemePreference('auto');
  }
}

export function useAppearancePreference(): ThemePreference {
  return useAppearanceStore((state) => state.preference);
}

export function useResolvedAppearanceTheme(): {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  systemTheme: ResolvedTheme;
  isDark: boolean;
} {
  const preference = useAppearancePreference();
  const systemScheme = useColorScheme();
  const systemTheme: ResolvedTheme = systemScheme === 'dark' ? 'dark' : 'light';
  const resolvedTheme: ResolvedTheme = preference === 'auto' ? systemTheme : preference;
  return {
    preference,
    resolvedTheme,
    systemTheme,
    isDark: resolvedTheme === 'dark',
  };
}
