import RoleRouteRedirect from '@/src/components/RoleRouteRedirect';

export default function LegacyEarningsRedirect() {
  return (
    <RoleRouteRedirect
      riderHref="/(rider-tabs)/rider-trips"
      driverHref="/(driver-tabs)/driver-earnings"
    />
  );
}
