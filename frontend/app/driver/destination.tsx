/**
 * Trips Towards Destination — Nexryde
 *
 * Drivers set a destination and only receive rides going their way.
 * Max 3 trips / day (configurable). Home & Favourite are saveable.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

const DAILY_LIMIT = 3;

/* ─────────────── types ─────────────── */
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
interface SavedLocation { label: string; name: string; lat: number; lng: number; }
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
  { name: 'Maryland', lat: 6.5720, lng: 3.3637, secondary: 'Lagos, Nigeria' },
  { name: 'Abuja', lat: 9.0579, lng: 7.4951, secondary: 'FCT, Nigeria' },
  { name: 'Port Harcourt', lat: 4.8156, lng: 7.0498, secondary: 'Rivers, Nigeria' },
];

/* ─────────────── trip-dots indicator ─────────────── */
function TripDots({ total, used }: { total: number; used: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            dot.base,
            i < used ? dot.used : dot.avail,
          ]}
        />
      ))}
    </View>
  );
}
const dot = StyleSheet.create({
  base:  { width: 11, height: 11, borderRadius: 5.5 },
  used:  { backgroundColor: '#22E5A0' },
  avail: { backgroundColor: 'rgba(34,229,160,0.22)', borderWidth: 1.5, borderColor: 'rgba(34,229,160,0.5)' },
});

/* ─────────────── main screen ─────────────── */
export default function DestinationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAppStore();

  const [state, setState]                   = useState<DestinationState | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [loading, setLoading]               = useState(true);
  const [activating, setActivating]         = useState(false);
  const [cancelling, setCancelling]         = useState(false);

  // search state
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setResults]       = useState<SearchResult[]>([]);
  const [searching, setSearching]         = useState(false);
  const [showSearch, setShowSearch]       = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [searchErrorHint, setSearchErrorHint] = useState<string | null>(null);
  // when set, search auto-saves result as this label (home / favourite)
  const [saveAsLabel, setSaveAsLabel]     = useState<string | null>(null);
  const searchRef   = useRef<TextInput>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearchRef = useRef('');

  // animations
  const slideAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  /* ── Load ── */
  const load = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [sr, lr] = await Promise.all([
        fetch(`${BACKEND_URL}/api/drivers/${user.id}/destination`,        { headers: getAuthHeaders() }),
        fetch(`${BACKEND_URL}/api/drivers/${user.id}/destination/saved`,  { headers: getAuthHeaders() }),
      ]);
      if (sr.ok) {
        setState(await sr.json());
        Animated.spring(slideAnim, { toValue: 1, tension: 50, friction: 9, useNativeDriver: true }).start();
      }
      if (lr.ok) {
        const d = await lr.json();
        setSavedLocations(Array.isArray(d.saved) ? d.saved : []);
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

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

  /* ── Pulse when active ── */
  useEffect(() => {
    if (!state?.active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [state?.active]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Search ── */
  const doSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || trimmed.length < 2) { setResults([]); setSearchErrorHint(null); return; }
    latestSearchRef.current = trimmed;
    setSearching(true);
    setSearchErrorHint(null);
    try {
      const r = await fetch(
        `${BACKEND_URL}/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`,
        { headers: getAuthHeaders() }
      );
      if (r.ok) {
        const d = await r.json();
        if (latestSearchRef.current !== trimmed) return;
        const preds = Array.isArray(d.predictions) ? d.predictions : [];
        const normalized = preds
          .map((p: any) => ({
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

        // Fallback: if autocomplete is denied/empty, try direct geocode by typed text.
        if (typeof d.status === 'string' && d.status !== 'OK') {
          setSearchErrorHint(
            d.status === 'REQUEST_DENIED'
              ? 'Places API denied this request. Check backend Google Maps key restrictions.'
              : `Places returned ${d.status}. Trying direct address lookup...`
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
            setResults([{
              place_id: `geocode:${encodeURIComponent(trimmed)}`,
              description: String(gd.address || trimmed),
              main_text: String((gd.address || trimmed).split(',')[0] || trimmed),
              secondary_text: String(gd.address || ''),
              lat,
              lng,
            }]);
            return;
          }
        }
        const localMatches = LOCAL_DESTINATION_FALLBACKS
          .filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
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
          setSearchErrorHint('Google Places unavailable right now — showing local fallback results.');
          setResults(localMatches);
          return;
        }
        setResults([]);
      } else {
        setResults([]);
      }
    } catch { /* silent */ }
    finally { setSearching(false); }
  }, [setSearchErrorHint]);

  const onSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(text), 380);
  };

  /* ── Resolve place_id → lat/lng ── */
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
    // ✅ FIX: path param, not query param
    const r = await fetch(
      `${BACKEND_URL}/api/places/details/${encodeURIComponent(place_id)}`,
      { headers: getAuthHeaders() }
    );
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.detail || 'Could not resolve location');
    }
    const d = await r.json();
    // ✅ FIX: backend returns { latitude, longitude, address }
    const lat = d.latitude ?? d.lat ?? d?.result?.geometry?.location?.lat;
    const lng = d.longitude ?? d.lng ?? d?.result?.geometry?.location?.lng;
    if (!lat || !lng) throw new Error('No coordinates returned for this location');
    return { lat, lng, address: d.address || '' };
  };

  /* ── Activate destination ── */
  const activateDestination = async (name: string, lat: number, lng: number, label?: string) => {
    if (!user?.id) return;
    const r = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/destination`, {
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
        'Daily Limit Reached',
        d.message || `You've used all ${DAILY_LIMIT} trips today. Resets at midnight.`,
        [{ text: 'Got it' }]
      );
      return;
    }
    if (!r.ok) throw new Error(d.detail || 'Failed to activate');
    await load();
  };

  /* ── Save a location as Home / Favourite ── */
  const saveLocation = async (label: string, name: string, lat: number, lng: number) => {
    if (!user?.id) return;
    await fetch(`${BACKEND_URL}/api/drivers/${user.id}/destination/saved`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, name, lat, lng }),
    });
    await load();
  };

  /* ── Handle search result tap ── */
  const handleSearchResult = useCallback(async (result: SearchResult) => {
    setShowSearch(false);
    setResults([]);
    setSearchQuery('');
    setActivating(true);
    const savedLabel = saveAsLabel;
    setSaveAsLabel(null);
    try {
      const { lat, lng } = await resolvePlaceId(result);
      const name = result.main_text || result.description;

      // If user tapped "Home +" or "Favourite +" → save first, then activate
      if (savedLabel) {
        await saveLocation(savedLabel, name, lat, lng);
        await activateDestination(name, lat, lng, savedLabel);
      } else {
        await activateDestination(name, lat, lng);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set destination. Try again.');
    } finally {
      setActivating(false);
    }
  }, [saveAsLabel, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handle saved location tap (activate directly) ── */
  const handleSavedTap = useCallback(async (saved: SavedLocation) => {
    setActivating(true);
    try {
      await activateDestination(saved.name, saved.lat, saved.lng, saved.label);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not activate. Try again.');
    } finally {
      setActivating(false);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Delete saved location ── */
  const handleDeleteSaved = (label: string) => {
    Alert.alert(
      `Remove ${label.charAt(0).toUpperCase() + label.slice(1)}`,
      'Remove this saved location?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!user?.id) return;
            await fetch(`${BACKEND_URL}/api/drivers/${user.id}/destination/saved/${label}`, {
              method: 'DELETE',
              headers: getAuthHeaders(),
            });
            await load();
          },
        },
      ]
    );
  };

  /* ── Cancel destination ── */
  const handleCancel = () => {
    Alert.alert('Turn Off Destination Mode', 'Stop receiving trips towards your destination?', [
      { text: 'Keep Active', style: 'cancel' },
      {
        text: 'Turn Off',
        style: 'destructive',
        onPress: async () => {
          if (!user?.id) return;
          setCancelling(true);
          try {
            await fetch(`${BACKEND_URL}/api/drivers/${user.id}/destination`, {
              method: 'DELETE', headers: getAuthHeaders(),
            });
            await load();
          } finally { setCancelling(false); }
        },
      },
    ]);
  };

  /* ── Open search ── */
  const openSearch = (asLabel?: string) => {
    setSaveAsLabel(asLabel || null);
    setShowSearch(true);
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  /* ── Helpers ── */
  const getSavedIcon = (label: string): React.ComponentProps<typeof Ionicons>['name'] => {
    if (label === 'home')                           return 'home';
    if (label === 'favourite' || label === 'favorite') return 'star';
    return 'location';
  };
  const getSavedColor = (label: string) => {
    if (label === 'home')                           return '#3B82F6';
    if (label === 'favourite' || label === 'favorite') return '#F59E0B';
    return '#22E5A0';
  };
  const fmtDist = (km?: number, mins?: number) => {
    if (km == null) return '';
    const d = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
    return mins != null ? `${d} · ~${Math.round(mins)} min` : d;
  };

  /* ── Preset presets for unsaved slots ── */
  const PRESETS: Array<{ label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }> = [
    { label: 'home',      icon: 'home',  color: '#3B82F6' },
    { label: 'favourite', icon: 'star',  color: '#F59E0B' },
  ];
  const unsavedPresets = PRESETS.filter(p => !savedLocations.some(s => s.label === p.label));

  /* ── Status ── */
  const statusColor = state?.limit_reached ? '#EF4444' : state?.active ? '#22E5A0' : '#64748B';
  const statusLabel = state?.limit_reached ? 'Limit reached' : state?.active ? 'Active' : 'Inactive';

  /* ══════════════════════════════ LOADING ══════════════════════════════ */
  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#22E5A0" />
        </View>
      </SafeAreaView>
    );
  }

  /* ══════════════════════════════ RENDER ══════════════════════════════ */
  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color="#E2E8F0" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Trips towards destination</Text>
          <Text style={s.headerSub}>Receive only rides going your way · Max {DAILY_LIMIT}/day</Text>
        </View>
        {state?.active && (
          <View style={[s.liveDot, { backgroundColor: '#22E5A020', borderColor: '#22E5A050' }]}>
            <View style={[s.liveDotInner, { backgroundColor: '#22E5A0' }]} />
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Status card ── */}
        <Animated.View
          style={[
            s.statusCard,
            state?.active       && s.cardActive,
            state?.limit_reached && s.cardLimit,
            { opacity: slideAnim, transform: [{ translateY: slideAnim.interpolate({ inputRange: [0,1], outputRange: [24,0] }) }] },
          ]}
        >
          {/* Row: badge + dots */}
          <View style={s.statusRow}>
            <View style={[s.badge, { backgroundColor: `${statusColor}18`, borderColor: `${statusColor}38` }]}>
              <View style={[s.badgeDot, { backgroundColor: statusColor }]} />
              <Text style={[s.badgeText, { color: statusColor }]}>{statusLabel.toUpperCase()}</Text>
            </View>
            {state && (
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <TripDots total={state.daily_limit} used={state.daily_trips} />
                <Text style={s.tripsLeft}>
                  {state.limit_reached
                    ? 'Resets at midnight'
                    : `${state.trips_remaining} trip${state.trips_remaining !== 1 ? 's' : ''} left today`}
                </Text>
              </View>
            )}
          </View>

          {state && (
            <View style={s.summaryRow}>
              <View style={s.summaryChip}>
                <Text style={s.summaryValue}>{state.daily_trips}</Text>
                <Text style={s.summaryLabel}>Used today</Text>
              </View>
              <View style={s.summaryChip}>
                <Text style={[s.summaryValue, { color: state.limit_reached ? '#F87171' : '#22E5A0' }]}>
                  {state.trips_remaining}
                </Text>
                <Text style={s.summaryLabel}>Remaining</Text>
              </View>
              <View style={s.summaryChip}>
                <Text style={s.summaryValue}>{state.daily_limit}</Text>
                <Text style={s.summaryLabel}>Daily limit</Text>
              </View>
            </View>
          )}

          {/* Active destination banner */}
          {state?.active && state.destination_name ? (
            <Animated.View style={[s.activeDest, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient colors={['rgba(34,229,160,0.12)', 'rgba(34,229,160,0.05)']} style={s.activeDestGrad}>
                <View style={s.activeDestIcon}>
                  <Ionicons name="flag" size={18} color="#22E5A0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.activeDestLabel}>GOING TOWARDS</Text>
                  <Text style={s.activeDestName} numberOfLines={2}>{state.destination_name}</Text>
                  {fmtDist(state.destination_distance_km, state.destination_duration_mins) !== '' && (
                    <Text style={s.activeDestMeta}>
                      <Ionicons name="navigate-outline" size={11} color="#22E5A0" /> {fmtDist(state.destination_distance_km, state.destination_duration_mins)}
                    </Text>
                  )}
                </View>
                {/* Cancel X */}
                <TouchableOpacity onPress={handleCancel} style={s.activeDestCancel} disabled={cancelling}>
                  {cancelling
                    ? <ActivityIndicator size="small" color="#EF4444" />
                    : <Ionicons name="close-circle" size={22} color="#EF4444" />
                  }
                </TouchableOpacity>
              </LinearGradient>
            </Animated.View>
          ) : state?.limit_reached ? (
            <View style={s.limitBanner}>
              <Ionicons name="time-outline" size={16} color="#EF4444" />
              <Text style={s.limitText}>
                All {DAILY_LIMIT} destination trips used today. Resets at midnight.
              </Text>
            </View>
          ) : (
            <Text style={s.inactiveHint}>
              Set a destination below to start receiving matched trips.
            </Text>
          )}
        </Animated.View>

        {/* ── How it works (collapsed when active) ── */}
        {!state?.active && !state?.limit_reached && (
          <View style={s.howCard}>
            <Text style={s.sectionLabel}>HOW IT WORKS</Text>
            {[
              { icon: 'navigate'         as const, color: '#22E5A0', title: 'Set your destination',  desc: 'Pick where you\'re heading — home, favourite, or any location.' },
              { icon: 'car-sport'        as const, color: '#3B82F6', title: 'Get matched trips',      desc: 'Only receive rides going your direction (within 2.5 km of your route).' },
              { icon: 'checkmark-circle' as const, color: '#F59E0B', title: 'Up to 3 trips/day',      desc: 'Complete up to 3 trips towards your destination. Resets daily at midnight.' },
            ].map((step, i) => (
              <View key={i} style={s.stepRow}>
                <View style={[s.stepIcon, { backgroundColor: `${step.color}18` }]}>
                  <Ionicons name={step.icon} size={18} color={step.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.stepTitle}>{step.title}</Text>
                  <Text style={s.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ── Choose / Change destination ── */}
        {!state?.limit_reached && (
          <>
            <Text style={s.sectionLabel}>
              {state?.active ? 'CHANGE DESTINATION' : 'CHOOSE DESTINATION'}
            </Text>

            {/* Saved locations */}
            {savedLocations.map((loc) => (
              <TouchableOpacity
                key={loc.label}
                style={[s.locRow, state?.active && state?.destination_saved_label === loc.label && s.locRowActive]}
                onPress={() => handleSavedTap(loc)}
                activeOpacity={0.8}
                disabled={activating}
              >
                <View style={[s.locIcon, { backgroundColor: `${getSavedColor(loc.label)}18` }]}>
                  <Ionicons name={getSavedIcon(loc.label)} size={20} color={getSavedColor(loc.label)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.locLabel}>{loc.label.charAt(0).toUpperCase() + loc.label.slice(1)}</Text>
                  <Text style={s.locName} numberOfLines={1}>{loc.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TouchableOpacity
                    style={s.locEditBtn}
                    onPress={() => openSearch(loc.label)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="pencil-outline" size={14} color="#64748B" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.locEditBtn}
                    onPress={() => handleDeleteSaved(loc.label)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  </TouchableOpacity>
                  <Ionicons name="chevron-forward" size={16} color="#334155" />
                </View>
              </TouchableOpacity>
            ))}

            {/* Unsaved preset slots (Home, Favourite if not set) */}
            {unsavedPresets.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={s.locRowUnset}
                onPress={() => openSearch(p.label)}
                activeOpacity={0.8}
              >
                <View style={[s.locIcon, { backgroundColor: `${p.color}12` }]}>
                  <Ionicons name={p.icon} size={20} color={p.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.locLabel}>{p.label.charAt(0).toUpperCase() + p.label.slice(1)}</Text>
                  <Text style={s.locNameMuted}>Not set — tap to add</Text>
                </View>
                <View style={[s.addChip, { borderColor: `${p.color}50` }]}>
                  <Ionicons name="add" size={16} color={p.color} />
                  <Text style={[s.addChipText, { color: p.color }]}>Add</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Search any location */}
            <TouchableOpacity style={s.searchTrigger} onPress={() => openSearch()} activeOpacity={0.8}>
              <View style={[s.locIcon, { backgroundColor: 'rgba(148,163,184,0.1)' }]}>
                <Ionicons name="search" size={18} color="#94A3B8" />
              </View>
              <Text style={s.locLabel}>Set destination</Text>
              <Ionicons name="chevron-forward" size={16} color="#334155" />
            </TouchableOpacity>
          </>
        )}

        {/* ── Activating spinner ── */}
        {activating && (
          <View style={s.activatingRow}>
            <ActivityIndicator size="small" color="#22E5A0" />
            <Text style={s.activatingText}>Setting destination...</Text>
          </View>
        )}

        {/* ── Tip when active ── */}
        {state?.active && (
          <View style={s.tipRow}>
            <Ionicons name="information-circle-outline" size={15} color="#3B82F6" />
            <Text style={s.tipText}>
              You'll only receive ride requests within 2.5 km of your route. Non-matching trips are automatically skipped.
            </Text>
          </View>
        )}
      </ScrollView>

      <Modal visible={showSearch} transparent animationType="fade" onRequestClose={() => setShowSearch(false)}>
        <KeyboardAvoidingView
          style={s.searchModalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <TouchableOpacity
            style={s.searchBackdrop}
            activeOpacity={1}
            onPress={() => { setShowSearch(false); setResults([]); setSearchQuery(''); setSaveAsLabel(null); }}
          />
          <View
            style={[
              s.searchPanel,
              {
                marginBottom:
                  Platform.OS === 'android'
                    ? Math.max(insets.bottom + 8, keyboardHeight + 8)
                    : insets.bottom + 10,
              },
            ]}
          >
            {/* Search label */}
            {saveAsLabel && (
              <View style={s.searchLabelRow}>
                <Ionicons
                  name={saveAsLabel === 'home' ? 'home' : 'star'}
                  size={14}
                  color={saveAsLabel === 'home' ? '#3B82F6' : '#F59E0B'}
                />
                <Text style={s.searchLabelText}>
                  Setting{' '}
                  <Text style={{ color: saveAsLabel === 'home' ? '#3B82F6' : '#F59E0B', fontWeight: '800' }}>
                    {saveAsLabel.charAt(0).toUpperCase() + saveAsLabel.slice(1)}
                  </Text>
                </Text>
              </View>
            )}

            {/* Input row */}
            <View style={s.searchInputRow}>
              <Ionicons name="search" size={18} color="#64748B" />
              <TextInput
                ref={searchRef}
                style={s.searchInput}
                placeholder={`Search${saveAsLabel ? ` for your ${saveAsLabel}...` : ' for a destination...'}`}
                placeholderTextColor="#475569"
                value={searchQuery}
                onChangeText={onSearchChange}
                autoFocus
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchQuery(''); setResults([]); }}>
                  <Ionicons name="close-circle" size={18} color="#475569" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={s.searchResultsWrap}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {searching && (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#22E5A0" />
                </View>
              )}

              {!searching && searchResults.map((r) => (
                <TouchableOpacity
                  key={r.place_id}
                  style={s.searchResult}
                  onPress={() => handleSearchResult(r)}
                  activeOpacity={0.8}
                  disabled={activating}
                >
                  <View style={s.searchResultIcon}>
                    <Ionicons name="location-outline" size={16} color="#64748B" />
                  </View>
                  <View style={s.searchResultTextWrap}>
                    <Text style={s.searchResultMain} numberOfLines={1}>
                      {r.main_text || r.description}
                    </Text>
                    {!!r.secondary_text && (
                      <Text style={s.searchResultSub} numberOfLines={1}>{r.secondary_text}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
                <View style={s.searchEmptyWrap}>
                  <Ionicons name="search-outline" size={15} color="#64748B" />
                  <Text style={s.searchEmptyText}>
                    {searchErrorHint || 'No locations found. Try a street, area, or landmark.'}
                  </Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={s.searchCancel}
              onPress={() => { setShowSearch(false); setResults([]); setSearchQuery(''); setSaveAsLabel(null); }}
            >
              <Text style={s.searchCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ─────────────────── styles ─────────────────── */
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080c18' },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#E2E8F0', letterSpacing: 0.2 },
  headerSub:   { fontSize: 12, fontWeight: '500', color: '#64748B', marginTop: 3, lineHeight: 17 },
  liveDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  liveDotInner: { width: 8, height: 8, borderRadius: 4 },

  /* Body */
  body: { paddingHorizontal: 20, paddingTop: 20, gap: 16 },

  /* Status card */
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    gap: 14,
  },
  cardActive: { borderColor: 'rgba(34,229,160,0.3)',  backgroundColor: 'rgba(34,229,160,0.04)' },
  cardLimit:  { borderColor: 'rgba(239,68,68,0.3)',   backgroundColor: 'rgba(239,68,68,0.04)' },
  statusRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1,
  },
  badgeDot:  { width: 7, height: 7, borderRadius: 3.5 },
  badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  tripsLeft: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  summaryRow: { flexDirection: 'row', gap: 9 },
  summaryChip: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  summaryValue: { fontSize: 16, fontWeight: '900', color: '#E2E8F0' },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: '#64748B', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },

  /* Active destination */
  activeDest:     { borderRadius: 18, overflow: 'hidden' },
  activeDestGrad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  activeDestIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(34,229,160,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  activeDestLabel: { fontSize: 10, fontWeight: '800', color: '#22E5A0', letterSpacing: 1, marginBottom: 2 },
  activeDestName:  { fontSize: 15, fontWeight: '800', color: '#F1F5F9', lineHeight: 20 },
  activeDestMeta:  { fontSize: 12, fontWeight: '600', color: '#22E5A0', marginTop: 3 },
  activeDestCancel:{ padding: 4 },

  /* Limit / inactive */
  limitBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  limitText:    { flex: 1, fontSize: 13, fontWeight: '600', color: '#FCA5A5', lineHeight: 18 },
  inactiveHint: { fontSize: 13, color: '#475569', lineHeight: 18 },

  /* How it works */
  howCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20, padding: 18, borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)', gap: 16,
  },
  stepRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepIcon:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepTitle: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginBottom: 2 },
  stepDesc:  { fontSize: 12, color: '#64748B', lineHeight: 17 },

  /* Section label */
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#475569',
    letterSpacing: 1.2, marginTop: 4, marginBottom: 8,
  },

  /* Location rows */
  locRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, padding: 16,
    minHeight: 72,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  locRowActive: { borderColor: 'rgba(34,229,160,0.35)', backgroundColor: 'rgba(34,229,160,0.05)' },
  locRowUnset: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16, padding: 16,
    minHeight: 72,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },
  locIcon:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  locLabel:     { fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginBottom: 2 },
  locName:      { fontSize: 12, color: '#64748B', lineHeight: 17 },
  locNameMuted: { fontSize: 12, color: '#475569', fontStyle: 'italic' },
  locEditBtn:   { padding: 10, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10 },

  addChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1.5,
  },
  addChipText: { fontSize: 12, fontWeight: '700' },

  /* Search trigger */
  searchTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16, padding: 16, minHeight: 72,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },

  /* Search panel */
  searchModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  searchBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,15,0.64)',
  },
  searchPanel: {
    backgroundColor: 'rgba(8,13,27,0.99)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.24)',
    overflow: 'hidden',
    marginHorizontal: 12,
    maxHeight: '78%',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -3 },
    elevation: 16,
  },
  searchLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4,
  },
  searchLabelText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  searchInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 18, paddingVertical: 13,
    minHeight: 56,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  searchResultsWrap: {
    maxHeight: 330,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#E2E8F0',
    padding: 0,
    paddingVertical: 4,
    textAlignVertical: 'center',
  },
  searchResult: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 15,
    minHeight: 68,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  searchResultIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  searchResultTextWrap: { flex: 1, paddingRight: 4 },
  searchResultMain: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', lineHeight: 19 },
  searchResultSub:  { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 16 },
  searchEmptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchEmptyText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  searchCancel:     { paddingVertical: 14, alignItems: 'center' },
  searchCancelText: { fontSize: 14, fontWeight: '700', color: '#64748B' },

  /* Misc */
  activatingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', paddingVertical: 16 },
  activatingText:{ fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  tipRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)',
  },
  tipText: { flex: 1, fontSize: 12, color: '#93C5FD', lineHeight: 17 },
});
