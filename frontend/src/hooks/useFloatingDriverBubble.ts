/** Floating bubble removed — hook returns permanent no-ops. */
const noop = () => {};
const asyncNoop = async () => false;
export function useFloatingDriverBubble() {
  return {
    enable: noop,
    disable: noop,
    updateStatus: noop,
    requestPermission: asyncNoop,
    hasPermission: asyncNoop,
  };
}
