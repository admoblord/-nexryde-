import { Redirect } from 'expo-router';

export default function LegacyWalletRedirect() {
  return <Redirect href="/(rider-tabs)/rider-wallet" />;
}
