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
  StatusBar,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTurnByTurnNav } from '@/src/navigation/useTurnByTurnNav';
import { TurnCard } from '@/src/navigation/TurnCard';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Card, Badge, Button } from '@/src/components/UI';
import { useAppStore, Trip } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders, getDriverTripOffers, acceptTrip, arriveTrip, startTrip, completeTrip, cancelTrip, getTrip, explainGeoFenceDeviation, triggerOneTouchPoliceConnect, submitDriverWitnessReport, submitDriverStopReason } from '@/src/services/api';
import notificationService from '@/src/services/notifications';
import * as Location from 'expo-location';
import policeContactsRaw from '@/src/data/policeContacts';

interface _PoliceContact { state: string; aliases: string[]; phone: string; }
const _POLICE = policeContactsRaw as _PoliceContact[];
function _matchPolice(region: string): string {
  const q = region.toLowerCase().trim();
  const found = _POLICE.find((c) => c.state.toLowerCase() === q || c.aliases.some((a) => a === q || q.includes(a)));
  return found ? `tel:${found.phone}` : 'tel:+2349055390070'; // Lagos fallback
}

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
  pickupAddress?: string;
  dropAddress?: string;
};

function calcDriverBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function haversineDriverKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function PulsingDriverDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  const ringPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.4, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(ringPulse, { toValue: 1.8, duration: 1200, useNativeDriver: true }),
        Animated.timing(ringPulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse, ringPulse]);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 48, height: 48 }}>
      <Animated.View style={{
        position: 'absolute', width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(59,130,246,0.15)', transform: [{ scale: ringPulse }],
      }} />
      <Animated.View style={{
        position: 'absolute', width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(59,130,246,0.25)', transform: [{ scale: pulse }],
      }} />
      <LinearGradient colors={['#60a5fa', '#2563eb']} style={{
        width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#FFF', elevation: 8,
      }}>
        <Ionicons name="car" size={13} color="#FFF" />
      </LinearGradient>
    </View>
  );
}

function RiderDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, [pulse]);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 32, height: 32 }}>
      <Animated.View style={{
        position: 'absolute', width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(168,85,247,0.25)', transform: [{ scale: pulse }],
      }} />
      <LinearGradient colors={['#c084fc', '#7c3aed']} style={{
        width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#FFF',
      }}>
        <Ionicons name="person" size={9} color="#FFF" />
      </LinearGradient>
    </View>
  );
}

const TripLiveMap = memo(function TripLiveMap({ driverLat, driverLng, pickupLat, pickupLng, dropLat, dropLng, status, riderLat, riderLng, pickupAddress, dropAddress }: LiveMapProps) {
  const [mapReady, setMapReady] = useState(false);
  const [userPanned, setUserPanned] = useState(false);
  const mapRef = useRef<any>(null);
  const bearingRef = useRef(0);
  const prevDriverRef = useRef<{ lat: number; lng: number } | null>(null);

  // Turn-by-turn navigation — origin/dest switches based on trip status
  const navOriginLat = status === 'ongoing' ? pickupLat : driverLat;
  const navOriginLng = status === 'ongoing' ? pickupLng : driverLng;
  const navDestLat = status === 'ongoing' ? dropLat : pickupLat;
  const navDestLng = status === 'ongoing' ? dropLng : pickupLng;
  const nav = useTurnByTurnNav(
    driverLat, driverLng,
    navOriginLat ?? null, navOriginLng ?? null,
    navDestLat ?? null, navDestLng ?? null,
    status,
  );
  const navActive = status === 'accepted' || status === 'arrived' || status === 'ongoing';

  // Stable initial region (only computed once — avoids map reload on re-render)
  const focalLat = driverLat ?? pickupLat ?? 6.5244;
  const focalLng = driverLng ?? pickupLng ?? 3.3792;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialRegion = useMemo(() => ({
    latitude: focalLat,
    longitude: focalLng,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  }), [Boolean(driverLat ?? pickupLat)]); // recompute only when coords go from null → available

  // Bearing-aware camera follow (skip re-animate if driver moved < 5 m to avoid over-animating GPS jitter)
  useEffect(() => {
    if (!mapReady || !mapRef.current || !driverLat || !driverLng) return;
    const prev = prevDriverRef.current;
    if (prev) {
      const moved = haversineDriverKm(prev.lat, prev.lng, driverLat, driverLng);
      if (moved < 0.005) return; // < 5 m — skip
      bearingRef.current = calcDriverBearing(prev.lat, prev.lng, driverLat, driverLng);
    }
    prevDriverRef.current = { lat: driverLat, lng: driverLng };
    if (!userPanned) {
      mapRef.current.animateCamera({
        center: { latitude: driverLat, longitude: driverLng },
        zoom: 16,
        heading: bearingRef.current,
        pitch: 25,
      }, { duration: 900 });
    }
  }, [driverLat, driverLng, mapReady, userPanned]);

  // Compute ETA & distance
  const { etaMin, distanceKm } = useMemo(() => {
    if (!driverLat || !driverLng) return { etaMin: null, distanceKm: null };
    const targetLat = status === 'ongoing' ? (dropLat ?? pickupLat) : (pickupLat ?? dropLat);
    const targetLng = status === 'ongoing' ? (dropLng ?? pickupLng) : (pickupLng ?? dropLng);
    if (!targetLat || !targetLng) return { etaMin: null, distanceKm: null };
    const km = haversineDriverKm(driverLat, driverLng, targetLat, targetLng);
    const min = Math.round((km / 28) * 60);
    return { etaMin: min < 1 ? 1 : min > 90 ? null : min, distanceKm: km };
  }, [driverLat, driverLng, status, pickupLat, pickupLng, dropLat, dropLng]);

  const showPickup = status !== 'ongoing' && pickupLat != null && Number.isFinite(pickupLat);
  const showDrop = dropLat != null && Number.isFinite(dropLat);
  const showDriver = driverLat != null && Number.isFinite(driverLat);
  const showRider = riderLat != null && Number.isFinite(riderLat!);

  // Use Google Directions overview polyline when available; fallback to straight line
  let polyline: { latitude: number; longitude: number }[] = nav.overviewCoords.length > 0
    ? nav.overviewCoords
    : [];
  if (polyline.length === 0) {
    if (status === 'accepted' && showDriver && pickupLat != null) {
      polyline = [
        { latitude: driverLat!, longitude: driverLng! },
        { latitude: pickupLat, longitude: pickupLng! },
      ];
    } else if ((status === 'arrived' || status === 'ongoing') && pickupLat != null && dropLat != null) {
      if (showDriver) polyline.push({ latitude: driverLat!, longitude: driverLng! });
      if (pickupLat != null) polyline.push({ latitude: pickupLat, longitude: pickupLng! });
      polyline.push({ latitude: dropLat, longitude: dropLng! });
    }
  }

  if (Platform.OS === 'web') {
    return (
      <View style={tripMapStyles.webFallback}>
        <Ionicons name="map" size={22} color="#475569" />
        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>Live map on mobile app</Text>
      </View>
    );
  }

  const MapView = require('react-native-maps').default;
  const { Marker, Polyline, PROVIDER_GOOGLE } = require('react-native-maps');

  const statusLabel =
    status === 'accepted' ? 'En route to pickup' :
    status === 'arrived' ? 'At pickup point' :
    status === 'ongoing' ? 'Trip in progress' :
    status.replace(/_/g, ' ');
  const statusColor =
    status === 'ongoing' ? '#22c55e' :
    status === 'arrived' ? '#f59e0b' :
    status === 'accepted' ? '#0ea5e9' : '#64748b';

  return (
    <View style={tripMapStyles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        initialRegion={initialRegion}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled={false}
        toolbarEnabled={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsCompass={false}
        showsTraffic={status === 'ongoing'}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => setUserPanned(true)}
      >
        {/* Route: glow + bright */}
        {polyline.length >= 2 && (
          <>
            <Polyline coordinates={polyline} strokeColor="rgba(14,165,233,0.2)" strokeWidth={10} />
            <Polyline
              coordinates={polyline}
              strokeColor={status === 'ongoing' ? '#22c55e' : '#0ea5e9'}
              strokeWidth={3.5}
              lineDashPattern={status === 'accepted' ? [8, 5] : undefined}
            />
          </>
        )}

        {/* Driver position */}
        {showDriver && (
          <Marker
            coordinate={{ latitude: driverLat!, longitude: driverLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={10}
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
            zIndex={5}
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
            zIndex={5}
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

        {/* Rider position */}
        {showRider && (
          <Marker
            coordinate={{ latitude: riderLat!, longitude: riderLng! }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
            zIndex={6}
          >
            <RiderDot />
          </Marker>
        )}
      </MapView>

      {/* Voice navigation card — top overlay (replaces plain status chip) */}
      <TurnCard
        loading={nav.loading}
        currentStep={nav.currentStep}
        nextStep={nav.nextStep}
        distToStep={nav.distToStep}
        totalRouteM={nav.totalRouteM}
        remainingRouteM={nav.remainingRouteM}
        stepIndex={nav.stepIndex}
        totalSteps={nav.totalSteps}
        speedKmh={nav.speedKmh}
        muted={nav.muted}
        onToggleMute={nav.toggleMute}
        active={navActive}
      />

      {/* ETA chip — top-right */}
      {(etaMin != null || distanceKm != null) && (
        <View style={tripMapStyles.etaChip}>
          <Ionicons name="time-outline" size={11} color="#38bdf8" />
          <Text style={tripMapStyles.etaText}>
            {etaMin != null
              ? `${etaMin} min`
              : distanceKm! < 1
              ? `${Math.round(distanceKm! * 1000)} m`
              : `${distanceKm!.toFixed(1)} km`}
          </Text>
        </View>
      )}

      {/* Re-center button — bottom-right */}
      {userPanned && showDriver && (
        <TouchableOpacity
          style={tripMapStyles.recenterBtn}
          onPress={() => {
            setUserPanned(false);
            mapRef.current?.animateCamera({
              center: { latitude: driverLat!, longitude: driverLng! },
              zoom: 16,
              heading: bearingRef.current,
            }, { duration: 600 });
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="locate" size={16} color="#FFF" />
        </TouchableOpacity>
      )}
    </View>
  );
});

const tripMapStyles = StyleSheet.create({
  container: {
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
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
  etaChip: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.88)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(56,189,248,0.3)',
  },
  etaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
  },
  recenterBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15,23,42,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
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
  const tabPad = useTabBottomPad(8);
  const [lastSpeedSpikeAlertAt, setLastSpeedSpikeAlertAt] = useState<string | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [gateSecs, setGateSecs] = useState<number | null>(null);
  const gateCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gateCopiedRef = useRef(false);

  useEffect(() => {
    loadPendingTrips();
    recoverActiveTrip();
    const interval = setInterval(loadPendingTrips, 18000);
    return () => clearInterval(interval);
  }, []);

  // ── Gate code countdown timer ────────────────────────────────────────────
  useEffect(() => {
    const gateAccess = currentTrip?.estate_gate_access;
    const isArrived = currentTrip?.status === 'arrived';
    if (!isArrived || !gateAccess?.available || !gateAccess?.gate_code) {
      if (gateCountdownRef.current) {
        clearInterval(gateCountdownRef.current);
        gateCountdownRef.current = null;
      }
      setGateSecs(null);
      return;
    }
    // Calculate remaining seconds from shared_at + 10 min window
    const computeRemaining = () => {
      const sharedAt = gateAccess.shared_at
        ? new Date(gateAccess.shared_at).getTime()
        : Date.now();
      const expiresAt = sharedAt + 10 * 60 * 1000;
      return Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    };
    setGateSecs(computeRemaining());
    if (gateCountdownRef.current) clearInterval(gateCountdownRef.current);
    gateCountdownRef.current = setInterval(() => {
      const remaining = computeRemaining();
      setGateSecs(remaining);
      if (remaining <= 0 && gateCountdownRef.current) {
        clearInterval(gateCountdownRef.current);
        gateCountdownRef.current = null;
      }
    }, 1000);
    return () => {
      if (gateCountdownRef.current) clearInterval(gateCountdownRef.current);
    };
  }, [
    currentTrip?.status,
    currentTrip?.estate_gate_access?.available,
    currentTrip?.estate_gate_access?.shared_at,
  ]);

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
        params: { trip_id: currentTrip.id, driver_id: user.id, auto: '0' },
      } as any);
    } finally {
      setTimeout(() => { setActionLoading(null); setBusyActionKey(null); }, 800);
    }
  };

  // Auto-trigger verify screen when driver is within 100m of pickup
  const autoVerifyTriggeredRef = useRef(false);
  useEffect(() => {
    if (
      currentTrip?.status === 'arrived' &&
      !currentTrip?.pickup_code_verified &&
      !currentTrip?.security_code_verified &&
      !autoVerifyTriggeredRef.current &&
      user?.id
    ) {
      autoVerifyTriggeredRef.current = true;
      setTimeout(() => {
        router.push({
          pathname: '/driver/verify-rider-code',
          params: { trip_id: currentTrip.id, driver_id: user.id, auto: '1' },
        } as any);
      }, 600);
    }
    if (!currentTrip || currentTrip.status !== 'arrived') {
      autoVerifyTriggeredRef.current = false;
    }
  }, [currentTrip?.status, currentTrip?.pickup_code_verified, currentTrip?.security_code_verified]);

  const handleArriveTrip = async () => {
    if (busyActionKey) return;
    if (!currentTrip?.id || !user?.id) return;
    setBusyActionKey('arrive');
    setActionLoading('arrive');
    try {
      const response = await arriveTrip(currentTrip.id, user.id);
      setCurrentTrip(response.data);
      Alert.alert('Arrived at Pickup', 'Rider notified. Ask them to open NEXRYDE and show their pick-up code.');
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
      // Use backend dial_uri if present; otherwise reverse-geocode to get state police number
      let dialUri = String(data.dial_uri || '');
      if (!dialUri) {
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
          const region = String(geo?.[0]?.region || geo?.[0]?.subregion || '').trim();
          dialUri = region ? _matchPolice(region) : 'tel:+2349055390070';
        } catch { dialUri = 'tel:+2349055390070'; }
      }
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
      <StatusBar barStyle="light-content" backgroundColor="#0D1420" />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>Driver Operations</Text>
          <Text style={styles.subtitle}>Handle your current trip and new requests from one clean hub.</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/shield-disputes' as any)}>
            <Ionicons name="shield-half-outline" size={22} color="#EAB308" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/driver/safety-alerts')}>
            <Ionicons name="shield-checkmark-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>
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
              pickupAddress={typeof currentTrip.pickup_location === 'object' ? (currentTrip.pickup_location as any)?.address : undefined}
              dropAddress={typeof currentTrip.dropoff_location === 'object' ? (currentTrip.dropoff_location as any)?.address : undefined}
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

          {/* ── Estate indicator (accepted/arrived) ─────────────────── */}
          {currentTrip.estate_gate_access?.has_saved_code &&
            ['accepted', 'arrived'].includes(currentTrip.status) && (
            <View style={styles.estateIndicator}>
              <Ionicons name="business-outline" size={13} color="#F59E0B" />
              <Text style={styles.estateIndicatorText}>
                {currentTrip.estate_gate_access?.estate_name
                  ? `Gated estate — ${currentTrip.estate_gate_access.estate_name}`
                  : 'Gated estate pickup'}
              </Text>
              {currentTrip.status === 'accepted' && (
                <Text style={styles.estateIndicatorHint}> · code shared on arrival</Text>
              )}
            </View>
          )}

          {/* ── Full gate code card (arrived) ────────────────────────── */}
          {currentTrip.estate_gate_access?.available &&
            currentTrip.status === 'arrived' && (
            <View style={styles.gateCodeCardPremium}>
              {/* Header */}
              <View style={styles.gateCodeHeaderRow}>
                <View style={styles.gateCodeIconBadge}>
                  <Ionicons name="key" size={16} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gateCodeTitle}>Estate Gate Code</Text>
                  {currentTrip.estate_gate_access?.estate_name ? (
                    <Text style={styles.gateCodeEstate}>
                      {currentTrip.estate_gate_access.estate_name}
                    </Text>
                  ) : null}
                </View>
                {gateSecs !== null && gateSecs > 0 && (
                  <View style={styles.gateTimerPill}>
                    <Ionicons name="timer-outline" size={11} color="#FCD34D" />
                    <Text style={styles.gateTimerText}>
                      {`${Math.floor(gateSecs / 60)}:${String(gateSecs % 60).padStart(2, '0')}`}
                    </Text>
                  </View>
                )}
                {gateSecs === 0 && (
                  <View style={[styles.gateTimerPill, { backgroundColor: '#7F1D1D' }]}>
                    <Text style={[styles.gateTimerText, { color: '#FCA5A5' }]}>Expired</Text>
                  </View>
                )}
              </View>

              {/* Code display */}
              <View style={styles.gateCodeDisplay}>
                <Text style={styles.gateCodeValueLarge}>
                  {currentTrip.estate_gate_access?.gate_code}
                </Text>
                <TouchableOpacity
                  style={styles.gateCopyBtn}
                  onPress={async () => {
                    const code = currentTrip.estate_gate_access?.gate_code ?? '';
                    await Clipboard.setStringAsync(code);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    gateCopiedRef.current = true;
                    Alert.alert('Copied', `Gate code "${code}" copied to clipboard.`);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Copy gate code"
                >
                  <Ionicons name="copy-outline" size={16} color="#F59E0B" />
                  <Text style={styles.gateCopyBtnText}>Copy</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.gateCodeText}>
                {gateSecs !== null && gateSecs <= 0
                  ? 'This gate code has expired. Ask the rider for access.'
                  : 'Enter this code at the estate gate to let yourself in.'}
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
                title={
                  currentTrip.pickup_code_verified || currentTrip.security_code_verified
                    ? (actionLoading === 'start' ? 'Starting...' : 'Start Trip ✓')
                    : (actionLoading === 'start' ? 'Opening...' : 'Enter Pick-up Code')
                }
                onPress={handleStartTrip}
                loading={actionLoading === 'start'}
                icon={currentTrip.pickup_code_verified || currentTrip.security_code_verified ? 'play-circle' : 'keypad'}
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
              <>
                {/* Trip recording button — available during active trips */}
                <TouchableOpacity
                  style={styles.recordingBtn}
                  onPress={() => router.push({ pathname: '/driver/ride-recording', params: { tripId: currentTrip.id } } as any)}
                >
                  <Ionicons name="videocam-outline" size={16} color="#9333EA" />
                  <Text style={styles.recordingBtnText}>Record This Trip</Text>
                </TouchableOpacity>
                <Button
                  title="Cancel"
                  onPress={handleCancelTrip}
                  variant="outline"
                  loading={actionLoading === 'cancel'}
                  style={styles.cancelButton}
                />
              </>
            )}
            {['completed', 'cancelled'].includes(currentTrip.status) && (
              <TouchableOpacity
                style={styles.reportIssueBtn}
                onPress={() => router.push({ pathname: '/shield-disputes', params: { tripId: currentTrip.id, mode: 'report' } } as any)}
              >
                <Ionicons name="shield-outline" size={16} color="#EF4444" />
                <Text style={styles.reportIssueBtnText}>Report Issue with this Trip</Text>
              </TouchableOpacity>
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
                contentContainerStyle={[styles.listContent, { paddingBottom: tabPad }]}
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
  /* ── Enhanced estate gate code styles ──────────────────── */
  estateIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  estateIndicatorText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: '#FCD34D',
  },
  estateIndicatorHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  gateCodeCardPremium: {
    marginTop: SPACING.md,
    backgroundColor: '#1C1106',
    borderWidth: 1.5,
    borderColor: '#78350F',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    gap: 12,
  },
  gateCodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gateCodeIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateCodeEstate: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  gateTimerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#451A03',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  gateTimerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FCD34D',
    fontVariant: ['tabular-nums'],
  },
  gateCodeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#292109',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  gateCodeValueLarge: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FDE68A',
    letterSpacing: 6,
  },
  gateCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gateCopyBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F59E0B',
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
  recordingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(147,51,234,0.12)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.3)',
  },
  recordingBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9333EA',
  },
  reportIssueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    borderRadius: BORDER_RADIUS.lg,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.xs,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  reportIssueBtnText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#EF4444',
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
