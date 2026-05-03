import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import {
  BACKEND_URL,
  activateInvisibleShieldMode,
  confirmInvisibleShieldSafeArrival,
  confirmSafeArrival,
  getAuthHeaders,
  respondToSafetyCheck,
  runFakeDriverAlertCheck,
  setGeoFenceTripLock,
  triggerSOS,
  uploadInvisibleShieldAudio,
  verifyRiderFaceAtPickup,
} from '@/src/services/api';
import { normalizeTripStatus } from '@/src/utils/tripStatus';
import { useRiderTripRealtime, type RiderTripWsMessage } from '@/src/hooks/useRiderTripRealtime';
import { useTripSafetyRecording } from '@/src/hooks/useTripSafetyRecording';
import MapComponent from '@/src/components/MapComponent';
import { TrafficAI, type TrafficRoute } from '@/src/services/trafficAI';
import notificationService from '@/src/services/notifications';
import { RideRecordingService } from '@/src/services/rideRecording';

export default function TrackingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tripId?: string; pickup?: string; destination?: string }>();
  const { user, token, currentTrip, setCurrentTrip } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  const [tripStatus, setTripStatus] = useState<string>('pending');
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [securityPromptShown, setSecurityPromptShown] = useState(false);
  const [driverLocation, setDriverLocation] = useState<any>(null);
  const [guardianAlert, setGuardianAlert] = useState<any>(null);
  const [optimizedRoute, setOptimizedRoute] = useState<TrafficRoute | null>(null);
  const [faceVerifiedAtStart, setFaceVerifiedAtStart] = useState(false);
  const [silentProtecting, setSilentProtecting] = useState(false);
  const [checkingDriverFace, setCheckingDriverFace] = useState(false);
  const [verifyingPickupFace, setVerifyingPickupFace] = useState(false);
  const [riderFaceVerifiedAtPickup, setRiderFaceVerifiedAtPickup] = useState(false);
  const [geoFenceLock, setGeoFenceLock] = useState<any>(null);
  const [armingGeoFence, setArmingGeoFence] = useState(false);
  const [invisibleShieldMode, setInvisibleShieldMode] = useState<any>(null);
  const [speedSpikeAlert, setSpeedSpikeAlert] = useState<any>(null);
  const [gpsSpoofingAlert, setGpsSpoofingAlert] = useState<any>(null);
  const [safeArrivalCheck, setSafeArrivalCheck] = useState<any>(null);
  const [armingInvisibleShield, setArmingInvisibleShield] = useState(false);
  const [confirmingShieldSafe, setConfirmingShieldSafe] = useState(false);
  const [confirmingSafeArrival, setConfirmingSafeArrival] = useState(false);
  const [respondingSafety, setRespondingSafety] = useState<'safe' | 'need_help' | null>(null);
  const [driverStopReason, setDriverStopReason] = useState<{ reason?: string; submitted_at?: string } | null>(null);
  const [isFavoriteDriver, setIsFavoriteDriver] = useState(false);
  const [checkingFavorite, setCheckingFavorite] = useState(false);
  const [showFavoritePrompt, setShowFavoritePrompt] = useState(false);
  const [addingFavorite, setAddingFavorite] = useState(false);
  const favoritePromptShownRef = useRef<string | null>(null);
  const pickupAlertSentRef = useRef(false);
  const geoFenceAlertShownRef = useRef<string | null>(null);
  const speedSpikeAlertShownRef = useRef<string | null>(null);
  const gpsSpoofingAlertShownRef = useRef<string | null>(null);
  const shieldUploadTripIdRef = useRef<string | null>(null);
  const safeArrivalPromptShownRef = useRef<string | null>(null);
  const nativeMapRef = useRef(null);
  const navigationLockRef = useRef<string | null>(null);
  const arrivedPromptShownRef = useRef<string | null>(null);
  const navigateOnce = useCallback(
    (key: string, run: () => void) => {
      if (navigationLockRef.current === key) return;
      navigationLockRef.current = key;
      run();
    },
    []
  );

  const getCoords = useCallback((value: unknown): { lat: number; lng: number } | null => {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const lat = typeof record.lat === 'number' ? record.lat : typeof record.latitude === 'number' ? record.latitude : null;
    const lng = typeof record.lng === 'number' ? record.lng : typeof record.longitude === 'number' ? record.longitude : null;
    return lat != null && lng != null ? { lat, lng } : null;
  }, []);

  const effectiveTripId = params.tripId || currentTrip?.id || '';
  const { recordingStatus, currentRecording, reportSafetyIncident } = useTripSafetyRecording(currentTrip);

  // Helpers for active-call-permitted states
  const ACTIVE_CALL_STATES = ['accepted', 'arrived', 'ongoing', 'pending_payment'];
  const isActiveRide = ACTIVE_CALL_STATES.includes(tripStatus);
  const callAllowed = isActiveRide || isFavoriteDriver;

  // Mask a phone number for display: 08012345678 → 0801***5678
  const maskPhone = (phone: string | null | undefined): string => {
    if (!phone) return '';
    const d = phone.replace(/\s+/g, '').replace(/-/g, '');
    if (d.length >= 8) return d.slice(0, 4) + '***' + d.slice(-4);
    return phone;
  };

  // Check if this driver is favorited
  const checkIsFavorite = useCallback(async (driverId: string) => {
    if (!user?.id || !driverId) return;
    setCheckingFavorite(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/users/${user.id}/favorite-drivers/${driverId}/check`,
        { headers: getAuthHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setIsFavoriteDriver(Boolean(data?.is_favorite));
      }
    } catch { /* silent */ }
    finally { setCheckingFavorite(false); }
  }, [user?.id]);

  // Add driver to favorites
  const handleAddFavorite = useCallback(async (driverId: string) => {
    if (!user?.id || !driverId) return;
    setAddingFavorite(true);
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/users/${user.id}/favorite-drivers`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ driver_id: driverId }),
        }
      );
      if (res.ok) {
        setIsFavoriteDriver(true);
        Alert.alert('Added to Favorites', 'You can call this driver after future rides too.');
      }
    } catch {
      Alert.alert('Error', 'Could not add driver to favorites.');
    } finally {
      setAddingFavorite(false);
      setShowFavoritePrompt(false);
    }
  }, [user?.id]);
  const pickupCoords = getCoords(currentTrip?.pickup_location);
  const dropoffCoords = getCoords(currentTrip?.dropoff_location);
  const liveDriverCoords = getCoords(driverLocation);
  const routePolyline =
    pickupCoords && dropoffCoords
      ? [
          { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
          ...(liveDriverCoords && (tripStatus === 'accepted' || tripStatus === 'arrived' || tripStatus === 'ongoing')
            ? [{ latitude: liveDriverCoords.lat, longitude: liveDriverCoords.lng }]
            : []),
          { latitude: dropoffCoords.lat, longitude: dropoffCoords.lng },
        ]
      : [];
  useEffect(() => {
    let active = true;
    const loadOptimizedRoute = async () => {
      if (!pickupCoords || !dropoffCoords) {
        if (active) setOptimizedRoute(null);
        return;
      }
      const routes = await TrafficAI.getOptimizedRoutes(
        { latitude: pickupCoords.lat, longitude: pickupCoords.lng },
        { latitude: dropoffCoords.lat, longitude: dropoffCoords.lng },
        { prioritizeTime: true, avoidTolls: false }
      );
      if (active) setOptimizedRoute(routes[0] || null);
    };
    void loadOptimizedRoute();
    return () => {
      active = false;
    };
  }, [pickupCoords?.lat, pickupCoords?.lng, dropoffCoords?.lat, dropoffCoords?.lng]);
  const mapTitle =
    tripStatus === 'accepted'
      ? 'Driver is on the way'
      : tripStatus === 'arrived'
        ? 'Driver is at pickup'
        : tripStatus === 'ongoing'
          ? 'Live Trip Tracking'
          : tripStatus === 'pending_payment'
            ? 'Trip ended, complete payment'
            : tripStatus === 'cancelled'
              ? 'Trip has been cancelled'
              : 'Searching Nearby Drivers';
  const mapSubtitle =
    tripStatus === 'accepted'
      ? 'Your driver has accepted. Get ready for pickup.'
      : tripStatus === 'arrived'
        ? 'Driver arrived — tap "Show Pick-up Code" and hand your phone to the driver'
        : tripStatus === 'ongoing'
          ? 'Your trip is currently in progress'
          : tripStatus === 'pending_payment'
            ? 'Trip is completed. Confirm payment and view receipt.'
            : tripStatus === 'cancelled'
              ? 'Your trip was cancelled.'
              : 'Live tracking will appear once a driver accepts';

  const fetchStatus = useCallback(async () => {
    if (!effectiveTripId || !user?.id) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/trips/${effectiveTripId}/status`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) return;

      const normalizedStatus = normalizeTripStatus(data.status, data.payment_status);
      const shieldPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(data.invisible_shield_mode?.active) &&
        !data.invisible_shield_mode?.confirmed_safe_at &&
        !data.invisible_shield_mode?.auto_escalated_at;
      const safeArrivalPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(data.safe_arrival_check?.required) &&
        !data.safe_arrival_check?.confirmed_at;
      const screenStatus = shieldPendingConfirmation || safeArrivalPendingConfirmation ? 'pending_payment' : normalizedStatus;
      setTripStatus(screenStatus);
      setPaymentStatus(data.payment_status || 'pending');
      setDriverInfo(data.driver_info || null);
      setDriverLocation(data.driver_location || null);
      setGuardianAlert(data.guardian_alert || null);
      setFaceVerifiedAtStart(Boolean(data.face_verified_at_start));
      setRiderFaceVerifiedAtPickup(Boolean(data.rider_face_verified_at_pickup));
      setGeoFenceLock(data.geo_fence_trip_lock || null);
      setSpeedSpikeAlert(data.speed_spike_alert || null);
      setGpsSpoofingAlert(data.gps_spoofing_alert || null);
      setDriverStopReason(data.driver_stop_reason || null);
      setInvisibleShieldMode(data.invisible_shield_mode || null);
      setSafeArrivalCheck(data.safe_arrival_check || null);

      {
        const prev = useAppStore.getState().currentTrip;
        if (prev) {
          setCurrentTrip({
            ...prev,
            status: (screenStatus || prev.status) as typeof prev.status,
            driver_id: data.driver_info?.driver_id || prev.driver_id,
            geo_fence_trip_lock: data.geo_fence_trip_lock || (prev as any).geo_fence_trip_lock,
            speed_spike_alert: data.speed_spike_alert || (prev as any).speed_spike_alert,
            gps_spoofing_alert: data.gps_spoofing_alert || (prev as any).gps_spoofing_alert,
            invisible_shield_mode: data.invisible_shield_mode || (prev as any).invisible_shield_mode,
            safe_arrival_check: data.safe_arrival_check || (prev as any).safe_arrival_check,
            rider_face_verified_at_pickup:
              data.rider_face_verified_at_pickup ?? (prev as any).rider_face_verified_at_pickup,
          });
        }
      }

      if (screenStatus === 'arrived' && !pickupAlertSentRef.current && !securityPromptShown && arrivedPromptShownRef.current !== effectiveTripId) {
        pickupAlertSentRef.current = true;
        arrivedPromptShownRef.current = effectiveTripId;
        setSecurityPromptShown(true);
        Alert.alert(
          'Driver Arrived',
          'Your driver is at the pickup point. Open your pick-up code and show it to the driver.',
          [
            {
              text: 'Show Code',
              onPress: () =>
                router.push({
                  pathname: '/rider/security-code',
                  params: { trip_id: effectiveTripId },
                } as any),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
      }

      if (screenStatus === 'cancelled') {
        setCurrentTrip(null);
        navigateOnce(`cancelled-${effectiveTripId}`, () => router.replace('/(rider-tabs)/rider-home'));
        return;
      }

      if (screenStatus === 'completed') {
        navigateOnce(`receipt-${effectiveTripId}`, () =>
          router.replace({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
        );
      }
    } catch {
      /* network */
    } finally {
      setLoading(false);
    }
  }, [
    effectiveTripId,
    user?.id,
    router,
    securityPromptShown,
    setCurrentTrip,
  ]);

  const handleTripWs = useCallback(
    (msg: RiderTripWsMessage) => {
      const t = (msg.trip || {}) as Record<string, any>;
      const normalizedStatus = normalizeTripStatus(msg.status, t.payment_status);
      const shieldPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(t.invisible_shield_mode?.active) &&
        !t.invisible_shield_mode?.confirmed_safe_at &&
        !t.invisible_shield_mode?.auto_escalated_at;
      const safeArrivalPendingConfirmation =
        normalizedStatus === 'completed' &&
        Boolean(t.safe_arrival_check?.required) &&
        !t.safe_arrival_check?.confirmed_at;
      const screenStatus = shieldPendingConfirmation || safeArrivalPendingConfirmation ? 'pending_payment' : normalizedStatus;
      setTripStatus(screenStatus);
      if (t.payment_status) setPaymentStatus(String(t.payment_status));
      setFaceVerifiedAtStart(Boolean(t.face_verified_at_start));
      setRiderFaceVerifiedAtPickup(Boolean(t.rider_face_verified_at_pickup));
      setGeoFenceLock(t.geo_fence_trip_lock || null);
      setSpeedSpikeAlert(t.speed_spike_alert || null);
      setGpsSpoofingAlert(t.gps_spoofing_alert || null);
      setDriverStopReason((t.driver_stop_reason as any) || null);
      setInvisibleShieldMode(t.invisible_shield_mode || null);
      setSafeArrivalCheck(t.safe_arrival_check || null);
      if (t.driver_id) {
        setDriverInfo({
          driver_id: t.driver_id,
          name: t.driver_name || 'Driver',
          rating: 4.5,
          vehicle: t.vehicle_model || 'Vehicle',
          plate: t.vehicle_plate || '',
          color: t.vehicle_color || '',
        });
      }
      {
        const prev = useAppStore.getState().currentTrip;
        if (prev) {
          setCurrentTrip({
            ...prev,
            status: (screenStatus || prev.status) as typeof prev.status,
            driver_id: t.driver_id || prev.driver_id,
            fare: t.fare != null ? Number(t.fare) : prev.fare,
            geo_fence_trip_lock: t.geo_fence_trip_lock || (prev as any).geo_fence_trip_lock,
            speed_spike_alert: t.speed_spike_alert || (prev as any).speed_spike_alert,
            gps_spoofing_alert: t.gps_spoofing_alert || (prev as any).gps_spoofing_alert,
            invisible_shield_mode: t.invisible_shield_mode || (prev as any).invisible_shield_mode,
            safe_arrival_check: t.safe_arrival_check || (prev as any).safe_arrival_check,
            rider_face_verified_at_pickup:
              t.rider_face_verified_at_pickup ?? (prev as any).rider_face_verified_at_pickup,
          });
        }
      }

      if (screenStatus === 'arrived' && !pickupAlertSentRef.current && arrivedPromptShownRef.current !== effectiveTripId) {
        pickupAlertSentRef.current = true;
        arrivedPromptShownRef.current = effectiveTripId;
        setSecurityPromptShown(true);
        Alert.alert(
          'Driver Arrived',
          'Your driver is at the pickup point. Open your pick-up code and show it to the driver.',
          [
            {
              text: 'Show Pick-up Code',
              onPress: () =>
                router.push({
                  pathname: '/rider/security-code',
                  params: { trip_id: effectiveTripId },
                } as any),
            },
            { text: 'OK', style: 'cancel' },
          ]
        );
      }

      if (screenStatus === 'cancelled') {
        setCurrentTrip(null);
        navigateOnce(`cancelled-${effectiveTripId}`, () => router.replace('/(rider-tabs)/rider-home'));
      }
      if (screenStatus === 'completed') {
        navigateOnce(`receipt-${effectiveTripId}`, () =>
          router.replace({ pathname: '/rider/trip-receipt', params: { tripId: effectiveTripId } } as any)
        );
      }
      void fetchStatus();
    },
    [effectiveTripId, router, setCurrentTrip, fetchStatus, navigateOnce]
  );

  const { connected: riderWsConnected } = useRiderTripRealtime({
    riderId: user?.id,
    token,
    enabled: Boolean(effectiveTripId && user?.id && token),
    watchTripId: effectiveTripId || null,
    onTripUpdate: handleTripWs,
  });

  useEffect(() => {
    if (!effectiveTripId || !user?.id) {
      setLoading(false);
      return;
    }

    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await fetchStatus();
    };
    void run();
    const pollMs = riderWsConnected ? 22000 : 5000;
    const interval = setInterval(() => {
      if (mounted) void fetchStatus();
    }, pollMs);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [effectiveTripId, user?.id, fetchStatus, riderWsConnected]);

  // Check favorite status whenever driverInfo.driver_id becomes known
  useEffect(() => {
    const driverId = driverInfo?.driver_id;
    if (!driverId) return;
    void checkIsFavorite(driverId);
  }, [driverInfo?.driver_id, checkIsFavorite]);

  // Show "Add to Favorites" prompt once when ride reaches completed/pending_payment
  useEffect(() => {
    const driverId = driverInfo?.driver_id;
    if (!driverId) return;
    if (isFavoriteDriver) return; // already favorited
    const shouldPrompt = ['completed', 'pending_payment'].includes(tripStatus);
    if (shouldPrompt && favoritePromptShownRef.current !== effectiveTripId) {
      favoritePromptShownRef.current = effectiveTripId;
      // Small delay so receipt navigation has time to happen first
      const t = setTimeout(() => setShowFavoritePrompt(true), 1200);
      return () => clearTimeout(t);
    }
  }, [tripStatus, driverInfo?.driver_id, isFavoriteDriver, effectiveTripId]);

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

  const handleReportIncident = async (incidentType: 'harassment' | 'dispute' | 'other') => {
    if (!currentRecording?.id) {
      Alert.alert('Recording unavailable', 'Safety recording has not started yet for this trip.');
      return;
    }
    try {
      await reportSafetyIncident(
        currentRecording.id,
        'rider',
        incidentType,
        `Reported from trip tracking while status=${tripStatus}`,
      );
      Alert.alert('Incident logged', 'Your trip safety recording will be preserved for review.');
    } catch {
      Alert.alert('Could not save report', 'Please try again in a moment.');
    }
  };

  const handleSilentDangerMode = async () => {
    if (!effectiveTripId || !user?.id) return;
    setSilentProtecting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Required', 'Enable location permission so protected silent safety can work.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (currentRecording?.id) {
        await reportSafetyIncident(
          currentRecording.id,
          'rider',
          'other',
          `Silent danger mode triggered while status=${tripStatus}`,
        );
      }
      await triggerSOS({
        trip_id: effectiveTripId,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
        auto_triggered: true,
      });
      Alert.alert(
        'Route refreshed',
        'Trip monitoring has been updated in the background and trusted safety recipients have your live trip context.',
      );
    } catch (error: any) {
      Alert.alert('Could not refresh route', error?.response?.data?.detail || 'Please try again in a moment.');
    } finally {
      setSilentProtecting(false);
    }
  };

  const handleArmGeoFence = async () => {
    if (!effectiveTripId) return;
    const routePoints =
      (((currentTrip as any)?.route_preview_coordinates || []) as Array<{ lat?: number; lng?: number; latitude?: number; longitude?: number }>)
        .map((point) => ({
          lat: typeof point.lat === 'number' ? point.lat : Number(point.latitude),
          lng: typeof point.lng === 'number' ? point.lng : Number(point.longitude),
        }))
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (routePoints.length < 2) {
      Alert.alert('Route unavailable', 'Approved route is not ready yet. Please wait a moment and try again.');
      return;
    }
    setArmingGeoFence(true);
    try {
      const res = await setGeoFenceTripLock(effectiveTripId, {
        threshold_meters: 200,
        approved_route: routePoints,
      });
      setGeoFenceLock(res.data?.geo_fence_trip_lock || null);
      Alert.alert(
        'Approved route locked',
        'If the driver moves more than 200 metres away, Nexryde will alert you loudly, notify your emergency contacts and keep recording protected evidence.',
      );
    } catch (error: any) {
      Alert.alert('Could not lock route', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setArmingGeoFence(false);
    }
  };

  const handleActivateInvisibleShield = async () => {
    if (!effectiveTripId) return;
    setArmingInvisibleShield(true);
    try {
      const etaMinutes = Math.max(
        10,
        optimizedRoute?.estimatedTimeMinutes || Number((currentTrip as any)?.duration_mins) || 20
      );
      const res = await activateInvisibleShieldMode(effectiveTripId, etaMinutes);
      setInvisibleShieldMode(res.data?.invisible_shield_mode || null);
      Alert.alert(
        'Invisible Shield Armed',
        'Late-night shield mode is now active. Protected trip audio will be preserved securely unless you confirm safe arrival.',
      );
    } catch (error: any) {
      Alert.alert('Could not arm shield', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setArmingInvisibleShield(false);
    }
  };

  const handleConfirmShieldSafe = async () => {
    if (!effectiveTripId) return;
    setConfirmingShieldSafe(true);
    try {
      const res = await confirmInvisibleShieldSafeArrival(effectiveTripId);
      setInvisibleShieldMode(res.data?.invisible_shield_mode || null);
      if (currentRecording?.id) {
        await RideRecordingService.deleteRecording(currentRecording.id);
      }
      Alert.alert('Shield cleared', res.data?.message || 'Safe arrival confirmed.');
    } catch (error: any) {
      Alert.alert('Could not confirm safe arrival', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setConfirmingShieldSafe(false);
    }
  };

  const handleConfirmSafeArrival = async () => {
    if (!effectiveTripId) return;
    setConfirmingSafeArrival(true);
    try {
      const res = await confirmSafeArrival(effectiveTripId);
      setSafeArrivalCheck(res.data?.safe_arrival_check || null);
      Alert.alert('Thanks', 'Safe arrival confirmed. Nexryde has closed the post-trip safety check.');
    } catch (error: any) {
      Alert.alert('Could not confirm', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setConfirmingSafeArrival(false);
    }
  };

  const handleSafetyCheckResponse = async (response: 'safe' | 'need_help') => {
    const checkId = guardianAlert?.check_id;
    if (!checkId) {
      Alert.alert('Unavailable', 'Safety check ID is missing. Please try again in a few seconds.');
      return;
    }
    setRespondingSafety(response);
    try {
      await respondToSafetyCheck(checkId, response);
      await fetchStatus();
      if (response === 'safe') {
        Alert.alert('Thanks', 'Great. We will continue monitoring quietly in the background.');
      } else {
        Alert.alert('Safety team alerted', 'Emergency support has been escalated and your trip is being monitored.');
      }
    } catch (error: any) {
      Alert.alert('Could not submit', error?.response?.data?.detail || 'Please try again.');
    } finally {
      setRespondingSafety(null);
    }
  };

  const handleFakeDriverAlertCheck = async () => {
    if (!effectiveTripId) return;
    setCheckingDriverFace(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to verify the driver face.');
        return;
      }
      const capture = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
        cameraType: ImagePicker.CameraType.front,
      });
      if (capture.canceled || !capture.assets?.[0]?.base64) {
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const payload = {
        observed_face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
      };
      const res = await runFakeDriverAlertCheck(effectiveTripId, payload);
      const data = res.data || {};
      if (data.matched) {
        Alert.alert('Driver verified', data.alert_message || 'Driver face matches the registered profile.');
      } else {
        await triggerSOS({
          trip_id: effectiveTripId,
          location_lat: location.coords.latitude,
          location_lng: location.coords.longitude,
          auto_triggered: true,
        });
        Alert.alert('Fake Driver Alert', data.alert_message || 'Face mismatch detected. Do not enter the vehicle.');
      }
    } catch (error: any) {
      Alert.alert('Face check unavailable', error?.response?.data?.detail || 'Could not run fake driver alert right now.');
    } finally {
      setCheckingDriverFace(false);
    }
  };

  const handleVerifyMyPickupFace = async () => {
    if (!effectiveTripId) return;
    setVerifyingPickupFace(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Camera permission is required to verify your face at pickup.');
        return;
      }
      const capture = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        base64: true,
        cameraType: ImagePicker.CameraType.front,
      });
      if (capture.canceled || !capture.assets?.[0]?.base64) return;
      await verifyRiderFaceAtPickup(effectiveTripId, {
        observed_face_image: `data:image/jpeg;base64,${capture.assets[0].base64}`,
      });
      setRiderFaceVerifiedAtPickup(true);
      Alert.alert('Identity confirmed', 'Your pickup face verification is complete. Driver can now proceed to code check.');
    } catch (error: any) {
      Alert.alert('Face verification failed', error?.response?.data?.detail || 'Please re-scan your face.');
    } finally {
      setVerifyingPickupFace(false);
    }
  };

  useEffect(() => {
    const alert = guardianAlert || {};
    if (!alert?.active || alert.type !== 'geo_fence_deviation') return;
    const alertKey = String(alert.triggered_at || alert.deviation_meters || 'geo-fence');
    if (geoFenceAlertShownRef.current === alertKey) return;
    geoFenceAlertShownRef.current = alertKey;
    void notificationService.sendLocalNotification({
      type: 'geo_fence_deviation',
      title: 'Route Lock Breach',
      body: 'Driver left your approved route. Safety escalation is active now.',
      data: { trip_id: effectiveTripId },
    });
    Alert.alert(
      'Approved Route Alert',
      alert.message || 'Driver moved away from your approved route. Emergency monitoring is now active.',
    );
  }, [effectiveTripId, guardianAlert]);

  useEffect(() => {
    const alert = speedSpikeAlert || {};
    if (!alert?.active) return;
    const alertKey = String(alert.triggered_at || alert.speed_kmh || 'speed-spike');
    if (speedSpikeAlertShownRef.current === alertKey) return;
    speedSpikeAlertShownRef.current = alertKey;
    void notificationService.sendLocalNotification({
      type: 'speed_spike_alert',
      title: 'Speed Spike Alert',
      body: `Driver speed reached ${Math.round(alert.speed_kmh || 0)} km/h. Nexryde has warned the driver.`,
      data: { trip_id: effectiveTripId },
    });
    Alert.alert(
      'Speed Spike Alert',
      `Your driver reached ${Math.round(alert.speed_kmh || 0)} km/h. Nexryde has logged a safety violation and warned the driver.`,
    );
  }, [effectiveTripId, speedSpikeAlert]);

  useEffect(() => {
    const alert = gpsSpoofingAlert || {};
    if (!alert?.active) return;
    const alertKey = String(alert.triggered_at || alert.jump_km || 'gps-spoofing');
    if (gpsSpoofingAlertShownRef.current === alertKey) return;
    gpsSpoofingAlertShownRef.current = alertKey;
    Alert.alert(
      'GPS Fraud Protection',
      alert.message || 'Suspected GPS spoofing detected. Your fare has been frozen and the driver was suspended for review.',
    );
  }, [gpsSpoofingAlert]);

  useEffect(() => {
    const mode = invisibleShieldMode || {};
    const uploadReady =
      Boolean(
        effectiveTripId &&
          mode.active &&
          !mode.server_audio_uploaded &&
          currentRecording?.audioUri &&
          recordingStatus === 'stopped' &&
          tripStatus === 'pending_payment'
      );
    if (!uploadReady || shieldUploadTripIdRef.current === effectiveTripId) return;

    shieldUploadTripIdRef.current = effectiveTripId;
    const run = async () => {
      try {
        const audioBase64 = await FileSystem.readAsStringAsync(currentRecording!.audioUri!, {
          encoding: 'base64',
        });
        await uploadInvisibleShieldAudio(effectiveTripId, audioBase64, 'audio/mp4');
        await fetchStatus();
      } catch (error) {
        console.log('Invisible Shield upload failed:', error);
        shieldUploadTripIdRef.current = null;
      }
    };
    void run();
  }, [currentRecording?.audioUri, effectiveTripId, fetchStatus, invisibleShieldMode, recordingStatus, tripStatus]);

  useEffect(() => {
    const mode = invisibleShieldMode || {};
    if (!mode.auto_escalated_at) return;
    void notificationService.sendLocalNotification({
      type: 'geo_fence_deviation',
      title: 'Invisible Shield Escalated',
      body: 'You did not confirm safe arrival. Emergency contacts and Nexryde Safety have been alerted.',
      data: { trip_id: effectiveTripId },
    });
  }, [effectiveTripId, invisibleShieldMode?.auto_escalated_at]);

  useEffect(() => {
    const check = safeArrivalCheck || {};
    if (!check?.required || check?.confirmed_at) return;
    const promptKey = String(check.trip_completed_at || check.confirm_deadline_at || effectiveTripId);
    if (safeArrivalPromptShownRef.current === promptKey) return;
    safeArrivalPromptShownRef.current = promptKey;
    void notificationService.sendLocalNotification({
      type: 'safe_arrival_checkin',
      title: 'Confirm Safe Arrival',
      body: 'Please confirm you arrived safely. Nexryde will check in automatically if you do not respond.',
      data: { trip_id: effectiveTripId },
    });
  }, [effectiveTripId, safeArrivalCheck]);

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
          <View style={styles.liveTripHero}>
            <View style={styles.liveTripHeroLeft}>
              <Text style={styles.liveTripHeroTitle}>Trip Intelligence</Text>
              <Text style={styles.liveTripHeroText}>
                Live vehicle state, safety checks, and transparent driver activity in one place.
              </Text>
            </View>
            <View style={styles.liveTripChip}>
              <Ionicons name="pulse-outline" size={14} color={COLORS.info} />
              <Text style={styles.liveTripChipText}>LIVE</Text>
            </View>
          </View>

          {/* Map Area */}
          {pickupCoords && dropoffCoords ? (
            Platform.OS === 'web' ? (
              <MapComponent
                style={styles.mapPlaceholder}
                pickup={{
                  latitude: pickupCoords.lat,
                  longitude: pickupCoords.lng,
                  address: currentTrip?.pickup_location?.address,
                }}
                dropoff={{
                  latitude: dropoffCoords.lat,
                  longitude: dropoffCoords.lng,
                  address: currentTrip?.dropoff_location?.address,
                }}
                driverLocation={
                  liveDriverCoords
                    ? {
                        latitude: liveDriverCoords.lat,
                        longitude: liveDriverCoords.lng,
                        address: driverInfo?.name || 'Driver live location',
                      }
                    : undefined
                }
                routeCoordinates={routePolyline}
              />
            ) : (
              (() => {
                const RideMap = require('@/src/components/RideMap.native').default;
                return (
                  <RideMap
                    mapRef={nativeMapRef}
                    pickupCoords={pickupCoords}
                    destinationCoords={dropoffCoords}
                    routePolyline={routePolyline}
                    pickup={currentTrip?.pickup_location?.address || (params.pickup as string) || 'Pickup'}
                    destination={currentTrip?.dropoff_location?.address || (params.destination as string) || 'Destination'}
                    activeDriverLocation={liveDriverCoords}
                    activeDriverMoving={Boolean(driverInfo?.is_moving)}
                    activeDriverMeta={{
                      name: driverInfo?.name,
                      vehicle: driverInfo?.vehicle,
                      plate: driverInfo?.plate,
                      rating: driverInfo?.rating ?? driverInfo?.avg_rating ?? undefined,
                      profileImage:
                        driverInfo?.profile_image || driverInfo?.face_image || null,
                    }}
                    tripStatus={tripStatus}
                  />
                );
              })()
            )
          ) : (
            <View style={styles.mapPlaceholder}>
              <View style={styles.mapOverlay}>
                <Ionicons name="navigate" size={40} color={COLORS.accentGreen} />
                <Text style={styles.mapTitle}>{mapTitle}</Text>
                <Text style={styles.mapSubtitle}>{mapSubtitle}</Text>
              </View>
            </View>
          )}

          {/* Driver Arrived — prominent pickup code CTA */}
          {tripStatus === 'arrived' && (
            <TouchableOpacity
              style={styles.arrivedCodeBanner}
              onPress={() => router.push({ pathname: '/rider/security-code', params: { trip_id: effectiveTripId } } as any)}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#00D46A', '#009E3F']}
                style={styles.arrivedCodeBannerGrad}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="keypad" size={26} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '900' }}>Driver has arrived!</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 13, marginTop: 2 }}>
                    Tap to show your 4-digit pick-up code
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.9)" />
              </LinearGradient>
            </TouchableOpacity>
          )}

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
                <Ionicons
                  name={driverInfo?.is_moving ? 'navigate' : 'pause-circle'}
                  size={16}
                  color={driverInfo?.is_moving ? COLORS.success : COLORS.warning}
                />
                <Text style={styles.driverLocationText}>
                  {driverInfo?.is_moving ? 'Driver moving live' : 'Driver paused on map'}
                </Text>
              </View>
            )}

            {driverStopReason?.reason ? (
              <View style={styles.safeArrivalCard}>
                <View style={styles.safeArrivalHeader}>
                  <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.info} />
                  <Text style={[styles.safeArrivalTitle, { color: COLORS.info }]}>Driver stop reason</Text>
                </View>
                <Text style={styles.safeArrivalText}>{driverStopReason.reason}</Text>
              </View>
            ) : null}

            {optimizedRoute ? (
              <View style={styles.aiRouteBadge}>
                <Ionicons name="navigate-circle" size={16} color={COLORS.info} />
                <Text style={styles.aiRouteBadgeText}>
                  Fastest route active: {TrafficAI.formatDelay(optimizedRoute.trafficDelay)} with live traffic analysis
                </Text>
              </View>
            ) : null}

            {(tripStatus === 'arrived' || tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
              <View style={[styles.faceMatchBadge, faceVerifiedAtStart ? styles.faceMatchBadgeOk : styles.faceMatchBadgePending]}>
                <Ionicons
                  name={faceVerifiedAtStart ? 'scan-circle-outline' : 'person-circle-outline'}
                  size={16}
                  color={faceVerifiedAtStart ? COLORS.success : COLORS.warning}
                />
                <Text style={[styles.faceMatchBadgeText, { color: faceVerifiedAtStart ? COLORS.success : COLORS.warning }]}>
                  {faceVerifiedAtStart
                    ? 'Driver face matched with registered profile'
                    : 'Waiting for live driver face match before trip start'}
                </Text>
              </View>
            )}

            <View style={styles.recordingBanner}>
              <View style={styles.recordingRow}>
                <Ionicons
                  name={recordingStatus === 'recording' ? 'radio' : 'mic-outline'}
                  size={18}
                  color={recordingStatus === 'recording' ? COLORS.error : COLORS.gray500}
                />
                <Text style={styles.recordingTitle}>
                  {recordingStatus === 'recording' ? 'Trip safety recording active' : 'Trip safety recording standby'}
                </Text>
              </View>
              <Text style={styles.recordingText}>
                {recordingStatus === 'recording'
                  ? 'Audio is being captured for incident protection with protected retention.'
                  : 'Recording auto-starts when your active trip enters the protected trip flow.'}
              </Text>
              {currentRecording ? (
                <>
                  <Text style={styles.recordingMeta}>
                    Protected capture started {Math.max(0, Math.floor((Date.now() - currentRecording.startTime) / 1000))}s ago
                  </Text>
                  {currentRecording.metadata?.lastKnownLocation ? (
                    <Text style={styles.recordingMeta}>
                      GPS snapshot active at {Number(currentRecording.metadata.lastKnownLocation.latitude || 0).toFixed(4)},{' '}
                      {Number(currentRecording.metadata.lastKnownLocation.longitude || 0).toFixed(4)}
                      {typeof currentRecording.metadata.lastKnownLocation.speedKph === 'number'
                        ? ` • ${Math.round(currentRecording.metadata.lastKnownLocation.speedKph)} km/h`
                        : ''}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>

            {speedSpikeAlert?.active ? (
              <View style={styles.speedSpikeCard}>
                <View style={styles.speedSpikeHeader}>
                  <Ionicons name="warning-outline" size={18} color={COLORS.error} />
                  <Text style={styles.speedSpikeTitle}>Speed Spike Alert</Text>
                </View>
                <Text style={styles.speedSpikeText}>
                  Driver speed reached {Math.round(speedSpikeAlert.speed_kmh || 0)} km/h. Nexryde warned the driver and logged a permanent safety violation.
                </Text>
                <Text style={styles.speedSpikeMeta}>
                  Violations on record: {Number(speedSpikeAlert.violation_count || 0)}
                  {speedSpikeAlert.driver_suspended ? ' • Driver suspended automatically' : ''}
                </Text>
              </View>
            ) : null}

            {gpsSpoofingAlert?.active ? (
              <View style={styles.speedSpikeCard}>
                <View style={styles.speedSpikeHeader}>
                  <Ionicons name="locate-outline" size={18} color={COLORS.error} />
                  <Text style={styles.speedSpikeTitle}>Anti-Spoofing GPS</Text>
                </View>
                <Text style={styles.speedSpikeText}>
                  Suspected fake GPS activity detected. Fare is frozen and the driver account is suspended pending investigation.
                </Text>
                <Text style={styles.speedSpikeMeta}>
                  Jump: {Number(gpsSpoofingAlert.jump_km || 0).toFixed(2)} km
                  {typeof gpsSpoofingAlert.estimated_speed_kmh === 'number'
                    ? ` • ${Math.round(gpsSpoofingAlert.estimated_speed_kmh)} km/h`
                    : ''}
                </Text>
              </View>
            ) : null}

            {safeArrivalCheck?.required && !safeArrivalCheck?.confirmed_at ? (
              <View style={styles.safeArrivalCard}>
                <View style={styles.safeArrivalHeader}>
                  <Ionicons name="home-outline" size={18} color={COLORS.success} />
                  <Text style={styles.safeArrivalTitle}>Safe Arrival Confirmation</Text>
                </View>
                <Text style={styles.safeArrivalText}>
                  Confirm that you arrived safely. If you do not respond within 5 minutes, Nexryde will start a safety check-in and notify emergency contacts if there is still no response.
                </Text>
                {safeArrivalCheck?.confirm_deadline_at ? (
                  <Text style={styles.safeArrivalMeta}>
                    Confirm by {new Date(safeArrivalCheck.confirm_deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
                {safeArrivalCheck?.call_attempted_at ? (
                  <Text style={styles.safeArrivalMeta}>Safety check-in call step started. Please confirm now.</Text>
                ) : null}
              </View>
            ) : null}

            {(tripStatus === 'accepted' || tripStatus === 'arrived' || tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
              <View style={[styles.shieldCard, invisibleShieldMode?.active ? styles.shieldCardActive : null]}>
                <View style={styles.shieldHeader}>
                  <Ionicons
                    name={invisibleShieldMode?.active ? 'moon-outline' : 'shield-half-outline'}
                    size={18}
                    color={invisibleShieldMode?.active ? COLORS.success : COLORS.primary}
                  />
                  <Text style={styles.shieldTitle}>
                    {invisibleShieldMode?.active ? 'Invisible Shield Mode Active' : 'Invisible Shield Mode'}
                  </Text>
                </View>
                <Text style={styles.shieldText}>
                  {invisibleShieldMode?.active
                    ? 'Late-night shield protection is armed. Confirm safe arrival after the trip or Nexryde will escalate the protected audio automatically.'
                    : 'Arm shield mode before entering the car for silent audio protection and delayed emergency escalation if you do not confirm safe arrival.'}
                </Text>
                {invisibleShieldMode?.confirm_deadline_at ? (
                  <Text style={styles.shieldMeta}>
                    Confirm by {new Date(invisibleShieldMode.confirm_deadline_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
                {invisibleShieldMode?.server_audio_uploaded ? (
                  <Text style={styles.shieldMeta}>Protected audio synced to Nexryde secure server.</Text>
                ) : null}
              </View>
            )}

            {(tripStatus === 'accepted' || tripStatus === 'arrived' || tripStatus === 'ongoing') && (
              <View style={[styles.geoFenceCard, geoFenceLock?.active ? styles.geoFenceCardActive : null]}>
                <View style={styles.geoFenceHeader}>
                  <Ionicons
                    name={geoFenceLock?.active ? 'shield-checkmark-outline' : 'navigate-circle-outline'}
                    size={18}
                    color={geoFenceLock?.active ? COLORS.success : COLORS.primary}
                  />
                  <Text style={styles.geoFenceTitle}>
                    {geoFenceLock?.active ? 'Approved Route Locked' : 'Geo Fence Trip Lock'}
                  </Text>
                </View>
                <Text style={styles.geoFenceText}>
                  {geoFenceLock?.active
                    ? `Deviation threshold is ${Math.round(geoFenceLock.threshold_meters || 200)}m. The driver is expected to stay on your approved route.`
                    : 'Lock the approved route before the trip starts so Nexryde can escalate automatically if the vehicle deviates.'}
                </Text>
                {geoFenceLock?.last_deviation_meters ? (
                  <Text style={styles.geoFenceMeta}>
                    Latest deviation: {Math.round(geoFenceLock.last_deviation_meters)}m
                  </Text>
                ) : null}
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
                {guardianAlert?.type === 'abnormal_stop' && guardianAlert?.check_id ? (
                  <View style={styles.guardianActions}>
                    <TouchableOpacity
                      style={[styles.guardianActionBtn, styles.guardianSafeBtn]}
                      onPress={() => void handleSafetyCheckResponse('safe')}
                      disabled={respondingSafety !== null}
                    >
                      <Text style={styles.guardianSafeBtnText}>
                        {respondingSafety === 'safe' ? 'Sending...' : "I'm Safe"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.guardianActionBtn, styles.guardianHelpBtn]}
                      onPress={() => void handleSafetyCheckResponse('need_help')}
                      disabled={respondingSafety !== null}
                    >
                      <Text style={styles.guardianHelpBtnText}>
                        {respondingSafety === 'need_help' ? 'Alerting...' : 'Need Help'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {driverInfo && (tripStatus === 'accepted' || tripStatus === 'arrived' || tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
            <>
              <View style={styles.actionsCard}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => router.push({ pathname: '/chat', params: { tripId: effectiveTripId } } as any)}
                >
                  <Ionicons name="chatbubble-outline" size={20} color={COLORS.primary} />
                  <Text style={styles.actionBtnText}>Chat Driver</Text>
                </TouchableOpacity>

                {/* Call Driver — shown when active ride OR driver is favorited */}
                {callAllowed && driverInfo?.phone ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#dcfce7' }]}
                    onPress={() => {
                      const phone = (driverInfo.phone as string).replace(/\s+/g, '');
                      Linking.openURL(`tel:${phone}`).catch(() =>
                        Alert.alert('Cannot call', 'Unable to open the dialler on this device.')
                      );
                    }}
                  >
                    <Ionicons name="call" size={20} color="#16a34a" />
                    <View>
                      <Text style={[styles.actionBtnText, { color: '#16a34a' }]}>Call Driver</Text>
                      {driverInfo?.phone_masked && (
                        <Text style={{ fontSize: 10, color: '#16a34a', opacity: 0.7 }}>{maskPhone(driverInfo.phone)}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ) : !isActiveRide && !isFavoriteDriver && driverInfo ? (
                  /* Disabled call state — ride not active, not favorited */
                  <View style={[styles.actionBtn, { backgroundColor: '#f1f5f9', opacity: 0.6 }]}>
                    <Ionicons name="call-outline" size={20} color="#94a3b8" />
                    <View>
                      <Text style={[styles.actionBtnText, { color: '#94a3b8' }]}>Call Unavailable</Text>
                      <Text style={{ fontSize: 10, color: '#94a3b8' }}>Favorite driver to re-enable</Text>
                    </View>
                  </View>
                ) : null}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, riderFaceVerifiedAtPickup ? styles.actionBtnSuccess : null]}
                    onPress={() => void handleVerifyMyPickupFace()}
                    disabled={verifyingPickupFace || riderFaceVerifiedAtPickup}
                  >
                    <Ionicons name="person-circle-outline" size={20} color={riderFaceVerifiedAtPickup ? COLORS.success : COLORS.primary} />
                    <Text style={styles.actionBtnText}>
                      {riderFaceVerifiedAtPickup
                        ? 'Face Verified'
                        : verifyingPickupFace
                          ? 'Verifying...'
                          : 'Verify My Face'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, tripStatus === 'arrived' && { borderColor: '#00D46A', backgroundColor: 'rgba(0,212,106,0.08)' }]}
                    onPress={() => router.push({ pathname: '/rider/security-code', params: { trip_id: effectiveTripId } } as any)}
                  >
                    <Ionicons name="keypad-outline" size={20} color={tripStatus === 'arrived' ? '#00D46A' : COLORS.primary} />
                    <Text style={[styles.actionBtnText, tripStatus === 'arrived' && { color: '#00D46A', fontWeight: '800' }]}>
                      {tripStatus === 'arrived' ? 'Show Pick-up Code' : 'Pick-up Code'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, invisibleShieldMode?.active ? styles.actionBtnSuccess : null]}
                    onPress={() => void handleActivateInvisibleShield()}
                    disabled={armingInvisibleShield}
                  >
                    <Ionicons name="moon-outline" size={20} color={invisibleShieldMode?.active ? COLORS.success : COLORS.primary} />
                    <Text style={styles.actionBtnText}>
                      {armingInvisibleShield ? 'Arming...' : invisibleShieldMode?.active ? 'Shield Armed' : 'Shield Mode'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={[styles.actionBtn, geoFenceLock?.active ? styles.actionBtnSuccess : null]}
                    onPress={() => void handleArmGeoFence()}
                    disabled={armingGeoFence}
                  >
                    <Ionicons name="navigate-circle-outline" size={20} color={geoFenceLock?.active ? COLORS.success : COLORS.primary} />
                    <Text style={styles.actionBtnText}>
                      {armingGeoFence ? 'Locking...' : geoFenceLock?.active ? 'Route Locked' : 'Lock Route'}
                    </Text>
                  </TouchableOpacity>
                )}

                {(tripStatus === 'accepted' || tripStatus === 'arrived') && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleFakeDriverAlertCheck()}
                    disabled={checkingDriverFace}
                  >
                    <Ionicons name="scan-outline" size={20} color={COLORS.error} />
                    <Text style={styles.actionBtnText}>
                      {checkingDriverFace ? 'Checking...' : 'Verify Driver Face'}
                    </Text>
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

              {(tripStatus === 'ongoing' || tripStatus === 'pending_payment') && (
                <View style={styles.actionsCard}>
                  {tripStatus === 'pending_payment' && safeArrivalCheck?.required && !safeArrivalCheck?.confirmed_at ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSuccess]}
                      onPress={() => void handleConfirmSafeArrival()}
                      disabled={confirmingSafeArrival}
                    >
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.success} />
                      <Text style={styles.actionBtnText}>
                        {confirmingSafeArrival ? 'Confirming...' : 'I Am Safe'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {tripStatus === 'pending_payment' && invisibleShieldMode?.active && !invisibleShieldMode?.confirmed_safe_at && !invisibleShieldMode?.auto_escalated_at ? (
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnSuccess]}
                      onPress={() => void handleConfirmShieldSafe()}
                      disabled={confirmingShieldSafe}
                    >
                      <Ionicons name="checkmark-done-outline" size={20} color={COLORS.success} />
                      <Text style={styles.actionBtnText}>
                        {confirmingShieldSafe ? 'Confirming...' : 'Confirm Safe'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]}
                    onPress={() => void handleSilentDangerMode()}
                    disabled={silentProtecting}
                  >
                    <Ionicons name="alert-circle" size={20} color="#dc2626" />
                    <Text style={[styles.actionBtnText, { color: '#dc2626', fontWeight: '700' }]}>
                      {silentProtecting ? 'Alerting...' : 'Silent SOS'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleReportIncident('harassment')}
                  >
                    <Ionicons name="shield-outline" size={20} color={COLORS.error} />
                    <Text style={styles.actionBtnText}>Safety Issue</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => void handleReportIncident('dispute')}
                  >
                    <Ionicons name="document-text-outline" size={20} color={COLORS.info} />
                    <Text style={styles.actionBtnText}>Preserve Record</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
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

      {/* ── Favorite Driver Prompt Modal ── */}
      <Modal
        visible={showFavoritePrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFavoritePrompt(false)}
      >
        <View style={favStyles.overlay}>
          <View style={favStyles.card}>
            <View style={favStyles.iconWrap}>
              <Ionicons name="star" size={36} color="#f59e0b" />
            </View>
            <Text style={favStyles.title}>Add driver to favorites?</Text>
            <Text style={favStyles.body}>
              {driverInfo?.name ? `${driverInfo.name} drove you safely.` : 'Your driver drove you safely.'}{'\n'}
              Favorite them to keep calling after future rides.
            </Text>
            <View style={favStyles.row}>
              <TouchableOpacity
                style={[favStyles.btn, favStyles.btnOutline]}
                onPress={() => setShowFavoritePrompt(false)}
              >
                <Text style={favStyles.btnOutlineText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[favStyles.btn, favStyles.btnPrimary, addingFavorite && { opacity: 0.7 }]}
                onPress={() => void handleAddFavorite(driverInfo?.driver_id || '')}
                disabled={addingFavorite}
              >
                {addingFavorite ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={favStyles.btnPrimaryText}>Yes, add favorite</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const favStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 12, width: '100%' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnOutline: { borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  btnOutlineText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  btnPrimary: { backgroundColor: '#f59e0b' },
  btnPrimaryText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});

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
  arrivedCodeBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#00D46A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  arrivedCodeBannerGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 16,
  },
  liveTripHero: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  liveTripHeroLeft: { flex: 1 },
  liveTripHeroTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  liveTripHeroText: {
    marginTop: 4,
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    lineHeight: 18,
    fontWeight: '600',
  },
  liveTripChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.infoSoft,
    borderWidth: 1,
    borderColor: COLORS.info,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  liveTripChipText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.info,
    fontWeight: '900',
    letterSpacing: 0.5,
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
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  actionsCard: {
    marginTop: SPACING.lg,
    flexDirection: 'row',
    gap: SPACING.md,
    flexWrap: 'wrap',
  },
  actionBtn: {
    minWidth: '47%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  actionBtnSuccess: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.successSoft,
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
  aiRouteBadge: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.infoSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  aiRouteBadgeText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.info,
  },
  faceMatchBadge: {
    width: '100%',
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  faceMatchBadgeOk: {
    backgroundColor: COLORS.successSoft,
  },
  faceMatchBadgePending: {
    backgroundColor: COLORS.warningSoft,
  },
  faceMatchBadgeText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  recordingBanner: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  recordingTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  recordingText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  recordingMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.gray500,
  },
  speedSpikeCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: '#FEF2F2',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  speedSpikeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  speedSpikeTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.error,
  },
  speedSpikeText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: COLORS.lightTextSecondary,
  },
  speedSpikeMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.error,
  },
  safeArrivalCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.successSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  safeArrivalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  safeArrivalTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.success,
  },
  safeArrivalText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: COLORS.lightTextSecondary,
  },
  safeArrivalMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.success,
  },
  shieldCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.primarySoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  shieldCardActive: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.success,
  },
  shieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  shieldTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  shieldText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: COLORS.lightTextSecondary,
  },
  shieldMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.primary,
  },
  geoFenceCard: {
    width: '100%',
    marginTop: SPACING.md,
    backgroundColor: COLORS.infoSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.info,
  },
  geoFenceCardActive: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.success,
  },
  geoFenceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  geoFenceTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  geoFenceText: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    lineHeight: 18,
    color: COLORS.lightTextSecondary,
  },
  geoFenceMeta: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.warning,
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
  guardianActions: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  guardianActionBtn: {
    flex: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingVertical: SPACING.xs + 2,
    alignItems: 'center',
    borderWidth: 1,
  },
  guardianSafeBtn: {
    backgroundColor: COLORS.successSoft,
    borderColor: COLORS.success,
  },
  guardianHelpBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: COLORS.error,
  },
  guardianSafeBtnText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.success,
  },
  guardianHelpBtnText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.error,
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
