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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';

interface Vehicle {
  id: string;
  type: string;
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  is_active: boolean;
  verification_status: 'verified' | 'pending' | 'not_submitted' | string;
  documents?: Record<string, any>;
  registered_at?: string;
}

const VEHICLE_TYPES = ['Economy', 'Comfort', 'XL', 'Premium', 'SUV', 'Minivan', 'Hatchback'];

function vehicleTypeIcon(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  const t = type.toLowerCase();
  if (t.includes('xl') || t.includes('suv') || t.includes('minivan')) return 'bus-outline';
  if (t.includes('premium')) return 'diamond-outline';
  if (t.includes('comfort')) return 'star-outline';
  return 'car-sport-outline';
}

function statusColor(s: string) {
  if (s === 'verified' || s === 'approved') return '#16A34A';
  if (s === 'pending' || s === 'pending_review') return '#D97706';
  return '#6B7280';
}
function statusBg(s: string) {
  if (s === 'verified' || s === 'approved') return '#D1FAE5';
  if (s === 'pending' || s === 'pending_review') return '#FEF3C7';
  return '#F3F4F6';
}
function statusLabel(s: string) {
  if (s === 'verified' || s === 'approved') return 'Verified';
  if (s === 'pending' || s === 'pending_review') return 'Pending';
  return 'Unverified';
}

const COLOR_SWATCHES: Record<string, string> = {
  white: '#FFFFFF', black: '#1C1C1C', silver: '#C0C0C0', gray: '#808080', grey: '#808080',
  red: '#EF4444', blue: '#3B82F6', green: '#22C55E', yellow: '#EAB308', orange: '#F97316',
  gold: '#EAB308', brown: '#92400E', maroon: '#7F1D1D', navy: '#1E3A5F', beige: '#E7D9B8',
  'dark gray': '#4B5563', 'dark grey': '#4B5563', 'pearl white': '#F5F5F0',
  'wine red': '#7F1D1D', champagne: '#F7E7CE', pink: '#EC4899',
};

function colorSwatch(colorLabel: string): string | null {
  const key = colorLabel?.toLowerCase().trim();
  return COLOR_SWATCHES[key] ?? null;
}

function ColorDot({ color, size = 14 }: { color: string; size?: number }) {
  const hex = colorSwatch(color);
  if (!hex) return null;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: hex,
      borderWidth: 1,
      borderColor: hex === '#FFFFFF' || hex === '#F5F5F0' ? '#CBD5E1' : 'transparent',
    }} />
  );
}

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

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMessage(null), 3500);
  };

  // Add vehicle modal
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addForm, setAddForm] = useState({
    type: 'Economy',
    make: '',
    model: '',
    year: '',
    color: '',
    plate: '',
  });
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

  // Animated active card pulse
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.015, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const apiBase = `${BACKEND_URL}/api/drivers/${user?.id}/vehicles`;

  const loadVehicles = useCallback(async () => {
    if (!user?.id) return;
    setLoadError(false);
    try {
      const res = await fetch(apiBase, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setVehicles(data.vehicles || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, apiBase]);

  useEffect(() => { void loadVehicles(); }, [loadVehicles]);

  const onRefresh = () => { setRefreshing(true); void loadVehicles(); };

  const handleSwitch = async (vehicle: Vehicle) => {
    if (vehicle.is_active) return;
    setSwitchingId(vehicle.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${apiBase}/${vehicle.id}/activate`, {
        method: 'PUT',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVehicles(data.vehicles || []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showSuccess('Active vehicle switched successfully.');
    } catch {
      Alert.alert('Error', 'Could not switch vehicle. Try again.');
    } finally {
      setSwitchingId(null);
    }
  };

  const openEdit = (v: Vehicle) => {
    setEditTarget(v);
    setEditMake(v.make);
    setEditModel(v.model);
    setEditYear(v.year);
    setEditColor(v.color);
    setEditPlate(v.plate);
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
        body: JSON.stringify({
          make: editMake.trim(),
          model: editModel.trim(),
          year: editYear.trim(),
          color: editColor.trim(),
          plate: editPlate.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setVehicles(data.vehicles || []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModalVisible(false);
      showSuccess('Vehicle details updated.');
    } catch {
      Alert.alert('Error', 'Could not save changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (vehicle: Vehicle) => {
    Alert.alert(
      'Remove Vehicle',
      `Remove ${[vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.plate}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(vehicle.id);
            try {
              const res = await fetch(`${apiBase}/${vehicle.id}`, {
                method: 'DELETE',
                headers: getAuthHeaders(),
              });
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                Alert.alert('Cannot remove', err?.detail || 'Failed to remove vehicle.');
                return;
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
    const missing = [];
    if (!addForm.model.trim()) missing.push('Model');
    if (!addForm.year.trim()) missing.push('Year');
    if (!addForm.color.trim()) missing.push('Color');
    if (!addForm.plate.trim()) missing.push('Plate');
    if (missing.length) {
      Alert.alert('Missing fields', `Please fill in: ${missing.join(', ')}`);
      return;
    }
    setAdding(true);
    try {
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: addForm.type,
          make: addForm.make.trim(),
          model: addForm.model.trim(),
          year: addForm.year.trim(),
          color: addForm.color.trim(),
          plate: addForm.plate.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Could not add vehicle', data?.detail || 'Please try again.');
        return;
      }
      setVehicles(data.vehicles || []);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAddModalVisible(false);
      setAddForm({ type: 'Economy', make: '', model: '', year: '', color: '', plate: '' });
      showSuccess('Vehicle added! It will be verified before accepting rides.');
    } catch {
      Alert.alert('Error', 'Could not add vehicle. Check your connection.');
    } finally {
      setAdding(false);
    }
  };

  const activeVehicle = vehicles.find(v => v.is_active);
  const otherVehicles = vehicles.filter(v => !v.is_active);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Vehicles</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setAddModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Success toast */}
      {successMessage && (
        <View style={styles.successToast}>
          <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
          <Text style={styles.successToastText}>{successMessage}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        {loadError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#EF4444" />
            <Text style={styles.errorText}>Could not load vehicles.</Text>
            <TouchableOpacity onPress={loadVehicles}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {loading && !loadError && (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading vehicles…</Text>
          </View>
        )}

        {!loading && vehicles.length === 0 && !loadError && (
          <View style={styles.emptyState}>
            <LinearGradient colors={['#EFF6FF', '#DBEAFE']} style={styles.emptyIconCircle}>
              <Ionicons name="car-outline" size={52} color={COLORS.primary} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No Vehicles Registered</Text>
            <Text style={styles.emptySubtitle}>
              Add your vehicle to start accepting rides on NEXRYDE.
            </Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setAddModalVisible(true)} activeOpacity={0.88}>
              <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
              <Text style={styles.emptyAddBtnText}>Add Your First Vehicle</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Active vehicle */}
        {!loading && activeVehicle && (
          <>
            <Text style={styles.sectionLabel}>ACTIVE VEHICLE</Text>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <LinearGradient
                colors={['#1E3A5F', '#2563EB']}
                style={styles.activeCard}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <View style={styles.activeCardTop}>
                  <View style={styles.activeIconWrap}>
                    <Ionicons name={vehicleTypeIcon(activeVehicle.type)} size={30} color={COLORS.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeVehicleName}>
                      {[activeVehicle.make, activeVehicle.model].filter(Boolean).join(' ') || 'My Vehicle'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <ColorDot color={activeVehicle.color} size={12} />
                      <Text style={styles.activeVehicleDetail}>
                        {[activeVehicle.color, activeVehicle.year, activeVehicle.plate].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.activeBadge}>
                    <Ionicons name="radio-button-on" size={12} color="#4ADE80" />
                    <Text style={styles.activeBadgeText}>Active</Text>
                  </View>
                </View>

                {/* Verification status bar */}
                <View style={styles.activeStatusRow}>
                  <View style={[styles.activeStatusPill, {
                    backgroundColor: activeVehicle.verification_status === 'verified' || activeVehicle.verification_status === 'approved' ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)',
                  }]}>
                    <Ionicons
                      name={activeVehicle.verification_status === 'verified' || activeVehicle.verification_status === 'approved' ? 'shield-checkmark' : 'time'}
                      size={13}
                      color={activeVehicle.verification_status === 'verified' || activeVehicle.verification_status === 'approved' ? '#4ADE80' : '#FCD34D'}
                    />
                    <Text style={[styles.activeStatusText, {
                      color: activeVehicle.verification_status === 'verified' || activeVehicle.verification_status === 'approved' ? '#4ADE80' : '#FCD34D',
                    }]}>
                      {statusLabel(activeVehicle.verification_status)}
                    </Text>
                  </View>
                  {activeVehicle.type ? (
                    <View style={styles.activeTypePill}>
                      <Text style={styles.activeTypeText}>{activeVehicle.type}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Edit action row */}
                <View style={styles.activeActions}>
                  <TouchableOpacity style={styles.activeEditBtn} onPress={() => openEdit(activeVehicle)} activeOpacity={0.8}>
                    <Ionicons name="create-outline" size={16} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.activeEditBtnText}>Edit</Text>
                  </TouchableOpacity>
                  {vehicles.length > 1 && (
                    <TouchableOpacity
                      style={styles.activeEditBtn}
                      onPress={() => handleRemove(activeVehicle)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="trash-outline" size={16} color="rgba(255,100,100,0.9)" />
                      <Text style={[styles.activeEditBtnText, { color: 'rgba(255,100,100,0.9)' }]}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </LinearGradient>
            </Animated.View>
          </>
        )}

        {/* Other vehicles */}
        {!loading && otherVehicles.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: SPACING.xl }]}>OTHER VEHICLES</Text>
            {otherVehicles.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleCard}>
                <View style={styles.vehicleCardLeft}>
                  <View style={styles.vehicleIconWrap}>
                    <Ionicons name={vehicleTypeIcon(vehicle.type)} size={24} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle'}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <ColorDot color={vehicle.color} size={11} />
                      <Text style={styles.vehicleDetail}>
                        {[vehicle.color, vehicle.year, vehicle.plate].filter(Boolean).join(' • ')}
                      </Text>
                    </View>
                    <View style={[styles.verificationChip, { backgroundColor: statusBg(vehicle.verification_status) }]}>
                      <View style={[styles.verificationDot, { backgroundColor: statusColor(vehicle.verification_status) }]} />
                      <Text style={[styles.verificationChipText, { color: statusColor(vehicle.verification_status) }]}>
                        {statusLabel(vehicle.verification_status)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.vehicleCardActions}>
                  <TouchableOpacity
                    style={styles.switchBtn}
                    onPress={() => handleSwitch(vehicle)}
                    activeOpacity={0.8}
                    disabled={switchingId === vehicle.id}
                  >
                    {switchingId === vehicle.id
                      ? <ActivityIndicator size="small" color={COLORS.white} />
                      : <>
                          <Ionicons name="swap-horizontal" size={14} color={COLORS.white} />
                          <Text style={styles.switchBtnText}>Switch</Text>
                        </>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.editIconBtn} onPress={() => openEdit(vehicle)} activeOpacity={0.8}>
                    <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeIconBtn}
                    onPress={() => handleRemove(vehicle)}
                    activeOpacity={0.8}
                    disabled={removingId === vehicle.id}
                  >
                    {removingId === vehicle.id
                      ? <ActivityIndicator size="small" color="#EF4444" />
                      : <Ionicons name="trash-outline" size={18} color="#EF4444" />
                    }
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </>
        )}

        {/* Add vehicle CTA at bottom */}
        {!loading && vehicles.length > 0 && (
          <TouchableOpacity style={styles.addVehicleRow} onPress={() => setAddModalVisible(true)} activeOpacity={0.88}>
            <View style={styles.addVehicleIcon}>
              <Ionicons name="add" size={22} color={COLORS.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.addVehicleText}>Add Another Vehicle</Text>
              <Text style={styles.addVehicleSubtext}>New vehicle will require verification</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        )}

        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={16} color="#6B7280" />
          <Text style={styles.infoNoteText}>
            Only your active vehicle is used when you go online. Switch anytime without leaving the app.
          </Text>
        </View>
      </ScrollView>

      {/* ===== ADD VEHICLE MODAL ===== */}
      <Modal visible={addModalVisible} animationType="slide" transparent onRequestClose={() => setAddModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Vehicle</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Vehicle type selector */}
              <Text style={styles.inputLabel}>Vehicle Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeScroll}>
                {VEHICLE_TYPES.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typePill, addForm.type === t && styles.typePillActive]}
                    onPress={() => setAddForm(f => ({ ...f, type: t }))}
                  >
                    <Text style={[styles.typePillText, addForm.type === t && styles.typePillTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Make <Text style={styles.optional}>(e.g. Honda)</Text></Text>
              <TextInput style={styles.input} value={addForm.make} onChangeText={v => setAddForm(f => ({ ...f, make: v }))} placeholder="Toyota, Honda, Hyundai…" placeholderTextColor="#9CA3AF" autoCapitalize="words" />

              <Text style={styles.inputLabel}>Model <Text style={styles.required}>*</Text></Text>
              <TextInput style={styles.input} value={addForm.model} onChangeText={v => setAddForm(f => ({ ...f, model: v }))} placeholder="Corolla, Accord, Elantra…" placeholderTextColor="#9CA3AF" autoCapitalize="words" />

              <View style={styles.rowInputs}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Year <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} value={addForm.year} onChangeText={v => setAddForm(f => ({ ...f, year: v }))} placeholder="2020" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={4} />
                </View>
                <View style={styles.rowInputGap} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Color <Text style={styles.required}>*</Text></Text>
                  <TextInput style={styles.input} value={addForm.color} onChangeText={v => setAddForm(f => ({ ...f, color: v }))} placeholder="Silver" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
                </View>
              </View>

              <Text style={styles.inputLabel}>Plate Number <Text style={styles.required}>*</Text></Text>
              <TextInput style={[styles.input, styles.plateInput]} value={addForm.plate} onChangeText={v => setAddForm(f => ({ ...f, plate: v.toUpperCase() }))} placeholder="ABC123XY" placeholderTextColor="#9CA3AF" autoCapitalize="characters" />

              <View style={styles.modalNote}>
                <Ionicons name="alert-circle-outline" size={16} color="#D97706" />
                <Text style={styles.modalNoteText}>
                  New vehicles require document verification before accepting rides. You will be contacted by NEXRYDE support.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.addConfirmBtn, adding && { opacity: 0.7 }]}
                onPress={handleAdd}
                disabled={adding}
                activeOpacity={0.88}
              >
                {adding
                  ? <ActivityIndicator color={COLORS.white} />
                  : <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />
                      <Text style={styles.addConfirmBtnText}>Add Vehicle</Text>
                    </>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ===== EDIT VEHICLE MODAL ===== */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) + 8 }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Vehicle</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Make</Text>
            <TextInput style={styles.input} value={editMake} onChangeText={setEditMake} placeholder="Toyota, Honda…" placeholderTextColor="#9CA3AF" autoCapitalize="words" />

            <Text style={styles.inputLabel}>Model</Text>
            <TextInput style={styles.input} value={editModel} onChangeText={setEditModel} placeholder="Corolla, Accord…" placeholderTextColor="#9CA3AF" autoCapitalize="words" />

            <View style={styles.rowInputs}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Year</Text>
                <TextInput style={styles.input} value={editYear} onChangeText={setEditYear} placeholder="2020" placeholderTextColor="#9CA3AF" keyboardType="number-pad" maxLength={4} />
              </View>
              <View style={styles.rowInputGap} />
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Color</Text>
                <TextInput style={styles.input} value={editColor} onChangeText={setEditColor} placeholder="Dark Gray" placeholderTextColor="#9CA3AF" autoCapitalize="words" />
              </View>
            </View>

            <Text style={styles.inputLabel}>Plate Number</Text>
            <TextInput style={[styles.input, styles.plateInput]} value={editPlate} onChangeText={v => setEditPlate(v.toUpperCase())} placeholder="KTU65KE" placeholderTextColor="#9CA3AF" autoCapitalize="characters" />

            <TouchableOpacity
              style={[styles.addConfirmBtn, saving && { opacity: 0.7 }]}
              onPress={handleSaveEdit}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving
                ? <ActivityIndicator color={COLORS.white} />
                : <>
                    <Ionicons name="checkmark" size={20} color={COLORS.white} />
                    <Text style={styles.addConfirmBtnText}>Save Changes</Text>
                  </>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  successToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  successToastText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#15803D' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 } }),
    elevation: 2,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: '#111827' },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  content: { padding: SPACING.lg },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: '#FEF2F2', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.lg,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: FONT_SIZE.sm, color: '#EF4444', fontWeight: '600' },
  retryText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '700' },
  loadingCenter: { alignItems: 'center', paddingVertical: 60, gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZE.sm, color: '#9CA3AF' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: SPACING.md },
  emptyIconCircle: {
    width: 108, height: 108, borderRadius: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: '#111827' },
  emptySubtitle: {
    fontSize: FONT_SIZE.sm, color: '#6B7280',
    textAlign: 'center', paddingHorizontal: 32, lineHeight: 22,
  },
  emptyAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.sm, ...SHADOWS.md,
  },
  emptyAddBtnText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6B7280',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  // Active card
  activeCard: {
    borderRadius: BORDER_RADIUS.xl + 4,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.lg,
  },
  activeCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.md },
  activeIconWrap: {
    width: 56, height: 56, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  activeVehicleName: { fontSize: FONT_SIZE.xl, fontWeight: '900', color: COLORS.white, lineHeight: 26 },
  activeVehicleDetail: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 20 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(74,222,128,0.2)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  activeBadgeText: { fontSize: 12, fontWeight: '800', color: '#4ADE80' },
  activeStatusRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  activeStatusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
  },
  activeStatusText: { fontSize: 12, fontWeight: '700' },
  activeTypePill: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  activeTypeText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  activeActions: {
    flexDirection: 'row', gap: SPACING.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)',
    paddingTop: SPACING.md,
  },
  activeEditBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.md,
  },
  activeEditBtnText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  // Other vehicle cards
  vehicleCard: {
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, marginBottom: SPACING.sm,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#F1F5F9',
    ...SHADOWS.sm,
  },
  vehicleCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  vehicleIconWrap: {
    width: 48, height: 48, borderRadius: BORDER_RADIUS.lg,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  vehicleName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#111827' },
  vehicleDetail: { fontSize: FONT_SIZE.xs, color: '#6B7280', fontWeight: '500', marginTop: 2, lineHeight: 18 },
  verificationChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm, paddingVertical: 2,
    borderRadius: BORDER_RADIUS.full,
  },
  verificationDot: { width: 6, height: 6, borderRadius: 3 },
  verificationChipText: { fontSize: 11, fontWeight: '700' },
  vehicleCardActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: SPACING.sm },
  switchBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: BORDER_RADIUS.md, minWidth: 64,
    justifyContent: 'center',
  },
  switchBtnText: { fontSize: 12, fontWeight: '800', color: COLORS.white },
  editIconBtn: {
    width: 34, height: 34, borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  removeIconBtn: {
    width: 34, height: 34, borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
  },
  // Add row
  addVehicleRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    backgroundColor: COLORS.white, borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md, marginTop: SPACING.md,
    borderWidth: 1.5, borderColor: '#BFDBFE', borderStyle: 'dashed',
  },
  addVehicleIcon: {
    width: 44, height: 44, borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  addVehicleText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: '#1D4ED8' },
  addVehicleSubtext: { fontSize: FONT_SIZE.xs, color: '#6B7280', marginTop: 2 },
  // Info note
  infoNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs,
    backgroundColor: '#F9FAFB', padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg, marginTop: SPACING.lg,
  },
  infoNoteText: { flex: 1, fontSize: FONT_SIZE.xs, color: '#6B7280', lineHeight: 18 },
  // Modals
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingHorizontal: SPACING.lg, paddingTop: SPACING.md,
  },
  modalDragHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#D1D5DB', alignSelf: 'center', marginBottom: SPACING.md,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: '#111827' },
  inputLabel: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#374151', marginBottom: SPACING.xs, marginTop: SPACING.sm },
  optional: { fontWeight: '400', color: '#9CA3AF' },
  required: { color: '#EF4444' },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: BORDER_RADIUS.lg, paddingHorizontal: SPACING.md,
    paddingVertical: 12, fontSize: FONT_SIZE.md, color: '#111827',
  },
  plateInput: { fontWeight: '800', letterSpacing: 2 },
  rowInputs: { flexDirection: 'row', alignItems: 'flex-start' },
  rowInputGap: { width: SPACING.md },
  typeScroll: { marginBottom: SPACING.sm, marginTop: SPACING.xs },
  typePill: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full, backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#E5E7EB', marginRight: SPACING.xs,
  },
  typePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typePillText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: '#374151' },
  typePillTextActive: { color: COLORS.white },
  modalNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: '#FFFBEB', borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md, marginTop: SPACING.lg,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  modalNoteText: { flex: 1, fontSize: FONT_SIZE.xs, color: '#92400E', lineHeight: 18 },
  addConfirmBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primary, padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl, marginTop: SPACING.lg, ...SHADOWS.md,
  },
  addConfirmBtnText: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.white },
});
