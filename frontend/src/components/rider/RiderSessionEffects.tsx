/**
 * Single mount point for rider live-session side effects.
 * Avoids double polling / duplicate accelerometer SOS when both
 * `(rider-tabs)` and `rider` stack layouts are in the nav tree.
 */
import useActiveTripCoordinator from '@/src/hooks/useActiveTripCoordinator';
import usePanicShakeGuard from '@/src/hooks/usePanicShakeGuard';
import { useAppStore } from '@/src/store/appStore';

export function RiderSessionEffects() {
  const isRider = useAppStore((s) => s.user?.role === 'rider');
  useActiveTripCoordinator({ enabled: isRider });
  usePanicShakeGuard();
  return null;
}
