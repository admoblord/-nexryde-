/**
 * Full-screen Google Navigation SDK session for drivers.
 * Trip-aware: Trip controls returns to home docks; Call stays one tap away.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { DriverGoogleNavigationSession } from '@/src/components/navigation/DriverGoogleNavigationSession';
import { isGoogleNavigationEnabled } from '@/src/constants/mapEngines';
import { promptExternalNavigation } from '@/src/utils/openExternalNavigation';
import { BRAND } from '@/src/constants/designSystem';
import { useAppStore } from '@/src/store/appStore';

export default function DriverInAppNavigationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const currentTrip = useAppStore((s) => s.currentTrip);
  const params = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    label?: string;
    tripId?: string;
    phase?: string;
  }>();
  const externalFallbackFired = useRef(false);

  const tripId = (params.tripId as string) || currentTrip?.id || '';

  const destination = useMemo(() => {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      lat,
      lng,
      label: typeof params.label === 'string' ? params.label : 'Destination',
    };
  }, [params.lat, params.lng, params.label]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(driver-tabs)/driver-home' as any);
  };

  const openTripHome = () => {
    router.replace('/(driver-tabs)/driver-home' as any);
  };

  const callRider = () => {
    const phone = (currentTrip as { rider_phone?: string } | null)?.rider_phone;
    if (!phone) {
      Alert.alert('Call unavailable', 'Rider phone is not available for this trip.');
      return;
    }
    void Linking.openURL(`tel:${phone}`);
  };

  const useExternal = Platform.OS === 'web' || !isGoogleNavigationEnabled();

  useEffect(() => {
    if (!destination || !useExternal || externalFallbackFired.current) return;
    externalFallbackFired.current = true;
    promptExternalNavigation(destination);
    const t = setTimeout(() => close(), 350);
    return () => clearTimeout(t);
  }, [destination, useExternal]);

  if (!destination) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Missing destination</Text>
        <TouchableOpacity style={styles.btn} onPress={close}>
          <Text style={styles.btnTxt}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (useExternal) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Opening Maps…</Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => {
            promptExternalNavigation(destination);
            close();
          }}
        >
          <Text style={styles.btnTxt}>Open navigation</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <DriverGoogleNavigationSession
        destination={destination}
        onClose={close}
        onUnavailable={() => {
          /* session shows its own fallback CTA */
        }}
      />

      {/* Trip action strip — honest labels: open trip docks, don’t fake arrive/complete */}
      {tripId ? (
        <View style={[styles.tripActions, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
          <TouchableOpacity style={styles.tripChip} onPress={openTripHome} accessibilityLabel="Trip controls">
            <Ionicons name="car-sport" size={16} color={BRAND.primary} />
            <Text style={styles.tripChipTxt}>Trip controls</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tripIconBtn} onPress={callRider} accessibilityLabel="Call rider">
            <Ionicons name="call" size={18} color="#E2E8F0" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.tripIconBtn} onPress={close} accessibilityLabel="Close navigation">
            <Ionicons name="close" size={18} color="#E2E8F0" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1220' },
  center: {
    flex: 1,
    backgroundColor: '#0c1220',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  title: { color: '#E2E8F0', fontSize: 16, fontWeight: '800' },
  btn: {
    backgroundColor: BRAND.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnTxt: { color: '#041016', fontWeight: '900' },
  tripActions: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.35)',
  },
  tripChipTxt: { color: '#F8FAFC', fontWeight: '800', fontSize: 13 },
  tripIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,13,24,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
  },
});
