import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  Linking,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore, Trip } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, getDriverTripOffers, acceptTrip, arriveTrip, startTrip, completeTrip, cancelTrip, getTrip, explainGeoFenceDeviation, triggerOneTouchPoliceConnect, submitDriverWitnessReport, submitDriverStopReason } from '@/src/services/api';
import notificationService from '@/src/services/notifications';

/* ─── Dark map style ─── */
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1d4ed8' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0ea5e9' }, { lightness: -60 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0f1f35' }] },
];

/* ─── Live Trip Map sub-component ─── */
type LiveMapProps = {
  driverLat: number | null;
  driverLng: number | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropLat: number | null;
  dropLng: number | null;
  status: string;
  riderLat?: number | null;
  riderLng?: number | null;
};

function PulsingDriverDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.5, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
  }, [pulse]);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}>
      <Animated.View style={{
        position: 'absolute', width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(59,130,246,0.3)', transform: [{ scale: pulse }],
      }} />
      <LinearGradient colors={['#60a5fa', '#3b82f6']} style={{
        width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#FFF',
      }}>
        <Ionicons name="car" size={12} color="#FFF" />
      </LinearGradient>
    </View>
  );
}

const TripLiveMap = memo(function TripLiveMap({ driverLat, driverLng, pickupLat, pickupLng, dropLat, dropLng, status, riderLat, riderLng }: LiveMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<any>(null);

  // Stable initial region (only computed once — avoids map reload)
  const focalLat = driverLat ?? pickupLat ?? 6.5244;
  const focalLng = driverLng ?? pickupLng ?? 3.3792;
  const initialRegion = useMemo(() => ({
    latitude: focalLat,
    longitude: focalLng,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Animate camera to driver position when it changes
  useEffect(() => {
    if (mapReady && mapRef.current && driverLat && driverLng) {
      mapRef.current.animateCamera({
        center: { latitude: driverLat, longitude: driverLng },
        zoom: 15,
      }, { duration: 800 });
    }
  }, [driverLat, driverLng, mapReady]);

  const showPickup = status !== 'ongoing' && pickupLat != null && Number.isFinite(pickupLat);
  const showDrop = dropLat != null && Number.isFinite(dropLat);
  const showDriver = driverLat != null && Number.isFinite(driverLat);
  const showRider = riderLat != null && Number.isFinite(riderLat!);

  // polyline: driver → pickup (accepted) or pickup → drop (ongoing)
  const polyline: { latitude: number; longitude: number }[] = [];
  if (status === 'accepted' && showDriver && pickupLat != null) {
    polyline.push({ latitude: driverLat!, longitude: driverLng! });
    polyline.push({ latitude: pickupLat, longitude: pickupLng! });
  } else if ((status === 'arrived' || status === 'ongoing') && pickupLat != null && dropLat != null) {
    if (showDriver) polyline.push({ latitude: driverLat!, longitude: driverLng! });
    if (pickupLat != null) polyline.push({ latitude: pickupLat, longitude: pickupLng! });
    polyline.push({ latitude: dropLat, longitude: dropLng! });
  }

  if (Platform.OS === 'web') {
    return (
      <View style={tripMapStyles.webFallback}>
        <Ionicons name="map" size={22} color="#475569" />
        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Live map on mobile app</Text>
      </View>
    );
  }

  // Lazy-load MapView to avoid import issues on web
  const MapView = require('react-native-maps').default;
  const { Marker, Polyline, PROVIDER_GOOGLE } = require('react-native-maps');

  return (
    <View style={tripMapStyles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={initialRegion}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsCompass={false}
        showsTraffic={false}
        onMapReady={() => setMapReady(true)}
      >
        {/* Route polyline */}
        {polyline.length >= 2 && (
          <>
            <Polyline coordinates={polyline} strokeColor="rgba(14,165,233,0.3)" strokeWidth={8} />
            <Polyline coordinates={polyline} strokeColor="#0ea5e9" strokeWidth={3} lineDashPattern={status === 'accepted' ? [8, 5] : undefined} />
          </>
        )}

        {/* Driver position */}
        {showDriver && (
          <Marker
            coordinate={{ latitude: driverLat!, longitude: driverLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <PulsingDriverDot />
          </Marker>
        )}

        {/* Pickup marker */}
        {showPickup && (
          <Marker
            coordinate={{ latitude: pickupLat!, longitude: pickupLng! }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={tripMapStyles.markerWrap}>
              <LinearGradient colors={['#22c55e', '#16a34a']} style={tripMapStyles.markerCircle}>
                <Ionicons name="location" size={13} color="#FFF" />
              </LinearGradient>
              <View style={tripMapStyles.markerStem} />
              <View style={tripMapStyles.markerLabel}>
                <Text style={tripMapStyles.markerLabelText}>Pickup</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* Dropoff marker */}
        {showDrop && (
          <Marker
            coordinate={{ latitude: dropLat!, longitude: dropLng! }}
            anchor={{ x: 0.5, y: 1 }}
            tracksViewChanges={false}
          >
            <View style={tripMapStyles.markerWrap}>
              <LinearGradient colors={['#ef4444', '#dc2626']} style={tripMapStyles.markerCircle}>
                <Ionicons name="flag" size={12} color="#FFF" />
              </LinearGradient>
              <View style={[tripMapStyles.markerStem, { backgroundColor: '#ef4444' }]} />
              <View style={tripMapStyles.markerLabel}>
                <Text style={tripMapStyles.markerLabelText}>Drop-off</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* Rider position (if available from backend) */}
        {showRider && (
          <Marker
            coordinate={{ latitude: riderLat!, longitude: riderLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={tripMapStyles.riderDot}>
              <Ionicons name="person" size={10} color="#FFF" />
            </View>
          </Marker>
        )}
      </MapView>

      {/* Status chip */}
      <View style={tripMapStyles.statusChip}>
        <View style={[tripMapStyles.statusDot, {
          backgroundColor:
            status === 'ongoing' ? '#22c55e' :
            status === 'arrived' ? '#f59e0b' :
            status === 'accepted' ? '#0ea5e9' : '#64748b'
        }]} />
        <Text style={tripMapStyles.statusText}>
          {status === 'accepted' ? 'En route to pickup' :
           status === 'arrived' ? 'At pickup point' :
           status === 'ongoing' ? 'Trip in progress' :
           status.replace(/_/g, ' ')}
        </Text>
      </View>
    </View>
  );
});

const tripMapStyles = StyleSheet.create({
  container: {
    height: 200,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#0f172a',
  },
  webFallback: {
    height: 80,
    backgroundColor: '#1e293b',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statusChip: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 6,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11, fontWeight: '800', color: '#e2e8f0' },
  markerWrap: { alignItems: 'center' },
  markerCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
  markerStem: { width: 2, height: 5, backgroundColor: '#22c55e' },
  markerLabel: {
    backgroundColor: 'rgba(15,23,42,0.85)', borderRadius: 5,
    paddingHorizontal: 5, paddingVertical: 1,
    borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  markerLabelText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  riderDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#f59e0b',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#FFF',
  },
});

export default function DriverTripsScreen() {
  const router = useRouter();
  const { user, currentLocation, currentTrip, setCurrentTrip } = useAppStore();
  const [trips, setTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const hasActiveTrip = Boolean(currentTrip?.id);
  const [lastSpeedSpikeAlertAt, setLastSpeedSpikeAlertAt] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

  useEffect(() => {
    loadPendingTrips();
    recoverActiveTrip();
    const interval = setInterval(loadPendingTrips, 18000);
    return () => clearInterval(interval);
  }, []);

  const recoverActiveTrip = async () => {
    if (!user?.id) return;
    try {
      const response = await fetch(`${BACKEND_URL}/api/trips/active/${user.id}`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!data?.active || !data?.trip) return;
      const trip = data.trip;
      const normalizedStatus =
        trip.status === 'completed' && trip.payment_status === 'pending'
          ? 'pending_payment'
          : trip.status;
      if (['accepted', 'arrived', 'ongoing', 'pending_payment'].includes(normalizedStatus)) {
        setCurrentTrip({ ...trip, status: normalizedStatus });
      }
    } catch {}
  };

  useEffect(() => {
    if (!currentTrip?.id) return;
    let mounted = true;
    const syncTrip = async () => {
      try {
        const res = await getTrip(currentTrip.id);
        if (mounted && res.data) {
          const spoofAlert = res.data.gps_spoofing_alert;
          if (spoofAlert?.active) {
            Alert.alert(
              'GPS Spoofing Detected',
              spoofAlert.message || 'Suspicious GPS manipulation was detected. Your account is suspended pending investigation.',
            );
          }
          const speedAlert = res.data.speed_spike_alert;
          if (speedAlert?.active && speedAlert.triggered_at && speedAlert.triggered_at !== lastSpeedSpikeAlertAt) {
            setLastSpeedSpikeAlertAt(speedAlert.triggered_at);
            void notificationService.sendLocalNotification({
              type: 'speed_spike_alert',
              title: 'Slow Down Now',
              body: `Critical speed detected at ${Math.round(speedAlert.speed_kmh || 0)} km/h. Nexryde logged a violation.`,
              data: { trip_id: currentTrip.id },
            });
            Alert.alert(
              'Speed Violation',
              speedAlert.driver_suspended
                ? 'Third speed violation detected. Your account has been suspended automatically.'
                : `Critical speed of ${Math.round(speedAlert.speed_kmh || 0)} km/h detected. Slow down immediately.`,
            );
          }
          if (res.data.status === 'completed' && res.data.payment_status === 'pending') {
            setCurrentTrip({ ...res.data, status: 'pending_payment' });
            return;
          }
          if (['completed', 'cancelled'].includes(res.data.status)) {
            setCurrentTrip(null);
            loadPendingTrips();
            return;
          }
          setCurrentTrip(res.data);
        }
      } catch {}
    };
    syncTrip();
    const interval = setInterval(syncTrip, 12000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [currentTrip?.id, lastSpeedSpikeAlertAt]);

  useEffect(() => {
    if (!currentTrip?.id || !currentLocation) return;
    if (!['accepted', 'arrived', 'ongoing'].includes(currentTrip.status)) return;

    let cancelled = false;
    const pushLocation = async () => {
      try {
        await fetch(`${BACKEND_URL}/api/trips/${currentTrip.id}/update-location`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }),
        });
      } catch (error) {
        if (__DEV__) console.warn('Trip location update failed', error);
      }
    };

    pushLocation();
    const interval = setInterval(() => {
      if (!cancelled) pushLocation();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentTrip?.id, currentTrip?.status, currentLocation?.latitude, currentLocation?.longitude]);

  const loadPendingTrips = async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const response = await getDriverTripOffers(user.id);
      setTrips(response.data);
    } catch (error) {
      if (__DEV__) console.warn('Error loading trips', error);
      // Retain existing trips on error — don't wipe the list
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPendingTrips();
    setRefreshing(false);
  }, []);

  const handleAcceptTrip = async (trip: any) => {
    if (busyActionKey) return;
    if (!user?.id) return;
    setBusyActionKey(`accept-${trip.id}`);
    setActionLoading(trip.id);
    try {
      const response = await acceptTrip(trip.id, user.id, trip.offer_id);
      setCurrentTrip(response.data);
      Alert.alert('Trip Accepted', 'Navigate to pickup location to start the ride.');
      setTrips(trips.filter(t => t.id !== trip.id));
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to accept trip');
    } finally {
      setActionLoading(null);
      setBusyActionKey(null);
    }
  };

  const handleStartTrip = async () => {
    if (!currentTrip?.id || !user?.id || busyActionKey) return;
    setBusyActionKey('start');
    setActionLoading('start');
    try {
      router.push({
        pathname: '/driver/verify-rider-code',
        params: { trip_id: currentTrip.id, driver_id: user.id },
      } as any);
    } finally {
      // Clear loading after navigation starts (slight delay for UX)
      setTimeout(() => { setActionLoading(null); setBusyActionKey(null); }, 800);
    }
  };

  const handleArriveTrip = async () => {
    if (busyActionKey) return;
    if (!currentTrip?.id || !user?.id) return;
    setBusyActionKey('arrive');
    setActionLoading('arrive');
    try {
      const response = await arriveTrip(currentTrip.id, user.id);
      setCurrentTrip(response.data);
      Alert.alert('Arrived', 'Rider has been notified. Ask them to show their security code.');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to mark arrival');
    } finally {
      setActionLoading(null);
      setBusyActionKey(null);
    }
  };

  const handleCompleteTrip = async () => {
    if (busyActionKey) return;
    if (!currentTrip?.id) return;
    setBusyActionKey('complete');
    setActionLoading('complete');
    try {
      const response = await completeTrip(currentTrip.id);
      const tripAfterComplete = response?.data || {};
      const statusAfterComplete =
        tripAfterComplete.status === 'completed' && tripAfterComplete.payment_status === 'pending'
          ? 'pending_payment'
          : tripAfterComplete.status;
      Alert.alert(
        'Trip Completed!', 
        `Collect ${CURRENCY}${currentTrip.fare.toLocaleString()} from the rider.`,
        [{ text: 'OK', onPress: () => {
          if (statusAfterComplete === 'pending_payment') {
            setCurrentTrip({ ...tripAfterComplete, status: 'pending_payment' });
          } else {
            setCurrentTrip(null);
          }
        } }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to complete trip');
    } finally {
      setActionLoading(null);
      setBusyActionKey(null);
    }
  };

  const handleCancelTrip = async () => {
    if (!currentTrip?.id || !user?.id) return;
    
    Alert.alert(
      'Cancel Trip',
      'Are you sure you want to cancel this trip? This will affect your rating.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            if (busyActionKey) return;
            setBusyActionKey('cancel');
            setActionLoading('cancel');
            try {
              await cancelTrip(currentTrip.id, user.id);
              setCurrentTrip(null);
              Alert.alert('Trip Cancelled');
            } catch (error: any) {
              Alert.alert('Error', error.response?.data?.detail || 'Failed to cancel trip');
            } finally {
              setActionLoading(null);
              setBusyActionKey(null);
            }
          }
        }
      ]
    );
  };

  const handleExplainRouteChange = async () => {
    if (!currentTrip?.id) return;
    Alert.alert(
      'Explain Route Change',
      'Share why you left the rider-approved route.',
      [
        { text: 'Dismiss', style: 'cancel' },
        {
          text: 'Traffic Diversion',
          onPress: async () => {
            try {
              await explainGeoFenceDeviation(currentTrip.id, 'Traffic diversion or road closure required a safer alternate route.');
              const refreshed = await getTrip(currentTrip.id);
              if (refreshed.data) setCurrentTrip(refreshed.data);
              Alert.alert('Explanation sent', 'The rider has been notified and monitoring remains active.');
            } catch (error: any) {
              Alert.alert('Could not send', error?.response?.data?.detail || 'Please try again.');
            }
          },
        },
        {
          text: 'Safety / Police',
          onPress: async () => {
            try {
              await explainGeoFenceDeviation(currentTrip.id, 'Police checkpoint, hazard or safety concern required an immediate route change.');
              const refreshed = await getTrip(currentTrip.id);
              if (refreshed.data) setCurrentTrip(refreshed.data);
              Alert.alert('Explanation sent', 'The rider has been notified and monitoring remains active.');
            } catch (error: any) {
              Alert.alert('Could not send', error?.response?.data?.detail || 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleOneTouchPoliceConnect = async () => {
    if (busyActionKey) return;
    if (!currentTrip?.id) return;
    const lat = currentLocation?.latitude;
    const lng = currentLocation?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      Alert.alert('Location required', 'Enable live location so Police Connect can send precise coordinates.');
      return;
    }
    setBusyActionKey('police-connect');
    setActionLoading('police-connect');
    try {
      const res = await triggerOneTouchPoliceConnect({
        trip_id: currentTrip.id,
        location_lat: lat,
        location_lng: lng,
      });
      const data = res.data || {};
      const mapUrl = String(data.nearest_police_station_map_url || '');
      const dialUri = String(data.dial_uri || 'tel:+234199');
      Alert.alert(
        'Police Connect Active',
        'Structured alert sent with your driver and vehicle details. Calling nearest emergency line now.',
        [
          {
            text: 'Open Station Map',
            onPress: () => {
              if (mapUrl) void Linking.openURL(mapUrl);
            },
          },
          {
            text: 'Call Police',
            onPress: () => {
              void Linking.openURL(dialUri);
            },
          },
          { text: 'Done', style: 'cancel' },
        ]
      );
      void Linking.openURL(dialUri);
    } catch (error: any) {
      Alert.alert('Police Connect failed', error?.response?.data?.detail || 'Could not alert police right now.');
    } finally {
      setActionLoading(null);
      setBusyActionKey(null);
    }
  };

  const handleDriverWitnessReport = async () => {
    if (!currentTrip?.id) return;
    const lat = currentLocation?.latitude;
    const lng = currentLocation?.longitude;
    const openSubmitFlow = (incidentType: 'crime' | 'accident' | 'medical' | 'fire' | 'violence' | 'other') => {
      Alert.alert(
        'Witness Report Privacy',
        'Submit anonymously to protect your identity while Nexryde forwards the structured report to relevant authorities.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Submit Anonymous',
            onPress: async () => {
              try {
                if (busyActionKey) return;
                setBusyActionKey('witness-report');
                setActionLoading('witness-report');
                const res = await submitDriverWitnessReport({
                  trip_id: currentTrip.id,
                  incident_type: incidentType,
                  description: `Driver witness report for ${incidentType}. Captured during active trip operations.`,
                  anonymous: true,
                  location_lat: typeof lat === 'number' ? lat : undefined,
                  location_lng: typeof lng === 'number' ? lng : undefined,
                });
                const data = res.data;
                Alert.alert(
                  'Report Submitted',
                  `${data.message}\n\nSafety points earned: +${data.reward_points_earned}`,
                );
              } catch (error: any) {
                Alert.alert('Could not submit', error?.response?.data?.detail || 'Please try again.');
              } finally {
                setActionLoading(null);
                setBusyActionKey(null);
              }
            },
          },
          {
            text: 'Submit With Identity',
            onPress: async () => {
              try {
                if (busyActionKey) return;
                setBusyActionKey('witness-report');
                setActionLoading('witness-report');
                const res = await submitDriverWitnessReport({
                  trip_id: currentTrip.id,
                  incident_type: incidentType,
                  description: `Driver witness report for ${incidentType}. Captured during active trip operations.`,
                  anonymous: false,
                  location_lat: typeof lat === 'number' ? lat : undefined,
                  location_lng: typeof lng === 'number' ? lng : undefined,
                });
                const data = res.data;
                Alert.alert(
                  'Report Submitted',
                  `${data.message}\n\nSafety points earned: +${data.reward_points_earned}`,
                );
              } catch (error: any) {
                Alert.alert('Could not submit', error?.response?.data?.detail || 'Please try again.');
              } finally {
                setActionLoading(null);
                setBusyActionKey(null);
              }
            },
          },
        ]
      );
    };

    Alert.alert(
      'Driver Witness Programme',
      'What did you witness?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Crime / Violence', onPress: () => openSubmitFlow('crime') },
        { text: 'Accident / Medical', onPress: () => openSubmitFlow('accident') },
      ]
    );
  };

  const handleShareStopReason = async () => {
    if (!currentTrip?.id) return;
    Alert.alert(
      'Why did you stop?',
      'Choose the reason to keep the rider informed and prevent safety escalation.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Traffic / Roadblock',
          onPress: async () => {
            if (busyActionKey) return;
            setBusyActionKey('stop-reason');
            try {
              setActionLoading('stop-reason');
              await submitDriverStopReason(currentTrip.id, 'Traffic jam or road blockage required a temporary stop.');
              const refreshed = await getTrip(currentTrip.id);
              if (refreshed.data) setCurrentTrip(refreshed.data);
              Alert.alert('Shared', 'Rider has been notified about your stop reason.');
            } catch (error: any) {
              Alert.alert('Could not share', error?.response?.data?.detail || 'Please try again.');
            } finally {
              setActionLoading(null);
              setBusyActionKey(null);
            }
          },
        },
        {
          text: 'Safety / Security',
          onPress: async () => {
            if (busyActionKey) return;
            setBusyActionKey('stop-reason');
            try {
              setActionLoading('stop-reason');
              await submitDriverStopReason(currentTrip.id, 'I paused due to a safety or security concern on the road.');
              const refreshed = await getTrip(currentTrip.id);
              if (refreshed.data) setCurrentTrip(refreshed.data);
              Alert.alert('Shared', 'Rider has been notified about your stop reason.');
            } catch (error: any) {
              Alert.alert('Could not share', error?.response?.data?.detail || 'Please try again.');
            } finally {
              setActionLoading(null);
              setBusyActionKey(null);
            }
          },
        },
      ]
    );
  };

  const renderTrip = ({ item }: { item: any }) => {
    const riderName: string = item.rider_display_name || item.rider_name || 'Rider';
    const riderRating: number = Number(item.rider_rating ?? item.rider_reputation_avg ?? 0);
    const isPreferred: boolean = Boolean(item.preferred);
    const riskBand: string = item.rider_risk_band || 'green';
    const riskColor = riskBand === 'red' ? '#dc2626' : riskBand === 'yellow' ? '#d97706' : '#16a34a';

    return (
    <Card style={isPreferred ? { ...styles.tripCard, borderColor: '#f59e0b', borderWidth: 2 } : styles.tripCard}>
      {isPreferred && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 4 }}>
          <Ionicons name="star" size={13} color="#f59e0b" />
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#f59e0b', textTransform: 'uppercase' }}>Priority Request</Text>
        </View>
      )}
      <View style={styles.tripHeader}>
        <View style={styles.distanceBadge}>
          <Ionicons name="navigate" size={16} color={COLORS.primary} />
          <Text style={styles.distanceText}>{Number(item.distance_to_pickup ?? 0).toFixed(1)} km away</Text>
        </View>
        <Text style={styles.tripFare}>{CURRENCY}{Number(item.fare ?? 0).toLocaleString()}</Text>
      </View>

      {/* Rider info row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#e0e7ff', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={16} color="#4f46e5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>{riderName}</Text>
          {riderRating > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="star" size={11} color="#f59e0b" />
              <Text style={{ fontSize: 12, color: '#64748b' }}>{riderRating.toFixed(1)}</Text>
            </View>
          )}
        </View>
        <View style={{ backgroundColor: riskColor + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: riskColor, textTransform: 'capitalize' }}>{riskBand} risk</Text>
        </View>
      </View>
      
      <View style={styles.tripRoute}>
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Pickup</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.pickup_location?.address || 'Pickup'}
            </Text>
          </View>
        </View>
        <View style={styles.routeLine} />
        <View style={styles.routePoint}>
          <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
          <View style={styles.routeInfo}>
            <Text style={styles.routeLabel}>Dropoff</Text>
            <Text style={styles.routeAddress} numberOfLines={1}>
              {item.dropoff_location?.address || 'Destination'}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.tripMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="navigate" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.distance_km} km</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.duration_mins} mins</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="card" size={14} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{item.payment_method || 'cash'}</Text>
        </View>
      </View>
      
      <Button
        title={actionLoading === item.id ? 'Accepting...' : 'Accept Trip'}
        onPress={() => handleAcceptTrip(item)}
        loading={actionLoading === item.id}
        style={styles.acceptButton}
      />
    </Card>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Driver Operations</Text>
          <Text style={styles.subtitle}>Handle your current trip and new requests from one clean hub.</Text>
        </View>
        <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/driver/safety-alerts')}>
          <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summaryCardPrimary]}>
          <Text style={styles.summaryLabel}>Active trip</Text>
          <Text style={styles.summaryValue}>{hasActiveTrip ? '1 live' : 'None'}</Text>
          <Text style={styles.summarySubtext}>
            {hasActiveTrip ? `Status: ${String(currentTrip?.status || '').replace(/_/g, ' ')}` : 'Accept a ride to start driving'}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Ride offers</Text>
          <Text style={styles.summaryValue}>{trips.length}</Text>
          <Text style={styles.summarySubtext}>
            {trips.length > 0 ? 'Nearby requests ready' : 'Pull to refresh offers'}
          </Text>
        </View>
      </View>

      {/* Current Trip */}
      {currentTrip && (
        <Card style={styles.currentTripCard}>
          <View style={styles.currentTripHeader}>
            <Badge 
              text={currentTrip.status.toUpperCase()} 
              variant={currentTrip.status === 'ongoing' ? 'info' : currentTrip.status === 'pending_payment' ? 'success' : 'warning'} 
            />
            <Text style={styles.currentTripFare}>{CURRENCY}{currentTrip.fare.toLocaleString()}</Text>
          </View>

          {/* Live map — shows driver position, pickup, dropoff */}
          {['accepted', 'arrived', 'ongoing'].includes(currentTrip.status) && (
            <TripLiveMap
              driverLat={currentLocation?.latitude ?? null}
              driverLng={currentLocation?.longitude ?? null}
              pickupLat={typeof currentTrip.pickup_location === 'object' ? (currentTrip.pickup_location as any)?.lat : null}
              pickupLng={typeof currentTrip.pickup_location === 'object' ? (currentTrip.pickup_location as any)?.lng : null}
              dropLat={typeof currentTrip.dropoff_location === 'object' ? (currentTrip.dropoff_location as any)?.lat : null}
              dropLng={typeof currentTrip.dropoff_location === 'object' ? (currentTrip.dropoff_location as any)?.lng : null}
              status={currentTrip.status}
              riderLat={(currentTrip as any)?.rider_current_lat ?? null}
              riderLng={(currentTrip as any)?.rider_current_lng ?? null}
            />
          )}
          
          <View style={styles.tripRoute}>
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Pickup</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {currentTrip.pickup_location.address}
                </Text>
              </View>
            </View>
            <View style={styles.routeLine} />
            <View style={styles.routePoint}>
              <View style={[styles.routeDot, { backgroundColor: COLORS.error }]} />
              <View style={styles.routeInfo}>
                <Text style={styles.routeLabel}>Dropoff</Text>
                <Text style={styles.routeAddress} numberOfLines={1}>
                  {currentTrip.dropoff_location.address}
                </Text>
              </View>
            </View>
          </View>

          {currentTrip.estate_gate_access?.available && currentTrip.status === 'arrived' && (
            <View style={styles.gateCodeCard}>
              <View style={styles.gateCodeHeader}>
                <Ionicons name="key-outline" size={18} color={COLORS.warning} />
                <Text style={styles.gateCodeTitle}>Estate Gate Code</Text>
              </View>
              <Text style={styles.gateCodeValue}>{currentTrip.estate_gate_access?.gate_code}</Text>
              <Text style={styles.gateCodeText}>
                {currentTrip.estate_gate_access?.estate_name
                  ? `${currentTrip.estate_gate_access.estate_name} gate access is live for 10 minutes.`
                  : 'Gate access is live for 10 minutes from arrival.'}
              </Text>
            </View>
          )}

          {(currentTrip as any).geo_fence_trip_lock?.active && ['accepted', 'arrived', 'ongoing'].includes(currentTrip.status) && (
            <View style={styles.gateCodeCard}>
              <View style={styles.gateCodeHeader}>
                <Ionicons name="navigate-circle-outline" size={18} color={COLORS.primary} />
                <Text style={styles.gateCodeTitle}>Geo Fence Trip Lock</Text>
              </View>
              <Text style={styles.gateCodeText}>
                Rider locked the approved route at {Math.round((currentTrip as any).geo_fence_trip_lock?.threshold_meters || 200)}m tolerance.
              </Text>
              {(currentTrip as any).geo_fence_trip_lock?.driver_explanation_required && currentTrip.status === 'ongoing' && (
                <Button
                  title="Explain Route Change"
                  onPress={handleExplainRouteChange}
                  icon="chatbubble-ellipses"
                  style={styles.actionButton}
                />
              )}
            </View>
          )}

          {(currentTrip as any).speed_spike_alert?.active && currentTrip.status === 'ongoing' && (
            <View style={styles.speedViolationCard}>
              <View style={styles.gateCodeHeader}>
                <Ionicons name="warning-outline" size={18} color={COLORS.error} />
                <Text style={styles.gateCodeTitle}>Speed Violation</Text>
              </View>
              <Text style={styles.gateCodeText}>
                Estimated speed: {Math.round((currentTrip as any).speed_spike_alert?.speed_kmh || 0)} km/h. Slow down immediately.
              </Text>
              <Text style={styles.speedViolationText}>
                Violation count: {Number((currentTrip as any).speed_spike_alert?.violation_count || 0)}
                {(currentTrip as any).speed_spike_alert?.driver_suspended ? ' • Automatic suspension applied' : ''}
              </Text>
            </View>
          )}

          {(currentTrip as any).gps_spoofing_alert?.active && ['accepted', 'ongoing', 'pending_payment'].includes(currentTrip.status) && (
            <View style={styles.speedViolationCard}>
              <View style={styles.gateCodeHeader}>
                <Ionicons name="locate-outline" size={18} color={COLORS.error} />
                <Text style={styles.gateCodeTitle}>GPS Spoofing Detected</Text>
              </View>
              <Text style={styles.gateCodeText}>
                Nexryde detected impossible GPS movement and froze the fare on this trip.
              </Text>
              <Text style={styles.speedViolationText}>
                {Number((currentTrip as any).gps_spoofing_alert?.jump_km || 0).toFixed(2)} km jump
                {(currentTrip as any).gps_spoofing_alert?.driver_suspended ? ' • Account suspended pending investigation' : ''}
              </Text>
            </View>
          )}

          {(currentTrip as any).guardian_alert?.active && (currentTrip as any).guardian_alert?.type === 'abnormal_stop' && currentTrip.status === 'ongoing' && (
            <View style={styles.gateCodeCard}>
              <View style={styles.gateCodeHeader}>
                <Ionicons name="pause-circle-outline" size={18} color={COLORS.warning} />
                <Text style={styles.gateCodeTitle}>Stop detected</Text>
              </View>
              <Text style={styles.gateCodeText}>
                The rider was asked a safety check. Share your stop reason now to keep trust high.
              </Text>
              <Button
                title={actionLoading === 'stop-reason' ? 'Sharing...' : 'Share Stop Reason'}
                onPress={handleShareStopReason}
                loading={actionLoading === 'stop-reason'}
                icon="chatbubble-ellipses"
                style={styles.actionButton}
              />
            </View>
          )}
          
          <View style={styles.currentTripActions}>
            {currentTrip.status === 'accepted' && (
              <Button
                title={actionLoading === 'arrive' ? 'Updating...' : 'Arrived at Pickup'}
                onPress={handleArriveTrip}
                loading={actionLoading === 'arrive'}
                icon="location"
                style={styles.actionButton}
              />
            )}
            {currentTrip.status === 'arrived' && (
              <Button
                title={actionLoading === 'start' ? 'Opening...' : 'Verify Rider Code'}
                onPress={handleStartTrip}
                loading={actionLoading === 'start'}
                icon="key"
                style={styles.actionButton}
              />
            )}
            {currentTrip.status === 'ongoing' && (
              <Button
                title={actionLoading === 'complete' ? 'Completing...' : 'Complete Trip'}
                onPress={handleCompleteTrip}
                loading={actionLoading === 'complete'}
                icon="checkmark-circle"
                style={styles.actionButton}
              />
            )}
            {currentTrip.status === 'pending_payment' && (
              <View style={styles.pendingPaymentBadge}>
                <Ionicons name="card-outline" size={14} color={COLORS.success} />
                <Text style={styles.pendingPaymentText}>Payment pending confirmation</Text>
              </View>
            )}
            {['accepted', 'arrived', 'ongoing'].includes(currentTrip.status) && (
              <Button
                title={actionLoading === 'witness-report' ? 'Submitting...' : 'Driver Witness Report'}
                onPress={handleDriverWitnessReport}
                variant="outline"
                loading={actionLoading === 'witness-report'}
                icon="document-text"
                style={styles.cancelButton}
              />
            )}
            {['accepted', 'arrived', 'ongoing'].includes(currentTrip.status) && (
              <Button
                title={actionLoading === 'police-connect' ? 'Connecting...' : 'One Touch Police Connect'}
                onPress={handleOneTouchPoliceConnect}
                variant="outline"
                loading={actionLoading === 'police-connect'}
                icon="shield-checkmark"
                style={styles.cancelButton}
              />
            )}
            {['accepted', 'arrived', 'ongoing'].includes(currentTrip.status) && (
              <Button
                title="Cancel"
                onPress={handleCancelTrip}
                variant="outline"
                loading={actionLoading === 'cancel'}
                style={styles.cancelButton}
              />
            )}
          </View>
        </Card>
      )}

      {/* Available Trips */}
      {!currentTrip && (
        <>
          {trips.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="car-outline" size={64} color={COLORS.gray300} />
              <Text style={styles.emptyTitle}>No rides available</Text>
              <Text style={styles.emptyText}>Pull down to refresh or wait for new ride requests</Text>
            </View>
          ) : (
            <>
              <View style={styles.listHeader}>
                <View>
                  <Text style={styles.listTitle}>Available rides</Text>
                  <Text style={styles.listSubtitle}>Review requests before you accept the next trip.</Text>
                </View>
                <TouchableOpacity style={styles.secondaryLink} onPress={() => router.push('/driver/subscription')}>
                  <Text style={styles.secondaryLinkText}>Subscription</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={trips}
                renderItem={renderTrip}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={
                  <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  headerTextWrap: {
    flex: 1,
    marginHorizontal: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
    ...SHADOWS.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    marginTop: 2,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    ...SHADOWS.sm,
  },
  summaryCardPrimary: {
    borderColor: COLORS.primary + '55',
  },
  summaryLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    marginTop: 6,
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  summarySubtext: {
    marginTop: 4,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  currentTripCard: {
    margin: SPACING.md,
    marginTop: 0,
    backgroundColor: COLORS.primary + '10',
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  currentTripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  currentTripFare: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  gateCodeCard: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.warningSoft,
    borderWidth: 1,
    borderColor: COLORS.warning + '35',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  gateCodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },
  gateCodeTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
    color: COLORS.warning,
  },
  gateCodeValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: 1,
  },
  gateCodeText: {
    marginTop: 6,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  speedViolationCard: {
    marginTop: SPACING.md,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  speedViolationText: {
    marginTop: 6,
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.error,
    lineHeight: 18,
  },
  currentTripActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  actionButton: {
    flex: 1,
  },
  cancelButton: {
    flex: 0.4,
  },
  pendingPaymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.success + '15',
    borderColor: COLORS.success + '40',
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  pendingPaymentText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.success,
    fontWeight: '700',
  },
  listContent: {
    padding: SPACING.md,
    paddingTop: 0,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  listTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  listSubtitle: {
    marginTop: 4,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  secondaryLink: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.warningSoft,
  },
  secondaryLinkText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.warning,
  },
  tripCard: {
    marginBottom: SPACING.md,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  distanceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  distanceText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontWeight: '600',
  },
  tripFare: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  tripRoute: {
    marginBottom: SPACING.md,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  routeInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  routeLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  routeAddress: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: COLORS.gray200,
    marginLeft: 5,
    marginVertical: SPACING.xs,
  },
  tripMeta: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    marginLeft: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  acceptButton: {
    marginTop: SPACING.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },
});
