/**
 * SSL/TLS Security Configuration for NEXRYDE
 *
 * Certificate pinning helps prevent man-in-the-middle attacks by validating
 * that the server's certificate matches expected values.
 *
 * For React Native/Expo, certificate pinning is best configured at the native level.
 * This module provides runtime validation as an additional layer.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { allowedApiHosts } from '@/src/config/backendOrigin';

/** App + build label for support and backend diagnostics (kept in sync with native builds). */
function clientVersionLabel(): string {
  const v =
    Constants.nativeAppVersion ||
    Constants.expoConfig?.version ||
    (Constants as { manifest?: { version?: string } }).manifest?.version ||
    'unknown';
  const build =
    Constants.nativeBuildVersion ||
    Constants.expoConfig?.ios?.buildNumber ||
    (Constants.expoConfig?.android as { versionCode?: string } | undefined)?.versionCode;
  if (build != null && String(build).trim()) {
    return `${v} (${String(build).trim()})`;
  }
  return v;
}

/**
 * Validate that API requests are going to the expected host.
 * Prevents request redirection attacks.
 *
 * The allowed set is derived from the configured backend origin, not from a
 * hard-coded provider. This used to permit only Cloud Run hosts beginning
 * with `nexryde-backend`; every other host failed with
 * `Security: Invalid API endpoint`. The allowlist is now derived from
 * `backend.config.json` / `EXPO_PUBLIC_BACKEND_URL`.
 */
export function validateApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const devHost =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname.startsWith('192.168.') ||
      parsed.hostname.startsWith('10.') ||
      parsed.hostname.endsWith('.local');
    if (__DEV__ && devHost) {
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    }
    if (parsed.protocol !== 'https:') return false;
    return allowedApiHosts().has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Security headers to include with all requests.
 */
export const SECURITY_HEADERS = {
  'X-Requested-With': 'NEXRYDE-App',
  'X-App-Version': clientVersionLabel(),
  'X-App-Platform': Platform.OS,
};
