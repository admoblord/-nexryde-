import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import LocationAutocomplete from '@/src/components/LocationAutocomplete';
import { RiderSavedSlotPremiumIcon } from '@/src/components/RiderSavedSlotPremiumIcon';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { BACKEND_URL } from '@/src/services/api';
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import {
  loadRiderSavedPlaces,
  upsertRiderSavedPlace,
  removeRiderSavedPlace,
  RIDER_SAVED_SLOT_META,
  RIDER_SAVED_SLOTS_ORDER,
  geocodeAddressForRider,
  type RiderSavedSlot,
} from '@/src/services/riderSavedPlaces';

export default function RiderSavedPlacesScreen() {
  const router = useRouter();
  const { userId: riderId, canCallAuthedApi } = useAuthedUserId();
  const tabPad = useTabBottomPad(16);
  const flow = useFlowLayout();
  const { colors, isDark } = useThemeColors();
  const [places, setPlaces] = useState<Awaited<ReturnType<typeof loadRiderSavedPlaces>>>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<RiderSavedSlot | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);

  const reload = useCallback(async () => {
    if (!riderId || !canCallAuthedApi) {
      setPlaces([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setPlaces(await loadRiderSavedPlaces(riderId));
    } finally {
      setLoading(false);
    }
  }, [riderId, canCallAuthedApi]);

  useEffect(() => {
    if (!canCallAuthedApi) return;
    void reload();
  }, [reload, canCallAuthedApi]);

  const openEditor = (slot: RiderSavedSlot) => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
    const existing = places.find((p) => p.slot === slot);
    setSearchDraft(existing?.address ?? '');
    setEditingSlot(slot);
    setEditorOpen(true);
  };

  const placeFor = (slot: RiderSavedSlot) => places.find((p) => p.slot === slot);

  const resolvePlaceId = async (placeId: string, sessionToken?: string) => {
    if (!placeId) return null;
    try {
      const sessionQ =
        sessionToken && sessionToken.trim().length > 0
          ? `?sessiontoken=${encodeURIComponent(sessionToken.trim())}`
          : '';
      const res = await fetch(
        `${BACKEND_URL}/api/places/details/${encodeURIComponent(placeId)}${sessionQ}`,
      );
      const data = await res.json().catch(() => ({}));
      const lat = Number(data?.latitude);
      const lng = Number(data?.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return {
          lat,
          lng,
          address: String(data.address || data.formatted_address || '').trim() || '',
        };
      }
    } catch {
      /* noop */
    }
    return null;
  };

  const handleAutocompletePick = async (place: {
    description: string;
    placeId: string;
    sessionToken?: string;
  }) => {
    if (!riderId || !canCallAuthedApi || !editingSlot) return;
    setSavingPlace(true);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      let addr = place.description.trim();

      const id = place.placeId?.trim();
      if (id) {
        const det = await resolvePlaceId(id, place.sessionToken);
        if (det) {
          lat = det.lat;
          lng = det.lng;
          if (det.address) addr = det.address;
        }
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const g = await geocodeAddressForRider(addr);
        if (g) {
          lat = g.lat;
          lng = g.lng;
          addr = g.address;
        }
      }
      if (!Number.isFinite(lat!) || !Number.isFinite(lng!) || !addr) {
        Alert.alert('Could not save', 'Pick a suggestion from the list, or try a fuller address.');
        return;
      }
      await upsertRiderSavedPlace(riderId, { slot: editingSlot, address: addr, lat: lat!, lng: lng! });
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditorOpen(false);
      setEditingSlot(null);
      setSearchDraft('');
      await reload();
    } finally {
      setSavingPlace(false);
    }
  };

  const handleRemove = (slot: RiderSavedSlot) => {
    if (!riderId || !canCallAuthedApi) return;
    Alert.alert(
      'Remove saved place?',
      `Clear ${RIDER_SAVED_SLOT_META[slot].label} from your shortcuts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeRiderSavedPlace(riderId, slot);
            await reload();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: flow.padH, borderBottomColor: isDark ? SURFACE.hairline : colors.border }]}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Saved places</Text>
        <View style={{ width: 44 }} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textMuted, paddingHorizontal: flow.padH }]}>
        Home, work, and more — book in one tap from the home screen. Stored on this device.
      </Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BRAND.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.list, { paddingBottom: tabPad, paddingHorizontal: flow.padH }]}
          showsVerticalScrollIndicator={false}
        >
          {RIDER_SAVED_SLOTS_ORDER.map((slot) => {
            const meta = RIDER_SAVED_SLOT_META[slot];
            const p = placeFor(slot);
            return (
              <View
                key={slot}
                style={[
                  styles.card,
                  {
                    backgroundColor: isDark ? SURFACE.cardDark : colors.card,
                    borderColor: isDark ? SURFACE.hairline : colors.border,
                  },
                ]}
              >
                <RiderSavedSlotPremiumIcon slot={slot} filled={!!p} size="lg" />
                <View style={styles.cardMid}>
                  <Text style={[styles.cardLabel, { color: colors.text }]}>{meta.label}</Text>
                  <Text style={[styles.cardAddr, { color: colors.textMuted }]} numberOfLines={2}>
                    {p?.address || 'Tap to set'}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.miniBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                    onPress={() => openEditor(slot)}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={p ? 'pencil' : 'add'} size={18} color={BRAND.primary} />
                  </TouchableOpacity>
                  {p ? (
                    <TouchableOpacity
                      style={[styles.miniBtn, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                      onPress={() => handleRemove(slot)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="trash-outline" size={18} color={BRAND.danger} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.doneRow}
            onPress={() => router.push('/rider/book' as any)}
            activeOpacity={0.88}
          >
            <LinearGradient colors={[BRAND.primaryDark, BRAND.primary]} style={styles.doneGrad}>
              <Ionicons name="car-sport" size={20} color="#FFF" />
              <Text style={styles.doneText}>Book a ride</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={editorOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditorOpen(false)}>
        <SafeAreaView style={[styles.modalSafe, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHead, { borderBottomColor: colors.border }]}>
            <TouchableOpacity
              onPress={() => {
                setEditorOpen(false);
                setEditingSlot(null);
                setSearchDraft('');
              }}
            >
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              Set {editingSlot ? RIDER_SAVED_SLOT_META[editingSlot].label : ''}
            </Text>
            <View style={{ width: 56 }} />
          </View>
          {editingSlot ? (
            <>
              <LocationAutocomplete
                value={searchDraft}
                onChangeText={setSearchDraft}
                placeholder={`Search ${RIDER_SAVED_SLOT_META[editingSlot].label.toLowerCase()} address`}
                onPlaceSelected={(p) => void handleAutocompletePick(p)}
              />
              {savingPlace ? (
                <View style={{ padding: 16, alignItems: 'center' }}>
                  <ActivityIndicator color={BRAND.primary} />
                </View>
              ) : null}
            </>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND.bgDeep },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  subtitle: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 19,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: SPACING.stack },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: SPACING.md,
  },
  cardMid: { flex: 1, minWidth: 0 },
  cardLabel: { fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
  cardAddr: { fontSize: 13, marginTop: 4, lineHeight: 18, fontWeight: '500' },
  cardActions: { flexDirection: 'row', gap: 6 },
  miniBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  doneRow: { marginTop: SPACING.lg, borderRadius: RADIUS.xl, overflow: 'hidden' },
  doneGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: SPACING.md,
  },
  doneText: { fontSize: 15, fontWeight: '800', color: BRAND.textInverse },
  modalSafe: { flex: 1 },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalCancel: { fontSize: 15, fontWeight: '700', color: BRAND.primary },
  modalTitle: { fontSize: 15, fontWeight: '800' },
});
