import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useErrorToast } from '@/src/components/shared/ErrorToast';
import {
  saveDriverState,
  updateDriverOnlineStatus,
  updateDriverLastScreen,
} from '@/src/services/driverStateService';
import { isLocallyApproved } from '@/src/services/driverVerificationFact';
import { peekDriverBootCache } from '@/src/services/driverBootCache';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  AppState,
  InteractionManager,
  Switch,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useSegments, type Href } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import { useAppStore, type Trip, type DriverProfile } from '@/src/store/appStore';
import { useLanguage } from '@/src/i18n/LanguageContext';
import { SupportedLanguage } from '@/src/i18n/translations';
import {
  driverLocationPushMinIntervalMs,
  driverOffersFallbackPollIntervalMs,
  isDriverHighPriorityPolling,
} from '@/src/constants/driverPollingProfiles';
import { setDriverIncomingOfferActive } from '@/src/utils/driverPollingMode';
import { flushTripLocationQueue } from '@/src/utils/tripLocationQueue';
import {
  BACKEND_URL,
  getAuthHeaders,
  formatApiDetail,
  extractApiDetailPayload,
  messageFromAxiosError,
  getDriverSubscriptionStatus,
  getTrip,
  arriveTrip,
  startTrip,
  cancelTrip,
  completeTrip,
  rateTrip,
  confirmTripPayment,
  triggerSOS,
} from '@/src/services/api';
import CancellationReasonModal from '@/src/components/shared/CancellationReasonModal';
import { parseDriverOnlineError } from '@/src/constants/driverOnlineErrors';
import {
  evaluateDriverPermissionPreflight,
  type DriverPermissionItem,
  type DriverPermissionPreflight,
} from '@/src/services/driverPermissionPreflight';
import {
  peekPermissionsCompleted,
  readPermissionsCompleted,
  writePermissionsCompleted,
} from '@/src/services/driverPermissionsCompleted';
import { DriverGoOnlinePermissionGate } from '@/src/components/driver/DriverGoOnlinePermissionGate';
import { apiFetch } from '@/src/utils/sessionRefresh';
import { verifyDriverTripAssignment } from '@/src/utils/verifyDriverTripAssignment';
import { getValidToken, getCachedToken } from '@/src/lib/tokenStore';
import {
  startupLog,
  startupStepStart,
  startupStepEnd,
} from '@/src/utils/driverStartupTrace';
import { driverFlowLog } from '@/src/utils/driverOnlineFlowLog';
import { useDriverSessionStore } from '@/src/store/driverSessionStore';
import { useDriverDisplayStore } from '@/src/store/driverDisplayStore';
import { driverOffersSocket } from '@/src/services/driverOffersSocket';
import { loadWorkZoneOnce } from '@/src/services/workZoneSession';
import { useWorkZoneIdleSuggestion } from '@/src/hooks/useWorkZoneIdleSuggestion';
import { fetchWithTimeout } from '@/src/utils/fetchWithTimeout';
import { useDriverBoot, type DriverBootRedirect } from '@/src/hooks/useDriverBoot';
import { DriverBootShell } from '@/src/components/driver/DriverBootShell';


import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { logLegalGateCheck, syncUserLegalStatus } from '@/src/services/legalStatusSync';
import { replaceLegalTermsIfNeeded } from '@/src/utils/navigationRouteGuard';
import { useDriverOfferAlert } from '@/src/hooks/useDriverOfferAlert';
import { stopDriverOfferBackgroundAlert } from '@/src/services/driverOfferBackgroundAlert';
import { configureDriverOfferAudioMode } from '@/src/services/driverOfferAudioSession';
import {
  type DriverNativeAction,
  hasNativeFullScreenIntentPermission,
  hasNativeOverlayPermission,
  requestNativeFullScreenIntentPermission,
  requestNativeOverlayPermission,
  refreshNativeDriverSession,
  startNativeDriverExperience,
  stopNativeDriverExperience,
  stopNativeRideAlert,
  subscribeDriverNativeActions,
  setNativeActiveTripId,
  updateNativeRideAcceptedState,
} from '@/src/services/driverNativeExperience';
import {
  driverDocumentsRouteParams,
  driverProfileRouteParams,
} from '@/src/utils/driverOnboardingNav';
import {
  getQueueSize,
  queueDriverRideAcceptance,
  syncQueuedRequests,
} from '@/src/services/offlineMode';
import {
  startDriverShiftSessionKeeper,
  stopDriverShiftSessionKeeper,
} from '@/src/services/driverSessionKeeper';
import { acceptDriverTripOffer } from '@/src/services/driverTripAccept';
import { ensureCriticalSessionReady } from '@/src/lib/sessionReadiness';
import {
  applyOptimisticGoOffline,
  GO_OFFLINE_FAIL_MESSAGE,
} from '@/src/services/driverGoOfflineOptimistic';
import {
  armGoOnlineWatchdog,
  clearGoOnlineWatchdog,
  GO_ONLINE_TIMEOUT_MS,
} from '@/src/services/driverGoOnlineWatchdog';
import {
  armGoOfflineWatchdog,
  clearGoOfflineWatchdog,
} from '@/src/services/driverGoOfflineWatchdog';
import {
  buildOnlineToggleUrl,
  createStatusRequestId,
  GO_ONLINE_ATTEMPT_TIMEOUT_MS,
  GO_ONLINE_MAX_ATTEMPTS,
  isRetryableOnlineStatus,
  statusBackoffMs,
} from '@/src/services/driverOnlineStatusCoordinator';
import { reportNetworkOpsSignal } from '@/src/services/platformConnectionManager';
import {
  startDriverHeartbeat,
  setDriverHeartbeatForceOfflineHandler,
  invokeDriverHeartbeatForceOffline,
  stopDriverHeartbeat,
  updateDriverHeartbeatCoords,
} from '@/src/services/driverHeartbeat';
import * as Haptics from 'expo-haptics';
import { DRIVER_OFFER_COUNTDOWN_SECONDS } from '@/src/constants/driverOffer';
import { buildTrialBannerText, splitTrialBannerForEmphasis } from '@/src/utils/driverTrialDisplay';
import DriverRideRequestModal from '@/src/components/DriverRideRequestModal';
import { suggestedCounter } from '@/src/components/driver/DriverOfferBidActions';
import { FeatureHubDrawer } from '@/src/components/FeatureHubDrawer';
import { SkeletonBlock } from '@/src/components/SkeletonBlock';
import { SURFACE,  HOME_PALETTE, BRAND } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { TripProfileAvatar } from '@/src/components/TripProfileAvatar';
import { resolvePublicMediaUri } from '@/src/utils/resolvePublicMediaUri';
import DriverLiveMapView, {
  NEXRYDE_MAP_STYLE,
  type ActiveTrip,
} from '@/src/components/DriverLiveMapView';
import { subscribeDriverTripMapCoords } from '@/src/services/driverTripMapGps';
import DriverTripCompletionPanel, {
  type TripCompletionPayload,
} from '@/src/components/driver/DriverTripCompletionPanel';
import DriverCompleteTripConfirmModal from '@/src/components/driver/DriverCompleteTripConfirmModal';
import { settlesOnCompletion } from '@/src/utils/tripPaymentMethod';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { TripMapErrorBoundary } from '@/src/components/TripMapErrorBoundary';
import { DriverUberStyleOfflineHome } from '@/src/components/driver/DriverUberStyleOfflineHome';

const { width } = Dimensions.get('window');

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

function normalizeRoutePreview(raw: unknown): Array<{ lat: number; lng: number }> | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const out: Array<{ lat: number; lng: number }> = [];
  for (const p of raw) {
    const o = p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
    if (!o) continue;
    const lat = Number(o.lat ?? o.latitude);
    const lng = Number(o.lng ?? o.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.push({ lat, lng });
  }
  return out.length >= 2 ? out : null;
}

function readTripShield(raw: Record<string, unknown>): Record<string, unknown> | null {
  const s = raw.shield;
  return s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
}

function tripToActiveTrip(trip: Trip | null, driverProfile: DriverProfile | null): ActiveTrip | null {
  if (!trip?.id) return null;
  const st = trip.status;
  if (!['accepted', 'arrived', 'ongoing', 'pending_payment'].includes(st)) return null;
  const raw = trip as unknown as Record<string, unknown>;
  const route =
    normalizeRoutePreview(raw.route_preview_coordinates) ??
    normalizeRoutePreview(raw.polyline_coords);
  const sh = readTripShield(raw);
  let rider_reputation_avg: number | null = null;
  if (sh) {
    const a = sh.rider_reputation_avg;
    const n = typeof a === 'number' ? a : typeof a === 'string' ? parseFloat(a) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= 5) rider_reputation_avg = Math.round(n * 10) / 10;
  }
  const tcRaw = sh?.rider_reputation_trip_count;
  const tcNum = typeof tcRaw === 'number' ? tcRaw : typeof tcRaw === 'string' ? parseInt(tcRaw, 10) : NaN;
  const rider_trip_count = Number.isFinite(tcNum) && tcNum >= 0 ? tcNum : null;
  const rider_new_account = sh ? !!sh.rider_new_account : false;
  return {
    id: trip.id,
    pickup_location: trip.pickup_location,
    dropoff_location: trip.dropoff_location,
    route_preview_coordinates: route,
    status: trip.status,
    rider_name: (raw.rider_name as string) || null,
    rider_profile_image: (raw.rider_profile_image as string) || null,
    rider_phone: (raw.rider_phone as string) || null,
    pickup_code_verified: trip.pickup_code_verified,
    security_code_verified: trip.security_code_verified,
    pickup_code_required: trip.pickup_code_required === true,
    arrived_at: trip.arrived_at ?? null,
    started_at: trip.started_at ?? null,
    fare: Number.isFinite(trip.fare) ? trip.fare : null,
    payment_method: trip.payment_method ?? null,
    payment_status: trip.payment_status ?? null,
    rider_reputation_avg,
    rider_trip_count,
    rider_new_account,
    distance_to_next_km: (() => {
      const d = raw.distance_to_next_km ?? raw.distance_to_pickup_km ?? raw.distance_to_pickup;
      if (d == null) return null;
      const n = Number(d);
      return Number.isFinite(n) ? n : null;
    })(),
    distance_km: Number.isFinite(Number(trip.distance_km)) ? Number(trip.distance_km) : null,
    duration_mins: Number.isFinite(Number(trip.duration_mins)) ? Number(trip.duration_mins) : null,
    base_fare: (() => {
      const v = Number(raw.base_fare);
      return Number.isFinite(v) ? v : null;
    })(),
    distance_fee: (() => {
      const v = Number(raw.distance_fee);
      return Number.isFinite(v) ? v : null;
    })(),
    time_fee: (() => {
      const v = Number(raw.time_fee);
      return Number.isFinite(v) ? v : null;
    })(),
    vehicle_model: (raw.vehicle_model as string) || driverProfile?.vehicle_model || null,
    vehicle_plate: (raw.vehicle_plate as string) || driverProfile?.vehicle_plate || null,
    vehicle_color: (raw.vehicle_color as string) || driverProfile?.vehicle_color || null,
  };
}

function formatTripShortIdForUi(id: string | undefined | null): string {
  if (!id || typeof id !== 'string') return '—';
  const tail = id.replace(/-/g, '').slice(-6).toUpperCase();
  return tail.length >= 4 ? tail : id.slice(0, 6).toUpperCase();
}

function tripToCompletionPayload(merged: Trip & Record<string, unknown>): TripCompletionPayload {
  const raw = merged as Record<string, unknown>;
  const rr = merged.rider_rating;
  const alreadyRated = typeof rr === 'number' && rr > 0 && rr <= 5;
  const riderName =
    typeof raw.rider_name === 'string' && raw.rider_name.trim().length > 0
      ? raw.rider_name.trim()
      : 'Your rider';
  const riderPhoto = typeof raw.rider_profile_image === 'string' ? raw.rider_profile_image : null;
  const mb = raw.mystery_bonus_ngn;
  const sh = readTripShield(raw);
  let riderRatingAvg: number | null = null;
  if (sh) {
    const a = sh.rider_reputation_avg;
    const n = typeof a === 'number' ? a : typeof a === 'string' ? parseFloat(a) : NaN;
    if (Number.isFinite(n) && n > 0 && n <= 5) riderRatingAvg = Math.round(n * 10) / 10;
  }
  const tcRaw = sh?.rider_reputation_trip_count;
  const tcNum = typeof tcRaw === 'number' ? tcRaw : typeof tcRaw === 'string' ? parseInt(tcRaw, 10) : NaN;
  const riderTripCount = Number.isFinite(tcNum) && tcNum >= 0 ? tcNum : null;
  const baseFareNgn = (() => {
    const v = Number(raw.base_fare);
    return Number.isFinite(v) && v >= 0 ? v : null;
  })();
  const distanceFareNgn = (() => {
    const v = Number(raw.distance_fee);
    return Number.isFinite(v) && v >= 0 ? v : null;
  })();
  const timeFareNgn = (() => {
    const v = Number(raw.time_fee);
    return Number.isFinite(v) && v >= 0 ? v : null;
  })();
  const distanceKm = (() => {
    const v = Number(raw.distance_km);
    return Number.isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null;
  })();
  const durationMins = (() => {
    const v = Number(raw.duration_mins ?? raw.duration_minutes);
    return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  })();
  const drop = raw.dropoff_location;
  let dropoffLabel: string | null = null;
  if (typeof drop === 'string' && drop.trim()) dropoffLabel = drop.trim();
  else if (drop && typeof drop === 'object') {
    const addr = (drop as Record<string, unknown>).address ?? (drop as Record<string, unknown>).name;
    if (typeof addr === 'string' && addr.trim()) dropoffLabel = addr.trim();
  }
  return {
    tripId: merged.id,
    tripDisplayId: `Trip ${formatTripShortIdForUi(merged.id)}`,
    riderName,
    riderPhoto,
    fare: Number(merged.fare ?? 0),
    paymentMethod: String(merged.payment_method ?? 'cash'),
    paymentPending: String(merged.payment_status || '').toLowerCase() === 'pending',
    alreadyRated,
    mysteryBonusNgn: mb != null && Number.isFinite(Number(mb)) ? Number(mb) : null,
    riderRatingAvg,
    riderTripCount,
    baseFareNgn,
    distanceFareNgn,
    timeFareNgn,
    distanceKm,
    durationMins,
    dropoffLabel,
  };
}

// Navigation helpers are imported from the shared utility
import {
  hasFullScreenInAppNavigation,
  openExternalNavigationApp,
  saveLastUsedNavigationApp,
  type NavigationAppId,
} from '@/src/utils/driverNavigationApps';
import DriverNavigationAppSheet from '@/src/components/driver/DriverNavigationAppSheet';
import { useThemeColors } from '@/src/constants/theme';

/** Map backend `ride_offer` WebSocket payload to the trip shape used by the offer modal + accept API. */
function mapWsRideOfferToTrip(data: Record<string, unknown>) {
  const riderOffer = data.rider_offer_price;
  const rec = data.recommended_fare;
  const pickup = (data.pickup ?? data.pickup_coordinates) as Record<string, unknown> | string | undefined;
  const dropoff = (data.dropoff ?? data.destination_coordinates) as Record<string, unknown> | string | undefined;
  return {
    id: String(data.trip_id ?? ''),
    offer_id: String(data.offer_id ?? ''),
    pickup_location: pickup,
    dropoff_location: dropoff,
    offered_fare: riderOffer,
    fare: riderOffer,
    min_price: data.minimum_allowed_price,
    max_price: data.maximum_allowed_price,
    distance_km: data.distance_km,
    duration_mins: data.estimated_time_mins,
    distance_to_pickup: data.distance_to_pickup_km ?? data.distance_to_pickup,
    base_price: rec,
    recommended_fare: rec,
    ride_preferences: Array.isArray(data.ride_preferences) ? data.ride_preferences : [],
    rider_mood: data.rider_mood ?? {},
    rider_name: data.rider_name ?? '',
    rider_photo: data.rider_photo ?? null,
    shield: data.shield as Record<string, unknown> | undefined,
    status: data.status,
    preferred: data.preferred,
    offer_expires_at: data.expires_at,
    // Map preview data for offer dock route context
    route_preview_coordinates: data.route_preview_coordinates ?? data.polyline_coords ?? null,
    map_preview_region: data.map_preview_region ?? null,
    area_summary_line: data.area_summary_line ?? data.area_label ?? null,
    surge_multiplier: data.surge_multiplier ?? 1,
    payment_method: data.payment_method ?? 'cash',
  };
}

// Feature arrays built inside component to use translations

// Per-tab crash safety net — confines any render error to this tab (never to OS home).
export { ErrorBoundary } from '@/src/components/driver/DriverTabErrorBoundary';

export default function ModernDriverHome() {
  const toast = useErrorToast();
  const router = useRouter();
  const segments = useSegments();
  // Per-field selectors — avoid re-rendering this hot screen on every store write.
  const user = useAppStore((s) => s.user);
  const currentTrip = useAppStore((s) => s.currentTrip);
  const driverProfile = useAppStore((s) => s.driverProfile);
  const setCurrentTrip = useAppStore((s) => s.setCurrentTrip);
  const setCurrentLocation = useAppStore((s) => s.setCurrentLocation);
  const setStoreIsOnline = useAppStore((s) => s.setIsOnline);
  // Only one native MapView should stay alive: tear down when this tab is blurred.
  const isFocused = useIsFocused();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();

  useEffect(() => {
    const enforceDriverLegal = async () => {
      if (!canCallAuthedApi || !driverId || user?.role !== 'driver') return;
      await syncUserLegalStatus(driverId);
      const effectiveUser = useAppStore.getState().user ?? user;
      if (logLegalGateCheck(effectiveUser, 'driver-home')) {
        replaceLegalTermsIfNeeded(router, 'driver', segments);
      }
    };
    void enforceDriverLegal();
  }, [canCallAuthedApi, driverId, router, segments, user?.role, user?.terms_accepted, user?.terms_version, user?.privacy_accepted, user?.privacy_version]);

  const handleBootRedirect = useCallback(
    (redirect: DriverBootRedirect) => {
      // Prefer live store — boot can finish before the selector's user is ready.
      const u = useAppStore.getState().user ?? user;
      if (!u?.id) return;
      const step = redirect.step;
      if (step === 'terms') {
        replaceLegalTermsIfNeeded(router, 'driver', segments);
      } else if (step === 'documents') {
        router.replace({
          pathname: '/(auth)/driver-documents',
          params: driverDocumentsRouteParams(u),
        });
      } else if (step === 'documents_rejected') {
        router.replace({
          pathname: '/(auth)/driver-verification-status',
          params: driverDocumentsRouteParams(u),
        });
      } else if (step === 'profile') {
        router.replace({
          pathname: '/(auth)/driver-profile',
          params: driverProfileRouteParams(u),
        });
      }
    },
    [user, router, segments],
  );

  const boot = useDriverBoot({
    driverId,
    enabled: Boolean(driverId && canCallAuthedApi),
    onRedirect: handleBootRedirect,
  });

  // Same display source as Profile — prefer shared store so tabs never disagree.
  const storeVerification = useDriverDisplayStore((s) =>
    driverId && s.driverId === driverId ? s.verificationStatus : null,
  );
  const storeSubscription = useDriverDisplayStore((s) =>
    driverId && s.driverId === driverId ? s.subscriptionStatus : null,
  );
  const storeTrialCompleted = useDriverDisplayStore((s) =>
    driverId && s.driverId === driverId ? s.trialTripsCompleted : 0,
  );
  const storeTrialTarget = useDriverDisplayStore((s) =>
    driverId && s.driverId === driverId ? s.trialTripsTarget : 15,
  );
  const storeTrialExtended = useDriverDisplayStore((s) =>
    driverId && s.driverId === driverId ? s.trialExtended : false,
  );

  const verificationStatus = storeVerification ?? boot.verificationStatus;
  const subscriptionStatus = storeSubscription ?? boot.subscriptionStatus;

  // Option 1: unfinished drivers never stay on Home (map/GO).
  // Never bounce approved drivers (durable local fact) back to document upload —
  // a stale not_submitted flash during boot was sending loopy9ice-style accounts
  // through the full resubmit flow after login.
  useEffect(() => {
    if (!driverId || !canCallAuthedApi) return;
    if (verificationStatus !== 'not_submitted') return;
    if (isLocallyApproved(driverId)) return;
    const u = useAppStore.getState().user ?? user;
    if (!u?.id) return;
    router.replace({
      pathname: '/(auth)/driver-documents',
      params: driverDocumentsRouteParams(u),
    });
  }, [driverId, canCallAuthedApi, verificationStatus, user, router]);
  const trialTripsCompleted = storeVerification != null ? storeTrialCompleted : boot.trialTripsCompleted;
  const trialTripsTarget = storeVerification != null ? storeTrialTarget : boot.trialTripsTarget;
  const trialExtended = storeVerification != null ? storeTrialExtended : boot.trialExtended;
  const trialDaysRemaining = boot.trialDaysRemaining;
  const trialDayLimit = boot.trialDayLimit;
  const trialEmphasis = boot.trialEmphasis;
  const trialMessage = boot.trialMessage;
  const earlySubscribeMessage = boot.earlySubscribeMessage;

  // ── Quick-access action (from widget tap or app shortcut) ─────────────────
  const { action: rawAction } = useLocalSearchParams<{ action?: string }>();
  const pendingAction = typeof rawAction === 'string' ? rawAction : '';
  const autoActionFiredRef = useRef(false);
  const { language, setLanguage, availableLanguages, t } = useLanguage();
  const { colors, isDark } = useThemeColors();
  const dashboardBg = isDark ? '#0a0f1e' : colors.background;
  const operationalState = useDriverSessionStore((s) => s.operationalState);
  const isDashboardVisible = useDriverSessionStore((s) => s.isDashboardVisible);
  const connectionPhase = useDriverSessionStore((s) => s.connectionPhase);
  const workZoneActive = useDriverSessionStore((s) => s.workZoneActive);
  const workZoneLabel = useDriverSessionStore((s) => s.workZoneLabel);
  const driverOffersWsConnected = useDriverSessionStore((s) => s.driverOffersWsConnected);
  const beginConnecting = useDriverSessionStore((s) => s.beginConnecting);
  const confirmOnline = useDriverSessionStore((s) => s.confirmOnline);
  const markReconnecting = useDriverSessionStore((s) => s.markReconnecting);
  const abortConnecting = useDriverSessionStore((s) => s.abortConnecting);
  const confirmOffline = useDriverSessionStore((s) => s.confirmOffline);
  const hydrateServerOnline = useDriverSessionStore((s) => s.hydrateServerOnline);
  const syncTripSignals = useDriverSessionStore((s) => s.syncTripSignals);
  const setDriverOffersWsConnected = useDriverSessionStore((s) => s.setDriverOffersWsConnected);
  const [statusToggleBusy, setStatusToggleBusy] = useState(false);
  // Only block the toggle while going online or mid-request — never lock Go Offline
  // during RECONNECTING (socket blips must not trap the driver).
  const toggling = statusToggleBusy || operationalState === 'CONNECTING';
  const sessionEngaged =
    connectionPhase === 'confirmed' || connectionPhase === 'reconnecting';
  /**
   * Hysteresis: hide blips — only show "Reconnecting" after ~5s continuous
   * reconnecting. Leaving reconnecting cancels the timer (no flicker).
   */
  const [showReconnectingChrome, setShowReconnectingChrome] = useState(false);
  useEffect(() => {
    if (connectionPhase !== 'reconnecting') {
      setShowReconnectingChrome(false);
      return;
    }
    const t = setTimeout(() => setShowReconnectingChrome(true), 5000);
    return () => clearTimeout(t);
  }, [connectionPhase]);
  const isOnlineRef = useRef(connectionPhase !== 'offline');
  isOnlineRef.current = connectionPhase !== 'offline';
  const [appInForeground, setAppInForeground] = useState(AppState.currentState === 'active');
  const bridgeActiveRef = useRef(false);
  const nativeOverlayPromptedRef = useRef(false);
  const nativeFullScreenPromptedRef = useRef(false);
  const nativeOfferAlertKeyRef = useRef<string | null>(null);
  const [permissionPreflight, setPermissionPreflight] = useState<DriverPermissionPreflight | null>(null);
  const [permissionRefreshing, setPermissionRefreshing] = useState(false);
  /**
   * Law 5 — preflight checklist shows before FIRST go-online only.
   * Once all granted we persist completed=true; only a revocation detected at
   * GO-tap (or FGS start) clears it and brings the checklist back.
   */
  const [permissionsCompletedOnce, setPermissionsCompletedOnce] = useState(
    peekPermissionsCompleted(),
  );
  useEffect(() => {
    void readPermissionsCompleted().then(setPermissionsCompletedOnce);
  }, []);
  const markPermissionsCompleted = useCallback((completed: boolean) => {
    setPermissionsCompletedOnce(completed);
    void writePermissionsCompleted(completed);
  }, []);

  const refreshPermissionPreflight = useCallback(async () => {
    if (Platform.OS === 'web') {
      setPermissionPreflight({ items: [], ready: true, missing: [], firstBlockingCode: null });
      return;
    }
    setPermissionRefreshing(true);
    try {
      const next = await evaluateDriverPermissionPreflight();
      setPermissionPreflight(next);
      if (next.ready) markPermissionsCompleted(true);
    } catch {
      /* keep last known */
    } finally {
      setPermissionRefreshing(false);
    }
  }, [markPermissionsCompleted]);

  useEffect(() => {
    void refreshPermissionPreflight();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshPermissionPreflight();
    });
    return () => sub.remove();
  }, [refreshPermissionPreflight]);

  const checkNativeOverlayPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }
    return hasNativeOverlayPermission();
  }, []);

  const checkNativeFullScreenIntentPermission = useCallback(async () => {
    if (Platform.OS !== 'android') {
      return true;
    }
    return hasNativeFullScreenIntentPermission();
  }, []);

  useEffect(() => {
    if (boot.lockedPendingApproval) confirmOffline();
  }, [boot.lockedPendingApproval, confirmOffline]);

  // Sync engaged online session (confirmed + reconnecting) — not dashboard chrome alone.
  useEffect(() => {
    setStoreIsOnline(sessionEngaged);
  }, [sessionEngaged, setStoreIsOnline]);

  // Work Zone: load once per session into store (no remount refetch / flicker)
  useEffect(() => {
    if (!driverId) return;
    void loadWorkZoneOnce(driverId);
  }, [driverId]);

  const [earnings, setEarnings] = useState({
    today: 0,
    week: 0,
    trips: 0,
    tripHoursToday: 0,
  });
  const [surgePricing, setSurgePricing] = useState<any>(null);

  // Load earnings for offline + online home (never leave EARNINGS/TRIPS blank forever).
  useEffect(() => {
    if (!driverId) {
      setEarningsLoading(false);
      return;
    }
    let mounted = true;
    const fetchEarnings = async (isInitial = false) => {
      if (isInitial) { setEarningsLoading(true); setEarningsError(false); }
      try {
        const [todayRes, weekRes] = await Promise.all([
          fetchWithTimeout(`${BACKEND_URL}/api/driver/earnings/${driverId}?period=today`, {
            headers: getAuthHeaders(),
            timeoutMs: 5000,
          }),
          fetchWithTimeout(`${BACKEND_URL}/api/driver/earnings/${driverId}?period=week`, {
            headers: getAuthHeaders(),
            timeoutMs: 5000,
          }),
        ]);
        if (!mounted) return;
        if (!todayRes.ok) { if (isInitial) setEarningsError(true); return; }
        const todayData = await todayRes.json();
        const weekData = weekRes.ok ? await weekRes.json() : null;
        const todaySummary = todayData?.summary || {};
        const weekSummary = weekData?.summary || {};
        if (mounted && todayData) {
          const todayEarnings = Number(
            todaySummary.total_earnings ?? todayData.today_earnings ?? todayData?.projections?.daily ?? 0
          );
          const weekEarnings = Number(weekSummary.total_earnings ?? weekData?.projections?.weekly ?? 0);
          const tripMins = Number(todaySummary.total_time_mins ?? 0);
          const tripHoursToday = tripMins > 0 ? Math.round((tripMins / 60) * 10) / 10 : 0;
          setEarnings({
            today: todayEarnings,
            week: weekEarnings,
            trips: Number(todaySummary.total_trips ?? 0),
            tripHoursToday,
          });
          setSurgePricing(todayData.surge || null);
          setEarningsError(false);
        }
      } catch {
        if (mounted && isInitial) setEarningsError(true);
      } finally {
        if (mounted && isInitial) setEarningsLoading(false);
      }
    };
    fetchEarnings(true);
    const interval = setInterval(() => fetchEarnings(false), 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [driverId, user?.total_trips]);
  /**
   * Display-only from local fact/cache (same store as Profile).
   * Approved drivers NEVER see "Checking your account" — durable fact + peek win.
   * Null status = silent background sync; Online switch still shows (tap validates).
   */
  const displayHydrated = useDriverDisplayStore(
    (s) => Boolean(driverId && s.driverId === driverId && s.displayHydrated),
  );
  const driverApproved =
    verificationStatus === 'approved' ||
    isLocallyApproved(driverId) ||
    peekDriverBootCache(driverId || '')?.verificationStatus === 'approved';
  /** Checking UI retired — never block the map / online switch on a spinner. */
  const verificationChecking = false;
  const awaitingLocalFact = false;
  const verificationPendingExplicit =
    !driverApproved &&
    (verificationStatus === 'pending' ||
      verificationStatus === 'pending_review' ||
      verificationStatus === 'rejected' ||
      verificationStatus === 'documents_rejected');
  const trialReady = subscriptionStatus
    ? ['trial', 'active', 'grace_period'].includes(subscriptionStatus)
    : false;
  const planBlocksGo =
    subscriptionStatus === 'none' ||
    subscriptionStatus === 'pending_payment' ||
    subscriptionStatus === 'expired' ||
    subscriptionStatus === 'locked_until_approval';
  /**
   * Show Online switch from local approved fact even before subscription sync.
   * Server still authorizes at tap time.
   */
  const displayGoReady = driverApproved && (trialReady || (subscriptionStatus == null && !planBlocksGo));
  const trialRemaining = Math.max(0, trialTripsTarget - trialTripsCompleted);
  const showTrialProgress = driverApproved && subscriptionStatus === 'trial' && trialTripsTarget > 0;
  /** Offers require server-confirmed entitlement — not stale cache alone. */
  const driverCanReceiveOffers =
    driverApproved && trialReady && boot.verificationConfirmedByServer;
  const verificationLocked = Boolean(verificationPendingExplicit);
  void displayHydrated; // kept for boot/store parity; UI no longer gates on it
  const [incomingRide, setIncomingRide] = useState<any>(null);
  const incomingOfferAlertKey =
    incomingRide?.offer_id != null
      ? String(incomingRide.offer_id)
      : incomingRide?.id != null
        ? String(incomingRide.id)
        : null;
  const nativeOfferAlertActive =
    Platform.OS === 'android' &&
    incomingOfferAlertKey != null &&
    nativeOfferAlertKeyRef.current === incomingOfferAlertKey;
  useDriverOfferAlert(
    Platform.OS !== 'web' &&
      Boolean(incomingRide) &&
      (Platform.OS !== 'android' || (appInForeground && !nativeOfferAlertActive)),
    incomingOfferAlertKey
  );

  useEffect(() => {
    if (connectionPhase !== 'confirmed' || Platform.OS === 'web') return;
    void configureDriverOfferAudioMode(true);
  }, [connectionPhase]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !driverId) return;
    // Keep FGS + token refresh across reconnect blips (not only confirmed).
    // Never start FGS without the same permission preflight GO ONLINE requires —
    // login hydrate of is_online=true used to skip it and crash Android 14+.
    if (connectionPhase === 'confirmed' || connectionPhase === 'reconnecting') {
      let cancelled = false;
      let sessionRefresh: ReturnType<typeof setInterval> | undefined;
      void (async () => {
        const preflight = await evaluateDriverPermissionPreflight();
        if (cancelled) return;
        if (!preflight.ready) {
          driverFlowLog('FGS_START_BLOCKED_PERMISSIONS', {
            code: preflight.firstBlockingCode,
            missing: preflight.missing.map((m) => m.key),
          });
          stopNativeDriverExperience();
          // Never dump a live trip offline from a permission blip during reconnect.
          if (!bridgeActiveRef.current) {
            confirmOffline();
            setPermissionPreflight(preflight);
            markPermissionsCompleted(false);
          }
          return;
        }
        void startNativeDriverExperience(driverId);
        sessionRefresh = setInterval(() => {
          void refreshNativeDriverSession();
        }, 60 * 1000);
        // Cleanup may have run during preflight await — clear immediately (audit 6.4).
        if (cancelled) {
          clearInterval(sessionRefresh);
          sessionRefresh = undefined;
        }
      })();
      return () => {
        cancelled = true;
        if (sessionRefresh) clearInterval(sessionRefresh);
      };
    }
    if (connectionPhase === 'offline') {
      stopNativeDriverExperience();
    }
    return undefined;
  }, [confirmOffline, connectionPhase, driverId, markPermissionsCompleted]);

  // Overlay is required in pre-flight BEFORE GO. Soft safety net only if somehow online without it.
  useEffect(() => {
    if (Platform.OS !== 'android' || connectionPhase !== 'confirmed' || nativeOverlayPromptedRef.current) return;
    void checkNativeOverlayPermission().then((allowed) => {
      if (allowed) {
        nativeOverlayPromptedRef.current = true;
        return;
      }
      nativeOverlayPromptedRef.current = true;
      // Do not dump into Settings mid-flow without explainer — return driver to offline gate.
      stopNativeDriverExperience();
      confirmOffline();
      void refreshPermissionPreflight();
      Alert.alert(
        'ERR_OVERLAY_PERMISSION',
        'Display over other apps is required before you stay online. Enable Driver Bubble, then tap GO ONLINE.',
        [{ text: 'OK' }],
      );
    });
  }, [checkNativeOverlayPermission, confirmOffline, connectionPhase, refreshPermissionPreflight]);

  useEffect(() => {
    if (Platform.OS !== 'android' || connectionPhase !== 'confirmed' || nativeFullScreenPromptedRef.current) return;
    nativeFullScreenPromptedRef.current = true;
    void checkNativeFullScreenIntentPermission().then((allowed) => {
      if (allowed) return;
      // Uber-grade: never stay Online without full-screen intent (ringtone-without-UI is a P0).
      stopNativeDriverExperience();
      confirmOffline();
      void refreshPermissionPreflight();
      Alert.alert(
        'Enable full-screen ride alerts',
        'Android requires NEXRYDE to show full-screen ride alerts. Enable this before going online so you never miss a request.',
        [
          {
            text: 'Open Settings',
            onPress: requestNativeFullScreenIntentPermission,
          },
        ],
      );
    });
  }, [
    checkNativeFullScreenIntentPermission,
    confirmOffline,
    connectionPhase,
    refreshPermissionPreflight,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Keep alerting through brief reconnect (socket drop); stop when truly offline/connecting.
    const canAlert =
      connectionPhase === 'confirmed' || connectionPhase === 'reconnecting';
    if (!canAlert || !incomingRide || !incomingOfferAlertKey) {
      if (nativeOfferAlertKeyRef.current) {
        nativeOfferAlertKeyRef.current = null;
        stopNativeRideAlert();
      }
      return;
    }
    // Background overlay/FS is owned by useDriverOfferBackgroundAlert — do not dual-present.
    return undefined;
  }, [connectionPhase, incomingOfferAlertKey, incomingRide]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const st = String(currentTrip?.status || '').toLowerCase();
    const live = Boolean(currentTrip?.id && ['accepted', 'arrived', 'ongoing'].includes(st));
    setNativeActiveTripId(live ? String(currentTrip!.id) : null);
    if (!live || !currentTrip) return;
    updateNativeRideAcceptedState(currentTrip as unknown as Record<string, unknown>);
  }, [currentTrip?.id, currentTrip?.status, currentTrip?.updated_at, currentTrip?.state_updated_at]);
  const [rideCountdown, setRideCountdown] = useState(DRIVER_OFFER_COUNTDOWN_SECONDS);
  const [counterFareInput, setCounterFareInput] = useState('');
  const [acceptingRide, setAcceptingRide] = useState(false);
  const acceptingRideRef = useRef(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [featureHubOpen, setFeatureHubOpen] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [driverCoords, setDriverCoords] = useState<{
    lat: number;
    lng: number;
    heading?: number;
    speedKmh?: number;
  } | null>(null);
  const lastLocationPushAtRef = useRef<number>(0);
  const lastLocationPushCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const onlineToggleInFlightRef = useRef(false);
  /** Sticky: intentional Go Offline must not be undone by hydrate while server still says online. */
  const desiredOfflineUntilSyncedRef = useRef(false);
  /** Bumps on each go-online intent so stale session awaits cannot start a second PUT. */
  const goOnlineToggleGenRef = useRef(0);
  /** True from the optimistic Online UI until the go-online PUT commits. Suppresses the
   *  first heartbeat's FORCE_OFFLINE while Mongo is_online is briefly still false —
   *  otherwise "tap GO → You were signed offline" flashes before the PUT lands. */
  const goOnlineCommitInFlightRef = useRef(false);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsError, setEarningsError] = useState(false);

  const [tripActionBusy, setTripActionBusy] = useState<string | null>(null);
  const [tripCompletion, setTripCompletion] = useState<TripCompletionPayload | null>(null);
  const [completeTripConfirmOpen, setCompleteTripConfirmOpen] = useState(false);
  /** Destination waiting on the driver to pick a navigation app. */
  const [navigationAppPrompt, setNavigationAppPrompt] = useState<{
    lat: number;
    lng: number;
    label?: string;
    phase?: string;
  } | null>(null);

  // ─── Ride category selection ─────────────────────────────────────────────
  const CATEGORY_OPTIONS = [
    { id: 'economy', label: 'Standard', icon: 'car-outline' as const, color: BRAND.primary, desc: 'Affordable rides' },
    { id: 'comfort', label: 'Comfort', icon: 'car-sport-outline' as const, color: '#0EA5E9', desc: 'More space & style' },
    { id: 'xl', label: 'XL', icon: 'bus-outline' as const, color: '#FFB800', desc: '6-seat vehicles' },
    { id: 'premium', label: 'Premium', icon: 'rocket-outline' as const, color: '#9333EA', desc: 'Luxury experience' },
  ] as const;
  const [activeCategories, setActiveCategories] = useState<string[]>(['economy']);
  const [categorySyncing, setCategorySyncing] = useState(false);
  const [idleBoostVisible, setIdleBoostVisible] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load driver categories on mount
  useEffect(() => {
    if (!driverId) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/drivers/${driverId}/categories`, {
          headers: getAuthHeaders(),
          timeoutMs: 5000,
        });
        if (res.ok && mounted) {
          const data = await res.json();
          if (Array.isArray(data.active_categories) && data.active_categories.length > 0) {
            setActiveCategories(data.active_categories);
          }
        }
      } catch { /* silent — default to economy */ }
    })();
    return () => { mounted = false; };
  }, [driverId]);

  const toggleCategory = async (catId: string) => {
    if (categorySyncing || !driverId || !canCallAuthedApi) return;
    let next: string[];
    if (activeCategories.includes(catId)) {
      if (activeCategories.length === 1) {
        Alert.alert('At least one category required', 'You must stay active in at least one ride category.');
        return;
      }
      next = activeCategories.filter((c) => c !== catId);
    } else {
      next = [...activeCategories, catId];
    }
    setActiveCategories(next);
    setCategorySyncing(true);
    try {
      await fetch(`${BACKEND_URL}/api/drivers/${driverId}/categories`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ active_categories: next }),
      });
    } catch { /* revert on failure */ setActiveCategories(activeCategories); }
    finally { setCategorySyncing(false); }
  };

  // Smart idle boost — suggest enabling more categories after 8 min idle while online
  useEffect(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isDashboardVisible && !incomingRide && activeCategories.length < CATEGORY_OPTIONS.length) {
      idleTimerRef.current = setTimeout(() => setIdleBoostVisible(true), 8 * 60 * 1000);
    } else {
      setIdleBoostVisible(false);
    }
    return () => { if (idleTimerRef.current) clearTimeout(idleTimerRef.current); };
  }, [isDashboardVisible, incomingRide, activeCategories.length]);
  // ─────────────────────────────────────────────────────────────────────────

  const tabPad = useTabBottomPad(8);
  const navigationInFlightRef = useRef(false);
  const guardedPush = useCallback(
    (route: Href) => {
      if (navigationInFlightRef.current) return;
      navigationInFlightRef.current = true;
      router.push(route);
      setTimeout(() => {
        navigationInFlightRef.current = false;
      }, 700);
    },
    [router]
  );

  const activeTripForMap = useMemo(
    () => tripToActiveTrip(currentTrip, driverProfile),
    [currentTrip, driverProfile],
  );

  /** Ask which app should guide this leg — NEXRYDE, Google Maps, Apple Maps or Waze. */
  const launchDriverNavigation = useCallback(
    (dest: { lat: number; lng: number; label?: string; phase?: string }) => {
      if (!Number.isFinite(dest.lat) || !Number.isFinite(dest.lng)) return;
      setNavigationAppPrompt(dest);
    },
    [],
  );

  const handleNavigationAppSelected = useCallback(
    (appId: NavigationAppId) => {
      const dest = navigationAppPrompt;
      setNavigationAppPrompt(null);
      if (!dest) return;
      void saveLastUsedNavigationApp(appId);

      if (appId === 'in_app') {
        if (hasFullScreenInAppNavigation()) {
          guardedPush({
            pathname: '/driver/in-app-navigation',
            params: {
              lat: String(dest.lat),
              lng: String(dest.lng),
              label: dest.label || 'Destination',
              tripId: currentTrip?.id || '',
              phase: dest.phase || String(currentTrip?.status || ''),
            },
          } as Href);
          return;
        }
        // No full-screen SDK on this platform — the trip map already draws the
        // route and speaks each turn, so keep the driver on it.
        toast.show('Guidance is on your trip map — follow the turn card.', 'info');
        return;
      }

      openExternalNavigationApp(appId, dest);
    },
    [currentTrip?.id, currentTrip?.status, guardedPush, navigationAppPrompt, toast],
  );

  const handleTripOpenNavigation = useCallback(() => {
    if (!currentTrip) return;
    const st  = currentTrip.status;
    const pick = currentTrip.pickup_location;
    const drop = currentTrip.dropoff_location;
    // Phase-aware: accepted/arrived Directions → pickup; ongoing → drop-off.
    // Arrived dock also has a dedicated Navigate-to-destination handler.
    if ((st === 'accepted' || st === 'arrived') && pick) {
      launchDriverNavigation({
        lat: Number(pick.lat),
        lng: Number(pick.lng),
        label: pick.address || 'Pickup',
        phase: st,
      });
    } else if (st === 'ongoing' && drop) {
      launchDriverNavigation({
        lat: Number(drop.lat),
        lng: Number(drop.lng),
        label: drop.address || 'Destination',
        phase: 'ongoing',
      });
    }
  }, [currentTrip, launchDriverNavigation]);

  // Dedicated handler to navigate to the trip destination (arrived / start docks)
  const handleTripNavigateToDestination = useCallback(() => {
    if (!currentTrip?.dropoff_location) return;
    const drop = currentTrip.dropoff_location;
    launchDriverNavigation({
      lat: Number(drop.lat),
      lng: Number(drop.lng),
      label: drop.address || 'Destination',
      phase: String(currentTrip.status || 'arrived'),
    });
  }, [currentTrip, launchDriverNavigation]);

  const handleTripMarkArrived = useCallback(async () => {
    if (!currentTrip?.id || !driverId) return;
    setTripActionBusy('arrive');
    try {
      const res = await arriveTrip(currentTrip.id, driverId);
      setCurrentTrip(res.data as Trip);
    } catch (e: unknown) {
      let msg = 'Try again.';
      if (typeof e === 'object' && e !== null && 'response' in e) {
        const d = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
        if (typeof d === 'string') msg = d;
      }
      toast.show(msg, 'error');
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip?.id, driverId, setCurrentTrip, toast]);

  const handleTripStart = useCallback(() => {
    if (!currentTrip?.id || !driverId) return;
    guardedPush(
      `/driver/verify-rider-code?trip_id=${encodeURIComponent(currentTrip.id)}&driver_id=${encodeURIComponent(driverId)}&auto=0`
    );
  }, [currentTrip?.id, driverId, guardedPush]);

  const handleTripConfirmStart = useCallback(async () => {
    if (!currentTrip?.id) return;
    setTripActionBusy('start');
    try {
      const res = await startTrip(currentTrip.id);
      setCurrentTrip((res?.data as Trip) || currentTrip);
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: unknown) {
      toast.show(messageFromAxiosError(e, 'Could not start trip. Try again in a moment.'), 'error');
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip, setCurrentTrip, toast]);

  const [driverCancelOpen, setDriverCancelOpen] = useState(false);
  const [driverCancelError, setDriverCancelError] = useState<string | null>(null);
  const [driverCancelReasonPrefill, setDriverCancelReasonPrefill] = useState<string | null>(null);

  const handleTripCancelFromDock = useCallback(() => {
    if (!currentTrip?.id || !driverId) return;
    setDriverCancelError(null);
    setDriverCancelReasonPrefill(null);
    setDriverCancelOpen(true);
  }, [currentTrip?.id, driverId]);

  const handleTripRiderNoShow = useCallback(() => {
    if (!currentTrip?.id || !driverId) return;
    setDriverCancelError(null);
    setDriverCancelReasonPrefill('Rider no-show');
    setDriverCancelOpen(true);
  }, [currentTrip?.id, driverId]);

  const confirmDriverCancel = useCallback(
    async (reason?: string) => {
      if (!currentTrip?.id || !driverId) return;
      setTripActionBusy('cancel');
      setDriverCancelError(null);
      try {
        const { reliableCancel } = await import('@/src/realtime/criticalActions');
        const result = await reliableCancel({
          tripId: currentTrip.id,
          actorId: driverId,
          reason,
          cancelFn: async () => {
            await cancelTrip(currentTrip.id, driverId, { reason });
          },
        });
        if (result.queued) {
          setDriverCancelOpen(false);
          setCurrentTrip(null);
          toast.show('Cancel saved offline — will sync when you reconnect.', 'info');
          return;
        }
        // Best-effort: reason is stored client-side for support if backend ignores it.
        if (reason) {
          try {
            await fetchWithTimeout(`${BACKEND_URL}/api/trips/${currentTrip.id}/cancel-reason`, {
              method: 'POST',
              headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason, cancelled_by: 'driver' }),
              timeoutMs: 4000,
            });
          } catch {
            /* optional endpoint */
          }
        }
        setDriverCancelOpen(false);
        setCurrentTrip(null);
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        toast.show(reason === 'Rider no-show' ? 'Trip cancelled — rider no-show.' : 'Trip cancelled.', 'success');
      } catch (e: unknown) {
        const msg = messageFromAxiosError(e, 'Could not cancel trip. Try again in a moment.');
        setDriverCancelError(msg);
        toast.show(msg, 'error');
      } finally {
        setTripActionBusy(null);
      }
    },
    [currentTrip?.id, driverId, setCurrentTrip, toast],
  );

  const handleTripEmergency = useCallback(() => {
    if (!currentTrip?.id) return;
    Alert.alert(
      'Emergency SOS',
      'This alerts NEXRYDE safety with your live GPS. Only use in a real emergency.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send SOS',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                const permission = await Location.requestForegroundPermissionsAsync();
                if (permission.status !== 'granted') {
                  Alert.alert('Location required', 'Enable location to send SOS with live GPS.');
                  return;
                }
                const loc = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.High,
                });
                await triggerSOS({
                  trip_id: currentTrip.id,
                  location_lat: loc.coords.latitude,
                  location_lng: loc.coords.longitude,
                });
                if (Platform.OS !== 'web') {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                }
                Alert.alert('SOS sent', 'Emergency alert sent to NEXRYDE support and your safety contacts.');
              } catch (err: any) {
                Alert.alert(
                  'SOS failed',
                  err?.response?.data?.detail || 'Could not send SOS. Call local emergency services if needed.',
                );
              }
            })();
          },
        },
      ],
    );
  }, [currentTrip?.id]);

  const handleTripPauseFromDock = useCallback(() => {
    Alert.alert(
      'Need a moment?',
      'Pull over safely. Use Call or Message to update your rider. Trip pause logging is coming soon.',
      [
        { text: 'OK', style: 'cancel' },
        {
          text: 'Message rider',
          onPress: () => {
            if (currentTrip?.id) {
              guardedPush(`/chat?tripId=${encodeURIComponent(currentTrip.id)}&role=driver` as Href);
            }
          },
        },
      ],
    );
  }, [currentTrip?.id, guardedPush]);

  const handleCompletionConfirmCash = useCallback(async () => {
    const tid = tripCompletion?.tripId;
    if (!tid) return;
    try {
      await confirmTripPayment(tid);
      setTripCompletion((prev) => (prev ? { ...prev, paymentPending: false } : prev));
      toast.show('Payment confirmed.', 'success');
    } catch (e: unknown) {
      toast.show(messageFromAxiosError(e, 'Could not confirm payment.'), 'error');
      throw e;
    }
  }, [tripCompletion?.tripId, toast]);

  const performCompleteTrip = useCallback(async () => {
    if (!currentTrip?.id) return;
    setTripActionBusy('complete');
    const tripId = currentTrip.id;
    const driverIdForLog = String(
      (currentTrip as { driver_id?: string }).driver_id || user?.id || '',
    );
    try {
      const { reliableComplete } = await import('@/src/realtime/criticalActions');
      let response: { data?: unknown } | undefined;
      const result = await reliableComplete({
        tripId,
        driverId: driverIdForLog,
        completeFn: async () => {
          response = await completeTrip(tripId);
        },
      });
      if (result.queued) {
        // Don't leave the driver stuck in the live-driving UI (GPS/heartbeat
        // running) for a trip they just completed. Mirror what the server does
        // on sync: cash/transfer settle outright, wallet waits for the rider.
        const settled = settlesOnCompletion(
          (currentTrip as { payment_method?: string }).payment_method,
        );
        const queuedMerged = {
          ...(currentTrip || ({} as Trip)),
          status: settled ? ('completed' as const) : ('pending_payment' as const),
          ...(settled ? { payment_status: 'completed' } : {}),
        } as Trip & Record<string, unknown>;
        setCompleteTripConfirmOpen(false);
        setTripCompletion(tripToCompletionPayload(queuedMerged));
        setCurrentTrip(settled ? null : (queuedMerged as Trip));
        toast.show('Trip saved offline — will sync when you reconnect.', 'info');
        return;
      }
      const tripAfter = (response?.data || {}) as Trip & Record<string, unknown>;
      const statusAfter =
        tripAfter.status === 'completed' && tripAfter.payment_status === 'pending'
          ? 'pending_payment'
          : tripAfter.status;
      const merged = {
        ...(currentTrip || ({} as Trip)),
        ...tripAfter,
        id: (tripAfter as Trip).id || currentTrip.id,
        ...(statusAfter === 'pending_payment' ? { status: 'pending_payment' as const } : {}),
      } as Trip & Record<string, unknown>;
      setCompleteTripConfirmOpen(false);
      setTripCompletion(tripToCompletionPayload(merged));
      if (statusAfter === 'pending_payment') {
        setCurrentTrip(merged as Trip);
      } else {
        setCurrentTrip(null);
      }
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (e: unknown) {
      toast.show(messageFromAxiosError(e, 'Could not complete trip. Try again in a moment.'), 'error');
    } finally {
      setTripActionBusy(null);
    }
  }, [currentTrip, setCurrentTrip, toast, user?.id]);

  const handleTripComplete = useCallback(() => {
    if (!currentTrip?.id) return;
    setCompleteTripConfirmOpen(true);
  }, [currentTrip?.id]);

  const completeModalRiderName = useMemo(() => {
    const raw = currentTrip as unknown as Record<string, unknown> | null;
    const n = raw?.rider_name;
    return typeof n === 'string' && n.trim() ? n.trim() : 'Your rider';
  }, [currentTrip]);

  const completeModalFare = useMemo(() => {
    if (!currentTrip || currentTrip.fare == null) return null;
    const f = Number(currentTrip.fare);
    return Number.isFinite(f) ? f : null;
  }, [currentTrip]);

  const handleCompletionRate = useCallback(
    async (stars: number, comment: string) => {
      if (!driverId) throw new Error('Not signed in');
      const tid = tripCompletion?.tripId;
      if (!tid) throw new Error('Missing trip');
      await rateTrip(tid, driverId, stars, comment);
    },
    [driverId, tripCompletion?.tripId],
  );

  const handleTripCallRider = useCallback(() => {
    const raw = currentTrip as unknown as Record<string, unknown> | null;
    const phone = raw?.rider_phone;
    if (typeof phone !== 'string' || !phone.trim()) {
      Alert.alert('Call unavailable', 'Rider phone will appear here once the trip syncs.');
      return;
    }
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  }, [currentTrip]);

  const handleTripMessageRider = useCallback(() => {
    if (!currentTrip?.id) return;
    guardedPush({ pathname: '/chat', params: { tripId: String(currentTrip.id) } });
  }, [currentTrip?.id, guardedPush]);

  const hydrateOnlineState = async () => {
    if (!driverId) return;
    // Do not fight an in-flight optimistic go-offline / go-online toggle.
    if (onlineToggleInFlightRef.current) return;
    startupStepStart('profile_hydrate');
    startupLog('PROFILE_FETCH_START', { source: 'hydrateOnlineState' });
    try {
      const response = await fetchWithTimeout(
        `${BACKEND_URL}/api/drivers/${driverId}/profile`,
        { headers: getAuthHeaders(), timeoutMs: 8000 },
      );
      if (!response.ok) {
        startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', { ok: false, status: response.status });
        return;
      }
      if (onlineToggleInFlightRef.current) return;
      const profile = await response.json();
      const serverOnline = Boolean(profile?.is_online);
      const localPhase = useDriverSessionStore.getState().connectionPhase;
      if (localPhase === 'connecting') {
        startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', {
          ok: true,
          isOnline: serverOnline,
          skipped: 'connecting',
        });
        return;
      }
      if (serverOnline && localPhase === 'offline') {
        if (desiredOfflineUntilSyncedRef.current) {
          // Driver just went offline locally — keep Offline and keep reconciling server.
          driverFlowLog('GO_ONLINE_DESYNC', {
            action: 'ignore_hydrate_restore_desired_offline',
            serverOnline: true,
          });
          const requestId = createStatusRequestId('offline');
          void fetchWithTimeout(
            buildOnlineToggleUrl(BACKEND_URL, { driverId, isOnline: false, requestId }),
            {
              method: 'PUT',
              headers: { ...getAuthHeaders(), 'X-Request-Id': requestId },
              timeoutMs: 8000,
            },
          )
            .then((res) => {
              if (res.ok) desiredOfflineUntilSyncedRef.current = false;
            })
            .catch(() => {});
          startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', {
            ok: true,
            isOnline: false,
            skipped: 'desired_offline',
          });
          return;
        }
        // Android: never auto-restore online on login/hydrate.
        // Going online is an explicit GO ONLINE action (permissions + typed FGS).
        // Auto-start was the process-death path on API 34+ (MissingForegroundServiceType /
        // ForegroundServiceDidNotStartInTime).
        if (Platform.OS === 'android') {
          // Keep server online when a live trip is already in memory (process death mid-trip).
          const liveTrip = useAppStore.getState().currentTrip;
          const liveStatus = String(liveTrip?.status || '').toLowerCase();
          if (liveTrip?.id && ['accepted', 'arrived', 'ongoing'].includes(liveStatus)) {
            driverFlowLog('GO_ONLINE_DESYNC', {
              action: 'hydrate_keep_online_active_trip',
              serverOnline: true,
              tripId: liveTrip.id,
            });
            hydrateServerOnline(true);
            driverOffersSocket.connect(driverId);
            startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', {
              ok: true,
              isOnline: true,
              skipped: 'android_active_trip',
            });
            return;
          }
          driverFlowLog('GO_ONLINE_DESYNC', {
            action: 'hydrate_keep_offline_require_go_online',
            serverOnline: true,
          });
          hydrateServerOnline(false);
          driverOffersSocket.disconnect();
          stopNativeDriverExperience();
          const requestId = createStatusRequestId('offline');
          void fetchWithTimeout(
            buildOnlineToggleUrl(BACKEND_URL, { driverId, isOnline: false, requestId }),
            {
              method: 'PUT',
              headers: { ...getAuthHeaders(), 'X-Request-Id': requestId },
              timeoutMs: 8000,
            },
          ).catch(() => {});
          void refreshPermissionPreflight();
          startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', {
            ok: true,
            isOnline: false,
            skipped: 'android_require_go_online',
          });
          return;
        }
        driverFlowLog('GO_ONLINE_DESYNC', { action: 'hydrate_restore_online', serverOnline: true });
        hydrateServerOnline(true);
        driverOffersSocket.connect(driverId);
      } else if (!serverOnline && (localPhase === 'confirmed' || localPhase === 'reconnecting')) {
        if (bridgeActiveRef.current) {
          driverFlowLog('GO_ONLINE_DESYNC', {
            action: 'ignore_server_offline_active_trip',
            localPhase,
          });
          markReconnecting();
        } else {
          driverFlowLog('GO_ONLINE_DESYNC', { action: 'hydrate_force_offline', serverOnline: false });
          hydrateServerOnline(false);
          driverOffersSocket.disconnect();
        }
      } else if (serverOnline && Platform.OS === 'android' && localPhase !== 'confirmed' && localPhase !== 'reconnecting') {
        // Any non-online local phase on Android: stay offline; user must GO ONLINE.
        driverFlowLog('GO_ONLINE_DESYNC', {
          action: 'hydrate_keep_offline_require_go_online_else',
          serverOnline: true,
          localPhase,
        });
        hydrateServerOnline(false);
        driverOffersSocket.disconnect();
        stopNativeDriverExperience();
        const requestId = createStatusRequestId('offline');
        void fetchWithTimeout(
          buildOnlineToggleUrl(BACKEND_URL, { driverId, isOnline: false, requestId }),
          {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'X-Request-Id': requestId },
            timeoutMs: 8000,
          },
        ).catch(() => {});
        startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', {
          ok: true,
          isOnline: false,
          skipped: 'android_require_go_online',
        });
        return;
      } else {
        hydrateServerOnline(serverOnline);
        if (serverOnline) driverOffersSocket.connect(driverId);
      }
      void updateDriverOnlineStatus(
        Platform.OS === 'android' ? localPhase === 'confirmed' || localPhase === 'reconnecting' : serverOnline,
        driverId,
      );
      startupStepEnd('PROFILE_FETCH_END', 'profile_hydrate', {
        ok: true,
        isOnline: Platform.OS === 'android'
          ? localPhase === 'confirmed' || localPhase === 'reconnecting'
          : serverOnline,
      });
    } catch (e) {
      startupStepEnd('PROFILE_FETCH_FAILED', 'profile_hydrate', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };
  const fetchIncomingRide = useCallback(async () => {
    if (!driverId || !canCallAuthedApi) return;
    try {
      const res = await apiFetch(`/trips/offers/${encodeURIComponent(driverId)}`);
      const trips = await res.json();
      if (Array.isArray(trips) && trips.length > 0) {
        setDriverIncomingOfferActive(true);
        setIncomingRide((prev: any) => {
          const next = trips[0];
          if (!prev) return next;
          const prevId = String(prev.offer_id || prev.id || '');
          const nextId = String(next.offer_id || next.id || '');
          // Replace a stale in-memory offer when the server surfaces a different one
          // (socket may have missed a withdrawal/reassignment). Keep prev if it's the
          // same offer so the countdown / counter-fare input isn't churned.
          return prevId && nextId && prevId === nextId ? prev : next;
        });
        setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
        return trips[0];
      }
      return null;
    } catch (e) {
      if (__DEV__) console.warn('Offer polling error', e);
      return null;
    }
  }, [driverId, canCallAuthedApi]);

  const clearIncomingOffer = useCallback(() => {
    setDriverIncomingOfferActive(false);
    setIncomingRide(null);
    void stopDriverOfferBackgroundAlert();
    stopNativeRideAlert();
  }, []);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    startupLog('SCREEN_MOUNT', { screen: 'driver-home', driverId: driverId ?? null });
  }, [driverId]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, friction: 8, useNativeDriver: true }),
    ]).start();

    void getQueueSize().then(setOfflineQueueCount);
  }, []);

  useEffect(() => {
    if (!driverId) return;

    hydrateOnlineState();

    void saveDriverState({
      isOnline: isOnlineRef.current,
      lastScreen: 'home',
      activeTripId: null,
      userId: driverId,
    });
  }, [driverId]);

  // ── Auto online actions from widget / shortcut / persistent notification ─────────────────
  useEffect(() => {
    if (!pendingAction || autoActionFiredRef.current) return;
    if (pendingAction !== 'go_online' && pendingAction !== 'go_offline') return;
    autoActionFiredRef.current = true;

    // Go Offline must be instant — do not wait for hydrate.
    if (pendingAction === 'go_offline') {
      if (bridgeActiveRef.current) {
        driverFlowLog('GO_OFFLINE_BLOCKED_ACTIVE_TRIP', { source: 'notification' });
        toast.show('Finish your trip before going offline.', 'info');
        return;
      }
      if (isOnlineRef.current) {
        handleToggleOnline();
      }
      return;
    }

    // Go Online still waits briefly so profile/approval hydrate can finish.
    const t = setTimeout(() => {
      if (!isOnlineRef.current) {
        handleToggleOnline();
      }
    }, 600);
    return () => clearTimeout(t);
  }, [pendingAction]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppInForeground(active);
      if (active) {
        void checkNativeOverlayPermission();
        hydrateOnlineState();
        void getQueueSize().then(setOfflineQueueCount);
        void syncQueuedRequests();
        boot.refresh();
        if (isOnlineRef.current) {
          void fetchIncomingRide();
        }
        if (isOnlineRef.current && !bridgeActiveRef.current) {
          import('@/src/tasks/backgroundLocationTask').then(({ startDriverBackgroundLocation }) => {
            void startDriverBackgroundLocation();
          });
        }
      } else if (isOnlineRef.current && !bridgeActiveRef.current) {
        import('@/src/tasks/backgroundLocationTask').then(({ stopDriverBackgroundLocation }) => {
          void stopDriverBackgroundLocation();
        });
      }
    });
    return () => {
      sub.remove();
    };
  }, [driverId, boot.refresh, fetchIncomingRide, checkNativeOverlayPermission]);

  // Poll onboarding while the driver waits for approval on the (limited) Home so
  // an admin approval flips them to GO without an app restart. Foreground-only;
  // self-cancels the moment they're approved.
  useEffect(() => {
    if (!driverId || !canCallAuthedApi || driverApproved) return;
    const awaitingApproval =
      verificationPendingExplicit ||
      boot.lockedPendingApproval ||
      subscriptionStatus === 'locked_until_approval';
    if (!awaitingApproval) return;
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') boot.refresh();
    }, 25000);
    return () => clearInterval(interval);
  }, [
    driverId,
    canCallAuthedApi,
    driverApproved,
    verificationPendingExplicit,
    boot.lockedPendingApproval,
    subscriptionStatus,
    boot.refresh,
  ]);

  // Pause home-screen GPS when DriverTripLocationBridge is active (accepted/arrived/ongoing).
  // The bridge is the single GPS owner during active trips to avoid triple concurrent watchers.
  const bridgeActive = Boolean(
    currentTrip?.id &&
    ['accepted', 'arrived', 'ongoing'].includes(String(currentTrip?.status || '').toLowerCase())
  );
  bridgeActiveRef.current = bridgeActive;

  // Keep live map car marker moving while bridge owns GPS (was freezing on trip).
  useEffect(() => {
    if (!bridgeActive) return;
    return subscribeDriverTripMapCoords((c) => {
      setDriverCoords({
        lat: c.lat,
        lng: c.lng,
        heading: c.heading,
        speedKmh: c.speedKmh,
      });
    });
  }, [bridgeActive]);
  const driverPollingHighPriority = isDriverHighPriorityPolling(currentTrip?.status);

  useEffect(() => {
    syncTripSignals({
      hasActiveTrip: bridgeActive,
      hasIncomingOffer: Boolean(incomingRide),
    });
  }, [bridgeActive, incomingRide, syncTripSignals]);

  useWorkZoneIdleSuggestion({
    enabled: isDashboardVisible && connectionPhase === 'confirmed',
    driverId: driverId ?? undefined,
    workZoneActive,
    workZoneLabel,
    hasIncomingOffer: Boolean(incomingRide),
    hasActiveTrip: bridgeActive,
  });

  useEffect(() => {
    // Never heartbeat during CONNECTING — server returns FORCE_OFFLINE until PUT /online commits.
    const shouldBeat = connectionPhase === 'confirmed' || connectionPhase === 'reconnecting';
    if (shouldBeat) {
      startDriverHeartbeat();
      startDriverShiftSessionKeeper();
    } else {
      stopDriverHeartbeat();
      stopDriverShiftSessionKeeper();
    }
    return () => {
      stopDriverHeartbeat();
      stopDriverShiftSessionKeeper();
    };
  }, [connectionPhase]);

  // Server HEARTBEAT FORCE_OFFLINE / 401 → reconcile local session (Uber pattern).
  useEffect(() => {
    setDriverHeartbeatForceOfflineHandler((meta) => {
      const phase = useDriverSessionStore.getState().connectionPhase;
      const ops = useDriverSessionStore.getState().operationalState;
      if (phase === 'offline' || phase === 'connecting') {
        driverFlowLog('HEARTBEAT_FORCE_OFFLINE', {
          ignored: true,
          phase,
          reason: phase === 'connecting' ? 'connecting' : 'already_offline',
          source: meta?.source ?? 'js',
          status: meta?.status ?? null,
        });
        return;
      }
      if (onlineToggleInFlightRef.current) {
        driverFlowLog('HEARTBEAT_FORCE_OFFLINE', {
          ignored: true,
          phase,
          reason: 'toggle_inflight',
          source: meta?.source ?? 'js',
        });
        return;
      }
      if (goOnlineCommitInFlightRef.current) {
        // Optimistic Online is up but PUT /online hasn't committed yet — the server
        // still reads offline, so this FORCE_OFFLINE is expected and must be ignored.
        driverFlowLog('HEARTBEAT_FORCE_OFFLINE', {
          ignored: true,
          phase,
          reason: 'go_online_commit_inflight',
          source: meta?.source ?? 'js',
        });
        return;
      }
      if (bridgeActiveRef.current || ops === 'ON_TRIP') {
        driverFlowLog('HEARTBEAT_FORCE_OFFLINE', {
          ignored: true,
          phase,
          reason: 'active_trip',
          source: meta?.source ?? 'js',
        });
        markReconnecting();
        toast.show('Connection issue — staying on trip. Reconnecting…', 'info');
        if (driverId) {
          const requestId = createStatusRequestId('online');
          const url = buildOnlineToggleUrl(BACKEND_URL, {
            driverId,
            isOnline: true,
            requestId,
          });
          void fetchWithTimeout(url, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'X-Request-Id': requestId },
            timeoutMs: 8000,
          })
            .then((res) => {
              if (res.ok) {
                confirmOnline();
                driverFlowLog('GO_ONLINE_DESYNC', { action: 'trip_reassert_online', requestId });
              }
            })
            .catch(() => {});
        }
        return;
      }
      driverFlowLog('HEARTBEAT_FORCE_OFFLINE', {
        ignored: false,
        phase,
        source: meta?.source ?? 'js',
        status: meta?.status ?? null,
      });
      driverFlowLog('GO_OFFLINE', { reason: 'heartbeat_force_offline' });
      confirmOffline();
      setStoreIsOnline(false);
      driverOffersSocket.disconnect();
      stopNativeDriverExperience();
      void stopDriverOfferBackgroundAlert();
      void configureDriverOfferAudioMode(false);
      if (driverId) void updateDriverOnlineStatus(false, driverId);
      toast.show('You were signed offline. Tap GO to go online again.', 'info');
    });
    return () => setDriverHeartbeatForceOfflineHandler(null);
  }, [confirmOffline, confirmOnline, driverId, markReconnecting, setStoreIsOnline, toast]);

  // Foreground GPS is independent of go-online — runs on offline home too (Locating never blocks ONLINE).
  useEffect(() => {
    if (!driverId) return;
    if (bridgeActive) return; // TripLocationBridge owns GPS during active trip
    if (!appInForeground) return;
    let cancelled = false;
    let locationSub: Location.LocationSubscription | null = null;
    let lastStorePushMs = 0;
    let lastStoreLat: number | null = null;
    let lastStoreLng: number | null = null;
    let fixLogged = false;

    const pushLocation = (c: { lat: number; lng: number; heading: number; speedKmh?: number }, force = false) => {
      const now = Date.now();
      const moved =
        lastStoreLat == null ||
        lastStoreLng == null ||
        Math.abs(c.lat - lastStoreLat) > 0.00008 ||
        Math.abs(c.lng - lastStoreLng) > 0.00008;
      if (!force && !moved && now - lastStorePushMs < 3000) return;
      lastStorePushMs = now;
      lastStoreLat = c.lat;
      lastStoreLng = c.lng;
      updateDriverHeartbeatCoords(c.lat, c.lng);
      setDriverCoords(c);
      setCurrentLocation({ latitude: c.lat, longitude: c.lng, address: '' });
      if (!fixLogged) {
        fixLogged = true;
        driverFlowLog('LOCATION_FIX', { lat: c.lat, lng: c.lng, source: force ? 'bootstrap' : 'watch' });
      }
    };

    const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
      Promise.race([
        p,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ]);

    const bootstrapLocation = async () => {
      startupStepStart('location');
      startupLog('LOCATION_START');
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) {
          startupLog('LOCATION_FAILED', { reason: status !== 'granted' ? 'permission_denied' : 'cancelled' });
          return;
        }

        // Prefer last-known immediately so map / go-online never wait on a fresh High fix.
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (!cancelled && lastKnown) {
          const c = {
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
            heading: lastKnown.coords.heading ?? 0,
            speedKmh: lastKnown.coords.speed != null ? (lastKnown.coords.speed * 3.6) : undefined,
          };
          pushLocation(c, true);
        }

        if (cancelled) return;
        const loc = await withTimeout(
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          5_000,
        );
        if (!cancelled && loc) {
          const c = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            heading: loc.coords.heading ?? 0,
            speedKmh: loc.coords.speed != null ? (loc.coords.speed * 3.6) : undefined,
          };
          pushLocation(c, true);
          startupStepEnd('LOCATION_SUCCESS', 'location');
        } else if (!cancelled) {
          startupLog('LOCATION_FAILED', { reason: lastKnown ? 'fresh_fix_timeout_using_last_known' : 'fresh_fix_timeout' });
        }

        if (cancelled) return;
        const created = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 2000,
            distanceInterval: 8,
          },
          (update) => {
            if (cancelled) return;
            const c = {
              lat: update.coords.latitude,
              lng: update.coords.longitude,
              heading: update.coords.heading ?? 0,
              speedKmh: update.coords.speed != null ? (update.coords.speed * 3.6) : undefined,
            };
            pushLocation(c);
          }
        );
        if (cancelled) {
          created.remove();
          return;
        }
        locationSub = created;
      } catch (e) {
        startupStepEnd('LOCATION_FAILED', 'location', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    bootstrapLocation();
    return () => {
      cancelled = true;
      locationSub?.remove();
    };
  }, [bridgeActive, appInForeground, driverId]);

  // Push live location to backend when online (or connecting) — does not gate go-online.
  useEffect(() => {
    if (connectionPhase === 'offline' || !driverId || !driverCoords) return;
    if (!appInForeground && !bridgeActive) return;
    const now = Date.now();
    const lastAt = lastLocationPushAtRef.current;
    const lastCoords = lastLocationPushCoordsRef.current;

    const movedKm = lastCoords
      ? Math.abs(calculateDistance(driverCoords.lat, driverCoords.lng, lastCoords.lat, lastCoords.lng))
      : 999;
    const minIntervalMs = driverLocationPushMinIntervalMs(driverPollingHighPriority, movedKm);
    const minMoveKm = 0.03; // 30 m movement threshold

    if (lastAt && now - lastAt < minIntervalMs) return;
    if (lastCoords && movedKm < minMoveKm && now - lastAt < 60000) return;

    const pushLocation = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/location`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({ latitude: driverCoords.lat, longitude: driverCoords.lng }),
        });
        reportNetworkOpsSignal('location_upload', res.ok);
        if (!res.ok) return;
        lastLocationPushAtRef.current = Date.now();
        lastLocationPushCoordsRef.current = { lat: driverCoords.lat, lng: driverCoords.lng };
      } catch {
        reportNetworkOpsSignal('location_upload', false);
      }
    };
    pushLocation();
  }, [connectionPhase, driverId, driverCoords?.lat, driverCoords?.lng, appInForeground, bridgeActive, driverPollingHighPriority]);

  useEffect(() => {
    if (AppState.currentState === 'active') void flushTripLocationQueue();
  }, [currentTrip?.id]);


  // Application-lifetime offers socket — listeners only; singleton owns the WebSocket.
  // Connect only after confirmed (or while reconnecting). Never during CONNECTING.
  useEffect(() => {
    const shouldSocket =
      (connectionPhase === 'confirmed' || connectionPhase === 'reconnecting') && !!driverId;
    if (!shouldSocket) {
      if (connectionPhase === 'offline' || connectionPhase === 'connecting') {
        driverOffersSocket.disconnect();
        setDriverOffersWsConnected(false);
      }
      return;
    }

    driverOffersSocket.connect(driverId);

    const unsubConn = driverOffersSocket.subscribeConnection((connected) => {
      setDriverOffersWsConnected(connected);
      const phase = useDriverSessionStore.getState().connectionPhase;
      if (!connected && phase === 'confirmed') {
        markReconnecting();
      } else if (connected && phase === 'reconnecting') {
        confirmOnline();
      }
    });

    const unsubOffer = driverOffersSocket.subscribeOffers((offerPayload) => {
      const mapped = mapWsRideOfferToTrip(offerPayload);
      if (!mapped.id || !mapped.offer_id) return;
      void ensureCriticalSessionReady();
      setDriverIncomingOfferActive(true);
      setIncomingRide((prev: any) => {
        if (prev?.offer_id === mapped.offer_id) return prev;
        setTimeout(() => {
          setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
        }, 0);
        return mapped;
      });
    });

    return () => {
      unsubConn();
      unsubOffer();
    };
  }, [connectionPhase, confirmOnline, driverId, markReconnecting, setDriverOffersWsConnected]);

  // Fallback polling when no active modal; slow interval while WebSocket is healthy.
  useEffect(() => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    if (isDashboardVisible && !incomingRide) {
      void fetchIncomingRide();
      const pollMs = driverOffersFallbackPollIntervalMs(
        driverOffersWsConnected,
        driverPollingHighPriority,
      );
      pollInterval = setInterval(() => {
        void fetchIncomingRide();
      }, pollMs);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [isDashboardVisible, incomingRide, driverId, driverOffersWsConnected, fetchIncomingRide, driverPollingHighPriority]);

  // Restore accepted / in-progress trip when driver goes online (resume after kill or refresh).
  useEffect(() => {
    if (!isDashboardVisible || !driverId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await apiFetch(`/trips/active/${encodeURIComponent(driverId)}`);
        if (!response.ok || cancelled) return;
        const payload = await response.json();
        if (!payload?.active || !payload?.trip || cancelled) return;
        const trip = payload.trip as Record<string, unknown>;
        const status = String(trip.status ?? '');
        let normalized: Trip['status'] | null = status as Trip['status'];
        if (status === 'pickup') normalized = 'arrived';
        if (status === 'completed' && trip.payment_status === 'pending') normalized = 'pending_payment';
        const allow: Trip['status'][] = ['accepted', 'arrived', 'ongoing', 'pending_payment'];
        if (!normalized || !allow.includes(normalized)) return;
        setCurrentTrip({
          ...(trip as unknown as Trip),
          status: normalized,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isDashboardVisible, driverId, setCurrentTrip]);

  // Keep trip snapshot fresh (pickup coords, rider phone, status transitions).
  useEffect(() => {
    if (!driverId || !currentTrip?.id) return;
    let cancelled = false;
    const tripId = currentTrip.id;

    const sync = async () => {
      try {
        const res = await getTrip(tripId);
        const d = res.data as Trip & { status?: string; payment_status?: string };
        if (cancelled) return;
        const st = String(d.status ?? '');
        if (st === 'completed') {
          const pst = String(d.payment_status ?? '');
          if (pst === 'pending') {
            setCurrentTrip({ ...d, status: 'pending_payment' });
          } else {
            setCurrentTrip(null);
          }
          return;
        }
        if (st === 'cancelled') {
          setCurrentTrip(null);
          return;
        }
        setCurrentTrip(d as Trip);
      } catch {
        /* ignore */
      }
    };

    void sync();
    const iv = setInterval(sync, 15000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [currentTrip?.id, driverId, setCurrentTrip]);

  useEffect(() => {
    if (!incomingRide?.id) return;
    const r = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    const minP = incomingRide.min_price != null ? Math.round(Number(incomingRide.min_price)) : null;
    const sug = r > 0 ? suggestedCounter(r, minP) : 0;
    setCounterFareInput(sug > 0 ? String(sug) : r > 0 ? String(r) : '');
  }, [incomingRide?.id]);

  const declineHandlerRef = useRef<() => Promise<void>>(async () => {});
  const nativeAcceptHandlerRef = useRef<(event: DriverNativeAction) => Promise<void>>(async () => {});
  const offerTimerExpiredRef = useRef(false);
  const snoozeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True while a NATIVE full-screen accept/decline HTTP call is in flight — the JS
   *  offer countdown must not auto-decline the ride out from under it. */
  const nativeActionInFlightRef = useRef(false);

  // Formal decline — driver tapped "Ignore" explicitly. Calls backend, records violation.
  const handleDeclineRide = useCallback(async () => {
    const ride = incomingRide;
    if (!ride) return;
    try {
      if (ride.offer_id && driverId) {
        const { reliableDecline } = await import('@/src/realtime/criticalActions');
        await reliableDecline({
          offerId: String(ride.offer_id),
          driverId,
          declineFn: async () => {
            await apiFetch(`/trips/offers/${encodeURIComponent(String(ride.offer_id))}/decline`, {
              method: 'PUT',
              body: JSON.stringify({
                driver_id: driverId,
                client_event_id: `decline:${ride.offer_id}:${driverId}`,
              }),
            });
          },
        });
      }
    } catch {}
    clearIncomingOffer();
    setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
  }, [incomingRide, driverId, clearIncomingOffer]);

  // Countdown expired — decline on server (clear UI). Do NOT snooze/hide then reappear
  // (that made offers "vanish" while ringtone had already played).
  const handleOfferTimeout = useCallback(() => {
    declineHandlerRef.current();
  }, []);

  // Keep timeout ref in sync
  const snoozeHandlerRef = useRef<() => void>(() => {});
  useEffect(() => {
    snoozeHandlerRef.current = handleOfferTimeout;
  }, [handleOfferTimeout]);

  useEffect(() => {
    declineHandlerRef.current = handleDeclineRide;
  }, [handleDeclineRide]);

  useEffect(() => {
    if (!incomingRide?.id) {
      offerTimerExpiredRef.current = false;
      return;
    }
    offerTimerExpiredRef.current = false;
    setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
    const id = setInterval(() => {
      setRideCountdown((p) => {
        if (p <= 1) {
          if (nativeActionInFlightRef.current || acceptingRideRef.current) {
            // An accept/decline is mid-flight (native full-screen alert or the JS
            // sheet). Hold the timer — declining now would cancel a ride the driver
            // is actively accepting. Native emits success/failed/expired to release.
            return 1;
          }
          if (!offerTimerExpiredRef.current) {
            offerTimerExpiredRef.current = true;
            clearInterval(id);
            // Timeout — decline (do not clear+snooze; that hid the accept UI).
            snoozeHandlerRef.current();
          }
          return 0;
        }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [incomingRide?.id]);

  const submitIncomingAcceptance = useCallback(
    async (proposed: number, rideOverride?: typeof incomingRide) => {
      const ride = rideOverride ?? incomingRide;
      if (!ride) return;
      if (acceptingRideRef.current) return;
      if (!driverId) {
        Alert.alert('Profile Required', 'Please login again to accept rides.');
        return;
      }
      acceptingRideRef.current = true;
      setAcceptingRide(true);
      const fallbackProposed = Math.round(
        Number.isFinite(proposed) && proposed > 0
          ? proposed
          : Number(ride.offered_fare ?? ride.fare ?? 0)
      );
      try {
        const tripId = ride.id;
        const riderOffer = Math.round(Number(ride.offered_fare ?? ride.fare ?? 0));
        const maxP = ride.max_price != null ? Math.round(Number(ride.max_price)) : null;
        const minP = ride.min_price != null ? Math.round(Number(ride.min_price)) : null;
        if (!Number.isFinite(proposed) || proposed < 1) {
          Alert.alert('Fare', 'Enter a valid fare.');
          acceptingRideRef.current = false;
          setAcceptingRide(false);
          return;
        }
        if (riderOffer > 0 && proposed < riderOffer) {
          Alert.alert('Fare', 'Your counter cannot be below the rider’s offer.');
          acceptingRideRef.current = false;
          setAcceptingRide(false);
          return;
        }
        if (minP != null && minP > 0 && proposed < minP) {
          Alert.alert('Minimum fare', `Minimum allowed price is ₦${minP.toLocaleString()}`);
          acceptingRideRef.current = false;
          setAcceptingRide(false);
          return;
        }
        if (maxP != null && maxP > 0 && proposed > maxP) {
          Alert.alert('Maximum fare', `Maximum allowed price is ₦${maxP.toLocaleString()}`);
          acceptingRideRef.current = false;
          setAcceptingRide(false);
          return;
        }
        // Optimistic accept: flip UI instantly, reconcile with server in background.
        const offerRoute = normalizeRoutePreview(ride?.route_preview_coordinates);
        const incomingRec = ride as Record<string, unknown> | null | undefined;
        const optimisticTrip = {
          id: tripId,
          status: 'accepted',
          driver_id: driverId,
          rider_id: ride?.rider_id,
          offered_fare: proposed,
          fare: proposed,
          pickup_location: ride?.pickup_location,
          dropoff_location: ride?.dropoff_location,
          route_preview_coordinates: offerRoute ?? null,
          rider_profile_image:
            ride?.rider_photo != null ? String(ride.rider_photo) : undefined,
          rider_name: typeof ride?.rider_name === 'string' ? ride.rider_name : undefined,
          shield: incomingRec?.shield as Record<string, unknown> | undefined,
        } as unknown as Trip;
        if (Platform.OS !== 'web') {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        setCurrentTrip(optimisticTrip);
        clearIncomingOffer();

        const outcome = await acceptDriverTripOffer({
          tripId,
          driverId,
          offerId: ride?.offer_id,
          proposedFare: proposed,
        });

        if (outcome.status === 'accepted' || outcome.status === 'reconciled') {
          const data = outcome.trip;
          const drec = data as Record<string, unknown>;
          const apiRoute = normalizeRoutePreview(drec.route_preview_coordinates);
          const mergedTrip = {
            ...optimisticTrip,
            ...data,
            route_preview_coordinates: apiRoute ?? offerRoute ?? null,
            rider_profile_image:
              (typeof drec.rider_profile_image === 'string' ? drec.rider_profile_image : undefined) ??
              (ride?.rider_photo != null ? String(ride.rider_photo) : undefined),
            rider_name:
              (typeof drec.rider_name === 'string' && drec.rider_name.trim()
                ? drec.rider_name
                : undefined) ??
              (typeof ride?.rider_name === 'string' ? ride.rider_name : undefined),
            shield:
              (drec.shield as Record<string, unknown> | undefined) ??
              (incomingRec?.shield as Record<string, unknown> | undefined),
          } as unknown as Trip;

          if (outcome.status === 'reconciled') {
            toast.show('Ride accepted — synced after a slow connection.', 'success');
          }
          setCurrentTrip(mergedTrip);
        } else if (outcome.status === 'session_expired') {
          setCurrentTrip(null);
          toast.show(outcome.message, 'error');
          Alert.alert('Session expired', outcome.message, [
            { text: 'Later', style: 'cancel' },
            { text: 'Sign in', onPress: () => router.replace('/(auth)/login' as Href) },
          ]);
        } else if (outcome.httpStatus === 408) {
          // Keep optimistic trip + queue accept for replay on reconnect.
          await queueDriverRideAcceptance(ride.id, {
            driver_id: driverId,
            offer_id: ride?.offer_id,
            proposed_fare: proposed,
          });
          setOfflineQueueCount(await getQueueSize());
          toast.show('Bid saved — will send when connection is stable. Tap Send bid to retry.', 'warning');
        } else {
          // Roll back optimistic accept when the server rejects.
          setCurrentTrip(null);
          toast.show(outcome.message || 'Could not accept — try the next offer.', 'warning');
        }
      } catch (e) {
        const verified = await verifyDriverTripAssignment(driverId, ride.id);
        if (verified.assigned && verified.trip) {
          setCurrentTrip(verified.trip as unknown as Trip);
          clearIncomingOffer();
          toast.show('Ride accepted — confirmed after connection issue.', 'success');
          return;
        }
        await queueDriverRideAcceptance(ride.id, {
          driver_id: driverId,
          offer_id: ride?.offer_id,
          proposed_fare: fallbackProposed,
        });
        setOfflineQueueCount(await getQueueSize());
        toast.show('Bid saved — will send when connection is stable. Tap Send bid to retry.', 'warning');
      } finally {
        acceptingRideRef.current = false;
        setAcceptingRide(false);
      }
    },
    [incomingRide, driverId, clearIncomingOffer]
  );

  const handleAcceptIncomingAtRiderOffer = useCallback(() => {
    if (!incomingRide) return;
    const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    void submitIncomingAcceptance(riderOffer);
  }, [incomingRide, submitIncomingAcceptance]);

  const handleAcceptIncomingAtCounterFare = useCallback(() => {
    if (!incomingRide) return;
    const riderOffer = Math.round(Number(incomingRide.offered_fare ?? incomingRide.fare ?? 0));
    const proposed = Math.round(Number(String(counterFareInput).replace(/,/g, '').trim()) || riderOffer);
    void submitIncomingAcceptance(proposed);
  }, [incomingRide, counterFareInput, submitIncomingAcceptance]);

  useEffect(() => {
    nativeAcceptHandlerRef.current = async (event) => {
      const eventTripId = typeof event.tripId === 'string' ? event.tripId : '';
      const eventOfferId = typeof event.offerId === 'string' ? event.offerId : '';
      const fareFromEvent = Number(String(event.fare || '').replace(/,/g, ''));
      let ride = incomingRide;
      if (
        !ride ||
        (eventOfferId && String(ride.offer_id || ride.id || '') !== eventOfferId) ||
        (eventTripId && String(ride.id || ride.trip_id || '') !== eventTripId)
      ) {
        const latest = await fetchIncomingRide();
        if (latest) ride = latest;
      }
      if (!ride && eventTripId) {
        ride = {
          id: eventTripId,
          trip_id: eventTripId,
          offer_id: eventOfferId || undefined,
          offered_fare: Number.isFinite(fareFromEvent) && fareFromEvent > 0 ? fareFromEvent : undefined,
        };
      }
      const riderOffer = Math.round(
        Number(
          ride?.offered_fare ??
          ride?.fare ??
          (Number.isFinite(fareFromEvent) ? fareFromEvent : 0)
        )
      );
      if (!ride || riderOffer <= 0) {
        toast.show('Open NEXRYDE to accept this ride.', 'warning');
        return;
      }
      await submitIncomingAcceptance(riderOffer, ride);
    };
  }, [fetchIncomingRide, incomingRide, submitIncomingAcceptance, toast]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    return subscribeDriverNativeActions((event) => {
      if (event.action === 'accept_offer') {
        void nativeAcceptHandlerRef.current(event);
      } else if (event.action === 'decline_offer') {
        void declineHandlerRef.current();
      } else if (event.action === 'native_action_pending') {
        // Native accept HTTP started — freeze the JS auto-decline timer.
        nativeActionInFlightRef.current = true;
      } else if (event.action === 'native_accept_failed') {
        // Native accept failed; native offers a short retry window. Release the JS
        // timer with a matching buffer instead of declining instantly.
        nativeActionInFlightRef.current = false;
        offerTimerExpiredRef.current = false;
        setRideCountdown((p) => (p < 8 ? 8 : p));
      } else if (event.action === 'native_accept_success') {
        nativeActionInFlightRef.current = false;
        let acceptedTrip: Record<string, unknown> | null = null;
        if (typeof event.tripJson === 'string' && event.tripJson.trim()) {
          try {
            acceptedTrip = JSON.parse(event.tripJson) as Record<string, unknown>;
          } catch {}
        }
        if (acceptedTrip) {
          setCurrentTrip(acceptedTrip as unknown as Trip);
        } else if (event.tripId && driverId) {
          const acceptedTripId = event.tripId;
          // Accept succeeded server-side but no inline trip JSON — retry the assignment
          // read (brief replication lag) so the driver reliably lands in the trip UI
          // instead of an empty home screen.
          void (async () => {
            for (let i = 0; i < 3; i++) {
              try {
                const verified = await verifyDriverTripAssignment(driverId, acceptedTripId);
                if (verified.assigned && verified.trip) {
                  setCurrentTrip(verified.trip as unknown as Trip);
                  return;
                }
              } catch {
                /* transient — retry */
              }
              await new Promise((r) => setTimeout(r, 400 * (i + 1)));
            }
          })();
        }
        clearIncomingOffer();
        setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
      } else if (event.action === 'native_decline_success' || event.action === 'native_offer_expired') {
        nativeActionInFlightRef.current = false;
        clearIncomingOffer();
        setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
      } else if (event.action === 'heartbeat_force_offline') {
        invokeDriverHeartbeatForceOffline({
          source: typeof event.source === 'string' ? event.source : 'native_force_offline',
          status: typeof event.status === 'number' ? event.status : undefined,
        });
      }
    });
  }, [clearIncomingOffer, driverId, setCurrentTrip]);

  const showOnlineStatusAlert = useCallback((detail: unknown, httpStatus?: number | null) => {
    const parsed = parseDriverOnlineError(detail, httpStatus);
    const title = parsed.code;
    const message = parsed.message;
    if (parsed.code === 'ERR_NO_ACTIVE_PLAN') {
      Alert.alert(title, message, [
        { text: 'Later', style: 'cancel' },
        { text: 'View Plans', onPress: () => guardedPush('/driver/subscription') },
      ]);
      return;
    }
    if (parsed.code === 'ERR_DOCUMENTS') {
      Alert.alert(title, message, [
        { text: 'Later', style: 'cancel' },
        { text: 'Update Docs', onPress: () => guardedPush('/driver/documents') },
      ]);
      return;
    }
    if (parsed.code === 'ERR_COMPLIANCE') {
      Alert.alert(title, message, [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Documents', onPress: () => guardedPush('/driver/documents') },
      ]);
      return;
    }
    if (parsed.code === 'ERR_NO_VEHICLE') {
      Alert.alert(title, message, [
        { text: 'Later', style: 'cancel' },
        { text: 'Open Profile', onPress: () => guardedPush('/(driver-tabs)/driver-profile') },
      ]);
      return;
    }
    if (parsed.code === 'ERR_APPROVAL') {
      Alert.alert(title, message);
      return;
    }
    if (parsed.code === 'ERR_AUTH') {
      Alert.alert(title, message, [
        { text: 'Sign in', onPress: () => router.replace('/(auth)/login' as Href) },
      ]);
      return;
    }
    const lower = message.toLowerCase();
    if (lower.includes('bank detail') || lower.includes('bank account') || lower.includes('payout')) {
      Alert.alert('Add Bank Details', message, [
        { text: 'Later', style: 'cancel' },
        { text: 'Add Now', onPress: () => guardedPush('/driver/bank') },
      ]);
      return;
    }
    if (lower.includes('ghost') || lower.includes('lock')) {
      Alert.alert('Account Locked', message, [
        { text: 'OK', style: 'cancel' },
        { text: 'Unlock', onPress: () => guardedPush('/driver/safety-alerts') },
      ]);
      return;
    }
    Alert.alert(title, message);
  }, [guardedPush, router]);

  const applyLocalOptimisticGoOffline = useCallback(() => {
    clearGoOnlineWatchdog();
    clearGoOfflineWatchdog();
    desiredOfflineUntilSyncedRef.current = true;
    driverFlowLog('GO_OFFLINE_TAP');
    const result = applyOptimisticGoOffline({
      clearIncomingOffer,
      confirmOffline: () => {
        confirmOffline();
        // Sync app-wide isOnline immediately (do not wait for useEffect).
        setStoreIsOnline(false);
        if (driverId) {
          void import('@/src/realtime/criticalActions').then(({ recordOffline }) =>
            recordOffline(driverId),
          );
        }
      },
      disconnectOffersSocket: () => {
        driverOffersSocket.disconnect();
      },
      stopNativeExperience: () => {
        stopNativeDriverExperience();
      },
      stopNativeRideAlert: () => {
        stopNativeRideAlert();
      },
      stopOfferBackgroundAlert: () => {
        void stopDriverOfferBackgroundAlert();
      },
      stopOfferAudio: () => {
        void configureDriverOfferAudioMode(false);
      },
      stopBackgroundLocation: () => {
        import('@/src/tasks/backgroundLocationTask').then(({ stopDriverBackgroundLocation }) => {
          void stopDriverBackgroundLocation();
        });
      },
      persistLocalOffline: () => {
        if (driverId) void updateDriverOnlineStatus(false, driverId);
      },
      resetOfferCountdown: () => {
        setRideCountdown(DRIVER_OFFER_COUNTDOWN_SECONDS);
      },
    });
    driverFlowLog('GO_OFFLINE_UI_APPLIED', {
      tapToUiMs: result.tapToUiMs,
      uiBudgetPass: result.uiBudgetPass,
    });
    return result;
  }, [clearIncomingOffer, confirmOffline, driverId, setStoreIsOnline]);

  /** If go-online PUT succeeded after local abort, force server offline to match client. */
  const reconcileServerOfflineAfterAbort = useCallback(
    async (reason: string) => {
      if (!driverId) return;
      const requestId = createStatusRequestId('offline');
      const url = buildOnlineToggleUrl(BACKEND_URL, {
        driverId,
        isOnline: false,
        requestId,
      });
      driverFlowLog('GO_ONLINE_DESYNC', { action: 'put_ok_after_abort', reason, requestId });
      try {
        await fetchWithTimeout(url, {
          method: 'PUT',
          headers: { ...getAuthHeaders(), 'X-Request-Id': requestId },
          timeoutMs: 8000,
        });
      } catch {
        /* best-effort reconcile */
      }
    },
    [driverId],
  );

  /** Background-only online sync. Socket + GPS run independently — never cancelled by this.
   * Supports optimistic UI: caller may already be `confirmed`; PUT failure rolls back to offline.
   */
  const syncOnlineStatusBackground = useCallback(async (nextOnline: boolean) => {
    if (!driverId) {
      onlineToggleInFlightRef.current = false;
      setStatusToggleBusy(false);
      clearGoOnlineWatchdog();
      return;
    }
    const requestId = createStatusRequestId(nextOnline ? 'online' : 'offline');
    const stillWantsOnline = () => {
      const phase = useDriverSessionStore.getState().connectionPhase;
      return phase === 'connecting' || phase === 'confirmed' || phase === 'reconnecting';
    };
    const isConnectingOnly = () =>
      useDriverSessionStore.getState().connectionPhase === 'connecting';
    try {
      let res: Response | null = null;
      let data: any = {};
      const coords = driverCoords;
      const url = buildOnlineToggleUrl(BACKEND_URL, {
        driverId,
        isOnline: nextOnline,
        lat: coords?.lat,
        lng: coords?.lng,
        requestId,
      });
      for (let attempt = 0; attempt < GO_ONLINE_MAX_ATTEMPTS; attempt += 1) {
        if (nextOnline && !stillWantsOnline()) {
          if (res?.ok) await reconcileServerOfflineAfterAbort('phase_left_during_retry');
          return;
        }
        try {
          res = await fetchWithTimeout(url, {
            method: 'PUT',
            headers: {
              ...getAuthHeaders(),
              'X-Request-Id': requestId,
            },
            timeoutMs: GO_ONLINE_ATTEMPT_TIMEOUT_MS,
          });
          data = await res.json().catch(() => ({}));
          if (res.ok) break;
          if (!isRetryableOnlineStatus(res.status)) break;
        } catch {
          res = null;
        }
        if (nextOnline && !stillWantsOnline()) {
          if (res?.ok) await reconcileServerOfflineAfterAbort('phase_left_after_attempt');
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, statusBackoffMs(attempt)));
      }

      if (!res?.ok) {
        const detailPayload = extractApiDetailPayload(data);
        const parsed = parseDriverOnlineError(detailPayload, res?.status ?? null);
        const detail =
          formatApiDetail(detailPayload) || parsed.message || 'Could not change online status.';
        if (nextOnline && stillWantsOnline()) {
          clearGoOnlineWatchdog();
          // Optimistic UI may already be confirmed — always roll back on hard PUT failure.
          if (isConnectingOnly()) abortConnecting();
          else confirmOffline();
          driverFlowLog('GO_ONLINE_RESULT', {
            ok: false,
            status: res?.status ?? null,
            detail,
            code: parsed.code,
            requestId,
            attempts: GO_ONLINE_MAX_ATTEMPTS,
          });
          if (res && res.status >= 400 && res.status < 500) {
            showOnlineStatusAlert(detailPayload ?? detail, res.status);
          } else {
            toast.show(`${parsed.code}: ${parsed.message}`, 'error');
          }
        }
        return;
      }
      if (nextOnline) {
        if (!stillWantsOnline()) {
          if (useDriverSessionStore.getState().connectionPhase === 'offline') {
            await reconcileServerOfflineAfterAbort('put_ok_after_abort');
          }
          return;
        }
        clearGoOnlineWatchdog();
        // Idempotent if already confirmed (optimistic path).
        if (isConnectingOnly()) confirmOnline();
        driverFlowLog('GO_ONLINE_RESULT', {
          ok: true,
          status: res.status,
          requestId,
          alreadyOnline: Boolean(data?.already_online),
        });
        driverOffersSocket.connect(driverId);
        void fetchIncomingRide();
        import('@/src/tasks/backgroundLocationTask').then(({ startDriverBackgroundLocation }) => {
          void startDriverBackgroundLocation();
        });
      }
      void updateDriverOnlineStatus(nextOnline, driverId);
    } catch {
      if (nextOnline && stillWantsOnline()) {
        clearGoOnlineWatchdog();
        if (isConnectingOnly()) abortConnecting();
        else confirmOffline();
        driverFlowLog('GO_ONLINE_RESULT', { ok: false, error: 'exception', requestId });
        toast.show('Couldn’t go online. Tap GO to retry.', 'error');
      }
    } finally {
      onlineToggleInFlightRef.current = false;
      setStatusToggleBusy(false);
    }
  }, [
    driverId,
    driverCoords,
    abortConnecting,
    confirmOnline,
    confirmOffline,
    fetchIncomingRide,
    reconcileServerOfflineAfterAbort,
    showOnlineStatusAlert,
    toast,
  ]);

  /**
   * Offline API after optimistic UI. Never restores ONLINE on failure —
   * driver must stay offline (safety). Retry sync in background.
   */
  const syncOfflineStatusBackground = useCallback(async () => {
    if (!driverId) {
      clearGoOfflineWatchdog();
      onlineToggleInFlightRef.current = false;
      setStatusToggleBusy(false);
      return;
    }
    const apiStarted = Date.now();
    const requestId = createStatusRequestId('offline');
    const url = buildOnlineToggleUrl(BACKEND_URL, {
      driverId,
      isOnline: false,
      requestId,
    });
    try {
      let res: Response | null = null;
      let data: any = {};
      // Keep wall-clock short so watchdog (~10s) can release busy without rollback.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          res = await fetchWithTimeout(url, {
            method: 'PUT',
            headers: {
              ...getAuthHeaders(),
              'X-Request-Id': requestId,
            },
            timeoutMs: 5000,
          });
          data = await res.json().catch(() => ({}));
          if (res.ok) break;
          if (!isRetryableOnlineStatus(res.status)) break;
        } catch {
          res = null;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(1500, 500 * 2 ** attempt)));
      }

      const apiMs = Date.now() - apiStarted;
      if (!res?.ok) {
        // Stay OFFLINE locally — queue another reconcile; do not bounce back online.
        void updateDriverOnlineStatus(false, driverId);
        toast.show(GO_OFFLINE_FAIL_MESSAGE, 'info');
        driverFlowLog('GO_OFFLINE_API_FAILED_STAY_OFFLINE', {
          apiMs,
          status: res?.status ?? null,
          requestId,
          detail: formatApiDetail(data?.detail) || null,
        });
        // Best-effort delayed reconcile (no UI rollback).
        setTimeout(() => {
          if (useDriverSessionStore.getState().connectionPhase !== 'offline') return;
          void fetchWithTimeout(url, {
            method: 'PUT',
            headers: { ...getAuthHeaders(), 'X-Request-Id': createStatusRequestId('offline') },
            timeoutMs: 8000,
          }).catch(() => {});
        }, 8000);
        return;
      }
      void updateDriverOnlineStatus(false, driverId);
      desiredOfflineUntilSyncedRef.current = false;
      driverFlowLog('GO_OFFLINE_API_OK', { apiMs, requestId });
    } catch {
      void updateDriverOnlineStatus(false, driverId);
      toast.show(GO_OFFLINE_FAIL_MESSAGE, 'info');
      driverFlowLog('GO_OFFLINE_API_FAILED_STAY_OFFLINE', {
        apiMs: Date.now() - apiStarted,
        requestId,
      });
    } finally {
      clearGoOfflineWatchdog();
      onlineToggleInFlightRef.current = false;
      setStatusToggleBusy(false);
    }
  }, [driverId, toast]);

  const handleToggleOnline = () => {
    if (onlineToggleInFlightRef.current) return;
    if (!driverId) {
      Alert.alert('Session Expired', 'Your session has ended. Please log in again to continue.');
      return;
    }

    const goOnlineIntent = connectionPhase === 'offline';

    // Go Offline: optimistic UI first — never await network / socket before Offline state.
    if (!goOnlineIntent) {
      if (bridgeActive || operationalState === 'ON_TRIP') {
        driverFlowLog('GO_OFFLINE_BLOCKED_ACTIVE_TRIP', { source: 'toggle' });
        toast.show('Finish your trip before going offline.', 'info');
        return;
      }
      onlineToggleInFlightRef.current = true;
      setStatusToggleBusy(true);
      applyLocalOptimisticGoOffline();
      armGoOfflineWatchdog({
        isOfflineSyncInFlight: () => onlineToggleInFlightRef.current,
        releaseBusy: () => {
          onlineToggleInFlightRef.current = false;
          setStatusToggleBusy(false);
        },
        onTimeout: () => {
          // Local Offline already applied — just soft-notify and keep reconciling.
          toast.show(GO_OFFLINE_FAIL_MESSAGE, 'info');
          driverFlowLog('GO_OFFLINE_WATCHDOG_STAY_OFFLINE');
        },
      });
      void (async () => {
        try {
          const session = await ensureCriticalSessionReady();
          if (!session.ok || !session.token) {
            // Still stay offline — cannot receive trips without session either.
            void updateDriverOnlineStatus(false, driverId);
            toast.show(GO_OFFLINE_FAIL_MESSAGE, 'info');
            clearGoOfflineWatchdog();
            onlineToggleInFlightRef.current = false;
            setStatusToggleBusy(false);
            driverFlowLog('GO_OFFLINE_SESSION_FAIL_STAY_OFFLINE');
            return;
          }
          await syncOfflineStatusBackground();
        } catch {
          void updateDriverOnlineStatus(false, driverId);
          toast.show(GO_OFFLINE_FAIL_MESSAGE, 'info');
          clearGoOfflineWatchdog();
          onlineToggleInFlightRef.current = false;
          setStatusToggleBusy(false);
          driverFlowLog('GO_OFFLINE_EXCEPTION_STAY_OFFLINE');
        }
      })();
      return;
    }

    // Lock BEFORE any await — rapid taps must not spawn duplicate go-online PUTs.
    onlineToggleInFlightRef.current = true;
    setStatusToggleBusy(true);
    const toggleGen = ++goOnlineToggleGenRef.current;

    const releaseGoOnlineLock = () => {
      if (goOnlineToggleGenRef.current !== toggleGen) return;
      onlineToggleInFlightRef.current = false;
      setStatusToggleBusy(false);
    };

    const PLAN_OK = new Set(['trial', 'active', 'grace_period']);
    const localApproved =
      verificationStatus === 'approved' || isLocallyApproved(driverId);
    const planLooksReady =
      (subscriptionStatus != null && PLAN_OK.has(String(subscriptionStatus))) ||
      (boot.subscriptionStatus != null && PLAN_OK.has(String(boot.subscriptionStatus))) ||
      // Approved + plan still syncing → optimistic go; server PUT is authoritative.
      (localApproved &&
        (subscriptionStatus == null ||
          !['pending_payment', 'expired', 'none', 'locked_until_approval'].includes(
            String(subscriptionStatus),
          )));

    void (async () => {
      try {
        // Fast local permission gate only — never wait on session/subscription before UI.
        if (!permissionsCompletedOnce) {
          const preflight = await evaluateDriverPermissionPreflight();
          if (goOnlineToggleGenRef.current !== toggleGen) return;
          setPermissionPreflight(preflight);
          if (!preflight.ready) {
            releaseGoOnlineLock();
            markPermissionsCompleted(false);
            const code = preflight.firstBlockingCode || 'ERR_UNKNOWN';
            const names = preflight.missing.map((m) => m.label).join(', ');
            driverFlowLog('GO_ONLINE_BLOCKED_PERMISSIONS', { code, missing: names });
            Alert.alert(code, `Grant these to go online: ${names}`);
            return;
          }
          markPermissionsCompleted(true);
        }

        if (!localApproved) {
          let entitlementStatus = verificationStatus;
          if (!boot.verificationConfirmedByServer) {
            const result = await boot.refreshAndWait(4000);
            if (goOnlineToggleGenRef.current !== toggleGen) return;
            entitlementStatus = result.verificationStatus ?? entitlementStatus;
          }
          if (entitlementStatus !== 'approved' && !isLocallyApproved(driverId)) {
            releaseGoOnlineLock();
            Alert.alert(
              'Verification in review',
              'You can go online after your documents are approved.',
            );
            return;
          }
        }

        if (!planLooksReady) {
          // Only block when we *know* plan is bad — never on null.
          const knownBad = ['pending_payment', 'expired', 'none', 'locked_until_approval'];
          const planHint = subscriptionStatus || boot.subscriptionStatus;
          if (planHint && knownBad.includes(String(planHint))) {
            releaseGoOnlineLock();
            const isTrialEnded = String(planHint) === 'pending_payment';
            Alert.alert(
              isTrialEnded ? 'Trial ended' : 'Activation needed',
              isTrialEnded
                ? 'Your free trial has ended. Subscribe to keep receiving trips.'
                : 'Start the verified-driver trial or complete payment before going online.',
              [
                { text: 'Later', style: 'cancel' },
                {
                  text: isTrialEnded ? 'Subscribe' : 'Open activation',
                  onPress: () => guardedPush('/driver/subscription'),
                },
              ],
            );
            return;
          }
        }

        if (useDriverSessionStore.getState().connectionPhase !== 'offline') {
          releaseGoOnlineLock();
          return;
        }

        // Session + FSI before Online UI — never claim Online without native accept readiness.
        const session = await ensureCriticalSessionReady();
        if (goOnlineToggleGenRef.current !== toggleGen) {
          releaseGoOnlineLock();
          return;
        }
        if (!session.ok || !session.token) {
          releaseGoOnlineLock();
          Alert.alert(
            'Session needs refresh',
            'Sign in again so you can stay online and accept rides.',
            [{ text: 'Sign in', onPress: () => router.replace('/(auth)/login' as Href) }],
          );
          return;
        }
        if (Platform.OS === 'android') {
          const fsiOk = await checkNativeFullScreenIntentPermission();
          if (goOnlineToggleGenRef.current !== toggleGen) {
            releaseGoOnlineLock();
            return;
          }
          if (!fsiOk) {
            releaseGoOnlineLock();
            void refreshPermissionPreflight();
            Alert.alert(
              'Enable full-screen ride alerts',
              'Full-screen alerts are required before going online.',
              [{ text: 'Open Settings', onPress: requestNativeFullScreenIntentPermission }],
            );
            return;
          }
        }

        // Push JWT into FGS before UI says Online (native accept needs a fresh bearer).
        try {
          await refreshNativeDriverSession();
        } catch {
          /* non-fatal — FGS start also receives token */
        }

        desiredOfflineUntilSyncedRef.current = false;
        // Guard the commit window BEFORE flipping to Online so the heartbeat that
        // starts on connectionPhase='confirmed' cannot FORCE_OFFLINE us before the PUT.
        goOnlineCommitInFlightRef.current = true;
        confirmOnline();
        void import('@/src/realtime/criticalActions').then(({ recordOnline }) =>
          recordOnline(driverId!),
        );
        void updateDriverOnlineStatus(true, driverId);
        driverFlowLog('GO_ONLINE_OPTIMISTIC_UI');
        releaseGoOnlineLock();
        driverOffersSocket.connect(driverId);

        void (async () => {
          try {
            try {
              const live = await getDriverSubscriptionStatus();
              const liveStatus = String(live?.data?.status || '');
              if (liveStatus) {
                useDriverDisplayStore.getState().setDriverDisplay({
                  driverId: driverId!,
                  subscriptionStatus: liveStatus,
                  trialTripsCompleted: Number(live?.data?.trial_trips_completed ?? 0),
                  trialTripsTarget: Number(live?.data?.trial_trips_target ?? 0) || undefined,
                  displayHydrated: true,
                });
                if (['pending_payment', 'expired', 'none'].includes(liveStatus)) {
                  confirmOffline();
                  Alert.alert(
                    liveStatus === 'pending_payment' ? 'Trial ended' : 'Activation needed',
                    liveStatus === 'pending_payment'
                      ? 'Your free trial has ended. Subscribe to keep receiving trips.'
                      : 'Start the verified-driver trial or complete payment before going online.',
                    [
                      { text: 'Later', style: 'cancel' },
                      {
                        text: 'Open activation',
                        onPress: () => guardedPush('/driver/subscription'),
                      },
                    ],
                  );
                  return;
                }
              }
            } catch {
              /* non-fatal — PUT still attempts */
            }
            await syncOnlineStatusBackground(true);
          } catch {
            confirmOffline();
            toast.show('Couldn’t go online. Tap GO to retry.', 'error');
          } finally {
            // Commit window closed — a genuine failure above already went offline,
            // so let heartbeat FORCE_OFFLINE resume normal reconcile from here.
            if (goOnlineToggleGenRef.current === toggleGen) {
              goOnlineCommitInFlightRef.current = false;
            }
          }
        })();
      } catch {
        releaseGoOnlineLock();
        confirmOffline();
      }
    })();
  };
  
  // Online map dock owns offers; modal only when dashboard cannot show the dock.
  const dockOwnsOffer =
    isDashboardVisible && sessionEngaged && !activeTripForMap && isFocused;

  /* ── LIVE MAP MODE: confirmed / reconnecting / trip only (never during CONNECTING) ── */
  if (isDashboardVisible) {
    return (
      <View style={{ flex: 1, backgroundColor: dashboardBg }}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />

        {isFocused ? (
        <DriverLiveMapView
          driverCoords={driverCoords}
          isOnline={sessionEngaged}
          isReconnecting={showReconnectingChrome}
          driverCanReceiveOffers={driverCanReceiveOffers}
          todayEarnings={earnings.today}
          driverOffersWsConnected={driverOffersWsConnected}
          workZoneActive={workZoneActive}
          workZoneLabel={workZoneLabel}
          onGoOnline={handleToggleOnline}
          onGoOffline={handleToggleOnline}
          toggling={toggling}
          driverApproved={driverApproved}
          verificationChecking={verificationChecking}
          trialReady={displayGoReady}
          onFeatureHub={() => setFeatureHubOpen(true)}
          onSearch={() => guardedPush('/driver/heatmap')}
          onShieldPress={() => guardedPush('/(driver-tabs)/driver-safety')}
          onInboxPress={() => guardedPush('/(driver-tabs)/driver-notifications')}
          onWorkZone={() => guardedPush('/driver/work-zone')}
          profileImageUri={user?.profile_image ?? null}
          onProfilePress={() => guardedPush('/(driver-tabs)/driver-profile')}
          activeTrip={activeTripForMap}
          embeddedOfferTrip={incomingRide}
          embeddedOfferCountdown={rideCountdown}
          embeddedOfferFareInput={counterFareInput}
          onEmbeddedOfferFareInputChange={setCounterFareInput}
          onEmbeddedOfferAcceptRider={() => void handleAcceptIncomingAtRiderOffer()}
          onEmbeddedOfferAcceptCounter={() => void handleAcceptIncomingAtCounterFare()}
          onEmbeddedOfferDecline={() => void handleDeclineRide()}
          embeddedOfferAccepting={acceptingRide}
          onTripOpenNavigation={handleTripOpenNavigation}
          onTripNavigateToDestination={handleTripNavigateToDestination}
          onTripMarkArrived={handleTripMarkArrived}
          onTripStart={handleTripStart}
          onTripConfirmStart={handleTripConfirmStart}
          onTripCancel={handleTripCancelFromDock}
          onTripRiderNoShow={handleTripRiderNoShow}
          onTripComplete={handleTripComplete}
          onTripPause={handleTripPauseFromDock}
          onTripCallRider={handleTripCallRider}
          onTripMessageRider={handleTripMessageRider}
          onTripEmergency={handleTripEmergency}
          tripActionBusy={tripActionBusy}
          suppressTripDock={!!tripCompletion || completeTripConfirmOpen || driverCancelOpen}
        />
        ) : (
          <View style={{ flex: 1, backgroundColor: dashboardBg }} />
        )}

        <DriverCompleteTripConfirmModal
          visible={completeTripConfirmOpen}
          riderName={completeModalRiderName}
          fare={completeModalFare}
          confirming={tripActionBusy === 'complete'}
          onCancel={() => setCompleteTripConfirmOpen(false)}
          onConfirm={() => void performCompleteTrip()}
        />

        <DriverNavigationAppSheet
          visible={navigationAppPrompt != null}
          destinationLabel={navigationAppPrompt?.label}
          onSelect={handleNavigationAppSelected}
          onClose={() => setNavigationAppPrompt(null)}
        />

        <CancellationReasonModal
          visible={driverCancelOpen}
          role="driver"
          cancelling={tripActionBusy === 'cancel'}
          errorMessage={driverCancelError}
          feePreviewNote={
            driverCancelReasonPrefill === 'Rider no-show'
              ? 'Free wait ended. Cancelling as rider no-show protects your acceptance metrics when used correctly.'
              : 'Frequent cancellations can lower your trip offer priority.'
          }
          onKeepTrip={() => {
            if (tripActionBusy !== 'cancel') {
              setDriverCancelOpen(false);
              setDriverCancelError(null);
              setDriverCancelReasonPrefill(null);
            }
          }}
          onConfirm={(reason) =>
            void confirmDriverCancel(driverCancelReasonPrefill || reason || 'Other')
          }
        />

        {tripCompletion ? (
          <DriverTripCompletionPanel
            payload={tripCompletion}
            onDismiss={() => setTripCompletion(null)}
            onSubmitRating={handleCompletionRate}
            onConfirmCash={
              tripCompletion.paymentPending ? () => handleCompletionConfirmCash() : undefined
            }
            onViewDetails={() => {
              const tid = tripCompletion.tripId;
              setTripCompletion(null);
              if (tid) {
                guardedPush(`/driver/trip-detail?tripId=${encodeURIComponent(tid)}` as Href);
              } else {
                guardedPush('/(driver-tabs)/driver-trips' as Href);
              }
            }}
          />
        ) : null}
        {/* Offer modal only when map dock cannot own the offer (offline / no session). */}
        {!dockOwnsOffer ? (
          <DriverRideRequestModal
            visible={!!incomingRide}
            trip={incomingRide}
            countdownSeconds={rideCountdown}
            countdownTotal={DRIVER_OFFER_COUNTDOWN_SECONDS}
            fareInput={counterFareInput}
            onFareInputChange={setCounterFareInput}
            accepting={acceptingRide}
            onAcceptRiderPrice={() => void handleAcceptIncomingAtRiderOffer()}
            onSendCounterPrice={() => void handleAcceptIncomingAtCounterFare()}
            onIgnore={handleDeclineRide}
            driverLat={driverCoords?.lat}
            driverLng={driverCoords?.lng}
          />
        ) : null}

        {/* Feature hub drawer */}
        <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="driver" />

      </View>
    );
  }

  // Option 1: never paint map/GO while documents are still outstanding.
  if (verificationStatus === 'not_submitted') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        <ActivityIndicator size="large" color="#4ADE80" />
        <Text style={{ marginTop: 14, color: '#E2E8F0', fontSize: 15, fontWeight: '600' }}>
          Continue document setup…
        </Text>
      </View>
    );
  }

  /* ── Uber boot shell: cached SWR + 8s gate + retry ── */
  return (
    <DriverBootShell
      isGateOpen={boot.isGateOpen || isDashboardVisible}
      error={boot.error}
      retrying={boot.retrying}
      fromCache={boot.fromCache}
      onRetry={boot.retry}
      onSignIn={() => router.replace('/(auth)/login' as Href)}
      onContinueOffline={boot.continueOffline}
    >
      <DriverUberStyleOfflineHome
    driverCoords={driverCoords}
    profileImageUri={user?.profile_image ?? null}
    driverApproved={driverApproved}
    trialReady={displayGoReady}
    subscriptionStatus={subscriptionStatus}
    trialTripsCompleted={trialTripsCompleted}
    trialTripsTarget={trialTripsTarget}
    trialDaysRemaining={trialDaysRemaining}
    trialDayLimit={trialDayLimit}
    trialEmphasis={trialEmphasis}
    earlySubscribeMessage={earlySubscribeMessage}
    verificationStatus={verificationStatus}
    toggling={toggling}
    todayEarnings={earnings.today}
    permissionPreflight={permissionsCompletedOnce ? null : permissionPreflight}
    permissionRefreshing={permissionRefreshing}
    onRefreshPermissions={() => void refreshPermissionPreflight()}
    onRequestPermission={(item: DriverPermissionItem) => {
      void item.request().then(() => refreshPermissionPreflight());
    }}
    onGoOnline={handleToggleOnline}
    onFeatureHub={() => setFeatureHubOpen(true)}
    onShield={() => guardedPush('/(driver-tabs)/driver-safety')}
    onHeatmap={() => guardedPush('/driver/heatmap')}
    onProfile={() => guardedPush('/(driver-tabs)/driver-profile')}
    onOpenSubscription={() => guardedPush('/driver/subscription')}
    onActivateTrial={async () => {
      // GET /driver/subscription-status auto-provisions trial for verified drivers.
      try {
        const res = await getDriverSubscriptionStatus();
        const status = String(res?.data?.status || '');
        // Refresh verification + subscription so CTA flips to GO ONLINE without leaving home.
        boot.retry();
        if (['trial', 'active', 'grace_period'].includes(status)) {
          toast.show('Free trial activated — tap GO to start.', 'success');
          return;
        }
      } catch {
        /* fall through to subscription screen */
      }
      guardedPush('/driver/subscription');
    }}
    rideRequestModal={
      <DriverRideRequestModal
        visible={!!incomingRide && !dockOwnsOffer}
        trip={incomingRide}
        countdownSeconds={rideCountdown}
        countdownTotal={DRIVER_OFFER_COUNTDOWN_SECONDS}
        fareInput={counterFareInput}
        onFareInputChange={setCounterFareInput}
        accepting={acceptingRide}
        onAcceptRiderPrice={() => void handleAcceptIncomingAtRiderOffer()}
        onSendCounterPrice={() => void handleAcceptIncomingAtCounterFare()}
        onIgnore={handleDeclineRide}
        driverLat={driverCoords?.lat}
        driverLng={driverCoords?.lng}
      />
    }
    featureHubDrawer={
      <FeatureHubDrawer visible={featureHubOpen} onClose={() => setFeatureHubOpen(false)} role="driver" />
    }
    mapActive={isFocused}
  />
    </DriverBootShell>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════
   OFFLINE HOME — layout-stable map + stats (no vertical reflow)
   ═══════════════════════════════════════════════════════════════════════════ */
const OFFLINE_MAP_LAYER_HEIGHT = 208;
const OFFLINE_MAP_FOOTER_HEIGHT = 48;
const OFFLINE_MAP_CARD_HEIGHT = OFFLINE_MAP_LAYER_HEIGHT + OFFLINE_MAP_FOOTER_HEIGHT;
const OFFLINE_TRIAL_SLOT_HEIGHT = 60;
const INITIAL_OFFLINE_MAP_REGION = {
  latitude: 6.5244,
  longitude: 3.3792,
  latitudeDelta: 0.055,
  longitudeDelta: 0.055,
} as const;

type DriverOfflineMapPreviewProps = {
  latitude: number | null;
  longitude: number | null;
  onHeatmapPress: () => void;
  /** When false, native MapView is unmounted (blurred tab / single-map policy). */
  mapActive?: boolean;
  /** Full-bleed live map behind chrome (modern e-hail home). */
  fullBleed?: boolean;
};

const DriverOfflineMapPreview = React.memo(function DriverOfflineMapPreview({
  latitude,
  longitude,
  onHeatmapPress,
  mapActive = true,
  fullBleed = false,
}: DriverOfflineMapPreviewProps) {
  const mapRef = useRef<MapView | null>(null);
  const didCenterOnce = useRef(false);
  const lastMapPushRef = useRef(0);
  const [displayCoords, setDisplayCoords] = useState<{ lat: number; lng: number } | null>(null);
  // Defer native MapView until after login transitions settle. Immediate mount + liteMode
  // under Navigation SDK / R8 was a process-death path on driver offline home.
  const [nativeMapEnabled, setNativeMapEnabled] = useState(
    () => mapActive && Platform.OS !== 'android',
  );
  const [mapEpoch, setMapEpoch] = useState(0);

  useEffect(() => {
    if (!mapActive) {
      setNativeMapEnabled(false);
      didCenterOnce.current = false;
      return;
    }
    if (Platform.OS !== 'android') {
      setNativeMapEnabled(true);
      return;
    }
    let cancelled = false;
    const handle = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        if (cancelled) return;
        startupLog('DRIVER_HOME_MAP_MOUNT', { deferredMs: 900 });
        setNativeMapEnabled(true);
      }, 900);
    });
    return () => {
      cancelled = true;
      handle.cancel?.();
    };
  }, [mapActive]);

  /* Throttle marker/camera feed — layout is fixed; avoid re-render churn from GPS stream */
  useEffect(() => {
    if (latitude == null || longitude == null) return;
    const now = Date.now();
    const elapsed = now - lastMapPushRef.current;
    const push = () => {
      lastMapPushRef.current = Date.now();
      setDisplayCoords({ lat: latitude, lng: longitude });
    };
    if (lastMapPushRef.current === 0 || elapsed >= 3000) {
      push();
      return;
    }
    const timer = setTimeout(push, 3000 - elapsed);
    return () => clearTimeout(timer);
  }, [latitude, longitude]);

  useEffect(() => {
    if (!nativeMapEnabled || displayCoords == null || !mapRef.current || didCenterOnce.current) return;
    didCenterOnce.current = true;
    mapRef.current.animateToRegion(
      {
        latitude: displayCoords.lat,
        longitude: displayCoords.lng,
        latitudeDelta: 0.055,
        longitudeDelta: 0.055,
      },
      300,
    );
  }, [displayCoords, nativeMapEnabled]);

  return (
    <View style={fullBleed ? ohStyles.mapFullBleed : ohStyles.mapCard}>
      <View style={fullBleed ? ohStyles.mapFullBleedLayer : ohStyles.mapMapLayer}>
        <LinearGradient
          colors={['#0B1220', '#132033', '#0B1220']}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />
        {nativeMapEnabled ? (
          <TripMapErrorBoundary
            key={`offline-map-${mapEpoch}`}
            onRetry={() => {
              didCenterOnce.current = false;
              setNativeMapEnabled(false);
              setMapEpoch((n) => n + 1);
              setTimeout(() => setNativeMapEnabled(true), 400);
            }}
          >
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFillObject}
              provider={PROVIDER_GOOGLE}
              customMapStyle={NEXRYDE_MAP_STYLE}
              initialRegion={INITIAL_OFFLINE_MAP_REGION}
              scrollEnabled={fullBleed}
              zoomEnabled={fullBleed}
              pitchEnabled={false}
              rotateEnabled={false}
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass={false}
              showsPointsOfInterest={false}
              showsBuildings={false}
              showsTraffic={false}
              toolbarEnabled={false}
              // liteMode + Navigation SDK maps has caused Android process death on login.
              liteMode={false}
              moveOnMarkerPress={false}
            >
              {displayCoords != null ? (
                <Marker
                  coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }}
                  anchor={{ x: 0.5, y: 1 }}
                  tracksViewChanges={false}
                >
                  <View style={ohStyles.mapPinWrap} collapsable={false}>
                    <Ionicons name="location" size={44} color={BRAND.primary} />
                  </View>
                </Marker>
              ) : null}
            </MapView>
          </TripMapErrorBoundary>
        ) : null}

        <LinearGradient
          colors={
            fullBleed
              ? ['rgba(6,11,20,0.55)', 'transparent', 'rgba(6,11,20,0.72)']
              : ['rgba(6,11,20,0.2)', 'transparent', 'rgba(6,11,20,0.88)']
          }
          locations={[0, 0.45, 1]}
          style={ohStyles.mapVignette}
          pointerEvents="none"
        />

        {!fullBleed ? (
          <>
            <View style={ohStyles.liveBadge} pointerEvents="none">
              <Ionicons name="location-outline" size={11} color="#94A3B8" />
              <Text style={ohStyles.liveBadgeText}>YOUR AREA</Text>
            </View>

            <View style={ohStyles.mapLocBadge} pointerEvents="none">
              <Text style={[ohStyles.mapLocText, displayCoords == null && ohStyles.mapLocTextMuted]}>
                {displayCoords != null ? 'Your location' : 'Locating…'}
              </Text>
            </View>
          </>
        ) : null}
      </View>

      {!fullBleed ? (
        <TouchableOpacity
          style={ohStyles.mapFooterCta}
          onPress={onHeatmapPress}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="See ride opportunities in your area"
        >
          <Ionicons name="scan-outline" size={18} color={BRAND.primary} />
          <Text style={ohStyles.mapFooterCtaText}>See ride opportunities in your area</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   OFFLINE HOME COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
function DriverOfflineHome({
  driverCoords,
  profileImageUri,
  driverApproved,
  verificationChecking: _verificationChecking,
  awaitingLocalFact: _awaitingLocalFact = false,
  trialReady,
  subscriptionStatus,
  trialTripsCompleted,
  trialTripsTarget,
  trialExtended: _trialExtended,
  trialDaysRemaining,
  trialDayLimit,
  trialEmphasis,
  trialMessage: _trialMessage,
  earlySubscribeMessage,
  verificationStatus,
  toggling,
  featureHubOpen: _featureHubOpen,
  permissionPreflight,
  permissionRefreshing,
  onRefreshPermissions,
  onRequestPermission,
  onGoOnline,
  onFeatureHub,
  onShield: _onShield,
  onHeatmap,
  onWorkZone: _onWorkZone,
  onProfile,
  onOpenSubscription,
  onActivateTrial,
  rideRequestModal,
  featureHubDrawer,
  mapActive = true,
}: {
  driverCoords: { lat: number; lng: number; heading?: number } | null;
  profileImageUri: string | null;
  driverApproved: boolean;
  /** No local fact after hydrate — never show Waiting for Approval. */
  verificationChecking: boolean;
  /** Cold start before local fact read — do not show Checking copy. */
  awaitingLocalFact?: boolean;
  trialReady: boolean;
  subscriptionStatus: string | null;
  trialTripsCompleted: number;
  trialTripsTarget: number;
  trialExtended: boolean;
  trialDaysRemaining: number | null;
  trialDayLimit: number | null;
  trialEmphasis: 'trips' | 'days';
  trialMessage: string;
  earlySubscribeMessage: string;
  verificationStatus: string | null;
  toggling: boolean;
  featureHubOpen: boolean;
  permissionPreflight: DriverPermissionPreflight | null;
  permissionRefreshing: boolean;
  onRefreshPermissions: () => void;
  onRequestPermission: (item: DriverPermissionItem) => void;
  onGoOnline: () => void;
  onFeatureHub: () => void;
  onShield: () => void;
  onHeatmap: () => void;
  onWorkZone: () => void;
  onProfile: () => void;
  onOpenSubscription: () => void;
  onActivateTrial: () => void;
  rideRequestModal: React.ReactNode;
  featureHubDrawer: React.ReactNode;
  mapActive?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const tabPad = useTabBottomPad(8);
  const { colors, isDark } = useThemeColors();
  const offlineBg = isDark ? '#050A12' : colors.background;

  const mapPinLat = driverCoords?.lat ?? null;
  const mapPinLng = driverCoords?.lng ?? null;
  const handleHeatmapPress = useCallback(() => onHeatmap(), [onHeatmap]);

  const permissionsReady = !permissionPreflight || permissionPreflight.ready;
  const pendingExplicit =
    !driverApproved &&
    (verificationStatus === 'pending' ||
      verificationStatus === 'pending_review' ||
      verificationStatus === 'rejected' ||
      verificationStatus === 'documents_rejected' ||
      Boolean(verificationStatus));
  // Approved (or unknown) + plan ready → Online switch. Never trap on Checking.
  const canTapGoOnline =
    (driverApproved || verificationStatus == null) &&
    (trialReady || verificationStatus == null) &&
    permissionsReady &&
    !toggling &&
    !pendingExplicit;
  const trialEnded = subscriptionStatus === 'pending_payment';
  const needsSubscription = driverApproved && !trialReady && subscriptionStatus != null;
  const trialBannerParts = splitTrialBannerForEmphasis({
    completed: trialTripsCompleted,
    target: trialTripsTarget,
    daysRemaining: trialDaysRemaining,
    dayLimit: trialDayLimit,
    emphasis: trialEmphasis,
  });
  const showTrialProgress = driverApproved && subscriptionStatus === 'trial' && trialTripsTarget > 0;
  const profileReadyDot = driverApproved && trialReady;

  const onOnlineSwitch = useCallback(
    (next: boolean) => {
      if (!next || toggling) return;
      onGoOnline();
    },
    [onGoOnline, toggling],
  );

  return (
    <View style={[ohStyles.screenRoot, { backgroundColor: offlineBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />

      <View style={ohStyles.mapStage} pointerEvents="box-none">
        <DriverOfflineMapPreview
          latitude={mapPinLat}
          longitude={mapPinLng}
          onHeatmapPress={handleHeatmapPress}
          mapActive={mapActive}
          fullBleed
        />
      </View>

      <View style={[ohStyles.overlayChrome, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={ohStyles.topBar}>
          <TouchableOpacity
            style={[
              ohStyles.topIconBtn,
              !isDark && { backgroundColor: colors.surfaceAlt, borderColor: colors.border },
            ]}
            onPress={onFeatureHub}
            activeOpacity={0.8}
          >
            <Ionicons name="menu" size={22} color={isDark ? '#E2E8F0' : colors.text} />
          </TouchableOpacity>

          <View style={ohStyles.onlineSwitchPill} accessibilityRole="switch">
            <View
              style={[
                ohStyles.onlineSwitchDot,
                { backgroundColor: canTapGoOnline ? '#64748B' : '#475569' },
              ]}
            />
            <Text style={ohStyles.onlineSwitchLabel}>Offline</Text>
            <Switch
              value={false}
              onValueChange={onOnlineSwitch}
              disabled={!canTapGoOnline}
              trackColor={{ false: 'rgba(100,116,139,0.45)', true: BRAND.primary }}
              thumbColor={canTapGoOnline ? '#F8FAFC' : '#94A3B8'}
              ios_backgroundColor="rgba(100,116,139,0.45)"
            />
          </View>

          <TouchableOpacity style={ohStyles.profileTap} onPress={onProfile} activeOpacity={0.82}>
            <TripProfileAvatar
              size={44}
              uri={resolvePublicMediaUri(profileImageUri)}
              borderColor="#FFFFFF"
              borderWidth={2.5}
              showOnlineDot
              onlineDotColor={profileReadyDot ? BRAND.primary : '#64748B'}
              accessibilityLabel="Your driver profile photo"
            />
          </TouchableOpacity>
        </View>

        {showTrialProgress ? (
          <TouchableOpacity
            style={ohStyles.trialProgressChip}
            activeOpacity={0.86}
            onPress={onOpenSubscription}
          >
            <View style={ohStyles.trialProgressDot} />
            <View style={{ flex: 1 }}>
              <Text style={ohStyles.trialProgressText}>
                <Text style={trialBannerParts.emphasis === 'trips' ? ohStyles.trialProgressEmphasis : undefined}>
                  {trialBannerParts.prefix}
                  {trialBannerParts.tripsPart}
                </Text>
                <Text style={trialBannerParts.emphasis === 'days' ? ohStyles.trialProgressEmphasis : undefined}>
                  {trialBannerParts.separator}
                  {trialBannerParts.secondaryPart}
                </Text>
              </Text>
              {earlySubscribeMessage ? (
                <Text style={ohStyles.trialSaveHint} numberOfLines={1}>
                  {earlySubscribeMessage}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={16} color="#64748B" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={[ohStyles.bottomDock, { paddingBottom: tabPad + 8 }]} pointerEvents="box-none">
        <LinearGradient
          colors={['transparent', 'rgba(6,11,20,0.88)', 'rgba(6,11,20,0.98)']}
          style={ohStyles.bottomDockFade}
          pointerEvents="none"
        />

        {pendingExplicit ? (
          <View style={ohStyles.bannerWarn}>
            <Ionicons name="time-outline" size={18} color="#FBBF24" />
            <View style={{ flex: 1 }}>
              <Text style={ohStyles.bannerTitle}>Verification Pending</Text>
              <Text style={ohStyles.bannerBody}>
                {(verificationStatus === 'pending' || verificationStatus === 'pending_review')
                  ? 'Your documents are being reviewed. You can drive once approved.'
                  : 'Complete your document verification to start driving.'}
              </Text>
            </View>
          </View>
        ) : null}

        {needsSubscription ? (
          <TouchableOpacity
            style={trialEnded ? ohStyles.bannerTrialEnded : ohStyles.bannerInfo}
            onPress={onOpenSubscription}
            activeOpacity={0.85}
          >
            <Ionicons
              name={trialEnded ? 'card-outline' : 'flash-outline'}
              size={18}
              color={trialEnded ? '#FBBF24' : '#3B82F6'}
            />
            <View style={{ flex: 1 }}>
              <Text style={[ohStyles.bannerTitle, { color: trialEnded ? '#FDE68A' : '#93C5FD' }]}>
                {trialEnded ? 'Trial ended' : 'Activate Trial'}
              </Text>
              <Text style={ohStyles.bannerBody}>
                {trialEnded
                  ? 'Your free trial has ended. Subscribe to keep receiving trips.'
                  : 'Start your free trial to receive ride requests.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={trialEnded ? '#FBBF24' : '#3B82F6'} />
          </TouchableOpacity>
        ) : null}

        {driverApproved && trialReady ? (
          <DriverGoOnlinePermissionGate
            preflight={permissionPreflight}
            refreshing={permissionRefreshing}
            onRefresh={onRefreshPermissions}
            onRequestItem={onRequestPermission}
          />
        ) : null}

        <TouchableOpacity
          style={ohStyles.heatmapChip}
          onPress={handleHeatmapPress}
          activeOpacity={0.88}
        >
          <Ionicons name="flame-outline" size={16} color={BRAND.primary} />
          <Text style={ohStyles.heatmapChipText}>Ride demand nearby</Text>
        </TouchableOpacity>

        {driverApproved && trialReady && !permissionsReady ? (
          <TouchableOpacity
            style={ohStyles.goBtnPending}
            activeOpacity={0.85}
            onPress={onRefreshPermissions}
            accessibilityRole="button"
            accessibilityLabel="Grant permissions to go online"
          >
            <Ionicons name="shield-outline" size={20} color="#FBBF24" />
            <Text style={ohStyles.goBtnPendingText}>Grant these to go online</Text>
          </TouchableOpacity>
        ) : canTapGoOnline ? (
          <TouchableOpacity
            style={ohStyles.goOnlineDockBtn}
            activeOpacity={0.9}
            onPress={onGoOnline}
            disabled={toggling}
            accessibilityRole="button"
            accessibilityLabel="Go online"
          >
            {toggling ? (
              <ActivityIndicator size="small" color="#0B1220" />
            ) : (
              <Ionicons name="flash" size={20} color="#0B1220" />
            )}
            <Text style={ohStyles.goOnlineDockBtnText}>
              {toggling ? 'Going online…' : 'Go Online'}
            </Text>
          </TouchableOpacity>
        ) : pendingExplicit ? (
          <View style={ohStyles.goBtnPending}>
            <Ionicons name="time-outline" size={20} color="#FBBF24" />
            <Text style={ohStyles.goBtnPendingText}>Waiting for Approval</Text>
          </View>
        ) : needsSubscription ? (
          <TouchableOpacity
            style={ohStyles.goBtnActivate}
            activeOpacity={0.85}
            onPress={() => {
              Alert.alert(
                'Activate Your Account',
                'Start your free trial to receive ride requests.',
                [
                  { text: 'Later', style: 'cancel' },
                  { text: 'Activate Now', onPress: onActivateTrial },
                ],
              );
            }}
          >
            <Ionicons name="flash" size={20} color="#FFF" />
            <Text style={ohStyles.goBtnActivateText}>Activate to Drive</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={ohStyles.goOnlineDockBtn}
            activeOpacity={0.9}
            onPress={onGoOnline}
            disabled={toggling}
          >
            {toggling ? (
              <ActivityIndicator size="small" color="#0B1220" />
            ) : (
              <Ionicons name="flash" size={20} color="#0B1220" />
            )}
            <Text style={ohStyles.goOnlineDockBtnText}>
              {toggling ? 'Going online…' : 'Go Online'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {rideRequestModal}
      {featureHubDrawer}
    </View>
  );
}

/* ── Offline home styles ─────────────────────────────────────── */
const ohStyles = StyleSheet.create({
  screenRoot: { flex: 1 },
  mapStage: {
    ...StyleSheet.absoluteFillObject,
  },
  mapFullBleed: {
    flex: 1,
    backgroundColor: '#080E18',
  },
  mapFullBleedLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0c1220',
  },
  overlayChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 10,
    zIndex: 4,
  },
  onlineSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,23,42,0.82)',
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  onlineSwitchDot: { width: 8, height: 8, borderRadius: 4 },
  onlineSwitchLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E2E8F0',
    letterSpacing: 0.2,
  },
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    gap: 10,
    zIndex: 4,
  },
  bottomDockFade: {
    ...StyleSheet.absoluteFillObject,
    top: -48,
  },
  heatmapChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.28)',
  },
  heatmapChipText: { fontSize: 13, fontWeight: '700', color: '#CBD5E1' },
  goOnlineDockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: BRAND.primary,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  goOnlineDockBtnText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0B1220',
    letterSpacing: 0.3,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  topIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.055)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  topCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  topBarCenterSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  profileTap: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15,23,42,0.72)',
    borderRadius: 22,
    paddingHorizontal: 17,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  offlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#64748B' },
  offlinePillText: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.15 },

  trialProgressSlot: {
    height: OFFLINE_TRIAL_SLOT_HEIGHT,
    marginBottom: 12,
    justifyContent: 'center',
  },
  trialProgressChip: {
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.32)',
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 5,
  },
  trialProgressDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.primaryLight },
  trialProgressText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#CFECDD' },
  trialProgressEmphasis: { color: '#FFFFFF', fontWeight: '900' },
  trialSaveHint: { fontSize: 10, fontWeight: '600', color: '#86EFAC', marginTop: 2 },
  bannerTrialEnded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  trialExtBadge: {
    backgroundColor: 'rgba(245,158,11,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.35)',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  trialExtText: { fontSize: 10, fontWeight: '800', color: '#F59E0B' },

  /* Map card — preview + heatmap entry (fixed height — no tile-load reflow) */
  mapCard: {
    height: OFFLINE_MAP_CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.26)',
    marginBottom: 16,
    backgroundColor: '#080E18',
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 14,
  },
  mapMapLayer: {
    height: OFFLINE_MAP_LAYER_HEIGHT,
    width: '100%',
    position: 'relative',
    backgroundColor: '#0c1220',
    overflow: 'hidden',
  },
  mapPinWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  mapVignette: { ...StyleSheet.absoluteFillObject },
  mapLocBadge: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
  },
  mapLocText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#4ADE80',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(5,10,18,0.9)',
    borderWidth: 1,
    borderColor: 'rgba(34,229,160,0.4)',
    overflow: 'hidden',
    minHeight: 28,
    textAlign: 'center',
  },
  mapLocTextMuted: { color: '#64748B', borderColor: 'rgba(100,116,139,0.35)' },
  mapFooterCta: {
    height: OFFLINE_MAP_FOOTER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(5,10,18,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(34,229,160,0.2)',
  },
  mapFooterCtaText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
    letterSpacing: 0.2,
  },
  liveBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(5,10,18,0.92)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.38)',
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F87171' },
  liveBadgeText: { fontSize: 10, fontWeight: '900', color: '#94A3B8', letterSpacing: 1.2 },

  /* Banners */
  bannerWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 0,
    marginBottom: 14,
    backgroundColor: 'rgba(251,191,36,0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.25)',
  },
  bannerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 0,
    marginBottom: 14,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.25)',
  },
  bannerDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(153,27,27,0.5)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  bannerTitle: { fontSize: 13, fontWeight: '800', color: '#FBBF24', marginBottom: 2 },
  bannerBody: { fontSize: 12, fontWeight: '400', color: '#94A3B8', lineHeight: 16 },

  /* Feature grid */
  gridWrap: { marginBottom: 14 },
  gridTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    alignItems: 'center',
    paddingVertical: 18,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2,
  },
  gridIcon: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  gridLabel: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.3 },

  /* GO bar */
  goBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    backgroundColor: 'rgba(4,8,16,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(34,229,160,0.18)',
  },
  goBarTopGradient: {
    position: 'absolute',
    top: -40,
    left: 0,
    right: 0,
    height: 40,
  },
  goBtn: {
    width: '100%',
    borderRadius: 20,
    shadowColor: '#00D47E',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    elevation: 20,
  },
  goBtnOuterRing: {
    position: 'absolute',
    left: -4,
    right: -4,
    top: -4,
    bottom: -4,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(0,212,126,0.4)',
  },
  goBtnGrad: {
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  goBtnGradClip: {
    overflow: 'hidden',
    position: 'relative',
  },
  goBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  goBtnTextLight: {
    fontSize: 19,
    fontWeight: '900',
    color: '#022C22',
    letterSpacing: -0.2,
  },
  goHalftone: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 76,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignContent: 'center',
    paddingRight: 8,
    opacity: 0.22,
  },
  goHalftoneDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    margin: 3,
  },
  goBtnIconChip: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(2,44,34,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(2,44,34,0.18)',
  },
  goBtnText: { fontSize: 18, fontWeight: '900', color: '#022C22', letterSpacing: 2 },
  goBtnSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(2,44,34,0.72)',
    letterSpacing: 0.2,
  },
  goBarHint: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    lineHeight: 17,
    paddingHorizontal: 8,
  },
  goBtnPending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    paddingVertical: 20,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(251,191,36,0.4)',
    width: '100%',
  },
  goBtnPendingText: { fontSize: 16, fontWeight: '800', color: '#FBBF24' },
  goBtnActivate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 20,
    paddingVertical: 20,
    backgroundColor: '#F59E0B',
    width: '100%',
  },
  goBtnActivateText: { fontSize: 16, fontWeight: '900', color: '#FFF' },
});


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.bgDeep,
  },
  simSwapBanner: {
    backgroundColor: '#991B1B',
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#7F1D1D',
  },
  simSwapBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  simSwapBannerTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  simSwapBannerText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    lineHeight: 17,
  },
  simSwapContactBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  simSwapContactBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  driverName: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 0.5,
  },
  profileButton: {
    width: 48,
    height: 48,
  },
  statusCard: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  statusCardOnlineGlow: {
    shadowColor: BRAND.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    borderColor: 'rgba(0, 212, 106, 0.45)',
  },
  statusDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,58,95,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotOnline: {
    backgroundColor: 'rgba(0,212,106,0.12)',
  },
  statusDotLocked: {
    backgroundColor: 'rgba(251,191,36,0.12)',
  },
  statusLeft: {
    flex: 1,
  },
  statusText: {
    flex: 1,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251,191,36,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pendingBadgeText: { fontSize: 12, fontWeight: '800', color: '#D97706' },
  activateBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  activateBtnText: { fontSize: 13, fontWeight: '800', color: '#FFF' },
  statusTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 3,
    letterSpacing: 0.3,
  },
  statusSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND.textSecondary,
  },
  // Trial progress bar inside status card
  trialBarBg: {
    height: 5,
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trialBarFill: {
    height: 5,
    borderRadius: 3,
  },
  toggleButton: {
    width: 72,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
    padding: 4,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  toggleButtonActive: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primaryDark,
    shadowColor: BRAND.primary,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  toggleButtonDisabled: {
    backgroundColor: '#F8FAFC',
    borderColor: '#FBBF24',
    opacity: 0.75,
  },
  toggleThumb: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  headerPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  headerPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  verificationRoadmap: {
    marginTop: 18,
    padding: 18,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  activationRoadmap: {
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
  },
  roadmapHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  roadmapIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roadmapIconGrad: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activationIcon: {
    backgroundColor: '#FEF3C7',
  },
  roadmapBadge: {
    fontSize: 10,
    fontWeight: '900',
    color: BRAND.primary,
    letterSpacing: 0.8,
    marginBottom: 3,
  },
  roadmapTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 4,
  },
  roadmapSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: BRAND.textSecondary,
  },
  roadmapSteps: {
    marginTop: 16,
    gap: 10,
  },
  roadmapStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  roadmapStepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roadmapStepLine: {
    width: 2,
    height: 12,
    backgroundColor: '#E2E8F0',
    marginLeft: 10,
  },
  roadmapStepText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: BRAND.textPrimary,
  },
  roadmapActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  roadmapPrimary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: BRAND.primary,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roadmapPrimaryText: {
    color: BRAND.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  roadmapSecondary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: SURFACE.hairline,
    paddingVertical: 12,
    alignItems: 'center',
  },
  roadmapSecondaryText: {
    color: BRAND.textPrimary,
    fontSize: 13,
    fontWeight: '900',
  },
  offlineSyncCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FCD34D',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  offlineSyncIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineSyncTextWrap: {
    flex: 1,
  },
  // ── Surge Pricing Card ──────────────────────────────────────────────
  surgeCard: {
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  surgeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  surgeTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  surgeReason: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 15,
  },
  surgeBadge: {
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  surgeBadgeText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  // kept for any accidental refs — can be cleaned up later
  guaranteeClaimBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
  },
  trialCompleteBanner: {
    marginTop: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  trialCompleteBannerGrad: {
    padding: 16,
  },
  offlineSyncTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: BRAND.textPrimary,
    marginBottom: 4,
  },
  offlineSyncSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: BRAND.textSecondary,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toolsHint: {
    fontSize: 12,
    lineHeight: 16,
    color: BRAND.textSecondary,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND.textPrimary,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  walletWithdrawStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#052e16', marginHorizontal: 16, marginBottom: 10,
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
  },
  walletWithdrawLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  walletWithdrawLabel: { fontSize: 10, fontWeight: '800', color: '#86efac', letterSpacing: 1, textTransform: 'uppercase' },
  walletWithdrawAmount: { fontSize: 15, fontWeight: '900', color: '#22c55e' },
  walletWithdrawBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22c55e', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  walletWithdrawBtnText: { fontSize: 12, fontWeight: '900', color: '#022C22' },
  seeAll: {
    fontSize: 15,
    color: BRAND.primary,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  earningsGradientWrap: {
    borderRadius: 22,
    padding: 12,
    overflow: 'hidden',
  },
  earningsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  earningCard: {
    width: (width - 56) / 3,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  earningIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  earningLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.textSecondary,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  earningValue: {
    fontSize: 22,
    fontWeight: '900',
    color: BRAND.textPrimary,
    letterSpacing: 1,
  },
  earningCardOnGreen: {
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    borderColor: 'rgba(255,255,255,0.2)',
  },
  earningLabelLight: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  earningValueLight: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  priorityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  priorityCard: {
    width: (width - 52) / 2,
    height: 100,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  priorityGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  priorityLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  featureCount: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND.textSecondary,
  },
  allFeaturesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
    justifyContent: 'space-between',
  },
  featureCard: {
    width: (width - 56) / 2,
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  featureIconBox: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND.textPrimary,
    textAlign: 'center',
    letterSpacing: 0.2,
    lineHeight: 14,
  },
  moreList: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: HOME_PALETTE.cardShadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  moreItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: SURFACE.hairline,
  },
  moreIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  moreLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: BRAND.textPrimary,
  },
  // ── Category selector ───────────────────────────────────────────────────
  catCard: {
    backgroundColor: SURFACE.cardDark,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  catCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 14,
    gap: 6,
  },
  catCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginLeft: 4,
  },
  catCardHint: {
    fontSize: 11,
    color: '#94A3B8',
    flex: 1,
    textAlign: 'right',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  catTile: {
    width: '47%',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    padding: 12,
    position: 'relative',
  },
  catTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  catTileLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND.textPrimary,
    marginBottom: 2,
  },
  catTileDesc: {
    fontSize: 11,
    color: '#94A3B8',
  },
  catCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Idle boost banner ──────────────────────────────────────────────────
  idleBoostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF8E7',
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FFB80040',
  },
  idleBoostText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },
});
