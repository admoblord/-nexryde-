import React, { useCallback, useEffect, useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { getDriverProfile, BACKEND_URL, getAuthHeaders } from '@/src/services/api';

interface Vehicle {
  id: string;
  type: string;
  make: string;
  model: string;
  year: string;
  color: string;
  plate: string;
  is_default?: boolean;
}

const VEHICLE_TYPE_OPTIONS = ['Economy', 'Comfort', 'XL', 'Premium', 'Sedan', 'SUV', 'Hatchback', 'Minivan'];

export default function VehicleScreen() {
  const router = useRouter();
  const { user, driverProfile, setDriverProfile } = useAppStore();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isApproved, setIsApproved] = useState(false);

  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editColor, setEditColor] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setLoadError(false);
    try {
      const res = await getDriverProfile(user.id);
      const profile = res.data as any;
      setDriverProfile(profile);
      setVehicles(profile?.vehicles || []);
      setIsApproved(profile?.verification_status === 'approved');
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, setDriverProfile]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadProfile();
  };

  const openEditModal = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setEditColor(vehicle.color);
    setEditPlate(vehicle.plate);
    setEditModalVisible(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const saveVehicleEdits = async () => {
    if (!editingVehicle || !user?.id) return;
    setSaving(true);
    try {
      const updated: Vehicle = { ...editingVehicle, color: editColor.trim(), plate: editPlate.trim() };
      const newVehicles = vehicles.map(v => v.id === updated.id ? updated : v);
      // Persist flat fields (backward compat) + vehicles array
      const response = await fetch(`${BACKEND_URL}/api/drivers/${user.id}/profile`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_color: updated.color,
          vehicle_plate_number: updated.plate,
          vehicle_plate: updated.plate,
          vehicles: newVehicles,
        }),
      });
      if (!response.ok) throw new Error('Failed to update');
      setVehicles(newVehicles);
      setDriverProfile({ ...(driverProfile || {}), vehicles: newVehicles } as any);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditModalVisible(false);
      Alert.alert('Updated', 'Vehicle details saved.');
    } catch {
      Alert.alert('Error', 'Could not save changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const setDefaultVehicle = (vehicleId: string) => {
    const updated = vehicles.map(v => ({ ...v, is_default: v.id === vehicleId }));
    setVehicles(updated);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Persist
    fetch(`${BACKEND_URL}/api/drivers/${user!.id}/profile`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicles: updated }),
    }).catch(() => null);
  };

  const getVehicleTypeIcon = (type: string): React.ComponentProps<typeof Ionicons>['name'] => {
    const t = type.toLowerCase();
    if (t.includes('xl') || t.includes('suv') || t.includes('minivan')) return 'bus';
    if (t.includes('premium')) return 'diamond';
    if (t.includes('comfort')) return 'star';
    return 'car-sport';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Vehicles</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Error state */}
        {loadError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
            <Text style={styles.errorText}>Could not load vehicle info.</Text>
            <TouchableOpacity onPress={loadProfile}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading skeleton */}
        {loading && !loadError && (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your vehicles…</Text>
          </View>
        )}

        {/* Vehicles list */}
        {!loading && vehicles.length > 0 && (
          <>
            {isApproved && (
              <LinearGradient
                colors={['#059669', '#10B981']}
                style={styles.approvedBanner}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="shield-checkmark" size={22} color={COLORS.white} />
                <Text style={styles.approvedBannerText}>
                  Vehicle verified — you are cleared for ride requests
                </Text>
              </LinearGradient>
            )}

            <Text style={styles.sectionLabel}>Registered Vehicles</Text>

            {vehicles.map((vehicle) => (
              <View key={vehicle.id} style={[styles.vehicleCard, vehicle.is_default && styles.vehicleCardDefault]}>
                {vehicle.is_default && (
                  <View style={styles.defaultBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={COLORS.white} />
                    <Text style={styles.defaultBadgeText}>Active</Text>
                  </View>
                )}

                <View style={styles.vehicleCardTop}>
                  <View style={styles.vehicleIconWrap}>
                    <Ionicons name={getVehicleTypeIcon(vehicle.type)} size={28} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>
                      {[vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Unknown Vehicle'}
                    </Text>
                    <Text style={styles.vehicleDetail}>
                      {[vehicle.color, vehicle.year, vehicle.plate].filter(Boolean).join(' • ')}
                    </Text>
                    {vehicle.type ? (
                      <View style={styles.typePill}>
                        <Text style={styles.typePillText}>{vehicle.type}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View style={styles.vehicleActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => openEditModal(vehicle)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={16} color={COLORS.primary} />
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>

                  {vehicles.length > 1 && !vehicle.is_default && (
                    <TouchableOpacity
                      style={styles.defaultButton}
                      onPress={() => setDefaultVehicle(vehicle.id)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="radio-button-on-outline" size={16} color="#059669" />
                      <Text style={styles.defaultButtonText}>Set Active</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </>
        )}

        {/* Empty state */}
        {!loading && vehicles.length === 0 && !loadError && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}>
              <Ionicons name="car-outline" size={48} color={COLORS.gray300} />
            </View>
            <Text style={styles.emptyTitle}>No vehicles registered</Text>
            <Text style={styles.emptySubtitle}>
              Complete your driver profile to register your vehicle.
            </Text>
            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => router.push('/(auth)/driver-profile' as any)}
              activeOpacity={0.88}
            >
              <Ionicons name="add-circle-outline" size={20} color={COLORS.white} />
              <Text style={styles.registerButtonText}>Complete Driver Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Compliance note */}
        {!loading && vehicles.length > 0 && (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.gray400} />
            <Text style={styles.noteText}>
              To add a new vehicle, contact NEXRYDE support with your new vehicle documents.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Edit modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Vehicle</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Vehicle Color</Text>
            <TextInput
              style={styles.textInput}
              value={editColor}
              onChangeText={setEditColor}
              placeholder="e.g. Dark Gray"
              placeholderTextColor={COLORS.gray400}
              autoCapitalize="words"
            />

            <Text style={styles.inputLabel}>Plate Number</Text>
            <TextInput
              style={styles.textInput}
              value={editPlate}
              onChangeText={setEditPlate}
              placeholder="e.g. KTU65KE"
              placeholderTextColor={COLORS.gray400}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={[styles.saveButton, saving && { opacity: 0.7 }]}
              onPress={saveVehicleEdits}
              disabled={saving}
              activeOpacity={0.88}
            >
              {saving
                ? <ActivityIndicator color={COLORS.white} />
                : <>
                    <Ionicons name="checkmark" size={18} color={COLORS.white} />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
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
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  backButton: { padding: SPACING.sm },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray800 },
  content: { padding: SPACING.lg, paddingBottom: 40 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: { flex: 1, fontSize: FONT_SIZE.sm, color: COLORS.error, fontWeight: '600' },
  retryText: { fontSize: FONT_SIZE.sm, color: COLORS.primary, fontWeight: '700' },
  loadingCenter: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.md },
  loadingText: { fontSize: FONT_SIZE.sm, color: COLORS.gray400 },
  approvedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  approvedBannerText: { flex: 1, fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.white },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.gray500,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.md,
  },
  vehicleCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray100,
    ...SHADOWS.sm,
    position: 'relative',
    overflow: 'hidden',
  },
  vehicleCardDefault: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  defaultBadge: {
    position: 'absolute',
    top: SPACING.sm,
    right: SPACING.sm,
    backgroundColor: '#16A34A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.white },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md, marginBottom: SPACING.md },
  vehicleIconWrap: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray900, marginBottom: 4 },
  vehicleDetail: { fontSize: FONT_SIZE.sm, color: COLORS.gray500, fontWeight: '500', lineHeight: 20 },
  typePill: {
    marginTop: SPACING.xs,
    alignSelf: 'flex-start',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  typePillText: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  vehicleActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
    paddingTop: SPACING.md,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editButtonText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.primary },
  defaultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  defaultButtonText: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: '#059669' },
  emptyState: { alignItems: 'center', paddingVertical: SPACING.xxxl, gap: SPACING.md },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: FONT_SIZE.xl, fontWeight: '800', color: COLORS.gray800 },
  emptySubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
    textAlign: 'center',
    paddingHorizontal: SPACING.xl,
    lineHeight: 20,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.sm,
    ...SHADOWS.md,
  },
  registerButtonText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: COLORS.gray100,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.sm,
  },
  noteText: { flex: 1, fontSize: FONT_SIZE.xs, color: COLORS.gray500, lineHeight: 18 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    padding: SPACING.xl,
    paddingTop: SPACING.lg,
    gap: SPACING.sm,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.gray200,
    alignSelf: 'center',
    marginBottom: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  modalTitle: { fontSize: FONT_SIZE.lg, fontWeight: '800', color: COLORS.gray900 },
  inputLabel: { fontSize: FONT_SIZE.sm, fontWeight: '700', color: COLORS.gray700, marginTop: SPACING.sm },
  textInput: {
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    color: COLORS.gray900,
    marginTop: SPACING.xs,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.lg,
    ...SHADOWS.md,
  },
  saveButtonText: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white },
});
