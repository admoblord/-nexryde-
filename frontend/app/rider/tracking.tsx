import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { normalizeTripStatus } from '@/src/utils/tripStatus';

export default function TrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string; pickup?: string; destination?: string }>();
  const { user, currentTrip, setCurrentTrip } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>('pending');
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [securityPromptShown, setSecurityPromptShown] = useState(false);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const [guardianAlert, setGuardianAlert] = useState<any>(null);

  const effectiveTripId = params.tripId || currentTrip?.id || '';

  useEffect(() => {
    if (!effectiveTripId || !user?.id) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/status`, {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (!mounted || !res.ok || !data?.success) return;

        const normalizedStatus = normalizeTripStatus(data.status, data.payment_status);
        setTripStatus(normalizedStatus);
        setPaymentStatus(data.payment_status || 'pending');
        setDriverInfo(data.driver_info || null);
        setDriverLocation(data.driver_location || null);
        setGuardianAlert(data.guardian_alert || null);

        if (currentTrip) {
          setCurrentTrip({
            ...currentTrip,
            status: normalizedStatus || currentTrip.status,
            driver_id: data.driver_info?.driver_id || currentTrip.driver_id,
          });
        }

        if (normalizedStatus === 'arrived' && !securityPromptShown) {
          setSecurityPromptShown(true);
          Alert.alert(
            'Driver Arrived',
            'Your driver is at the pickup point. Please show your security code before the ride starts.',
            [
              {
                text: 'Show Code',
                onPress: () => router.push({ pathname: '/rider/security-code', params: { tripId: effectiveTripId, driverId: data.driver_info?.driver_id || '' } } as any),
              },
            ]
          );
        }

        if (normalizedStatus === 'cancelled') {
          setCurrentTrip(null);
          router.replace('/(rider-tabs)/rider-home');
          return;
        }

        if (normalizedStatus === 'completed') {
          router.replace({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any);
          return;
        }
      } catch {}
      if (mounted) setLoading(false);
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [effectiveTripId, user?.id]);

  const handleCancelRide = async () => {
    if (!effectiveTripId || !user?.id) return;
    if (['ongoing', 'pending_payment', 'completed', 'cancelled'].includes(tripStatus)) {
      router.back();
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/cancel`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ cancelled_by: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Cannot cancel', data?.detail || 'Unable to cancel this trip.');
        return;
      }
      setCurrentTrip(null);
      router.back();
    } catch {
      Alert.alert('Error', 'Could not cancel ride.');
    }
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {tripStatus === 'accepted'
              ? 'Driver Assigned'
              : tripStatus === 'arrived'
                ? 'Driver Arrived'
                : tripStatus === 'ongoing'
                  ? 'Trip in Progress'
                  : tripStatus === 'pending_payment'
                    ? 'Trip Completed - Payment Pending'
                    : tripStatus === 'cancelled'
                      ? 'Trip Cancelled'
                      : 'Finding Driver'}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          {/* Map Area */}
          <View style={styles.mapPlaceholder}>
            <View style={styles.mapOverlay}>
              <Ionicons name="navigate" size={40} color={COLORS.accentGreen} />
              <Text style={styles.mapTitle}>
                {tripStatus === 'accepted'
                  ? 'Driver is on the way'
                  : tripStatus === 'arrived'
                    ? 'Driver is at pickup'
                    : tripStatus === 'ongoing'
                      ? 'Live Trip Tracking'
                      : tripStatus === 'pending_payment'
                        ? 'Trip ended, complete payment'
                        : tripStatus === 'cancelled'
                          ? 'Trip has been cancelled'
                          : 'Searching Nearby Drivers'}
              </Text>
              <Text style={styles.mapSubtitle}>
                {tripStatus === 'accepted'
                  ? 'Your driver has accepted. Get ready for pickup.'
                  : tripStatus === 'arrived'
                    ? 'Show your security code before entering the vehicle'
                    : tripStatus === 'ongoing'
                      ? 'Your trip is currently in progress'
                      : tripStatus === 'pending_payment'
                        ? 'Trip is completed. Confirm payment and view receipt.'
                        : tripStatus === 'cancelled'
                          ? 'Your trip was cancelled.'
                          : 'Live tracking will appear once a driver accepts'}
              </Text>
            </View>
          </View>

          {/* Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.loadingContainer}>
              {loading ? (
                <ActivityIndicator size="large" color={COLORS.accentGreen} />
              ) : (
                <Ionicons
                  name={
                    tripStatus === 'accepted'
                      ? 'car-sport'
                      : tripStatus === 'arrived'
                        ? 'location'
                        : tripStatus === 'ongoing'
                          ? 'navigate'
                          : tripStatus === 'pending_payment'
                            ? 'card'
                            : tripStatus === 'cancelled'
                              ? 'close-circle'
                              : 'search'
                  }
                  size={36}
                  color={COLORS.accentGreen}
                />
              )}
            </View>
            <Text style={styles.statusTitle}>
              {tripStatus === 'accepted'
                ? `${driverInfo?.name || 'Your driver'} accepted your ride`
                : tripStatus === 'arrived'
                  ? `${driverInfo?.name || 'Your driver'} has arrived`
                  : tripStatus === 'ongoing'
                    ? 'Ride in progress'
                    : tripStatus === 'pending_payment'
                      ? 'Payment pending'
                      : tripStatus === 'cancelled'
                        ? 'Trip cancelled'
                        : 'Finding your driver...'}
            </Text>
            <Text style={styles.statusSubtitle}>
              {tripStatus === 'accepted'
                ? `${driverInfo?.vehicle || 'Vehicle'}${driverInfo?.plate ? ` • ${driverInfo.plate}` : ''}`
                : tripStatus === 'arrived'
                  ? `${driverInfo?.name || 'Driver'} is waiting for you at pickup`
                  : tripStatus === 'ongoing'
                    ? 'You can contact your driver using chat or call'
                    : tripStatus === 'pending_payment'
                      ? `Payment status: ${paymentStatus || 'pending'}`
                      : tripStatus === 'cancelled'
                        ? 'You can return to home and book another ride'
                        : 'This usually takes 1-2 minutes'}
            </Text>

            {driverLocation && (
              <View style={styles.driverLocationBadge}>
                <Ionicons name="locate" size={16} color={COLORS.info} />
                <Text style={styles.driverLocationText}>
                  Driver live location active
                </Text>
              </View>
            )}

            {/* Route Info */}
            <View style={styles.routeInfo}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
                <Text style={styles.routeText} numberOfLines={1}>{(params.pickup as string) || 'Your location'}</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.accentBlue }]} />
                <Text style={styles.routeText} numberOfLines={1}>{(params.destination as string) || 'Destination'}</Text>
              </View>
            </View>
          </View>

          {guardianAlert?.active && (
            <View style={styles.guardianCard}>
              <Ionicons name="shield-outline" size={20} color={COLORS.warning} />
              <View style={{ flex: 1 }}>
                <Text style={styles.guardianTitle}>Safety Check</Text>
                <Text style={styles.guardianText}>{guardianAlert.message || 'We are monitoring this trip for safety.'}</Text>
              </View>
            </View>
          )}

          {driverInfo && (tripStatus === 'accepted' || tripStatus === 'arrived' || tripStatus === 'ongoing') && (
            <View style={styles.actionsCard}>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any)}
              >
                <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
                <Text style={styles.actionBtnText}>Chat Driver</Text>
              </TouchableOpacity>

              {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/rider/security-code', params: { tripId: effectiveTripId, driverId: driverInfo?.driver_id || '' } } as any)}
                >
                  <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.actionBtnText}>Show Code</Text>
                </TouchableOpacity>
              )}

              {(tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)}
                >
                  <Ionicons name="card-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.actionBtnText}>Payment Info</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Cancel Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={handleCancelRide}
          >
            <Text style={styles.cancelText}>
              {['ongoing', 'pending_payment', 'completed', 'cancelled'].includes(tripStatus) ? 'Close Tracking' : 'Cancel Ride'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  mapOverlay: {
    flex: 1,
    backgroundColor: 'rgba(58, 209, 115, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  mapSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginTop: 4,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionsCard: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  actionBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  driverLocationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.sm,
  },
  driverLocationText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.info,
  },
  guardianCard: {
    marginTop: SPACING.lg,
    backgroundColor: '#FFF7ED',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#FED7AA',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  guardianTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.warning,
    marginBottom: 2,
  },
  guardianText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    lineHeight: 18,
  },
  loadingContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  statusTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.lg,
  },
  routeInfo: {
    width: '100%',
    paddingHorizontal: SPACING.lg,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.lightBorder,
    marginLeft: 5,
    marginVertical: 4,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  cancelButton: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  cancelText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.error,
  },
});
