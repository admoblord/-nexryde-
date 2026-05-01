/**
 * SSL/TLS Security Configuration for NEXRYDE
 *
 * Certificate pinning helps prevent man-in-the-middle attacks by validating
 * that the server's certificate matches expected values.
 *
 * For React Native/Expo, certificate pinning is best configured at the native level.
 * This module provides runtime validation as an additional layer.
 */

/** Known production API hosts (Cloud Run may show either URL shape). */
const ALLOWED_BACKEND_HOSTS = new Set([
  'nexryde-backend-993913300770.us-central1.run.app',
  'nexryde-backend-pkzkptjzba-uc.a.run.app',
]);

/**
 * Validate that API requests are going to the expected host.
 * Prevents request redirection attacks.
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
    const h = parsed.hostname;
    if (ALLOWED_BACKEND_HOSTS.has(h)) return true;
    // Any Cloud Run URL for this service name (future revision URLs).
    return h.endsWith('.run.app') && h.startsWith('nexryde-backend');
  } catch {
    return false;
  }
}

/**
 * Security headers to include with all requests.
 */
export const SECURITY_HEADERS = {
  'X-Requested-With': 'NEXRYDE-App',
  'X-App-Version': '1.1.6',
};
