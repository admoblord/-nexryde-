/** Shared trip UI — build once, use in both apps. */
export { BottomSheet, useSheetHeights, type SheetSnap } from '@/src/components/trip/BottomSheet';
export { MapBadge, arrivalClockTime, type MapBadgeTone } from '@/src/components/trip/MapBadge';
export { PersonRow, VehicleStrip } from '@/src/components/trip/PersonRow';
export { PrimaryButton, SecondaryButton, DangerButton } from '@/src/components/trip/Buttons';
export { StatusPill, type StatusTone } from '@/src/components/trip/StatusPill';
export { SkeletonRow } from '@/src/components/trip/SkeletonRow';
export { RecentreFab } from '@/src/components/trip/RecentreFab';
export {
  tripMapViewProps,
  routeCasingProps,
  routeLineProps,
  regionForPoints,
  isOutsideRegion,
  toLatLng,
  vehicleAccent,
  vehicleOpacity,
  MAP_FIT_PADDING,
  type LatLng,
  type Coord,
  type VehicleStatus,
} from '@/src/components/trip/mapTreatment';
