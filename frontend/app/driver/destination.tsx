/**
 * Trips Towards Destination — Nexryde
 * Drivers set a destination and only receive rides going their way.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Animated,
  Easing,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { useFlowLayout, FLOW_MAX_CONTENT_WIDTH } from '@/src/constants/flowLayout';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { BORDER_RADIUS } from '@/src/constants/theme';

const DAILY_LIMIT = 3;
const ACCENT = '#34F5B8';
const ACCENT_DIM = 'rgba(52,245,184,0.14)';
const SURFACE = 'rgba(15,23,42,0.72)';
const BORDER = 'rgba(148,163,184,0.18)';

interface DestinationState {
  active: boolean;
  limit_reached: boolean;
  daily_trips: number;
  daily_limit: number;
  trips_remaining: number;
  destination_name: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_distance_km?: number;
  destination_duration_mins?: number;
  destination_saved_label?: string;
}
interface SavedLocation {
  label: string;
  name: string;
  lat: number;
  lng: number;
}
interface SearchResult {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
  lat?: number;
  lng?: number;
}

const LOCAL_DESTINATION_FALLBACKS: Array<{ name: string; lat: number; lng: number; secondary?: string }> = [
  { name: 'Ikorodu', lat: 6.6194, lng: 3.5105, secondary: 'Lagos, Nigeria' },
  { name: 'Lekki', lat: 6.4698, lng: 3.5852, secondary: 'Lagos, Nigeria' },
  { name: 'Ikeja', lat: 6.6018, lng: 3.3515, secondary: 'Lagos, Nigeria' },
  { name: 'Victoria Island', lat: 6.4281, lng: 3.4219, secondary: 'Lagos, Nigeria' },
  { name: 'Yaba', lat: 6.5155, lng: 3.3702, secondary: 'Lagos, Nigeria' },
  { name: 'Surulere', lat: 6.5058, lng: 3.3581, secondary: 'Lagos, Nigeria' },
  { name: 'Ajah', lat: 6.4654, lng: 3.5448, secondary: 'Lagos, Nigeria' },
  { name: 'Maryland', lat: 6.572, lng: 3.3637, secondary: 'Lagos, Nigeria' },
  { name: 'Abuja', lat: 9.0579, lng: 7.4951, secondary: 'FCT, Nigeria' },
  { name: 'Port Harcourt', lat: 4.8156, lng: 7.0498, secondary: 'Rivers, Nigeria' },
];

function TripProgressBar({ total, used }: { total: number; used: number }) {
  return (
    <View style={progressStyles.track} accessibilityLabel={`${used} of ${total} trips used today`}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[progressStyles.segment, i < used ? progressStyles.segmentUsed : progressStyles.segmentFree]} />
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 8, width: '100%' },
  segment: { flex: 1, height: 10, borderRadius: 5 },
  segmentUsed: { backgroundColor: ACCENT },
  segmentFree: {
    backgroundColor: 'rgba(52,245,184,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(52,245,184,0.35)',
  },
});

export default function DestinationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();

  const isNarrow = screenW < 360;
  const contentMaxW = Math.min(screenW, FLOW_MAX_CONTENT_WIDTH);
  const tileMinW = screenW >= 400 ? '47%' : '100%';

  const [state, setState] = useState<DestinationState | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchErrorHint, setSearchErrorHint] = useState<string | null>(null);
  const [saveAsLabel, setSaveAsLabel] = useState<string | null>(null);
  const searchRef = useRef<TextInput>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearchRef = useRef('');

  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const heroFade = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!driverId) return;
    try {
      const [sr, lr] = await Promise.all([
        fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination`, { headers: getAuthHeaders() }),
        fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination/saved`, { headers: getAuthHeaders() }),
      ]);
      if (sr.ok) {
        setState(await sr.json());
        Animated.parallel([
          Animated.spring(slideAnim, { toValue: 1, tension: 48, friction: 9, useNativeDriver: true }),
          Animated.timing(heroFade, { toValue: 1, duration: 420, useNativeDriver: true }),
        ]).start();
      }
      if (lr.ok) {
        const d = await lr.json();
        setSavedLocations(Array.isArray(d.saved) ? d.saved : []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [driverId, slideAnim, heroFade]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void load();
  }, [canCallAuthedApi, load]);

  useEffect(() => {
    const onShow = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const onHide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  useEffect(() => {
    if (!state?.active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.04,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true,
          easing: Easing.inOut(Easing.ease),
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state?.active, pulseAnim]);

  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) {
      setResults([]);
      setSearchErrorHint(null);
      return;
    }
    latestSearchRef.current = trimmed;
    setSearching(true);
    setSearchErrorHint(null);
    try {
      const r = await fetch(`${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`, {
        headers: getAuthHeaders(),
      });
      if (r.ok) {
        const d = await r.json();
        if (latestSearchRef.current !== trimmed) return;
        const preds = Array.isArray(d.predictions) ? d.predictions : [];
        const normalized = preds
          .map((p: Record<string, unknown>) => ({
            place_id: String(p.place_id ?? p.id ?? ''),
            description: String(p.description ?? p.main_text ?? ''),
            main_text: String(p.main_text ?? p.description ?? ''),
            secondary_text: String(p.secondary_text ?? ''),
          }))
          .filter((p: SearchResult) => p.place_id && (p.main_text || p.description))
          .slice(0, 8);
        if (normalized.length > 0) {
          setResults(normalized);
          return;
        }
        if (typeof d.status === 'string' && d.status !== 'OK') {
          setSearchErrorHint(
            d.status === 'REQUEST_DENIED'
              ? 'Places API denied. Check Google Maps key on the server.'
              : `Places returned ${d.status}. Trying address lookup…`
          );
        }
        const geo = await fetch(
          `${BACKEND_URL}/api/places/geocode-address?address=${encodeURIComponent(trimmed)}`,
          { headers: getAuthHeaders() }
        );
        if (latestSearchRef.current !== trimmed) return;
        if (geo.ok) {
          const gd = await geo.json();
          const lat = Number(gd.latitude);
          const lng = Number(gd.longitude);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setResults([
              {
                place_id: `geocode:${encodeURIComponent(trimmed)}`,
                description: String(gd.address || trimmed),
                main_text: String((gd.address || trimmed).split(',')[0] || trimmed),
                secondary_text: String(gd.address || ''),
                lat,
                lng,
              },
            ]);
            return;
          }
        }
        const localMatches = LOCAL_DESTINATION_FALLBACKS.filter((c) =>
          c.name.toLowerCase().includes(trimmed.toLowerCase())
        )
          .slice(0, 6)
          .map((c) => ({
            place_id: `local:${encodeURIComponent(c.name)}`,
            description: `${c.name}${c.secondary ? `, ${c.secondary}` : ''}`,
            main_text: c.name,
            secondary_text: c.secondary || 'Nigeria',
            lat: c.lat,
            lng: c.lng,
          }));
        if (localMatches.length > 0) {
          setSearchErrorHint('Showing local area matches.');
          setResults(localMatches);
          return;
        }
        setResults([]);
      } else {
        setResults([]);
      }
    } catch {
      /* silent */
    } finally {
      setSearching(false);
    }
  }, []);

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(text), 380);
  };

  const resolvePlaceId = async (result: SearchResult): Promise<{ lat: number; lng: number; address: string }> => {
    if (Number.isFinite(result.lat) && Number.isFinite(result.lng)) {
      return {
        lat: Number(result.lat),
        lng: Number(result.lng),
        address: result.description || result.main_text || '',
      };
    }
    const place_id = result.place_id;
    if (place_id.startsWith('geocode:')) {
      const raw = decodeURIComponent(place_id.replace(/^geocode:/, ''));
      const geo = await fetch(
        `${BACKEND_URL}/api/places/geocode-address?address=${encodeURIComponent(raw)}`,
        { headers: getAuthHeaders() }
      );
      if (!geo.ok) {
        const err = await geo.json().catch(() => ({}));
        throw new Error(err.detail || 'Could not resolve typed address');
      }
      const gd = await geo.json();
      const lat = Number(gd.latitude);
      const lng = Number(gd.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('No coordinates returned for this address');
      }
      return { lat, lng, address: gd.address || raw };
    }
    const r = await fetch(`${BACKEND_URL}/api/places/details/${encodeURIComponent(place_id)}`, {
      headers: getAuthHeaders(),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Could not resolve location');
    }
    const d = await r.json();
    const lat = d.latitude ?? d.lat ?? d?.result?.geometry?.location?.lat;
    const lng = d.longitude ?? d.lng ?? d?.result?.geometry?.location?.lng;
    if (!lat || !lng) throw new Error('No coordinates returned for this location');
    return { lat, lng, address: d.address || '' };
  };

  const activateDestination = async (name: string, lat: number, lng: number, label?: string) => {
    if (!driverId) return;
    const r = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        destination_lat: lat,
        destination_lng: lng,
        destination_name: name,
        saved_label: label || null,
      }),
    });
    const d = await r.json();
    if (d.blocked) {
      Alert.alert(
        'Daily limit reached',
        d.message || `You've used all ${DAILY_LIMIT} trips today. Resets at midnight.`,
        [{ text: 'OK' }]
      );
      return;
    }
    if (!r.ok) throw new Error(d.detail || 'Failed to activate');
    await load();
  };

  const saveLocation = async (label: string, name: string, lat: number, lng: number) => {
    if (!driverId) return;
    await fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination/saved`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, name, lat, lng }),
    });
    await load();
  };

  const handleSearchResult = useCallback(
    async (result: SearchResult) => {
      setShowSearch(false);
      setResults([]);
      setSearchQuery('');
      setActivating(true);
      const savedLabel = saveAsLabel;
      setSaveAsLabel(null);
      try {
        const { lat, lng } = await resolvePlaceId(result);
        const name = result.main_text || result.description;
        if (savedLabel) {
          await saveLocation(savedLabel, name, lat, lng);
          await activateDestination(name, lat, lng, savedLabel);
        } else {
          await activateDestination(name, lat, lng);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not set destination. Try again.';
        Alert.alert('Error', msg);
      } finally {
        setActivating(false);
      }
    },
    [saveAsLabel, driverId]
  );

  const handleSavedTap = useCallback(async (saved: SavedLocation) => {
    setActivating(true);
    try {
      await activateDestination(saved.name, saved.lat, saved.lng, saved.label);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not activate. Try again.';
      Alert.alert('Error', msg);
    } finally {
      setActivating(false);
    }
  }, []);

  const handleDeleteSaved = (label: string) => {
    Alert.alert(`Remove ${label}`, 'Remove this saved location?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (!driverId) return;
          await fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination/saved/${label}`, {
            method: 'DELETE',
            headers: getAuthHeaders(),
          });
          await load();
        },
      },
    ]);
  };

  const handleCancel = () => {
    Alert.alert('Turn off destination mode', 'Stop receiving trips towards your destination?', [
      { text: 'Keep active', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          if (!driverId) return;
          setCancelling(true);
          try {
            await fetch(`${BACKEND_URL}/api/drivers/${driverId}/destination`, {
              method: 'DELETE',
              headers: getAuthHeaders(),
            });
            await load();
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const openSearch = (asLabel?: string) => {
    setSaveAsLabel(asLabel || null);
    setShowSearch(true);
    setTimeout(() => searchRef.current?.focus(), 120);
  };

  const getSavedIcon = (label: string): React.ComponentProps<typeof Ionicons>['name'] => {
    if (label === 'home') return 'home';
    if (label === 'favourite' || label === 'favorite') return 'star';
    return 'location';
  };
  const getSavedColor = (label: string) => {
    if (label === 'home') return '#60A5FA';
    if (label === 'favourite' || label === 'favorite') return '#FBBF24';
    return ACCENT;
  };

  const fmtDist = (km?: number, mins?: number) => {
    if (km == null) return '';
    const d = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    return mins != null ? `${d} · ~${Math.round(mins)} min` : d;
  };

  const PRESETS: Array<{ label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = [
    { label: 'home', icon: 'home', color: '#60A5FA' },
    { label: 'favourite', icon: 'star', color: '#FBBF24' },
  ];
  const unsavedPresets = PRESETS.filter((p) => !savedLocations.some((s) => s.label === p.label));

  const statusColor = state?.limit_reached ? '#F87171' : state?.active ? ACCENT : '#94A3B8';
  const statusLabel = state?.limit_reached ? 'Limit reached' : state?.active ? 'Active' : 'Ready to set';

  const slideY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [32, 0] });

  const searchPanelMaxH = useMemo(() => Math.min(screenH * 0.88, screenH - insets.top - 24), [screenH, insets.top]);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <TabBrandStrip role="driver" />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingTxt}>Loading destination mode…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <TabBrandStrip role="driver" />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingHorizontal: flow.padH }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#F1F5F9" />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }} />
        {state?.active ? (
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.livePillTxt}>LIVE</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scrollBody,
          {
            paddingHorizontal: flow.padH,
            paddingBottom: insets.bottom + flow.sectionGap,
            maxWidth: contentMaxW,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <Animated.View style={{ opacity: heroFade }}>
          <LinearGradient colors={['rgba(37,99,235,0.35)', 'rgba(8,12,24,0)']} style={styles.heroGrad}>
            <View style={styles.heroIconRing}>
              <LinearGradient colors={['#3B82F6', '#1D4ED8']} style={styles.heroIconGrad}>
                <Ionicons name="navigate-circle" size={isNarrow ? 36 : 42} color="#FFF" />
              </LinearGradient>
            </View>
            <Text style={[styles.heroTitle, isNarrow && { fontSize: 24 }]}>Trips towards destination</Text>
            <Text style={styles.heroSub}>
              Only get offers going your way · up to {DAILY_LIMIT} matched trips per day
            </Text>
          </LinearGradient>
        </Animated.View>

        {/* Status card */}
        <Animated.View
          style={[
            styles.statusCard,
            state?.active && styles.statusCardActive,
            state?.limit_reached && styles.statusCardLimit,
            { opacity: slideAnim, transform: [{ translateY: slideY }] },
          ]}
        >
          <View style={styles.statusTopRow}>
            <View style={[styles.statusBadge, { borderColor: `${statusColor}55`, backgroundColor: `${statusColor}18` }]}>
              <View style={[styles.statusBadgeDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusBadgeTxt, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text>
            </View>
            {state ? (
              <Text style={styles.statusTripsHint}>
                {state.limit_reached
                  ? 'Resets at midnight'
                  : `${state.trips_remaining} left today`}
              </Text>
            ) : null}
          </View>

          {state ? (
            <>
              <TripProgressBar total={state.daily_limit} used={state.daily_trips} />
              <View style={styles.statGrid}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{state.daily_trips}</Text>
                  <Text style={styles.statLabel}>Used</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, { color: state.limit_reached ? '#F87171' : ACCENT }]}>
                    {state.trips_remaining}
                  </Text>
                  <Text style={styles.statLabel}>Left</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{state.daily_limit}</Text>
                  <Text style={styles.statLabel}>Daily max</Text>
                </View>
              </View>
            </>
          ) : null}

          {state?.active && state.destination_name ? (
            <Animated.View style={[styles.activeCard, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient
                colors={['rgba(52,245,184,0.16)', 'rgba(6,78,59,0.35)']}
                style={styles.activeCardGrad}
              >
                <View style={styles.activeIconWrap}>
                  <Ionicons name="flag" size={28} color={ACCENT} />
                </View>
                <View style={styles.activeTextCol}>
                  <Text style={styles.activeEyebrow}>HEADING TO</Text>
                  <Text style={styles.activeName} numberOfLines={3}>
                    {state.destination_name}
                  </Text>
                  {fmtDist(state.destination_distance_km, state.destination_duration_mins) ? (
                    <View style={styles.activeMetaRow}>
                      <Ionicons name="map-outline" size={14} color={ACCENT} />
                      <Text style={styles.activeMeta}>
                        {fmtDist(state.destination_distance_km, state.destination_duration_mins)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity
                  onPress={handleCancel}
                  style={styles.activeOffBtn}
                  disabled={cancelling}
                  accessibilityLabel="Turn off destination mode"
                >
                  {cancelling ? (
                    <ActivityIndicator size="small" color="#FCA5A5" />
                  ) : (
                    <>
                      <Ionicons name="power" size={18} color="#FCA5A5" />
                      <Text style={styles.activeOffTxt}>Off</Text>
                    </>
                  )}
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          ) : state?.limit_reached ? (
            <View style={styles.limitBox}>
              <Ionicons name="moon-outline" size={22} color="#F87171" />
              <Text style={styles.limitBoxTxt}>
                All {DAILY_LIMIT} destination trips used today. Come back after midnight.
              </Text>
            </View>
          ) : (
            <Text style={styles.inactiveHint}>Pick a destination below to start matching rides on your route.</Text>
          )}
        </Animated.View>

        {!state?.active && !state?.limit_reached ? (
          <View style={styles.howSection}>
            <Text style={styles.sectionEyebrow}>How it works</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.howScroll}>
              {[
                { icon: 'navigate' as const, color: ACCENT, title: 'Set direction', desc: 'Home, favourite, or search any area.' },
                { icon: 'git-merge' as const, color: '#60A5FA', title: 'Matched only', desc: 'Offers within ~2.5 km of your route.' },
                { icon: 'calendar' as const, color: '#FBBF24', title: `${DAILY_LIMIT} per day`, desc: 'Resets every night at midnight.' },
              ].map((step) => (
                <View key={step.title} style={[styles.howCard, { width: Math.min(260, screenW * 0.72) }]}>
                  <View style={[styles.howIcon, { backgroundColor: `${step.color}22` }]}>
                    <Ionicons name={step.icon} size={22} color={step.color} />
                  </View>
                  <Text style={styles.howTitle}>{step.title}</Text>
                  <Text style={styles.howDesc}>{step.desc}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {!state?.limit_reached ? (
          <>
            <Text style={styles.sectionEyebrow}>{state?.active ? 'Change destination' : 'Choose destination'}</Text>

            <View style={[styles.quickGrid, { gap: flow.cardPad }]}>
              {savedLocations.map((loc) => (
                <TouchableOpacity
                  key={loc.label}
                  style={[
                    styles.quickTile,
                    { minWidth: tileMinW, flexGrow: 1, flexBasis: tileMinW },
                    state?.active && state?.destination_saved_label === loc.label && styles.quickTileOn,
                  ]}
                  onPress={() => handleSavedTap(loc)}
                  activeOpacity={0.88}
                  disabled={activating}
                >
                  <View style={[styles.quickTileIcon, { backgroundColor: `${getSavedColor(loc.label)}22` }]}>
                    <Ionicons name={getSavedIcon(loc.label)} size={26} color={getSavedColor(loc.label)} />
                  </View>
                  <Text style={styles.quickTileLabel}>
                    {loc.label.charAt(0).toUpperCase() + loc.label.slice(1)}
                  </Text>
                  <Text style={styles.quickTileName} numberOfLines={2}>
                    {loc.name}
                  </Text>
                  <View style={styles.quickTileActions}>
                    <TouchableOpacity
                      onPress={() => openSearch(loc.label)}
                      hitSlop={8}
                      style={styles.quickTileActionBtn}
                    >
                      <Ionicons name="pencil" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteSaved(loc.label)}
                      hitSlop={8}
                      style={styles.quickTileActionBtn}
                    >
                      <Ionicons name="trash-outline" size={16} color="#F87171" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}

              {unsavedPresets.map((p) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.quickTile, styles.quickTileEmpty, { minWidth: tileMinW, flexGrow: 1, flexBasis: tileMinW }]}
                  onPress={() => openSearch(p.label)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.quickTileIcon, { backgroundColor: `${p.color}14`, borderStyle: 'dashed', borderWidth: 1, borderColor: `${p.color}44` }]}>
                    <Ionicons name={p.icon} size={26} color={p.color} />
                  </View>
                  <Text style={styles.quickTileLabel}>{p.label.charAt(0).toUpperCase() + p.label.slice(1)}</Text>
                  <Text style={styles.quickTileNameMuted}>Tap to add</Text>
                  <View style={[styles.addPill, { borderColor: `${p.color}66` }]}>
                    <Ionicons name="add" size={18} color={p.color} />
                    <Text style={[styles.addPillTxt, { color: p.color }]}>Add</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.searchHeroBtn} onPress={() => openSearch()} activeOpacity={0.9}>
              <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.searchHeroGrad}>
                <Ionicons name="search" size={24} color="#FFF" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.searchHeroTitle}>Search any destination</Text>
                  <Text style={styles.searchHeroSub}>Street, area, landmark, or city</Text>
                </View>
                <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.85)" />
              </LinearGradient>
            </TouchableOpacity>
          </>
        ) : null}

        {activating ? (
          <View style={styles.activatingRow}>
            <ActivityIndicator color={ACCENT} />
            <Text style={styles.activatingTxt}>Updating destination…</Text>
          </View>
        ) : null}

        {state?.active ? (
          <View style={styles.tipCard}>
            <Ionicons name="information-circle" size={20} color="#60A5FA" />
            <Text style={styles.tipTxt}>
              You'll only see requests near your route. Other offers are skipped automatically.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Search sheet */}
      <Modal visible={showSearch} transparent animationType="slide" onRequestClose={() => setShowSearch(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 6 : 0}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => {
              setShowSearch(false);
              setResults([]);
              setSearchQuery('');
              setSaveAsLabel(null);
            }}
          />
          <View
            style={[
              styles.searchSheet,
              {
                marginHorizontal: Math.max(8, flow.padH - 4),
                marginBottom: Platform.OS === 'android' ? Math.max(insets.bottom + 8, keyboardHeight + 8) : insets.bottom + 8,
                maxHeight: searchPanelMaxH,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            {saveAsLabel ? (
              <View style={styles.sheetLabelRow}>
                <Ionicons
                  name={saveAsLabel === 'home' ? 'home' : 'star'}
                  size={18}
                  color={saveAsLabel === 'home' ? '#60A5FA' : '#FBBF24'}
                />
                <Text style={styles.sheetLabelTxt}>
                  Saving as{' '}
                  <Text style={{ fontWeight: '900', color: saveAsLabel === 'home' ? '#60A5FA' : '#FBBF24' }}>
                    {saveAsLabel.charAt(0).toUpperCase() + saveAsLabel.slice(1)}
                  </Text>
                </Text>
              </View>
            ) : null}

            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={22} color="#64748B" />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                placeholder={saveAsLabel ? `Search ${saveAsLabel} address…` : 'Where are you heading?'}
                placeholderTextColor="#64748B"
                value={searchQuery}
                onChangeText={onSearchChange}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setResults([]); }}>
                  <Ionicons name="close-circle" size={22} color="#64748B" />
                </TouchableOpacity>
              ) : null}
            </View>

            <ScrollView
              style={{ maxHeight: searchPanelMaxH * 0.55 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {searching ? (
                <View style={styles.searchLoading}>
                  <ActivityIndicator color={ACCENT} />
                  <Text style={styles.searchLoadingTxt}>Searching…</Text>
                </View>
              ) : null}
              {!searching &&
                searchResults.map((r) => (
                  <TouchableOpacity
                    key={r.place_id}
                    style={styles.resultRow}
                    onPress={() => handleSearchResult(r)}
                    activeOpacity={0.85}
                    disabled={activating}
                  >
                    <View style={styles.resultIcon}>
                      <Ionicons name="location" size={20} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.resultMain} numberOfLines={2}>
                        {r.main_text || r.description}
                      </Text>
                      {r.secondary_text ? (
                        <Text style={styles.resultSub} numberOfLines={1}>
                          {r.secondary_text}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#475569" />
                  </TouchableOpacity>
                ))}
              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
                <View style={styles.searchEmpty}>
                  <Ionicons name="search-outline" size={28} color="#475569" />
                  <Text style={styles.searchEmptyTxt}>
                    {searchErrorHint || 'No places found. Try a neighbourhood or landmark.'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <TouchableOpacity
              style={styles.sheetCancelBtn}
              onPress={() => {
                setShowSearch(false);
                setResults([]);
                setSearchQuery('');
                setSaveAsLabel(null);
              }}
            >
              <Text style={styles.sheetCancelTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B18' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingTxt: { fontSize: 15, fontWeight: '600', color: '#94A3B8' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  backBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(6,78,59,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(52,245,184,0.35)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ACCENT },
  livePillTxt: { fontSize: 11, fontWeight: '900', color: ACCENT, letterSpacing: 1 },

  scrollBody: { gap: 20, paddingTop: 4 },

  heroGrad: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: 4,
  },
  heroIconRing: {
    marginBottom: 14,
    shadowColor: '#3B82F6',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  heroIconGrad: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(191,219,254,0.35)',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F8FAFC',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  heroSub: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 340,
  },

  statusCard: {
    backgroundColor: SURFACE,
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 16,
  },
  statusCardActive: {
    borderColor: 'rgba(52,245,184,0.35)',
    backgroundColor: 'rgba(6,78,59,0.12)',
  },
  statusCardLimit: {
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(127,29,29,0.12)',
  },
  statusTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusBadgeDot: { width: 8, height: 8, borderRadius: 4 },
  statusBadgeTxt: { fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  statusTripsHint: { fontSize: 13, fontWeight: '700', color: '#94A3B8' },

  statGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2,6,23,0.5)',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: BORDER },
  statValue: { fontSize: 22, fontWeight: '900', color: '#F8FAFC', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5 },

  activeCard: { borderRadius: 20, overflow: 'hidden' },
  activeCardGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    minHeight: 100,
  },
  activeIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ACCENT_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTextCol: { flex: 1, minWidth: 0, gap: 4 },
  activeEyebrow: { fontSize: 11, fontWeight: '900', color: ACCENT, letterSpacing: 1.2 },
  activeName: { fontSize: 18, fontWeight: '900', color: '#F8FAFC', lineHeight: 24 },
  activeMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  activeMeta: { fontSize: 14, fontWeight: '700', color: ACCENT },
  activeOffBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(127,29,29,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.35)',
    minWidth: 52,
  },
  activeOffTxt: { fontSize: 11, fontWeight: '800', color: '#FCA5A5' },

  limitBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(127,29,29,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
  },
  limitBoxTxt: { flex: 1, fontSize: 15, fontWeight: '600', color: '#FECACA', lineHeight: 22 },
  inactiveHint: { fontSize: 15, fontWeight: '600', color: '#64748B', lineHeight: 22 },

  howSection: { gap: 12 },
  howScroll: { gap: 12, paddingRight: 8 },
  howCard: {
    backgroundColor: SURFACE,
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 10,
    minHeight: 130,
  },
  howIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howTitle: { fontSize: 16, fontWeight: '900', color: '#E2E8F0' },
  howDesc: { fontSize: 14, fontWeight: '600', color: '#94A3B8', lineHeight: 20 },

  sectionEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  quickTile: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    padding: 18,
    minHeight: 148,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  quickTileOn: {
    borderColor: 'rgba(52,245,184,0.45)',
    backgroundColor: 'rgba(6,78,59,0.15)',
  },
  quickTileEmpty: { borderStyle: 'dashed', borderColor: 'rgba(148,163,184,0.22)' },
  quickTileIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTileLabel: { fontSize: 16, fontWeight: '900', color: '#F1F5F9' },
  quickTileName: { fontSize: 14, fontWeight: '600', color: '#94A3B8', lineHeight: 20, flex: 1 },
  quickTileNameMuted: { fontSize: 14, fontWeight: '600', color: '#64748B', fontStyle: 'italic' },
  quickTileActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  quickTileActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1.5,
    marginTop: 4,
  },
  addPillTxt: { fontSize: 13, fontWeight: '800' },

  searchHeroBtn: { borderRadius: 20, overflow: 'hidden', marginTop: 4 },
  searchHeroGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 20,
    paddingHorizontal: 20,
    minHeight: 72,
  },
  searchHeroTitle: { fontSize: 17, fontWeight: '900', color: '#FFF' },
  searchHeroSub: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 2 },

  activatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 8 },
  activatingTxt: { fontSize: 15, fontWeight: '700', color: '#94A3B8' },

  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(37,99,235,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.28)',
  },
  tipTxt: { flex: 1, fontSize: 14, fontWeight: '600', color: '#BFDBFE', lineHeight: 21 },

  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,15,0.72)' },
  searchSheet: {
    backgroundColor: '#0B1224',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: BORDER,
    paddingBottom: 12,
    overflow: 'hidden',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(148,163,184,0.35)',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingBottom: 8 },
  sheetLabelTxt: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#F1F5F9',
    padding: 0,
  },
  searchLoading: { alignItems: 'center', paddingVertical: 28, gap: 10 },
  searchLoadingTxt: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 16,
    minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ACCENT_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultMain: { fontSize: 16, fontWeight: '800', color: '#E2E8F0', lineHeight: 22 },
  resultSub: { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 2 },
  searchEmpty: { alignItems: 'center', padding: 32, gap: 12 },
  searchEmptyTxt: { fontSize: 14, fontWeight: '600', color: '#64748B', textAlign: 'center', lineHeight: 20 },
  sheetCancelBtn: { alignItems: 'center', paddingVertical: 16 },
  sheetCancelTxt: { fontSize: 16, fontWeight: '800', color: '#64748B' },
});
