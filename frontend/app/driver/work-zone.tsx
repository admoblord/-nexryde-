/**
 * Work Zone — included with NexRyde driver plan (trial + subscription).
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { useWorkZoneScreen } from '@/src/hooks/useWorkZoneScreen';
import { BACKEND_URL, getAuthHeaders } from '@/src/services/api';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { setWorkZoneFromApi } from '@/src/services/workZoneSession';
import { useWorkZoneScreenStore, type WorkZoneArea } from '@/src/store/workZoneScreenStore';
import { workZoneScreenLog } from '@/src/utils/workZoneScreenLog';
import { useFlowLayout } from '@/src/constants/flowLayout';
import { BORDER_RADIUS, SPACING } from '@/src/constants/theme';
import { BRAND, SURFACE } from '@/src/constants/designSystem';

const FOOTER_H = 88;
const SUBSCRIPTION_BENEFITS = [
  '100% of every fare',
  'Work Zone included',
  'Full trip details before accepting',
  'Zero commission',
] as const;

type DemandTone = { label: string; color: string; bg: string };

function demandTone(area: WorkZoneArea): DemandTone {
  const n = area.trips_per_week ?? 0;
  const dl = (area.demand_label || '').toLowerCase();
  if (dl === 'high' || n >= 40) {
    return { label: 'Busy', color: '#FCA5A5', bg: 'rgba(239,68,68,0.14)' };
  }
  if (dl === 'moderate' || dl === 'steady' || n >= 15) {
    return { label: 'Steady', color: '#FDE68A', bg: 'rgba(245,158,11,0.14)' };
  }
  return { label: 'Quiet', color: BRAND.textMuted, bg: 'rgba(148,163,184,0.12)' };
}

function demandHint(area: WorkZoneArea): string {
  const n = area.trips_per_week ?? 0;
  if (n >= 40) return `~${n} trips this week`;
  if (n >= 15) return `~${n} trips this week`;
  if (n > 0) return `~${n} trips · longer waits possible`;
  return 'Low recent volume';
}

export default function WorkZoneScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const flow = useFlowLayout();
  const { userId: driverId } = useAuthedUserId();
  const renderCount = useRef(0);
  renderCount.current += 1;
  workZoneScreenLog('WORKZONE_RENDER', { count: renderCount.current });

  const [benefitsOpen, setBenefitsOpen] = useState(false);

  const areas = useWorkZoneScreenStore((s) => s.areas);
  const driverState = useWorkZoneScreenStore((s) => s.driverState);
  const selected = useWorkZoneScreenStore((s) => s.selected);
  const initialLoadDone = useWorkZoneScreenStore((s) => s.initialLoadDone);
  const fetchInFlight = useWorkZoneScreenStore((s) => s.fetchInFlight);
  const saving = useWorkZoneScreenStore((s) => s.saving);
  const toggleSelected = useWorkZoneScreenStore((s) => s.toggleSelected);
  const setSaving = useWorkZoneScreenStore((s) => s.setSaving);
  const patchDriverState = useWorkZoneScreenStore((s) => s.patchDriverState);
  const setSelected = useWorkZoneScreenStore((s) => s.setSelected);

  useWorkZoneScreen(driverId);

  const showFirstLoadPlaceholder = !initialLoadDone && fetchInFlight;
  const canActivateWorkZone = Boolean(driverState?.entitled);
  const showSubscribeBanner =
    initialLoadDone && !canActivateWorkZone && !driverState?.active;
  const footerPad = Math.max(insets.bottom, SPACING.md);

  const scrollPad = useMemo(
    () => ({
      paddingHorizontal: flow.padH,
      paddingTop: SPACING.xs,
      paddingBottom: FOOTER_H + footerPad + SPACING.lg,
      maxWidth: flow.maxContentWidth,
      alignSelf: 'center' as const,
      width: '100%' as const,
    }),
    [flow.maxContentWidth, flow.padH, footerPad],
  );

  const selectedLabel = useMemo(() => {
    if (!selected.length) return null;
    const names = selected
      .map((id) => areas.find((a) => a.id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length <= 2) return names.join(' · ');
    return `${names.slice(0, 2).join(' · ')} +${names.length - 2}`;
  }, [areas, selected]);

  const canSelect = useCallback(
    (areaId: string) => {
      if (selected.includes(areaId)) return true;
      if (selected.length >= 4) return false;
      if (selected.length === 0) return true;
      return selected.some((id) => {
        const a = areas.find((x) => x.id === id);
        return a?.adjacent_ids?.includes(areaId);
      });
    },
    [areas, selected],
  );

  const bumpHaptic = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync();
  };

  const toggleArea = (areaId: string) => {
    if (selected.includes(areaId)) {
      bumpHaptic();
      toggleSelected(areaId);
      return;
    }
    if (!canSelect(areaId)) {
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert('Adjacent areas only', 'Pick areas next to your current selection (up to 4).');
      return;
    }
    bumpHaptic();
    toggleSelected(areaId);
  };

  const activate = async () => {
    if (!driverId || selected.length === 0) {
      Alert.alert('Select your zone', 'Choose 1–4 adjacent areas you want to work today.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/work-zone`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ area_ids: selected }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        Alert.alert('Could not activate', data.detail || 'Try again later.');
        return;
      }
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Work Zone ON', data.message || 'Zone active for today.');
      setWorkZoneFromApi(true, data.label || driverState?.label || '');
      patchDriverState({
        active: true,
        label: data.label || driverState?.label || '',
        area_ids: [...selected],
      });
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!driverId) return;
    Alert.alert('Turn off Work Zone?', 'You will receive trips from anywhere again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Turn off',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            const res = await fetch(`${BACKEND_URL}/api/drivers/${driverId}/work-zone`, {
              method: 'DELETE',
              headers: getAuthHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              Alert.alert('Could not turn off', data.detail || 'Your Work Zone is still active.');
              return;
            }
            setWorkZoneFromApi(false, '');
            patchDriverState({ active: false, area_ids: [] });
            setSelected([]);
          } finally {
            setSaving(false);
          }
        },
      },
    ]);
  };

  const planChip = driverState?.subscription_status === 'trial' ? 'Trial included' : 'Plan included';
  const featureUnavailable =
    initialLoadDone && driverState != null && !driverState.feature_available;

  const ctaDisabled = saving || !canActivateWorkZone || showFirstLoadPlaceholder;
  const ctaLabel = driverState?.active ? 'Update zone' : 'Activate Work Zone';

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[BRAND.bgDeep, BRAND.bgCard, BRAND.bgDeep]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar barStyle="light-content" />
        <TabBrandStrip role="driver" />

        <View style={[styles.header, { paddingHorizontal: flow.padH }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={BRAND.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Work Zone</Text>
          {driverState?.active ? (
            <View style={styles.activePill}>
              <View style={styles.activeDot} />
              <Text style={styles.activePillTxt}>LIVE</Text>
            </View>
          ) : (
            <View style={styles.headerBtnSpacer} />
          )}
        </View>

        <View style={styles.body}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={scrollPad}
          >
            {featureUnavailable ? (
              <View style={styles.unavailableCard}>
                <View style={styles.unavailableIcon}>
                  <Ionicons name="map-outline" size={28} color={BRAND.textMuted} />
                </View>
                <Text style={styles.unavailableTitle}>Coming soon</Text>
                <Text style={styles.unavailableBody}>
                  {driverState.feature_reason || 'Work Zone is rolling out area by area.'}
                </Text>
                <TouchableOpacity style={styles.backLink} onPress={() => router.back()} activeOpacity={0.85}>
                  <Text style={styles.backLinkTxt}>Go back</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.heroWrap}>
                  <LinearGradient
                    colors={['#0F2844', '#081A2E', '#061222']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.hero}
                  >
                    <LinearGradient
                      colors={['rgba(34,225,128,0.12)', 'transparent']}
                      style={styles.heroSheen}
                      pointerEvents="none"
                    />
                    <View style={styles.heroTop}>
                      <View style={styles.heroIcon}>
                        <Ionicons name="layers" size={20} color={BRAND.primary} />
                      </View>
                      <View style={styles.planChip}>
                        <Text style={styles.planChipTxt}>{planChip}</Text>
                      </View>
                    </View>
                    <Text style={styles.eyebrow}>TERRITORY DISPATCH</Text>
                    <Text style={styles.heroTitle}>Know your area.{'\n'}Know your money.</Text>
                    {driverState?.active && driverState.label ? (
                      <View style={styles.activeZoneBanner}>
                        <Ionicons name="navigate" size={14} color={BRAND.primary} />
                        <Text style={styles.activeZoneTxt} numberOfLines={1}>
                          {driverState.label}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.sub}>
                        Pick 1–4 adjacent areas. Only trips inside your zone are offered.
                      </Text>
                    )}
                    {showFirstLoadPlaceholder ? (
                      <ActivityIndicator color={BRAND.primary} style={styles.inlineLoader} />
                    ) : null}
                  </LinearGradient>
                </View>

                <TouchableOpacity
                  style={styles.benefitsToggle}
                  onPress={() => setBenefitsOpen((v) => !v)}
                  activeOpacity={0.88}
                >
                  <View style={styles.benefitsToggleLeft}>
                    <Ionicons name="shield-checkmark" size={18} color={BRAND.primary} />
                    <Text style={styles.benefitsToggleTxt}>What&apos;s included with your plan</Text>
                  </View>
                  <Ionicons
                    name={benefitsOpen ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={BRAND.textMuted}
                  />
                </TouchableOpacity>
                {benefitsOpen ? (
                  <View style={styles.benefitsBox}>
                    {SUBSCRIPTION_BENEFITS.map((line) => (
                      <View key={line} style={styles.benefitRow}>
                        <Ionicons name="checkmark-circle" size={15} color={BRAND.primary} />
                        <Text style={styles.benefitTxt}>{line}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {showSubscribeBanner ? (
                  <View style={styles.warnBox}>
                    <Ionicons name="card-outline" size={18} color={BRAND.warning} />
                    <Text style={styles.warnTxt}>
                      {driverState?.entitlement_message || 'Subscribe to activate Work Zone.'}
                    </Text>
                  </View>
                ) : null}

                {driverState?.active ? (
                  <TouchableOpacity style={styles.offBtn} onPress={deactivate} activeOpacity={0.85}>
                    <Ionicons name="close-circle-outline" size={18} color="#FCA5A5" />
                    <Text style={styles.offTxt}>Turn off Work Zone</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.sectionRow}>
                  <Text style={styles.section}>Your corridor</Text>
                  <Text style={styles.sectionMeta}>
                    {selected.length > 0 ? `${selected.length}/4` : 'Up to 4 areas'}
                  </Text>
                </View>
                <Text style={styles.sectionHint}>Tap adjacent areas next to your selection.</Text>

                {showFirstLoadPlaceholder && areas.length === 0
                  ? [0, 1, 2, 3].map((i) => (
                      <View
                        key={`sk-${i}`}
                        style={[styles.areaRow, styles.areaSkeleton, { minHeight: flow.rowMinHeight }]}
                      />
                    ))
                  : areas.map((a) => {
                      const on = selected.includes(a.id);
                      const disabled = !on && !canSelect(a.id);
                      const tone = demandTone(a);
                      return (
                        <TouchableOpacity
                          key={a.id}
                          style={[
                            styles.areaRow,
                            { minHeight: flow.rowMinHeight },
                            on && styles.areaOn,
                            disabled && styles.areaDisabled,
                          ]}
                          onPress={() => toggleArea(a.id)}
                          disabled={disabled || showFirstLoadPlaceholder}
                          activeOpacity={0.88}
                        >
                          {on ? <View style={styles.areaAccent} /> : null}
                          <View style={styles.areaTextCol}>
                            <View style={styles.areaNameRow}>
                              <Text style={[styles.areaName, on && styles.areaNameOn]}>{a.name}</Text>
                              <View style={[styles.demandPill, { backgroundColor: tone.bg }]}>
                                <Text style={[styles.demandPillTxt, { color: tone.color }]}>
                                  {tone.label}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.areaMeta}>{demandHint(a)}</Text>
                          </View>
                          <View style={[styles.checkCircle, on && styles.checkCircleOn]}>
                            <Ionicons
                              name={on ? 'checkmark' : 'add'}
                              size={on ? 16 : 18}
                              color={on ? BRAND.textInverse : BRAND.textMuted}
                            />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
              </>
            )}
          </ScrollView>

          {!featureUnavailable ? (
            <View style={[styles.footer, { paddingBottom: footerPad, paddingHorizontal: flow.padH }]}>
              <LinearGradient
                colors={['transparent', 'rgba(13,20,32,0.92)', BRAND.bgDeep]}
                style={styles.footerFade}
                pointerEvents="none"
              />
              <View style={[styles.footerInner, { maxWidth: flow.maxContentWidth }]}>
                {selectedLabel && canActivateWorkZone ? (
                  <Text style={styles.footerPreview} numberOfLines={1}>
                    {selectedLabel}
                  </Text>
                ) : null}
                <TouchableOpacity
                  style={[styles.primaryBtn, ctaDisabled && styles.primaryBtnDisabled]}
                  onPress={activate}
                  disabled={ctaDisabled}
                  activeOpacity={0.9}
                >
                  <LinearGradient
                    colors={
                      ctaDisabled
                        ? ['rgba(34,225,128,0.35)', 'rgba(34,225,128,0.25)']
                        : [BRAND.primaryLight, BRAND.primary, BRAND.primaryDark]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.primaryGrad}
                  >
                    {saving ? (
                      <ActivityIndicator color={BRAND.textInverse} />
                    ) : (
                      <>
                        <Ionicons
                          name={driverState?.active ? 'refresh' : 'flash'}
                          size={18}
                          color={BRAND.textInverse}
                        />
                        <Text style={styles.primaryTxt}>{ctaLabel}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.bgDeep },
  safe: { flex: 1 },
  body: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: SURFACE.tile,
  },
  headerBtnSpacer: { width: 44 },
  headerTitle: {
    flex: 1,
    color: BRAND.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: BRAND.primaryMuted,
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: BRAND.primary,
  },
  activePillTxt: {
    color: BRAND.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  heroWrap: { marginBottom: SPACING.sm + 4 },
  hero: {
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md + 2,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
    overflow: 'hidden',
  },
  heroSheen: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm + 2,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: BRAND.primaryMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
  },
  planChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: SURFACE.tile,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  planChipTxt: {
    color: BRAND.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  eyebrow: {
    color: BRAND.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heroTitle: {
    color: BRAND.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 4,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  sub: {
    color: BRAND.textSecondary,
    fontSize: 13,
    marginTop: SPACING.sm + 2,
    lineHeight: 19,
  },
  activeZoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.sm + 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: BRAND.primaryMuted,
    borderWidth: 1,
    borderColor: SURFACE.glassBorder,
  },
  activeZoneTxt: {
    flex: 1,
    color: BRAND.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  inlineLoader: { marginTop: 14 },
  benefitsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm + 4,
    paddingHorizontal: SPACING.sm + 4,
    marginBottom: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: SURFACE.glassSoft,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
  },
  benefitsToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  benefitsToggleTxt: { color: BRAND.textSecondary, fontSize: 13, fontWeight: '600' },
  benefitsBox: {
    backgroundColor: SURFACE.glassSoft,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm + 6,
    marginBottom: SPACING.sm + 4,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
    gap: SPACING.sm,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  benefitTxt: { color: BRAND.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    marginBottom: 4,
  },
  section: { color: BRAND.textPrimary, fontSize: 15, fontWeight: '800' },
  sectionMeta: { color: BRAND.primary, fontSize: 12, fontWeight: '700' },
  sectionHint: {
    color: BRAND.textMuted,
    fontSize: 12,
    marginBottom: SPACING.sm + 2,
    lineHeight: 16,
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE.glassSoft,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
    overflow: 'hidden',
  },
  areaSkeleton: { opacity: 0.3 },
  areaOn: {
    borderColor: SURFACE.glassBorder,
    backgroundColor: 'rgba(34,225,128,0.08)',
  },
  areaDisabled: { opacity: 0.4 },
  areaAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: BRAND.primary,
  },
  areaTextCol: { flex: 1, paddingRight: SPACING.sm },
  areaNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexWrap: 'wrap',
  },
  areaName: { color: BRAND.textPrimary, fontSize: 15, fontWeight: '700' },
  areaNameOn: { color: BRAND.primaryLight },
  demandPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BORDER_RADIUS.full,
  },
  demandPillTxt: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  areaMeta: { color: BRAND.textMuted, fontSize: 11, marginTop: 4, lineHeight: 15 },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: SURFACE.hairline,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE.tile,
  },
  checkCircleOn: {
    backgroundColor: BRAND.primary,
    borderColor: BRAND.primary,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  footerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -28,
    height: 28,
  },
  footerInner: {
    width: '100%',
    alignSelf: 'center',
    gap: 8,
  },
  footerPreview: {
    color: BRAND.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  primaryBtn: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnDisabled: { shadowOpacity: 0, elevation: 0 },
  primaryGrad: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: SPACING.lg,
  },
  primaryTxt: { color: BRAND.textInverse, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  offBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.sm + 4,
    marginBottom: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: 'rgba(127,29,29,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.18)',
  },
  offTxt: { color: '#FCA5A5', fontWeight: '700', fontSize: 13 },
  warnBox: {
    flexDirection: 'row',
    gap: 10,
    padding: SPACING.sm + 4,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm + 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)',
  },
  warnTxt: { color: '#FDE68A', flex: 1, fontSize: 12, lineHeight: 17 },
  unavailableCard: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: SURFACE.glassSoft,
    borderWidth: 1,
    borderColor: SURFACE.hairline,
    marginTop: SPACING.lg,
  },
  unavailableIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: SURFACE.tile,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  unavailableTitle: {
    color: BRAND.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  unavailableBody: {
    color: BRAND.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
  },
  backLink: { marginTop: SPACING.lg, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  backLinkTxt: { color: BRAND.primary, fontWeight: '700', fontSize: 15 },
});
