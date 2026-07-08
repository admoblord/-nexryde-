import {
  hasNativeOverlayPermission,
  hideNativeDriverBubble,
  requestNativeOverlayPermission,
  showNativeDriverBubble,
} from '@/src/services/driverNativeExperience';

export type BubbleStatus = 'online' | 'offline' | 'on_trip' | 'arrived';

export default {
  show: (status: BubbleStatus = 'online', badge = 0) => showNativeDriverBubble(status, badge),
  update: (status: BubbleStatus = 'online', badge = 0) => showNativeDriverBubble(status, badge),
  hide: hideNativeDriverBubble,
  isRunning: () => Promise.resolve(false),
  hasPermission: hasNativeOverlayPermission,
  requestPermission: requestNativeOverlayPermission,
};
