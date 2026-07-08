import {
  hasNativeOverlayPermission,
  hideNativeDriverBubble,
  requestNativeOverlayPermission,
  showNativeDriverBubble,
} from '@/src/services/driverNativeExperience';

export function useFloatingDriverBubble() {
  return {
    enable: () => showNativeDriverBubble('online', 0),
    disable: hideNativeDriverBubble,
    updateStatus: (status = 'online', badge = 0) => showNativeDriverBubble(status, badge),
    requestPermission: async () => {
      requestNativeOverlayPermission();
      return hasNativeOverlayPermission();
    },
    hasPermission: hasNativeOverlayPermission,
  };
}
