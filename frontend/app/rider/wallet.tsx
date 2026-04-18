import { Redirect } from 'expo-router';

/**
 * Legacy route — wallet top-up uses Squad on the tab wallet screen.
 */
export default function LegacyRiderWalletRedirect() {
  return <Redirect href="/(rider-tabs)/rider-wallet" />;
}
