import { Redirect } from 'expo-router';

/**
 * Legacy route — root saved-places was a mock. Real data lives under rider stack.
 */
export default function LegacySavedPlacesRedirect() {
  return <Redirect href="/rider/saved-places" />;
}
