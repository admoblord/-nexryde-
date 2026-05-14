/** Floating bubble removed — all methods are permanent no-ops. */
export type BubbleStatus = 'online' | 'offline' | 'on_trip' | 'arrived';
const noop = () => {};
export default {
  show: noop,
  update: noop,
  hide: noop,
  isRunning: () => Promise.resolve(false),
  hasPermission: () => Promise.resolve(false),
  requestPermission: noop,
};
