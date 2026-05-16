/**
 * Legacy route — active trips live on driver-home (DriverLiveMapView).
 * Deep links and old navigation land here; we forward to the canonical map.
 */
import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function DriverTripsRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string }>();

  useEffect(() => {
    const tripId = params.tripId ? String(params.tripId) : undefined;
    router.replace({
      pathname: '/(driver-tabs)/driver-home',
      params: tripId ? { tripId } : undefined,
    } as any);
  }, [params.tripId, router]);

  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color="#22C55E" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
