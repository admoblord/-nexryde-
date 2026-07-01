import { useEffect, useRef, useState } from 'react';

/** Hold a value steady for `intervalMs` to avoid layout thrash from rapid GPS/ETA ticks. */
export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [stable, setStable] = useState(value);
  const latestRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  latestRef.current = value;

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setStable(latestRef.current);
    }, intervalMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, intervalMs]);

  return stable;
}
