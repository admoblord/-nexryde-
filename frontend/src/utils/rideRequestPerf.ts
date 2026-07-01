/**
 * Performance marks for the rider "Request Ride" → Finding Driver flow.
 * Target: button click → overlay visible < 200ms.
 */
type RideRequestMark =
  | 'REQUEST_RIDE_BUTTON_CLICKED'
  | 'FINDING_DRIVER_SCREEN_OPENED'
  | 'DRIVER_SEARCH_STARTED'
  | 'FIRST_DRIVER_FOUND';

const marks = new Map<RideRequestMark, number>();

function nowMs(): number {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

export const rideRequestPerf = {
  reset() {
    marks.clear();
  },

  start(mark: RideRequestMark = 'REQUEST_RIDE_BUTTON_CLICKED') {
    marks.clear();
    marks.set(mark, nowMs());
    if (__DEV__) console.log(`[ride-perf] ${mark}`);
  },

  mark(mark: RideRequestMark) {
    marks.set(mark, nowMs());
    if (__DEV__) console.log(`[ride-perf] ${mark}`);
  },

  delta(from: RideRequestMark, to: RideRequestMark): number | null {
    const a = marks.get(from);
    const b = marks.get(to);
    if (a == null || b == null) return null;
    return Math.round(b - a);
  },

  report() {
    const clickToScreen = this.delta('REQUEST_RIDE_BUTTON_CLICKED', 'FINDING_DRIVER_SCREEN_OPENED');
    const screenToSearch = this.delta('FINDING_DRIVER_SCREEN_OPENED', 'DRIVER_SEARCH_STARTED');
    const searchToDriver = this.delta('DRIVER_SEARCH_STARTED', 'FIRST_DRIVER_FOUND');

    const lines = [
      '[ride-perf] --- timing report ---',
      clickToScreen != null ? `click → screen: ${clickToScreen}ms` : 'click → screen: (pending)',
      screenToSearch != null ? `screen → search: ${screenToSearch}ms` : 'screen → search: (pending)',
      searchToDriver != null ? `search → driver: ${searchToDriver}ms` : 'search → driver: (pending)',
    ];
    if (__DEV__) console.log(lines.join('\n'));
    return { clickToScreen, screenToSearch, searchToDriver };
  },
};
