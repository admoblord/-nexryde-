import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Vehicle {
  id: string; type: string; make: string; model: string;
  year: string; color: string; plate: string; is_active: boolean;
  verification_status: 'verified' | 'pending' | 'not_submitted' | string;
  documents?: Record<string, any>; registered_at?: string;
}

const VEHICLE_TYPES = ['Economy', 'Comfort', 'XL', 'Premium', 'SUV', 'Minivan', 'Hatchback'];

// ─── Car emoji by type ──────────────────────────────────────────────────────────
function vehicleEmoji(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t.includes('premium')) return '🏎️';
  if (t.includes('suv') || t.includes('minivan')) return '🚙';
  if (t.includes('xl')) return '🚐';
  return '🚗';
}

function vehicleTypeIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  const t = (type ?? '').toLowerCase();
  if (t.includes('xl') || t.includes('suv') || t.includes('minivan')) return 'bus-outline';
  if (t.includes('premium')) return 'diamond-outline';
  if (t.includes('comfort')) return 'star-outline';
  return 'car-sport-outline';
}

// ─── Status helpers ─────────────────────────────────────────────────────────────
function statusColor(s: string) {
  if (s === 'verified' || s === 'approved') return '#4ADE80';
  if (s === 'pending' || s === 'pending_review') return '#FCD34D';
  return '#94A3B8';
}
function statusBgDark(s: string) {
  if (s === 'verified' || s === 'approved') return 'rgba(74,222,128,0.14)';
  if (s === 'pending' || s === 'pending_review') return 'rgba(252,211,77,0.14)';
  return 'rgba(148,163,184,0.12)';
}
function statusLabel(s: string) {
  if (s === 'verified' || s === 'approved') return 'Verified';
  if (s === 'pending' || s === 'pending_review') return 'Pending';
  return 'Unverified';
}

// ─── Colour swatch map ──────────────────────────────────────────────────────────
const COLOR_HEX: Record<string, string> = {
  white: '#F5F5F5', black: '#1C1C1C', silver: '#C0C0C0', gray: '#808080',
  grey: '#808080', red: '#EF4444', blue: '#3B82F6', green: '#22C55E',
  yellow: '#EAB308', orange: '#F97316', gold: '#D97706', brown: '#92400E',
  maroon: '#7F1D1D', navy: '#1E3A8A', beige: '#E7D9B8', pink: '#EC4899',
  'dark gray': '#4B5563', 'dark grey': '#4B5563', 'pearl white': '#F0F0F0',
  champagne: '#F7E7CE', 'wine red': '#7F1D1D', purple: '#7C3AED',
};
function carGlowColor(colorLabel: string): string {
  const hex = COLOR_HEX[(colorLabel ?? '').toLowerCase().trim()];
  return hex ?? '#3B82F6';
}

// ─── ColorDot ───────────────────────────────────────────────────────────────────
function ColorDot({ color, size = 12 }: { color: string; size?: number }) {
  const hex = COLOR_HEX[(color ?? '').toLowerCase().trim()];
  if (!hex) return null;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: hex,
      borderWidth: 1.5,
      borderColor: hex === '#F5F5F0' || hex === '#F5F5F5' ? '#475569' : 'rgba(255,255,255,0.2)',
    }} />
  );
}

// ─── Car preview panel (shown inside active card) ───────────────────────────────
function CarPreview({ type, color }: { type: string; color: string }) {
  const glowColor = carGlowColor(color);
  const emoji = vehicleEmoji(type);
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -6, duration: 1800, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  }, [floatAnim]);

  return (
    <View style={cp.wrap}>
      {/* Glow beneath car */}
      <View style={[cp.glow, { backgroundColor: glowColor }]} />
      {/* Floating car emoji */}
      <Animated.Text style={[cp.emoji, { transform: [{ translateY: floatAnim }] }]}>
        {emoji}
      </Animated.Text>
      {/* Ground reflection line */}
      <View style={cp.groundLine} />
    </View>
  );
}
const cp = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-end', height: 110, marginVertical: 4 },
  glow: {
    position: 'absolute',
    bottom: 10,
    width: 130,
    height: 24,
    borderRadius: 60,
    opacity: 0.22,
    transform: [{ scaleX: 1.3 }],
  },
  emoji: { fontSize: 84, lineHeight: 90, includeFontPadding: false },
  groundLine: {
    width: 140, height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    marginTop: 4,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
export default function VehicleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAppStore();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm, setAddForm] = useState({ type: 'Economy', make: '', model: '', year: '', color: '', plate: '' });
  const [adding, setAdding] = useState(false);

  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Vehicle | null>(null);
  const [editColor, setEditColor] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [editMake, setEditMake] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editYear, setEditYear] = useState('');
  const [saving, setSaving] = useState(false);

  // Card entrance animation
  const cardSlide = useRef(new Animated.Value(40)).current;
  const cardFade  = useRef(new Animated.Value(0)).current;

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMessage(null), 3500);
  };

  const apiBase = `${BACKEND_URL}/api/drivers/${user?.id}/vehicles`;

  const loadVehicles = useCallback(async () => {
    if (!user?.id) return;
    setLoadError(false);
    try {
      const res = await fetch(apiBase, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVehicles(data.vehicles || []);
      // Entrance animation
      Animated.parallel([
        Animated.timing(cardSlide, { toValue: 0, duration: 420, useNativeDriver: true }),
        Animated.timing(cardFade,  { toValue: 1, duration: 420, useNativeDriver: true }),
      ]).start();
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, apiBase, cardSlide, cardFade]);

  useEffect(() => { void loadVehicles(); }, [loadVehicles]);

  const onRefresh = () => { setRefreshing(true); void loadVehicles(); };

  const handleSwitch = async (vehicle: Vehicle) => {
    if (vehicle.is_active) return;
    setSwitchingId(vehicle.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${apiBase}/${vehicle.id}/activate`, { method: 'PUT', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVehicles(data.vehicles || []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess('Active vehicle switched.');
    } catch {
      Alert.alert('Error', 'Could not switch vehicle. Try again.');
    } finally {
      setSwitchingId(null);
    }
  };

  const openEdit = (v: Vehicle) => {
    setEditTarget(v); setEditMake(v.make); setEditModel(v.model);
    setEditYear(v.year); setEditColor(v.color); setEditPlate(v.plate);
    setEditModalVisible(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/${editTarget.id}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ make: editMake.trim(), model: editModel.trim(), year: editYear.trim(), color: editColor.trim(), plate: editPlate.trim() }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVehicles(data.vehicles || []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModalVisible(false);
      showSuccess('Vehicle updated.');
    } catch {
      Alert.alert('Error', 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (vehicle: Vehicle) => {
    Alert.alert(
      'Remove Vehicle',
      `Remove ${[vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.plate}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            setRemovingId(vehicle.id);
            try {
              const res = await fetch(`${apiBase}/${vehicle.id}`, { method: 'DELETE', headers: getAuthHeaders() });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                Alert.alert('Cannot remove', err?.detail || 'Failed.'); return;
              }
              const data = await res.json();
              setVehicles(data.vehicles || []);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } catch {
              Alert.alert('Error', 'Could not remove vehicle.');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ]
    );
  };

  const handleAdd = async () => {
    const missing: string[] = [];
    if (!addForm.model.trim()) missing.push('Model');
    if (!addForm.year.trim()) missing.push('Year');
    if (!addForm.color.trim()) missing.push('Color');
    if (!addForm.plate.trim()) missing.push('Plate');
    if (missing.length) { Alert.alert('Missing fields', `Please fill: ${missing.join(', ')}`); return; }
    setAdding(true);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: addForm.type, make: addForm.make.trim(), model: addForm.model.trim(), year: addForm.year.trim(), color: addForm.color.trim(), plate: addForm.plate.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert('Could not add', data?.detail || 'Try again.'); return; }
      setVehicles(data.vehicles || []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddModalVisible(false);
      setAddForm({ type: 'Economy', make: '', model: '', year: '', color: '', plate: '' });
      showSuccess('Vehicle added — pending verification.');
    } catch {
      Alert.alert('Error', 'Could not add vehicle. Check connection.');
    } finally {
      setAdding(false);
    }
  };

  const activeVehicle  = vehicles.find(v => v.is_active);
  const otherVehicles  = vehicles.filter(v => !v.is_active);
  const isVerified     = (v: Vehicle) => v.verification_status === 'verified' || v.verification_status === 'approved';

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#0D1420" />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Vehicles</Text>
        <TouchableOpacity style={s.headerAddBtn} onPress={() => setAddModalVisible(true)} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color="#00D46A" />
        </TouchableOpacity>
      </View>

      {/* ── Success toast ── */}
      {successMessage ? (
        <View style={s.toast}>
          <Ionicons name="checkmark-circle" size={16} color="#4ADE80" />
          <Text style={s.toastText}>{successMessage}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00D46A" />}
      >
        {/* ── Error ── */}
        {loadError ? (
          <View style={s.errorBanner}>
            <Ionicons name="alert-circle-outline" size={16} color="#F87171" />
            <Text style={s.errorText}>Could not load vehicles.</Text>
            <TouchableOpacity onPress={loadVehicles}><Text style={s.retryText}>Retry</Text></TouchableOpacity>
          </View>
        ) : null}

        {/* ── Loading ── */}
        {loading && !loadError ? (
          <View style={s.loadCenter}>
            <ActivityIndicator size="large" color="#00D46A" />
            <Text style={s.loadText}>Loading your garage…</Text>
          </View>
        ) : null}

        {/* ── Empty state ── */}
        {!loading && vehicles.length === 0 && !loadError ? (
          <View style={s.emptyWrap}>
            <LinearGradient colors={['#111827', '#1e293b']} style={s.emptyCircle}>
              <Text style={{ fontSize: 64 }}>🚗</Text>
            </LinearGradient>
            <Text style={s.emptyTitle}>No Vehicles Yet</Text>
            <Text style={s.emptySub}>Add your vehicle to start accepting rides on NEXRYDE.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setAddModalVisible(true)} activeOpacity={0.88}>
              <Ionicons name="add-circle-outline" size={19} color="#fff" />
              <Text style={s.emptyBtnText}>Add Your First Vehicle</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════
            ACTIVE VEHICLE CARD
        ══════════════════════════════════════════════════════════════════ */}
        {!loading && activeVehicle ? (
          <Animated.View style={{ opacity: cardFade, transform: [{ translateY: cardSlide }] }}>
            <Text style={s.sectionLabel}>ACTIVE VEHICLE</Text>

            {/* Outer glow layer */}
            <View style={s.activeGlowWrap}>
              <LinearGradient
                colors={['#0F2344', '#102F5E', '#0A1F3C']}
                style={s.activeCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                {/* Mesh top-right shimmer */}
                <LinearGradient
                  colors={['rgba(0,212,106,0.12)', 'transparent']}
                  style={s.activeShimmer}
                  start={{ x: 1, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  pointerEvents="none"
                />

                {/* ── Top: name + Active badge ── */}
                <View style={s.activeTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.activeName} numberOfLines={1}>
                      {[activeVehicle.make, activeVehicle.model].filter(Boolean).join(' ') || 'My Vehicle'}
                    </Text>
                    <View style={s.activeDetailRow}>
                      <ColorDot color={activeVehicle.color} size={11} />
                      <Text style={s.activeDetail}>
                        {[activeVehicle.color, activeVehicle.year].filter(Boolean).join('  •  ')}
                      </Text>
                    </View>
                  </View>
                  <View style={s.activeBadge}>
                    <View style={s.activeDot} />
                    <Text style={s.activeBadgeText}>Active</Text>
                  </View>
                </View>

                {/* ── Car preview ── */}
                <CarPreview type={activeVehicle.type} color={activeVehicle.color} />

                {/* ── Plate badge ── */}
                <View style={s.plateBadgeRow}>
                  <View style={s.plateBadge}>
                    <Ionicons name="card-outline" size={12} color="rgba(255,255,255,0.5)" />
                    <Text style={s.plateBadgeText}>{activeVehicle.plate || '—'}</Text>
                  </View>
                </View>

                {/* ── Status chips ── */}
                <View style={s.chipsRow}>
                  <View style={[s.chip, { backgroundColor: statusBgDark(activeVehicle.verification_status) }]}>
                    <Ionicons
                      name={isVerified(activeVehicle) ? 'shield-checkmark' : 'time-outline'}
                      size={12}
                      color={statusColor(activeVehicle.verification_status)}
                    />
                    <Text style={[s.chipText, { color: statusColor(activeVehicle.verification_status) }]}>
                      {statusLabel(activeVehicle.verification_status)}
                    </Text>
                  </View>
                  {activeVehicle.type ? (
                    <View style={[s.chip, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                      <Ionicons name={vehicleTypeIcon(activeVehicle.type)} size={12} color="rgba(255,255,255,0.65)" />
                      <Text style={[s.chipText, { color: 'rgba(255,255,255,0.75)' }]}>{activeVehicle.type}</Text>
                    </View>
                  ) : null}
                </View>

                {/* ── Actions ── */}
                <View style={s.activeActions}>
                  <TouchableOpacity style={s.activeActionBtn} onPress={() => openEdit(activeVehicle)} activeOpacity={0.8}>
                    <Ionicons name="create-outline" size={15} color="rgba(255,255,255,0.85)" />
                    <Text style={s.activeActionText}>Edit</Text>
                  </TouchableOpacity>
                  {vehicles.length > 1 ? (
                    <TouchableOpacity
                      style={[s.activeActionBtn, s.activeActionDanger]}
                      onPress={() => handleRemove(activeVehicle)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={15} color="#F87171" />
                      <Text style={[s.activeActionText, { color: '#F87171' }]}>Remove</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </LinearGradient>
            </View>
          </Animated.View>
        ) : null}

        {/* ══════════════════════════════════════════════════════════════════
            OTHER VEHICLES
        ══════════════════════════════════════════════════════════════════ */}
        {!loading && otherVehicles.length > 0 ? (
          <>
            <Text style={[s.sectionLabel, { marginTop: 28 }]}>OTHER VEHICLES</Text>
            {otherVehicles.map((vehicle) => (
              <Animated.View key={vehicle.id} style={{ opacity: cardFade }}>
                <View style={s.otherCard}>
                  {/* Left icon */}
                  <LinearGradient
                    colors={['#1a2a45', '#0f1e35']}
                    style={s.otherIconWrap}
                  >
                    <Text style={{ fontSize: 26 }}>{vehicleEmoji(vehicle.type)}</Text>
                  </LinearGradient>

                  {/* Info */}
                  <View style={{ flex: 1 }}>
                    <Text style={s.otherName} numberOfLines={1}>
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                    </Text>
                    <View style={s.otherDetailRow}>
                      <ColorDot color={vehicle.color} size={10} />
                      <Text style={s.otherDetail}>
                        {[vehicle.color, vehicle.year, vehicle.plate].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={[s.chip, s.chipSm, { backgroundColor: statusBgDark(vehicle.verification_status), marginTop: 6, alignSelf: 'flex-start' }]}>
                      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: statusColor(vehicle.verification_status) }} />
                      <Text style={[s.chipText, { color: statusColor(vehicle.verification_status), fontSize: 10 }]}>
                        {statusLabel(vehicle.verification_status)}
                      </Text>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={s.otherActions}>
                    <TouchableOpacity
                      style={s.switchBtn}
                      onPress={() => handleSwitch(vehicle)}
                      disabled={switchingId === vehicle.id}
                      activeOpacity={0.8}
                    >
                      {switchingId === vehicle.id
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <>
                            <Ionicons name="swap-horizontal" size={13} color="#fff" />
                            <Text style={s.switchBtnText}>Switch</Text>
                          </>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={s.iconBtn} onPress={() => openEdit(vehicle)}>
                      <Ionicons name="create-outline" size={16} color="#60A5FA" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.iconBtn, s.iconBtnRed]} onPress={() => handleRemove(vehicle)} disabled={removingId === vehicle.id}>
                      {removingId === vehicle.id
                        ? <ActivityIndicator size="small" color="#F87171" />
                        : <Ionicons name="trash-outline" size={16} color="#F87171" />
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </Animated.View>
            ))}
          </>
        ) : null}

        {/* ── Add vehicle CTA ── */}
        {!loading && vehicles.length > 0 ? (
          <TouchableOpacity style={s.addRow} onPress={() => setAddModalVisible(true)} activeOpacity={0.85}>
            <View style={s.addRowIcon}>
              <Ionicons name="add" size={22} color="#00D46A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.addRowText}>Add Another Vehicle</Text>
              <Text style={s.addRowSub}>New vehicle will require verification</Text>
            </View>
            <Ionicons name="chevron-forward" size={17} color="#4B5563" />
          </TouchableOpacity>
        ) : null}

        {/* ── Info note ── */}
        <View style={s.infoNote}>
          <Ionicons name="information-circle-outline" size={15} color="#4B5563" />
          <Text style={s.infoNoteText}>
            Only your active vehicle is used when you go online. Switch anytime without leaving the app.
          </Text>
        </View>
      </ScrollView>

      {/* ════════════════════════════════════════════════════════════════════
          ADD VEHICLE MODAL
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={addModalVisible} animationType="slide" transparent onRequestClose={() => setAddModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Add New Vehicle</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.inputLabel}>Vehicle Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {VEHICLE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[s.typePill, addForm.type === t && s.typePillOn]}
                    onPress={() => { setAddForm(f => ({ ...f, type: t })); Haptics.selectionAsync(); }}
                  >
                    <Text style={[s.typePillText, addForm.type === t && s.typePillTextOn]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={s.inputLabel}>Make <Text style={s.optional}>(e.g. Honda)</Text></Text>
              <TextInput style={s.input} value={addForm.make} onChangeText={v => setAddForm(f => ({ ...f, make: v }))} placeholder="Toyota, Honda, Hyundai…" placeholderTextColor="#4B5563" autoCapitalize="words" />

              <Text style={s.inputLabel}>Model <Text style={s.required}>*</Text></Text>
              <TextInput style={s.input} value={addForm.model} onChangeText={v => setAddForm(f => ({ ...f, model: v }))} placeholder="Corolla, Accord, Elantra…" placeholderTextColor="#4B5563" autoCapitalize="words" />

              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Year <Text style={s.required}>*</Text></Text>
                  <TextInput style={s.input} value={addForm.year} onChangeText={v => setAddForm(f => ({ ...f, year: v }))} placeholder="2020" placeholderTextColor="#4B5563" keyboardType="number-pad" maxLength={4} />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.inputLabel}>Color <Text style={s.required}>*</Text></Text>
                  <TextInput style={s.input} value={addForm.color} onChangeText={v => setAddForm(f => ({ ...f, color: v }))} placeholder="Silver" placeholderTextColor="#4B5563" autoCapitalize="words" />
                </View>
              </View>

              <Text style={s.inputLabel}>Plate Number <Text style={s.required}>*</Text></Text>
              <TextInput
                style={[s.input, { fontWeight: '800', letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}
                value={addForm.plate}
                onChangeText={v => setAddForm(f => ({ ...f, plate: v.toUpperCase() }))}
                placeholder="ABC 123 XY"
                placeholderTextColor="#4B5563"
                autoCapitalize="characters"
              />

              <View style={s.modalNote}>
                <Ionicons name="alert-circle-outline" size={15} color="#FCD34D" />
                <Text style={s.modalNoteText}>New vehicles require document verification before accepting rides.</Text>
              </View>

              <TouchableOpacity style={[s.confirmBtn, adding && { opacity: 0.65 }]} onPress={handleAdd} disabled={adding} activeOpacity={0.88}>
                {adding
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />
                      <Text style={s.confirmBtnText}>Add Vehicle</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ════════════════════════════════════════════════════════════════════
          EDIT VEHICLE MODAL
      ════════════════════════════════════════════════════════════════════ */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Edit Vehicle</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={s.inputLabel}>Make</Text>
            <TextInput style={s.input} value={editMake} onChangeText={setEditMake} placeholder="Toyota, Honda…" placeholderTextColor="#4B5563" autoCapitalize="words" />

            <Text style={s.inputLabel}>Model</Text>
            <TextInput style={s.input} value={editModel} onChangeText={setEditModel} placeholder="Corolla, Accord…" placeholderTextColor="#4B5563" autoCapitalize="words" />

            <View style={{ flexDirection: 'row' }}>
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Year</Text>
                <TextInput style={s.input} value={editYear} onChangeText={setEditYear} placeholder="2020" placeholderTextColor="#4B5563" keyboardType="number-pad" maxLength={4} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.inputLabel}>Color</Text>
                <TextInput style={s.input} value={editColor} onChangeText={setEditColor} placeholder="Dark Gray" placeholderTextColor="#4B5563" autoCapitalize="words" />
              </View>
            </View>

            <Text style={s.inputLabel}>Plate Number</Text>
            <TextInput
              style={[s.input, { fontWeight: '800', letterSpacing: 2, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}
              value={editPlate}
              onChangeText={v => setEditPlate(v.toUpperCase())}
              placeholder="KTU 65 KE"
              placeholderTextColor="#4B5563"
              autoCapitalize="characters"
            />

            <TouchableOpacity style={[s.confirmBtn, saving && { opacity: 0.65 }]} onPress={handleSaveEdit} disabled={saving} activeOpacity={0.88}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Ionicons name="checkmark" size={19} color="#fff" />
                    <Text style={s.confirmBtnText}>Save Changes</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const BG = '#0D1420';
const CARD_BG = '#111827';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  // ── Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: BG,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: 0.2 },
  headerAddBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,212,106,0.12)',
    borderWidth: 1, borderColor: 'rgba(0,212,106,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Toast
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(74,222,128,0.1)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(74,222,128,0.2)',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  toastText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#4ADE80' },

  content: { paddingHorizontal: 16, paddingTop: 20 },

  // ── Error
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: 12,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: { flex: 1, fontSize: 13, color: '#F87171', fontWeight: '600' },
  retryText: { fontSize: 13, color: '#60A5FA', fontWeight: '700' },

  // ── Loading
  loadCenter: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  loadText: { fontSize: 14, color: '#4B5563' },

  // ── Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 14 },
  emptyCircle: {
    width: 116, height: 116, borderRadius: 58,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  emptySub: { fontSize: 14, color: '#4B5563', textAlign: 'center', paddingHorizontal: 28, lineHeight: 22 },
  emptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#00D46A', paddingHorizontal: 24, paddingVertical: 13,
    borderRadius: 20, marginTop: 6,
    shadowColor: '#00D46A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 8,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#4B5563',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10,
  },

  // ── Active card
  activeGlowWrap: {
    borderRadius: 26,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 16,
    marginBottom: 6,
  },
  activeCard: {
    borderRadius: 26, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,212,106,0.18)',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
  },
  activeShimmer: {
    position: 'absolute', top: 0, right: 0,
    width: '60%', height: '50%',
    borderRadius: 26,
  },
  activeTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  activeName: { fontSize: 22, fontWeight: '900', color: '#fff', lineHeight: 27 },
  activeDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  activeDetail: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(74,222,128,0.15)',
    borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    marginLeft: 8, marginTop: 2,
  },
  activeDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ADE80' },
  activeBadgeText: { fontSize: 12, fontWeight: '800', color: '#4ADE80' },

  // plate badge
  plateBadgeRow: { alignItems: 'center', marginTop: 4, marginBottom: 4 },
  plateBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 10,
  },
  plateBadgeText: {
    fontSize: 15, fontWeight: '900', color: 'rgba(255,255,255,0.85)',
    letterSpacing: 3, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 14, marginTop: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  chipSm: { paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 12, fontWeight: '700' },

  activeActions: {
    flexDirection: 'row', gap: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 14,
  },
  activeActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  activeActionDanger: { backgroundColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.2)' },
  activeActionText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },

  // ── Other vehicle cards
  otherCard: {
    backgroundColor: CARD_BG,
    borderRadius: 20, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 10,
  },
  otherIconWrap: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)',
  },
  otherName: { fontSize: 15, fontWeight: '800', color: '#fff' },
  otherDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  otherDetail: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  otherActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#1D4ED8', paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 10, minWidth: 62, justifyContent: 'center',
  },
  switchBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: 'rgba(96,165,250,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnRed: { backgroundColor: 'rgba(248,113,113,0.1)' },

  // ── Add row
  addRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CARD_BG, borderRadius: 20, padding: 14,
    marginTop: 10, borderWidth: 1.5,
    borderColor: 'rgba(0,212,106,0.22)', borderStyle: 'dashed',
  },
  addRowIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(0,212,106,0.1)',
    borderWidth: 1, borderColor: 'rgba(0,212,106,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  addRowText: { fontSize: 15, fontWeight: '800', color: '#00D46A' },
  addRowSub: { fontSize: 12, color: '#4B5563', marginTop: 2 },

  // ── Info note
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 12, borderRadius: 12, marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  infoNoteText: { flex: 1, fontSize: 12, color: '#4B5563', lineHeight: 18 },

  // ── Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#374151', alignSelf: 'center', marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#fff' },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center', justifyContent: 'center',
  },
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#9CA3AF', marginBottom: 6, marginTop: 14 },
  optional: { fontWeight: '400', color: '#4B5563' },
  required: { color: '#F87171' },
  input: {
    backgroundColor: '#1e293b', borderWidth: 1, borderColor: '#1F2D42',
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#fff',
  },
  typePill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#1e293b',
    borderWidth: 1, borderColor: '#1F2D42', marginRight: 8,
  },
  typePillOn: { backgroundColor: '#1D4ED8', borderColor: '#2563EB' },
  typePillText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  typePillTextOn: { color: '#fff' },
  modalNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: 'rgba(252,211,77,0.08)',
    borderRadius: 12, padding: 12, marginTop: 16,
    borderWidth: 1, borderColor: 'rgba(252,211,77,0.2)',
  },
  modalNoteText: { flex: 1, fontSize: 12, color: '#FCD34D', lineHeight: 18 },
  confirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#00D46A', padding: 16, borderRadius: 20, marginTop: 20,
    shadowColor: '#00D46A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  confirmBtnText: { fontSize: 16, fontWeight: '900', color: '#fff' },
});
