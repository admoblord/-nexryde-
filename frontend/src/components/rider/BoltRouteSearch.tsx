/**
 * Bolt-style Route entry: stacked pickup/dropoff, inline suggestions, no confirm step.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  classifyPlacesFailure,
  isPlacesAbortError,
  searchPlacesAutocomplete,
  type PlacesFailure,
} from '@/src/services/placesSearch';
import {
  loadIdleRouteSuggestions,
  mapPlacesPredictions,
  mergeRouteSuggestions,
  splitHighlight,
  type RouteSuggestion,
} from '@/src/services/routeSuggestions';

const GREEN = '#22E180';
const BG = '#F2F3F5';
const CARD = '#FFFFFF';
const TEXT = '#0F172A';
const MUTED = '#64748B';
const FIELD_GREY = '#ECEEF1';
const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

export type RouteField = 'pickup' | 'dropoff' | 'stop';

export type BoltRouteSelection = {
  field: RouteField;
  title: string;
  address: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  sessionToken?: string;
};

type Props = {
  userId?: string;
  pickupLabel: string;
  dropoffLabel: string;
  stopLabel?: string;
  showStop?: boolean;
  origin: { lat: number; lng: number } | null;
  initialFocus?: RouteField;
  onClose: () => void;
  onSwap: () => void;
  onAddStop?: () => void;
  onPickupChangeText: (text: string) => void;
  onDropoffChangeText: (text: string) => void;
  onStopChangeText?: (text: string) => void;
  onSelect: (sel: BoltRouteSelection) => void;
  onOpenMapPin?: (field: RouteField) => void;
};

function newSessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

/**
 * Say what actually happened. Claiming "no internet" on a phone with full
 * signal sends the rider to their router instead of telling us anything.
 */
function failureHeadline(failure: PlacesFailure | null): string {
  switch (failure?.kind) {
    case 'no_network':
      return 'No internet connection. Check your Wi-Fi or mobile data.';
    case 'timeout':
      return 'Address search timed out. Your connection reached us but the reply was too slow.';
    case 'dns':
      return "Could not look up NexRyde's address server. This is usually a DNS or Wi-Fi problem.";
    case 'tls':
      return 'Secure connection to NexRyde failed.';
    case 'unreachable':
      return 'Could not reach NexRyde. Your device is online but the connection was refused.';
    case 'auth':
      return 'Sign in again to search pickup and destination';
    case 'http':
      return 'Address search returned an error.';
    default:
      return 'Address search did not respond.';
  }
}

export function BoltRouteSearch({
  userId,
  pickupLabel,
  dropoffLabel,
  stopLabel = '',
  showStop = false,
  origin,
  initialFocus = 'dropoff',
  onClose,
  onSwap,
  onAddStop,
  onPickupChangeText,
  onDropoffChangeText,
  onStopChangeText,
  onSelect,
  onOpenMapPin,
}: Props) {
  const [focused, setFocused] = useState<RouteField>(initialFocus);
  const [idle, setIdle] = useState<RouteSuggestion[]>([]);
  const [places, setPlaces] = useState<RouteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<'auth' | 'network' | 'offline' | null>(null);
  const [failure, setFailure] = useState<PlacesFailure | null>(null);
  const sessionRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const originRef = useRef(origin);
  const pickupRef = useRef<TextInput>(null);
  const dropoffRef = useRef<TextInput>(null);
  const stopRef = useRef<TextInput>(null);
  originRef.current = origin;

  const activeQuery = useMemo(() => {
    if (focused === 'pickup') return pickupLabel;
    if (focused === 'stop') return stopLabel;
    return dropoffLabel;
  }, [focused, pickupLabel, dropoffLabel, stopLabel]);

  useEffect(() => {
    let cancelled = false;
    void loadIdleRouteSuggestions(userId, origin).then((rows) => {
      if (!cancelled) setIdle(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, origin?.lat, origin?.lng]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (focused === 'pickup') pickupRef.current?.focus();
      else if (focused === 'stop') stopRef.current?.focus();
      else dropoffRef.current?.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [focused]);

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

  const ensureSession = useCallback(() => {
    if (!sessionRef.current) sessionRef.current = newSessionToken();
    return sessionRef.current;
  }, []);

  const fetchPlaces = useCallback(
    async (input: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const reqId = ++reqIdRef.current;
      setLoading(true);
      setSearchError(null);
      setFailure(null);
      try {
        const session = ensureSession();
        const data = await searchPlacesAutocomplete(input, {
          origin: originRef.current,
          sessionToken: session,
          countryCode: 'ng',
          signal: ac.signal,
        });
        if (reqId !== reqIdRef.current || ac.signal.aborted) return;
        const rows = mapPlacesPredictions(
          data.predictions || [],
          input,
          originRef.current,
          session,
        );
        if (rows.length) {
          setPlaces(rows);
          setSearchError(null);
          return;
        }
        setFailure(data.failure ?? null);
        if (data.httpStatus === 401) {
          setSearchError('auth');
          setPlaces([]);
          return;
        }
        if (data.emptyConfirmed) {
          // Backend reached Google and there is genuinely no such place.
          setPlaces([]);
          setSearchError(null);
          return;
        }
        // Degraded response: keep the suggestions already on screen rather than
        // replacing real addresses with an empty state.
        setSearchError(data.offline ? 'offline' : 'network');
      } catch (err) {
        if (reqId !== reqIdRef.current || ac.signal.aborted || isPlacesAbortError(err)) return;
        const f = classifyPlacesFailure(err);
        setFailure(f);
        setSearchError(f.kind === 'no_network' ? 'offline' : 'network');
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    [ensureSession],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = activeQuery.trim();
    if (q.length < MIN_CHARS) {
      abortRef.current?.abort();
      setPlaces([]);
      setLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void fetchPlaces(q);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [activeQuery, fetchPlaces]);

  const suggestions = useMemo(
    () => mergeRouteSuggestions(idle, places, activeQuery),
    [idle, places, activeQuery],
  );

  const onClear = (field: RouteField) => {
    if (field === 'pickup') onPickupChangeText('');
    else if (field === 'stop') onStopChangeText?.('');
    else onDropoffChangeText('');
  };

  const handleSelect = (item: RouteSuggestion) => {
    Keyboard.dismiss();
    sessionRef.current = item.sessionToken || sessionRef.current;
    onSelect({
      field: focused,
      title: item.title,
      address: item.subtitle || item.title,
      placeId: item.placeId,
      lat: item.lat,
      lng: item.lng,
      sessionToken: sessionRef.current || undefined,
    });
    // Parent moves focus / closes. Discard session after successful Places select.
    if (item.kind === 'places') sessionRef.current = null;
  };

  const renderField = (
    field: RouteField,
    value: string,
    placeholder: string,
    onChange: (t: string) => void,
    inputRef: React.RefObject<TextInput | null>,
  ) => {
    const isFocused = focused === field;
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => setFocused(field)}
        style={[styles.fieldRow, isFocused ? styles.fieldFocused : styles.fieldIdle]}
      >
        {isFocused ? (
          <Ionicons name="search" size={18} color={MUTED} style={styles.fieldLeftIcon} />
        ) : (
          <View style={[styles.dotIcon, field === 'pickup' ? styles.dotPickup : styles.dotDrop]} />
        )}
        <TextInput
          ref={inputRef}
          style={styles.fieldInput}
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(field)}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="words"
        />
        {isFocused ? (
          <View style={styles.fieldRight}>
            {value.trim().length > 0 ? (
              <TouchableOpacity
                onPress={() => onClear(field)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Clear"
              >
                <Ionicons name="close-circle" size={20} color={MUTED} />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => onOpenMapPin?.(field)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Pick on map"
              style={{ marginLeft: 8 }}
            >
              <Ionicons name="location" size={20} color={GREEN} />
            </TouchableOpacity>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderSuggestion = ({ item }: { item: RouteSuggestion }) => {
    const parts = splitHighlight(item.title, activeQuery);
    return (
      <TouchableOpacity style={styles.sugRow} onPress={() => handleSelect(item)} activeOpacity={0.75}>
        <View style={styles.sugIconWrap}>
          <Ionicons name={item.icon} size={20} color={TEXT} />
        </View>
        <View style={styles.sugTextCol}>
          <Text style={styles.sugTitle} numberOfLines={1}>
            {parts.map((p, i) => (
              <Text key={`${item.id}-${i}`} style={p.hit ? styles.sugHit : undefined}>
                {p.text}
              </Text>
            ))}
          </Text>
          <Text style={styles.sugSub} numberOfLines={1}>
            {item.subtitle}
          </Text>
        </View>
        {item.distanceLabel ? (
          <Text style={styles.sugDist}>{item.distanceLabel}</Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={26} color={TEXT} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Route</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.cardRow}>
        <View style={styles.card}>
          {renderField('pickup', pickupLabel, 'Current location', onPickupChangeText, pickupRef)}
          <View style={styles.connector}>
            <View style={styles.connectorDot} />
          </View>
          {showStop ? (
            <>
              {renderField(
                'stop',
                stopLabel,
                'Stop',
                (t) => onStopChangeText?.(t),
                stopRef,
              )}
              <View style={styles.connector}>
                <View style={styles.connectorDot} />
              </View>
            </>
          ) : null}
          {renderField(
            'dropoff',
            dropoffLabel,
            'Dropoff location',
            onDropoffChangeText,
            dropoffRef,
          )}
        </View>
        <View style={styles.sideBtns}>
          <TouchableOpacity
            style={styles.sideBtn}
            onPress={onAddStop}
            accessibilityLabel="Add stop"
          >
            <Ionicons name="add" size={22} color={TEXT} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideBtn} onPress={onSwap} accessibilityLabel="Swap">
            <Ionicons name="swap-vertical" size={20} color={TEXT} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={GREEN} />
        </View>
      ) : null}

      <FlatList
        data={suggestions}
        keyExtractor={(item) => item.id}
        renderItem={renderSuggestion}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>
              {loading
                ? 'Searching addresses…'
                : searchError === 'auth'
                  ? 'Sign in again to search pickup and destination'
                  : searchError === 'offline' || searchError === 'network'
                    ? failureHeadline(failure)
                    : activeQuery.trim().length >= MIN_CHARS
                      ? 'No places found'
                      : 'Saved places and recent searches appear here'}
            </Text>
            {/* The exact reason, so a screenshot is enough to diagnose it. */}
            {!loading && failure ? (
              <Text style={styles.emptyDetail} selectable>
                {failure.kind}: {failure.detail}
              </Text>
            ) : null}
            {!loading && (searchError === 'offline' || searchError === 'network') ? (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => void fetchPlaces(activeQuery.trim())}
                accessibilityRole="button"
              >
                <Ionicons name="refresh" size={16} color={TEXT} />
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT,
    fontFamily: Platform.select({ ios: 'System', android: 'sans-serif-medium', default: undefined }),
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 12,
    gap: 8,
  },
  card: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  fieldFocused: {
    backgroundColor: CARD,
    borderWidth: 2,
    borderColor: GREEN,
  },
  fieldIdle: {
    backgroundColor: FIELD_GREY,
    borderWidth: 0,
  },
  fieldLeftIcon: { marginRight: 8 },
  dotIcon: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotPickup: { backgroundColor: GREEN },
  dotDrop: { backgroundColor: '#0F172A' },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    color: TEXT,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  fieldRight: { flexDirection: 'row', alignItems: 'center', marginLeft: 6 },
  connector: {
    alignItems: 'flex-start',
    paddingLeft: 18,
    height: 10,
    justifyContent: 'center',
  },
  connectorDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  sideBtns: { justifyContent: 'space-between', paddingVertical: 4 },
  sideBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    elevation: 1,
  },
  loadingRow: { paddingVertical: 8, alignItems: 'center' },
  list: { flex: 1, marginTop: 8 },
  listContent: { paddingBottom: 40 },
  sugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: BG,
  },
  sugIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sugTextCol: { flex: 1, minWidth: 0 },
  sugTitle: { fontSize: 16, fontWeight: '600', color: TEXT },
  sugHit: { color: GREEN, fontWeight: '700' },
  sugSub: { fontSize: 13, color: MUTED, marginTop: 2 },
  sugDist: { fontSize: 13, color: MUTED, marginLeft: 8, fontWeight: '500' },
  empty: { textAlign: 'center', color: MUTED, marginTop: 32, paddingHorizontal: 24 },
  emptyWrap: { alignItems: 'center' },
  emptyDetail: {
    textAlign: 'center',
    color: MUTED,
    marginTop: 8,
    paddingHorizontal: 28,
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: undefined }),
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  retryText: { fontSize: 15, fontWeight: '600', color: TEXT },
});

export default BoltRouteSearch;
