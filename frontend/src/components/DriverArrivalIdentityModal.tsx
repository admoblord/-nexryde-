/**
 * DriverArrivalIdentityModal — NEXRYDE Safety Identity System
 *
 * Shown when driver arrives at pickup. Presents:
 *  – Full driver photo / avatar
 *  – Name, rating, vehicle model, colour
 *  – GIANT plate number (high-contrast, easy to read at night)
 *  – 3-step confirmation checklist
 *  – [Confirm Driver] button (enabled once all 3 checked)
 *  – [Report Mismatch] panic link
 *  – Auto-confirm when all conditions are met silently
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Image, ScrollView, Animated, Easing, Platform,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

const { width: W } = Dimensions.get('window');

/* ─────────────────────── types ─────────────────────── */
export interface DriverIdentity {
  driver_id: string;
  name: string;
  rating: number | null;
  profile_image?: string | null;
  face_image?: string | null;
  vehicle: string;
  plate: string;
  color: string;
  vehicle_type?: string;
}

export interface DriverArrivalIdentityModalProps {
  visible: boolean;
  driver: DriverIdentity | null;
  /**  Whether rider GPS is close to pickup (<= 150 m) */
  riderNearPickup?: boolean;
  /** Whether pickup code was already verified */
  pickupCodeVerified?: boolean;
  onConfirmDriver: () => void;
  onReportMismatch: () => void;
  onDismiss: () => void;
  onShowPickupCode: () => void;
}

/* ─────────────────────── utils ─────────────────────── */
function getVehicleTypeLabel(raw?: string | null): string {
  if (!raw) return 'Standard';
  const m = raw.toLowerCase();
  if (m.includes('premium')) return 'Premium';
  if (m.includes('xl') || m.includes('suv')) return 'XL / SUV';
  if (m.includes('comfort')) return 'Comfort';
  if (m.includes('female')) return 'Women Only';
  return 'Standard';
}

function getVehicleTypeColor(raw?: string | null): string {
  const m = (raw || '').toLowerCase();
  if (m.includes('premium')) return '#9333EA';
  if (m.includes('xl') || m.includes('suv')) return '#FFB800';
  if (m.includes('comfort')) return '#0EA5E9';
  if (m.includes('female')) return '#EC4899';
  return '#22E5A0';
}

/* ─────────────────────── Checklist item ─────────────────────── */
function CheckItem({
  index, label, checked, onToggle,
}: {
  index: number; label: string; checked: boolean; onToggle: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = useCallback(() => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 140, useNativeDriver: true, easing: Easing.out(Easing.back(2)) }),
    ]).start();
    onToggle();
  }, [onToggle, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        style={[ci.row, checked && ci.rowChecked]}
        onPress={handlePress}
        activeOpacity={0.85}
      >
        <View style={[ci.circle, checked && ci.circleChecked]}>
          {checked
            ? <Ionicons name="checkmark" size={15} color="#022C22" />
            : <Text style={ci.num}>{index + 1}</Text>
          }
        </View>
        <Text style={[ci.label, checked && ci.labelChecked]}>{label}</Text>
        {checked && <Ionicons name="shield-checkmark" size={16} color="#22E5A0" />}
      </TouchableOpacity>
    </Animated.View>
  );
}

const ci = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
  },
  rowChecked: {
    backgroundColor: 'rgba(34,229,160,0.08)',
    borderColor: 'rgba(34,229,160,0.45)',
  },
  circle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
  },
  circleChecked: {
    backgroundColor: '#22E5A0',
    borderColor: '#22E5A0',
  },
  num:  { fontSize: 13, fontWeight: '800', color: '#94A3B8' },
  label: { flex: 1, fontSize: 15, fontWeight: '700', color: '#CBD5E1' },
  labelChecked: { color: '#E2E8F0' },
});

/* ─────────────────────── Main modal ─────────────────────── */
export default function DriverArrivalIdentityModal({
  visible,
  driver,
  riderNearPickup = false,
  pickupCodeVerified = false,
  onConfirmDriver,
  onReportMismatch,
  onDismiss,
  onShowPickupCode,
}: DriverArrivalIdentityModalProps) {
  const insets = useSafeAreaInsets();
  const [imgErr, setImgErr] = useState(false);
  const [checks, setChecks] = useState([false, false, false]);
  const allChecked = checks.every(Boolean);
  const slideAnim = useRef(new Animated.Value(W)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  /* Slide in when visible */
  useEffect(() => {
    if (visible) {
      setImgErr(false);
      setChecks([false, false, false]);
      Animated.spring(slideAnim, {
        toValue: 0, tension: 60, friction: 11, useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: W, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease),
      }).start();
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Plate number pulse when first shown */
  useEffect(() => {
    if (!visible) return;
    if (pulseLoop.current) pulseLoop.current.stop();
    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.04, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
      { iterations: 6 }
    );
    pulseLoop.current.start();
    return () => { if (pulseLoop.current) pulseLoop.current.stop(); };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Auto-confirm silently */
  useEffect(() => {
    if (!visible || !riderNearPickup || !pickupCodeVerified) return;
    const t = setTimeout(() => {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onConfirmDriver();
    }, 1200);
    return () => clearTimeout(t);
  }, [visible, riderNearPickup, pickupCodeVerified, onConfirmDriver]);

  const toggleCheck = useCallback((i: number) => {
    setChecks((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }, []);

  const handleConfirm = useCallback(() => {
    if (!allChecked) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirmDriver();
  }, [allChecked, onConfirmDriver]);

  if (!driver) return null;

  const photo = !imgErr ? (driver.profile_image || driver.face_image || null) : null;
  const ratingStr = driver.rating != null ? Number(driver.rating).toFixed(1) : null;
  const vtLabel = getVehicleTypeLabel(driver.vehicle_type || driver.vehicle);
  const vtColor = getVehicleTypeColor(driver.vehicle_type || driver.vehicle);

  const checkLabels = [
    `Plate number: ${driver.plate || '—'}`,
    `Vehicle colour: ${driver.color || '—'}`,
    `Driver face matches photo`,
  ];

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <View style={m.overlay}>
        <Animated.View
          style={[
            m.sheet,
            {
              transform: [{ translateX: slideAnim }],
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          {/* ── HEADER ── */}
          <View style={m.header}>
            <LinearGradient
              colors={['rgba(34,229,160,0.15)', 'transparent']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={m.arrivedBadge}>
              <Ionicons name="location" size={14} color="#0a0f1e" />
              <Text style={m.arrivedBadgeText}>DRIVER ARRIVED</Text>
            </View>
            <Text style={m.headerTitle}>Verify your driver</Text>
            <Text style={m.headerSub}>
              Before entering — confirm the details match
            </Text>
            <TouchableOpacity style={m.closeBtn} onPress={onDismiss} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={m.scroll}
            contentContainerStyle={m.scrollContent}
            showsVerticalScrollIndicator={false}
          >

            {/* ── DRIVER PHOTO + NAME ── */}
            <View style={m.driverRow}>
              <View style={m.avatarWrap}>
                {photo ? (
                  <Image
                    source={{ uri: photo }}
                    style={m.avatar}
                    onError={() => setImgErr(true)}
                  />
                ) : (
                  <LinearGradient colors={['#1e40af', '#7c3aed']} style={m.avatar}>
                    <Text style={m.avatarInitial}>
                      {(driver.name || 'D').charAt(0).toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
                {/* Verified badge */}
                <View style={m.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={12} color="#0a0f1e" />
                </View>
              </View>

              <View style={m.driverMeta}>
                <Text style={m.driverName} numberOfLines={1}>{driver.name}</Text>
                {ratingStr && (
                  <View style={m.ratingRow}>
                    <Ionicons name="star" size={13} color="#EAB308" />
                    <Text style={m.ratingText}>{ratingStr} rating</Text>
                  </View>
                )}
                <View style={[m.vtBadge, { backgroundColor: vtColor + '20', borderColor: vtColor + '55' }]}>
                  <Text style={[m.vtBadgeText, { color: vtColor }]}>{vtLabel}</Text>
                </View>
              </View>
            </View>

            {/* ── VEHICLE INFO ── */}
            <View style={m.vehicleCard}>
              <View style={m.vehicleRow}>
                <Ionicons name="car-sport" size={20} color="#22E5A0" />
                <View style={m.vehicleText}>
                  <Text style={m.vehicleLabel}>VEHICLE</Text>
                  <Text style={m.vehicleValue}>{driver.vehicle || 'Vehicle'}</Text>
                </View>
              </View>

              <View style={m.vehicleDivider} />

              <View style={m.vehicleRow}>
                <View style={[m.colorDot, { backgroundColor: resolveColorDot(driver.color) }]} />
                <View style={m.vehicleText}>
                  <Text style={m.vehicleLabel}>COLOUR</Text>
                  <Text style={m.vehicleValue}>{driver.color || '—'}</Text>
                </View>
              </View>
            </View>

            {/* ── PLATE NUMBER — HERO ── */}
            <View style={m.plateOuter}>
              <Text style={m.plateHint}>LICENCE PLATE</Text>
              <Animated.View
                style={[m.platePlate, { transform: [{ scale: pulseAnim }] }]}
              >
                <LinearGradient
                  colors={['#0f172a', '#1e293b']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                />
                {/* Left flag stripe */}
                <View style={m.plateFlag}>
                  <View style={m.plateFlagGreen} />
                  <View style={m.plateFlagWhite} />
                  <View style={m.plateFlagGreen2} />
                </View>
                <Text style={m.plateNumber} selectable>
                  {driver.plate || '— — —'}
                </Text>
              </Animated.View>
              <Text style={m.plateCaption}>Look for this on the vehicle</Text>
            </View>

            {/* ── CHECKLIST ── */}
            <View style={m.checklistSection}>
              <View style={m.checklistHeader}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#94A3B8" />
                <Text style={m.checklistTitle}>Confirm before boarding</Text>
              </View>
              <View style={m.checklistItems}>
                {checkLabels.map((label, i) => (
                  <CheckItem
                    key={i}
                    index={i}
                    label={label}
                    checked={checks[i]}
                    onToggle={() => toggleCheck(i)}
                  />
                ))}
              </View>
            </View>

            {/* ── PICKUP CODE CTA ── */}
            <TouchableOpacity style={m.codeBtn} onPress={onShowPickupCode} activeOpacity={0.88}>
              <Ionicons name="keypad" size={18} color="#0ea5e9" />
              <Text style={m.codeBtnText}>Show pick-up code to driver</Text>
              <Ionicons name="chevron-forward" size={16} color="#0ea5e9" />
            </TouchableOpacity>

          </ScrollView>

          {/* ── ACTION BUTTONS ── */}
          <View style={m.actions}>
            {/* Confirm button */}
            <TouchableOpacity
              style={[m.confirmBtn, !allChecked && m.confirmBtnDisabled]}
              onPress={handleConfirm}
              disabled={!allChecked}
              activeOpacity={0.9}
            >
              <LinearGradient
                colors={allChecked ? ['#22E5A0', '#00a855'] : ['#1e293b', '#1e293b']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={m.confirmGrad}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={20}
                  color={allChecked ? '#022C22' : '#475569'}
                />
                <Text style={[m.confirmText, !allChecked && m.confirmTextDisabled]}>
                  {allChecked ? 'Confirm Driver — Board Now' : `Tick all ${checks.filter(Boolean).length}/3 items to confirm`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Mismatch / panic row */}
            <TouchableOpacity
              style={m.mismatchBtn}
              onPress={onReportMismatch}
              activeOpacity={0.88}
            >
              <Ionicons name="warning-outline" size={16} color="#ef4444" />
              <Text style={m.mismatchText}>
                Details don't match? Report mismatch
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ─────────────────────── Mismatch alert modal ─────────────────────── */
export function DriverMismatchModal({
  visible,
  onReport,
  onCancelRide,
  onClose,
}: {
  visible: boolean;
  onReport: () => void;
  onCancelRide: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    Animated.sequence([
      Animated.timing(shake, { toValue: 10,  duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8,   duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8,  duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0,   duration: 55, useNativeDriver: true }),
    ]).start();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={mm.overlay}>
        <Animated.View
          style={[mm.card, { paddingBottom: Math.max(insets.bottom, 20) + 4, transform: [{ translateX: shake }] }]}
        >
          <LinearGradient
            colors={['rgba(239,68,68,0.18)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={mm.iconWrap}>
            <Ionicons name="alert-circle" size={44} color="#ef4444" />
          </View>
          <Text style={mm.title}>This does not match your driver</Text>
          <Text style={mm.body}>
            Do not enter the vehicle.{'\n'}
            Your safety is the priority — stay in a safe location.
          </Text>
          <View style={mm.bullets}>
            {[
              'Move away from the vehicle',
              'Call someone you trust',
              'Contact NEXRYDE support',
            ].map((t, i) => (
              <View key={i} style={mm.bulletRow}>
                <Ionicons name="chevron-forward" size={14} color="#ef4444" />
                <Text style={mm.bulletText}>{t}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity style={mm.reportBtn} onPress={onReport} activeOpacity={0.88}>
            <LinearGradient
              colors={['#ef4444', '#b91c1c']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={mm.reportGrad}
            >
              <Ionicons name="flag" size={18} color="#FFF" />
              <Text style={mm.reportText}>Report Mismatch to NEXRYDE</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity style={mm.cancelBtn} onPress={onCancelRide} activeOpacity={0.88}>
            <Ionicons name="close-circle-outline" size={18} color="#ef4444" />
            <Text style={mm.cancelText}>Cancel this ride</Text>
          </TouchableOpacity>
          <TouchableOpacity style={mm.closeLink} onPress={onClose}>
            <Text style={mm.closeLinkText}>Dismiss</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

/* ─────────────────────── Color dot resolver ─────────────────────── */
function resolveColorDot(color: string): string {
  const c = (color || '').toLowerCase();
  if (c.includes('black'))  return '#1a1a1a';
  if (c.includes('white'))  return '#f0f0f0';
  if (c.includes('silver') || c.includes('grey') || c.includes('gray')) return '#9ca3af';
  if (c.includes('red'))    return '#ef4444';
  if (c.includes('blue'))   return '#3b82f6';
  if (c.includes('green'))  return '#22c55e';
  if (c.includes('gold') || c.includes('yellow')) return '#eab308';
  if (c.includes('orange')) return '#f97316';
  if (c.includes('brown'))  return '#92400e';
  if (c.includes('maroon')) return '#9f1239';
  if (c.includes('purple') || c.includes('violet')) return '#9333ea';
  if (c.includes('beige') || c.includes('cream'))   return '#d6c8a0';
  return '#94a3b8';
}

/* ─────────────────────── Styles ─────────────────────── */
const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0D1420',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.1)',
    maxHeight: '92%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6, shadowRadius: 20, elevation: 24,
  },

  /* Header */
  header: {
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  arrivedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: '#22E5A0', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  arrivedBadgeText: { fontSize: 11, fontWeight: '900', color: '#022C22', letterSpacing: 1 },
  headerTitle: { fontSize: 22, fontWeight: '900', color: '#E2E8F0', letterSpacing: -0.3 },
  headerSub:   { fontSize: 13, fontWeight: '600', color: '#64748B', marginTop: 3 },
  closeBtn: {
    position: 'absolute', top: 20, right: 16,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, gap: 14 },

  /* Driver row */
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarWrap: { width: 76, height: 76, borderRadius: 38, position: 'relative' },
  avatar: {
    width: 76, height: 76, borderRadius: 38,
    borderWidth: 3, borderColor: '#22E5A0',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: { fontSize: 30, fontWeight: '900', color: '#FFF' },
  verifiedBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#22E5A0', borderWidth: 2, borderColor: '#0D1420',
    alignItems: 'center', justifyContent: 'center',
  },
  driverMeta: { flex: 1, gap: 5 },
  driverName: { fontSize: 20, fontWeight: '900', color: '#E2E8F0' },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ratingText: { fontSize: 14, fontWeight: '700', color: '#EAB308' },
  vtBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1,
  },
  vtBadgeText: { fontSize: 12, fontWeight: '800' },

  /* Vehicle card */
  vehicleCard: {
    backgroundColor: '#111827', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#1e293b',
  },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleText: { flex: 1 },
  vehicleLabel: { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 0.8, textTransform: 'uppercase' },
  vehicleValue: { fontSize: 16, fontWeight: '800', color: '#E2E8F0', marginTop: 2 },
  vehicleDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)', marginVertical: 12 },
  colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },

  /* Plate hero */
  plateOuter: { alignItems: 'center', gap: 8 },
  plateHint:  { fontSize: 10, fontWeight: '800', color: '#64748B', letterSpacing: 1.5, textTransform: 'uppercase' },
  platePlate: {
    width: W - 48,
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#22E5A0', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  plateFlag: { width: 18, height: 52, marginRight: 18, overflow: 'hidden', borderRadius: 2, gap: 0 },
  plateFlagGreen:  { flex: 1, backgroundColor: '#006600' },
  plateFlagWhite:  { flex: 1, backgroundColor: '#FFFFFF' },
  plateFlagGreen2: { flex: 1, backgroundColor: '#006600' },
  plateNumber: {
    flex: 1,
    fontSize: 36,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 6,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(34,229,160,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  plateCaption: { fontSize: 12, fontWeight: '600', color: '#475569' },

  /* Checklist */
  checklistSection: { gap: 10 },
  checklistHeader: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  checklistTitle:  { fontSize: 13, fontWeight: '800', color: '#94A3B8', letterSpacing: 0.5 },
  checklistItems:  { gap: 8 },

  /* Pickup code CTA */
  codeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(14,165,233,0.1)',
    borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'rgba(14,165,233,0.3)',
  },
  codeBtnText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#0ea5e9' },

  /* Actions */
  actions: { paddingHorizontal: 18, paddingTop: 10, gap: 10 },
  confirmBtn:  { borderRadius: 16, overflow: 'hidden' },
  confirmBtnDisabled: {},
  confirmGrad: {
    paddingVertical: 17, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  confirmText:         { fontSize: 16, fontWeight: '900', color: '#022C22' },
  confirmTextDisabled: { color: '#475569' },
  mismatchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12,
  },
  mismatchText: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
});

const mm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#0D1420',
    borderRadius: 24, padding: 24,
    width: '100%', maxWidth: 400,
    borderWidth: 1.5, borderColor: 'rgba(239,68,68,0.4)',
    overflow: 'hidden',
    shadowColor: '#ef4444', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 14,
  },
  iconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 14,
    borderWidth: 2, borderColor: 'rgba(239,68,68,0.4)',
  },
  title: { fontSize: 20, fontWeight: '900', color: '#E2E8F0', textAlign: 'center', marginBottom: 8 },
  body:  { fontSize: 14, fontWeight: '600', color: '#94A3B8', textAlign: 'center', lineHeight: 22, marginBottom: 16 },
  bullets: { gap: 6, marginBottom: 20 },
  bulletRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bulletText: { fontSize: 14, fontWeight: '600', color: '#CBD5E1' },
  reportBtn:  { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  reportGrad: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  reportText: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  cancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  cancelText:   { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  closeLink:    { alignItems: 'center', marginTop: 12 },
  closeLinkText: { fontSize: 13, fontWeight: '600', color: '#475569' },
});
