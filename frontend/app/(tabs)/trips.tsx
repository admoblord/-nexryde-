import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

export default function LegacyTripsRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-trips"
      driverHref="/(driver-tabs)/driver-trips"
    />
  );
}
