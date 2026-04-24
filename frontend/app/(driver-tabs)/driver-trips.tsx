import { Redirect } from 'expo-router';
import { DRIVER_TRIPS_STACK_HREF } from '@/src/constants/driverNavigation';

export default function DriverTripsTabRedirect() {
  return <Redirect href={DRIVER_TRIPS_STACK_HREF} />;
}
