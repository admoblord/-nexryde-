/**
 * Nexryde Demand Heatmap
 * Live heat circles on a map + ranked zone cards + hourly forecast.
 * Auto-detects driver GPS, passes to backend for city-accurate zones.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Animated,
  Easing,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapView, { Circle, Marker, PROVIDER_GOOGLE, MapStyleElement } from 'react-native-maps';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useAuthedApiReady } from '@/src/hooks/useAuthedApiReady';

// ── Types ────────────────────────────────────────────────────────────────────

interface HeatZone {
  lat: number;
  lng: number;
  intensity: number;
  name: string;
  surge: number;
  demand_level?: string;
}

interface HeatmapData {
  city: string;
  zones: HeatZone[];
  updated_at: string;
  recommendation: string;
  /** True when zones are generated on-device (API failed or returned no coordinates). */
  isEstimate?: boolean;
}

/** Lagos macro areas — kept in sync with backend NIGERIAN_CITIES.lagos.zones for consistent naming. */
const LAGOS_ZONE_NAMES = ['Victoria Island', 'Lekki', 'Ikeja', 'Surulere', 'Oshodi', 'Apapa'];

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic “hot spots” around a center when the API is unreachable or returns bad coords. */
function buildFallbackZones(baseLat: number, baseLng: number, hourSeed: number): HeatZone[] {
  const rand = mulberry32((hourSeed * 31 + Math.round(baseLat * 1000 + baseLng * 1000)) >>> 0);
  return LAGOS_ZONE_NAMES.map((name, i) => {
    const intensity = Math.min(0.95, Math.max(0.52, 0.58 + rand() * 0.37 - i * 0.02));
    const surge = Math.min(1.5, 1 + rand() * 0.48);
    const dlat = (rand() - 0.5) * 0.088;
    const dlng = (rand() - 0.5) * 0.11;
    return {
      lat: Math.round((baseLat + dlat) * 10000) / 10000,
      lng: Math.round((baseLng + dlng) * 10000) / 10000,
      intensity,
      name,
      surge: Math.round(surge * 10) / 10,
      demand_level: intensity > 0.8 ? 'very_high' : intensity > 0.65 ? 'high' : 'medium',
    };
  });
}

async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 12000, ...rest } = init;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── Demand config ────────────────────────────────────────────────────────────

function getDemandConfig(intensity: number) {
  if (intensity >= 0.85) return { label: 'Very High', color: '#EF4444', mapColor: 'rgba(239,68,68,0.22)', ring: 'rgba(239,68,68,0.5)', radius: 900 };
  if (intensity >= 0.65) return { label: 'High',      color: '#F97316', mapColor: 'rgba(249,115,22,0.20)', ring: 'rgba(249,115,22,0.45)', radius: 700 };
  if (intensity >= 0.45) return { label: 'Medium',    color: '#FBBF24', mapColor: 'rgba(251,191,36,0.18)', ring: 'rgba(251,191,36,0.4)', radius: 550 };
  return                          { label: 'Low',       color: '#22C55E', mapColor: 'rgba(34,197,94,0.14)', ring: 'rgba(34,197,94,0.35)', radius: 400 };
}

// ── Dark map style ───────────────────────────────────────────────────────────

const DARK_MAP: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748b' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1e3a5f' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#1d4ed8' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0ea5e9', lightness: -60 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#0f1f35' }] },
];

// ── Hourly forecast data (time-of-day demand pattern) ────────────────────────

const HOUR_LABELS = ['6a', '7a', '8a', '9a', '10a', '12p', '2p', '4p', '5p', '6p', '7p', '8p', '9p', '10p'];
const HOUR_VALUES = [0.3, 0.8, 0.95, 0.7, 0.45, 0.5, 0.4, 0.6, 0.9, 0.95, 0.85, 0.7, 0.5, 0.3];
const HOUR_REAL  = [6,   7,   8,    9,   10,   12,  14,  16,  17,  18,  19,  20,  21,  22];

// ── Zone rank card with animated bar ─────────────────────────────────────────

function ZoneCard({ zone, rank, onNavigate }: { zone: HeatZone; rank: number; onNavigate: () => void }) {
  const cfg = getDemandConfig(zone.intensity);
  const barAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barAnim, {
      toValue: zone.intensity,
      duration: 700 + rank * 80,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [zone.intensity, rank]);

  const barWidth = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={[zs.card, { borderLeftColor: cfg.color }]}>
      <View style={zs.top}>
        {/* Rank */}
        <View style={[zs.rank, { backgroundColor: cfg.color + '22' }]}>
          <Text style={[zs.rankText, { color: cfg.color }]}>#{rank + 1}</Text>
        </View>

        {/* Info */}
        <View style={zs.info}>
          <Text style={zs.name} numberOfLines={1}>{zone.name}</Text>
          <Text style={[zs.level, { color: cfg.color }]}>{cfg.label} Demand</Text>
        </View>

        {/* Surge badge */}
        {zone.surge > 1.05 && (
          <View style={zs.surge}>
            <Ionicons name="flash" size={13} color="#F59E0B" />
            <Text style={zs.surgeText}>{zone.surge.toFixed(1)}×</Text>
          </View>
        )}

        {/* Navigate */}
        <TouchableOpacity style={zs.navBtn} onPress={onNavigate}>
          <Ionicons name="navigate" size={14} color="#6366F1" />
          <Text style={zs.navText}>Go</Text>
        </TouchableOpacity>
      </View>

      {/* Animated demand bar */}
      <View style={zs.barTrack}>
        <Animated.View style={[zs.bar, { width: barWidth, backgroundColor: cfg.color }]} />
      </View>

      <Text style={zs.pct}>{Math.round(zone.intensity * 100)}% demand</Text>
    </View>
  );
}

// ── Hourly bar chart ──────────────────────────────────────────────────────────

function HourlyForecast({ city }: { city: string }) {
  const currentHour = new Date().getHours();
  const barAnims = useRef(HOUR_VALUES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(35, barAnims.map((a, i) =>
      Animated.timing(a, { toValue: HOUR_VALUES[i], duration: 500, useNativeDriver: false, easing: Easing.out(Easing.quad) })
    )).start();
  }, []);

  return (
    <View style={hs.wrap}>
      <Text style={hs.title}>Hourly Demand Forecast</Text>
      <Text style={hs.sub}>{city} · Today</Text>
      <View style={hs.chart}>
        {HOUR_LABELS.map((label, i) => {
          const isNow = Math.abs(HOUR_REAL[i] - currentHour) <= 1;
          const cfg = getDemandConfig(HOUR_VALUES[i]);
          const barH = barAnims[i].interpolate({ inputRange: [0, 1], outputRange: [4, 52] });
          return (
            <View key={label} style={hs.col}>
              <Animated.View style={[hs.bar, { height: barH, backgroundColor: isNow ? '#6366F1' : cfg.color, opacity: isNow ? 1 : 0.75 }]} />
              <Text style={[hs.label, isNow && hs.labelNow]}>{label}</Text>
              {isNow && <View style={hs.nowDot} />}
            </View>
          );
        })}
      </View>
      <View style={hs.legend}>
        {[
          { color: '#EF4444', label: 'Very High' },
          { color: '#F97316', label: 'High' },
          { color: '#FBBF24', label: 'Medium' },
          { color: '#22C55E', label: 'Low' },
          { color: '#6366F1', label: 'Now' },
        ].map(l => (
          <View key={l.label} style={hs.legendItem}>
            <View style={[hs.dot, { backgroundColor: l.color }]} />
            <Text style={hs.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function DriverHeatmapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { canCallAuthedApi } = useAuthedApiReady();
  const mapHeight = Math.round(flow.width * 0.65);
  const mapEdge = Math.max(10, flow.padH);
  const mapRef = useRef<MapView>(null);

  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');
  const [fetchHint, setFetchHint] = useState<string | null>(null);
  const [driverCoords, setDriverCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const spinLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startSpin = useCallback(() => {
    spinAnim.setValue(0);
    spinLoop.current = Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.linear })
    );
    spinLoop.current.start();
  }, [spinAnim]);

  const stopSpin = useCallback(() => {
    spinLoop.current?.stop();
    spinAnim.setValue(0);
  }, [spinAnim]);

  const getFreshCoords = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }, []);

  const loadHeatmap = useCallback(async (coords?: { lat: number; lng: number }) => {
    if (!canCallAuthedApi) {
      setLoading(false);
      return;
    }
    startSpin();
    setFetchHint(null);
    try {
      const fresh = coords ?? await getFreshCoords();
      const loc = fresh || driverCoords;
      const center = loc ?? { lat: 6.5244, lng: 3.3792 };
      if (fresh) setDriverCoords(fresh);

      const params = loc ? `?lat=${encodeURIComponent(loc.lat)}&lng=${encodeURIComponent(loc.lng)}` : '';
      let raw: HeatZone[] = [];
      let cityName = '';
      let rec = '';
      let updatedIso = '';
      let fromApi = false;
      let backendErrHint: string | null = null;

      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/driver/heatmap${params}`, {
          headers: getAuthHeaders(),
          timeoutMs: 12000,
        });
        const text = await res.text();
        if (!res.ok) {
          backendErrHint =
            res.status === 401
              ? 'Sign in required to refresh live data.'
              : `Server error (${res.status}). Showing offline estimate.`;
          throw new Error('HTTP ' + res.status);
        }
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(text) as Record<string, unknown>;
        } catch {
          backendErrHint = 'Invalid response from server. Showing offline estimate.';
          throw new Error('INVALID_JSON');
        }
        raw = (Array.isArray(json.zones) ? json.zones : [])
          .map((z: Record<string, unknown>) => ({
            lat:          Number(z.lat ?? z.latitude ?? 0),
            lng:          Number(z.lng ?? z.longitude ?? 0),
            intensity:    Math.min(1, Math.max(0, Number(z.intensity ?? 0.5))),
            name:         String(z.zone_name ?? z.name ?? 'Hot zone'),
            surge:        Number(z.surge_multiplier ?? z.surge ?? 1),
            demand_level: typeof z.demand_level === 'string' ? z.demand_level : undefined,
          }))
          .filter((z) =>
            Number.isFinite(z.lat) &&
            Number.isFinite(z.lng) &&
            Math.abs(z.lat) <= 90 &&
            Math.abs(z.lng) <= 180 &&
            !(Math.abs(z.lat) < 0.00001 && Math.abs(z.lng) < 0.00001)
          );
        cityName = typeof json.city === 'string' ? json.city : '';
        rec = typeof json.recommendation === 'string' ? json.recommendation : '';
        updatedIso = typeof json.updated_at === 'string' ? json.updated_at : '';
        fromApi = true;
      } catch {
        raw = [];
        if (!backendErrHint)
          backendErrHint = 'Network error or timeout. Showing offline estimate.';
      }

      let isEstimate = false;
      if (raw.length === 0) {
        const hourSeed = new Date().getHours();
        raw = buildFallbackZones(center.lat, center.lng, hourSeed);
        isEstimate = true;
        if (!cityName) cityName = loc ? 'Metro area' : 'Lagos';
        if (!rec) {
          const top = raw[0]?.name ?? 'central hotspots';
          rec = `Estimated demand — head toward ${top} for the best shot at requests nearby. Pull to refresh for live data.`;
        }
        setFetchHint(
          backendErrHint ??
            (fromApi
              ? 'Live zones unavailable. Showing offline estimate.'
              : 'Could not load live heatmap. Showing offline estimate.')
        );
      } else {
        setFetchHint(null);
      }

      const sorted = [...raw].sort((a, b) => b.intensity - a.intensity);
      setData({
        city:           cityName || 'Lagos',
        zones:          sorted,
        updated_at:     updatedIso || new Date().toISOString(),
        recommendation: rec || `Focus on ${sorted[0]?.name ?? 'top zones'} for stronger demand.`,
        isEstimate,
      });
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      if (sorted.length > 0 && mapRef.current) {
        setTimeout(() => {
          mapRef.current?.fitToCoordinates(
            sorted.map(z => ({ latitude: z.lat, longitude: z.lng })),
            { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true }
          );
        }, 400);
      }
    } catch (e) {
      if (__DEV__) console.warn('[heatmap]', e);
      const center = driverCoords ?? { lat: 6.5244, lng: 3.3792 };
      const raw = buildFallbackZones(center.lat, center.lng, new Date().getHours());
      setData({
        city: 'Lagos',
        zones: raw.sort((a, b) => b.intensity - a.intensity),
        updated_at: new Date().toISOString(),
        recommendation: 'Estimated demand — pick a hotspot below and tap Go to open navigation.',
        isEstimate: true,
      });
      setFetchHint('Could not refresh heatmap. Showing offline estimate.');
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setLoading(false);
      stopSpin();
    }
  }, [canCallAuthedApi, driverCoords, getFreshCoords, startSpin, stopSpin]);

  // Get GPS on mount, then fetch
  useEffect(() => {
    if (!canCallAuthedApi) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDriverCoords(coords);
          await loadHeatmap(coords);
          return;
        }
      } catch { /* fall through */ }
      await loadHeatmap();
    })();

    const interval = setInterval(() => { void loadHeatmap(); }, 45000);
    return () => clearInterval(interval);
  }, [canCallAuthedApi, loadHeatmap]);

  const onRefresh = useCallback(async () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await loadHeatmap();
    setRefreshing(false);
  }, [loadHeatmap]);

  const navigateTo = (zone: HeatZone) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${zone.lat},${zone.lng}`,
      android: `geo:0,0?q=${zone.lat},${zone.lng}(${encodeURIComponent(zone.name)})`,
    }) || `https://www.google.com/maps/dir/?api=1&destination=${zone.lat},${zone.lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${zone.lat},${zone.lng}`)
    );
  };

  const focusZone = (zone: HeatZone, idx: number) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    setSelectedZone(idx === selectedZone ? null : idx);
    mapRef.current?.animateToRegion({
      latitude: zone.lat,
      longitude: zone.lng,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }, 400);
  };

  const spinInterp = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const topZones = data?.zones ?? [];
  const city = data?.city ?? (loading ? 'Loading…' : 'Near you');
  const forecastCity = data?.city && data.city !== 'Loading…' ? data.city : 'Lagos metro';

  // Default region (Lagos)
  const defaultRegion = {
    latitude: driverCoords?.lat ?? 6.5244,
    longitude: driverCoords?.lng ?? 3.3792,
    latitudeDelta: 0.18,
    longitudeDelta: 0.18,
  };

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6, paddingHorizontal: flow.padH }]}>
        <TouchableOpacity style={s.iconBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Demand Heatmap</Text>
          <Text style={s.headerSub}>{city}{lastUpdated ? ` · ${lastUpdated}` : ''}</Text>
        </View>
        <TouchableOpacity style={s.iconBtn} onPress={() => void onRefresh()}>
          <Animated.View style={{ transform: [{ rotate: spinInterp }] }}>
            <Ionicons name="refresh" size={20} color="#6366F1" />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {(fetchHint || data?.isEstimate) && (
        <View style={[s.hintBanner, !fetchHint && s.hintBannerMuted, { marginHorizontal: flow.padH }]}>
          <Ionicons
            name={fetchHint ? 'warning-outline' : 'radio-outline'}
            size={16}
            color={fetchHint ? '#F59E0B' : '#818cf8'}
          />
          <Text style={s.hintText}>
            {fetchHint ?? 'Illustrative demand hotspots — refreshed every time you pull down.'}
          </Text>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        contentContainerStyle={[
          s.content,
          {
            paddingHorizontal: flow.padH,
            paddingBottom: insets.bottom + 24,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      >

        {/* ── LIVE MAP ──────────────────────────────────────────────────── */}
        <View style={s.mapWrap}>
          {Platform.OS !== 'web' ? (
            <MapView
              ref={mapRef}
              style={[s.map, { height: mapHeight }]}
              provider={PROVIDER_GOOGLE}
              customMapStyle={DARK_MAP}
              initialRegion={defaultRegion}
              scrollEnabled
              zoomEnabled
              rotateEnabled={false}
              pitchEnabled={false}
              showsUserLocation
              showsMyLocationButton={false}
              showsCompass={false}
              toolbarEnabled={false}
            >
              {topZones.map((zone, i) => {
                const cfg = getDemandConfig(zone.intensity);
                const isSelected = selectedZone === i;
                return (
                  <React.Fragment key={`zone-${i}`}>
                    {/* Outer glow ring */}
                    <Circle
                      center={{ latitude: zone.lat, longitude: zone.lng }}
                      radius={cfg.radius * 1.6}
                      fillColor={cfg.mapColor.replace('0.2', '0.06').replace('0.18', '0.05').replace('0.14', '0.04').replace('0.22', '0.07')}
                      strokeColor="transparent"
                    />
                    {/* Main heat circle */}
                    <Circle
                      center={{ latitude: zone.lat, longitude: zone.lng }}
                      radius={isSelected ? cfg.radius * 1.2 : cfg.radius}
                      fillColor={cfg.mapColor}
                      strokeColor={cfg.ring}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                    {/* Zone name marker */}
                    <Marker
                      coordinate={{ latitude: zone.lat, longitude: zone.lng }}
                      anchor={{ x: 0.5, y: 0.5 }}
                      tracksViewChanges={false}
                      onPress={() => focusZone(zone, i)}
                    >
                      <View style={[ms.pin, { backgroundColor: cfg.color + 'EE', borderColor: cfg.color }]}>
                        <Text style={ms.pinText} numberOfLines={1}>{zone.name.split(' ')[0]}</Text>
                        {zone.surge > 1.05 && (
                          <View style={ms.surgeDot}>
                            <Text style={ms.surgeDotText}>{zone.surge.toFixed(1)}×</Text>
                          </View>
                        )}
                      </View>
                    </Marker>
                  </React.Fragment>
                );
              })}
            </MapView>
          ) : (
            <View style={[s.map, s.webFallback, { height: mapHeight }]}>
              <Ionicons name="map" size={32} color="#475569" />
              <Text style={s.webFallbackText}>Map preview not available on web</Text>
            </View>
          )}

          {/* Live indicator */}
          <View style={[s.liveChip, { left: mapEdge }]}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>LIVE</Text>
          </View>

          {/* Zone count chip */}
          {topZones.length > 0 && (
            <View style={[s.zoneChip, { right: mapEdge }]}>
              <Ionicons name="location" size={12} color="#6366F1" />
              <Text style={s.zoneChipText}>{topZones.length} hot zones</Text>
            </View>
          )}
        </View>

        {/* ── AI RECOMMENDATION ─────────────────────────────────────────── */}
        {data?.recommendation ? (
          <LinearGradient colors={['rgba(99,102,241,0.15)', 'rgba(139,92,246,0.08)']} style={s.recCard}>
            <View style={s.recIcon}>
              <Ionicons name="bulb" size={22} color="#FBBF24" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.recLabel}>AI Recommendation</Text>
              <Text style={s.recText}>{data.recommendation}</Text>
            </View>
          </LinearGradient>
        ) : loading ? (
          <View style={s.recCard}>
            <View style={[s.recIcon, { backgroundColor: '#1e293b' }]}>
              <Ionicons name="bulb-outline" size={22} color="#475569" />
            </View>
            <Text style={{ color: '#475569', fontSize: 13 }}>Loading recommendation…</Text>
          </View>
        ) : null}

        {/* ── HOURLY FORECAST ───────────────────────────────────────────── */}
        <HourlyForecast city={forecastCity} />

        {/* ── ZONE RANKINGS ─────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Hot Zones</Text>
            <Text style={s.sectionSub}>Tap a zone to focus map</Text>
          </View>

          {loading && topZones.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="hourglass-outline" size={28} color="#475569" />
              <Text style={s.emptyText}>Loading zones…</Text>
            </View>
          ) : topZones.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="map-outline" size={28} color="#475569" />
              <Text style={s.emptyText}>No zones to show</Text>
              <Text style={s.emptySub}>Check connection and try again.</Text>
              <TouchableOpacity style={s.retryBtn} onPress={() => void onRefresh()}>
                <Text style={s.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            topZones.map((zone, i) => (
              <TouchableOpacity key={zone.name + i} onPress={() => focusZone(zone, i)} activeOpacity={0.88}>
                <View style={selectedZone === i ? s.zoneSelected : undefined}>
                  <ZoneCard
                    zone={zone}
                    rank={i}
                    onNavigate={() => navigateTo(zone)}
                  />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* ── PEAK HOURS SUMMARY ────────────────────────────────────────── */}
        <View style={s.peakCard}>
          <Text style={s.sectionTitle}>Peak Windows Today</Text>
          <View style={s.peakRow}>
            <View style={s.peakItem}>
              <LinearGradient colors={['#78350f', '#92400e']} style={s.peakIcon}>
                <Ionicons name="sunny" size={18} color="#FCD34D" />
              </LinearGradient>
              <Text style={s.peakTime}>7AM – 10AM</Text>
              <Text style={s.peakLabel}>Morning Rush</Text>
              <View style={s.peakBadge}>
                <Text style={s.peakBadgeText}>95% demand</Text>
              </View>
            </View>

            <View style={s.peakDivider} />

            <View style={s.peakItem}>
              <LinearGradient colors={['#1e1b4b', '#3730a3']} style={s.peakIcon}>
                <Ionicons name="moon" size={18} color="#818cf8" />
              </LinearGradient>
              <Text style={s.peakTime}>5PM – 8PM</Text>
              <Text style={s.peakLabel}>Evening Rush</Text>
              <View style={[s.peakBadge, { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: '#6366f155' }]}>
                <Text style={[s.peakBadgeText, { color: '#818cf8' }]}>90% demand</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── LEGEND ────────────────────────────────────────────────────── */}
        <View style={s.legendCard}>
          <Text style={s.legendTitle}>DEMAND LEVEL KEY</Text>
          <View style={s.legendRow}>
            {[
              { color: '#EF4444', label: 'Very High' },
              { color: '#F97316', label: 'High' },
              { color: '#FBBF24', label: 'Medium' },
              { color: '#22C55E', label: 'Low' },
            ].map(l => (
              <View key={l.label} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: l.color }]} />
                <Text style={s.legendLabel}>{l.label}</Text>
              </View>
            ))}
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

// ── Zone card styles ──────────────────────────────────────────────────────────

const zs = StyleSheet.create({
  card: { backgroundColor: '#111827', borderRadius: 14, padding: 14, marginBottom: 10, borderLeftWidth: 3, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#1e293b' },
  top:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  rank: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 12, fontWeight: '900' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  level:{ fontSize: 12, fontWeight: '700', marginTop: 2 },
  surge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  surgeText: { fontSize: 12, fontWeight: '800', color: '#F59E0B' },
  navBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(99,102,241,0.12)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  navText: { fontSize: 12, fontWeight: '800', color: '#6366F1' },
  barTrack: { height: 5, backgroundColor: '#1e293b', borderRadius: 3, overflow: 'hidden', marginBottom: 5 },
  bar:      { height: '100%', borderRadius: 3 },
  pct: { fontSize: 11, fontWeight: '700', color: '#64748b' },
});

// ── Hourly chart styles ───────────────────────────────────────────────────────

const hs = StyleSheet.create({
  wrap:  { backgroundColor: '#111827', borderRadius: 16, padding: 16, marginHorizontal: 0, marginBottom: 12, borderWidth: 1, borderColor: '#1e293b' },
  title: { fontSize: 15, fontWeight: '800', color: '#f8fafc', marginBottom: 2 },
  sub:   { fontSize: 12, color: '#64748b', marginBottom: 14 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 68 },
  col:   { flex: 1, alignItems: 'center', justifyContent: 'flex-end', position: 'relative' },
  bar:   { width: '80%', borderRadius: 3, minHeight: 4 },
  label: { fontSize: 8, fontWeight: '700', color: '#475569', marginTop: 4 },
  labelNow: { color: '#6366F1' },
  nowDot: { position: 'absolute', bottom: -2, width: 5, height: 5, borderRadius: 3, backgroundColor: '#6366F1' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, fontWeight: '700', color: '#94a3b8' },
});

// ── Map marker styles ─────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  pin: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1.5, maxWidth: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4, elevation: 5,
  },
  pinText: { fontSize: 11, fontWeight: '900', color: '#fff' },
  surgeDot: { backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 },
  surgeDotText: { fontSize: 9, fontWeight: '800', color: '#FCD34D' },
});

// ── Main styles ───────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D1420' },
  content: { gap: 0 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, backgroundColor: '#0D1420', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1e293b' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#f8fafc' },
  headerSub:   { fontSize: 11, color: '#64748b', marginTop: 1 },

  hintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.22)',
  },
  hintBannerMuted: {
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderColor: 'rgba(99,102,241,0.25)',
  },
  hintText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#94a3b8', lineHeight: 17 },

  // Map
  mapWrap: { position: 'relative', marginBottom: 12 },
  map:     { width: '100%' },
  webFallback: { backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', gap: 8 },
  webFallbackText: { color: '#475569', fontSize: 13 },
  liveChip: { position: 'absolute', top: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(13,20,32,0.85)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  liveDot:  { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
  liveText: { fontSize: 10, fontWeight: '900', color: '#22c55e', letterSpacing: 1 },
  zoneChip: { position: 'absolute', top: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(13,20,32,0.85)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)' },
  zoneChipText: { fontSize: 10, fontWeight: '800', color: '#818cf8' },

  // Recommendation
  recCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginHorizontal: 0, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(99,102,241,0.25)' },
  recIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(251,191,36,0.15)', alignItems: 'center', justifyContent: 'center' },
  recLabel: { fontSize: 11, fontWeight: '800', color: '#818cf8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  recText:  { fontSize: 14, fontWeight: '600', color: '#f8fafc', lineHeight: 20 },

  // Sections
  section:       { marginHorizontal: 0, marginBottom: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle:  { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  sectionSub:    { fontSize: 11, color: '#64748b' },
  zoneSelected:  { transform: [{ scale: 1.01 }], borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(99,102,241,0.55)' },

  // Empty/loading
  emptyCard: { backgroundColor: '#111827', borderRadius: 14, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#1e293b' },
  emptyText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  emptySub:  { fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: -4 },
  retryBtn:  { backgroundColor: 'rgba(99,102,241,0.15)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginTop: 4 },
  retryText: { fontSize: 13, fontWeight: '800', color: '#6366F1' },

  // Peak windows
  peakCard: { marginHorizontal: 0, marginBottom: 12, backgroundColor: '#111827', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e293b', gap: 14 },
  peakRow:  { flexDirection: 'row', alignItems: 'flex-start' },
  peakItem: { flex: 1, alignItems: 'center', gap: 6 },
  peakIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  peakTime: { fontSize: 15, fontWeight: '800', color: '#f8fafc' },
  peakLabel:{ fontSize: 12, color: '#64748b' },
  peakBadge: { backgroundColor: 'rgba(245,158,11,0.15)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  peakBadgeText: { fontSize: 11, fontWeight: '800', color: '#F59E0B' },
  peakDivider: { width: 1, height: 80, backgroundColor: '#1e293b', alignSelf: 'center' },

  // Legend
  legendCard: { marginHorizontal: 0, marginBottom: 12, backgroundColor: '#111827', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#1e293b' },
  legendTitle: { fontSize: 11, fontWeight: '800', color: '#475569', letterSpacing: 0.8, marginBottom: 10 },
  legendRow:   { flexDirection: 'row', justifyContent: 'space-around' },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8' },
});
