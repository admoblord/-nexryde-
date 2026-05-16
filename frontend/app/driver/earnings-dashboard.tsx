import { Redirect } from 'expo-router';

/**
 * Legacy path — earnings live on the driver tab stack.
 */
export default function DriverEarningsDashboardRedirect() {
  return <Redirect href="/(driver-tabs)/driver-earnings" />;
}
