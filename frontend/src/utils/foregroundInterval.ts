/**
 * Network/UI polling that should not run while the app is backgrounded.
 * Saves battery + backend load; callers still get an immediate tick on foreground.
 */
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

type Options = {
  /** Fire once when starting in foreground (default true). */
  runImmediately?: boolean;
  /** Fire once when returning to active (default true). */
  runOnForeground?: boolean;
};

export function setForegroundInterval(
  fn: () => void,
  ms: number,
  options?: Options,
): () => void {
  const runImmediately = options?.runImmediately !== false;
  const runOnForeground = options?.runOnForeground !== false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const clear = () => {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const start = () => {
    if (timer != null) return;
    timer = setInterval(fn, ms);
  };

  const onChange = (state: AppStateStatus) => {
    if (state === 'active') {
      if (runOnForeground) fn();
      start();
    } else {
      clear();
    }
  };

  if (AppState.currentState === 'active') {
    if (runImmediately) fn();
    start();
  }

  const sub: NativeEventSubscription = AppState.addEventListener('change', onChange);

  return () => {
    clear();
    sub.remove();
  };
}
