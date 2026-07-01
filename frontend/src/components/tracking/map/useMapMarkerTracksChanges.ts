import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * Android caches custom Marker views when tracksViewChanges=false — first paint can be blank.
 * Keep true briefly after mount/trip change so emoji pins snapshot correctly.
 */
export function useMapMarkerTracksChanges(resetKey: string): boolean {
  const [capture, setCapture] = useState(Platform.OS === 'android');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setCapture(true);
    const t = setTimeout(() => setCapture(false), 3500);
    return () => clearTimeout(t);
  }, [resetKey]);

  return Platform.OS === 'ios' || capture;
}
