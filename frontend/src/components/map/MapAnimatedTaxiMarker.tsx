/**
 * Booking / home nearby-driver marker — thin wrapper over shared MapVehicleMarker.
 */
import React from 'react';
import { MapVehicleMarker, type MapVehicleStatus } from '@/src/components/map/MapVehicleMarker';

type Props = {
  size?: number;
  searchMode?: boolean;
  heading?: number | null;
  status?: MapVehicleStatus;
};

export function MapAnimatedTaxiMarker({
  size = 36,
  searchMode,
  heading = null,
  status,
}: Props) {
  const resolved: MapVehicleStatus =
    status ?? (searchMode ? 'on_trip' : 'available');
  return (
    <MapVehicleMarker
      size={size}
      heading={heading}
      status={resolved}
      showHalo={Boolean(searchMode)}
    />
  );
}

export default MapAnimatedTaxiMarker;
