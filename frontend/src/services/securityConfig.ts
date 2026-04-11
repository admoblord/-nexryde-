/**
 * SSL/TLS Security Configuration for NEXRYDE
 *
 * Certificate pinning helps prevent man-in-the-middle attacks by validating
 * that the server's certificate matches expected values.
 *
 * For React Native/Expo, certificate pinning is best configured at the native level.
 * This module provides runtime validation as an additional layer.
 */

const BACKEND_HOST = 'nexryde-backend-993913300770.us-central1.run.app';

/**
 * Validate that API requests are going to the expected host.
 * Prevents request redirection attacks.
 */
export function validateApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === BACKEND_HOST && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Security headers to include with all requests.
 */
export const SECURITY_HEADERS = {
  'X-Requested-With': 'NEXRYDE-App',
  'X-App-Version': '1.0.1',
};
