import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useThemeColors } from '@/src/constants/theme';
import { BRAND, LAYOUT, RADIUS, SPACING, SURFACE, TYPOGRAPHY } from '@/src/constants/designSystem';
import { DRIVER_ACTIVE_TRIP_HREF, DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';
import { TabBrandStrip } from '@/src/components/flow/TabBrandStrip';
import { useFlowLayout } from '@/src/constants/flowLayout';
import policeContacts from '@/src/data/policeContacts';

type PoliceContact = { state: string; aliases: string[]; phone: string };
const POLICE: PoliceContact[] = policeContacts as PoliceContact[];

function normalise(v: string) {
  return v.toLowerCase().replace(/\bstate\b/g, '').replace(/\s+/g, ' ').trim();
}

function matchState(query: string): PoliceContact | null {
  const q = normalise(query);
  if (!q) return null;
  return (
    POLICE.find((c) => c.aliases.some((a) => a.includes(q) || q.includes(a))) ||
    POLICE.find((c) => normalise(c.state).includes(q)) ||
    null
  );
}

type SafeRow = {
  label: string;
  desc: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'safe' | 'danger' | 'info';
};

const SECTIONS: { title: string; rows: SafeRow[] }[] = [
  {
    title: 'Verification',
    rows: [
      { label: 'Driver verification', desc: 'License, vehicle & identity checks', route: '/driver/verification', icon: 'checkmark-done', tone: 'safe' },
      { label: 'Pick-up Code', desc: 'Auto-triggered at pickup — enter rider code to start trip', route: '/driver/verify-rider-code', icon: 'keypad', tone: 'safe' },
      { label: 'Documents', desc: 'Upload or refresh verification files', route: '/driver/documents', icon: 'document-text', tone: 'info' },
    ],
  },
  {
    title: 'Emergency tools',
    rows: [
      { label: 'Active trip safety', desc: 'Police connect, witness & SOS during a live trip', route: DRIVER_ACTIVE_TRIP_HREF, icon: 'flash', tone: 'danger' },
      { label: 'Safety alerts & zones', desc: 'Area risk map and community reports', route: '/driver/safety-alerts', icon: 'map', tone: 'danger' },
      { label: 'Support', desc: '24/7 help and incident reporting', route: '/support', icon: 'headset', tone: 'info' },
    ],
  },
  {
    title: 'Recording & trip proof',
    rows: [
      { label: 'Trip history', desc: 'Receipts, ratings & trip timeline', route: DRIVER_TRIPS_TAB_HREF, icon: 'car', tone: 'info' },
      { label: 'Story mode', desc: 'Optional trip notes & media', route: '/driver/story-mode', icon: 'mic', tone: 'info' },
    ],
  },
  {
    title: 'Account security',
    rows: [
      { label: 'Bank & earnings vault', desc: 'Biometric withdrawals & locked savings', route: '/driver/bank', icon: 'finger-print', tone: 'safe' },
      { label: 'Subscription & access', desc: 'Payment status for trip offers', route: '/driver/subscription', icon: 'card', tone: 'info' },
      { label: 'App settings', desc: 'Privacy, notifications & device', route: '/settings', icon: 'options', tone: 'info' },
    ],
  },
];

function toneBg(tone: SafeRow['tone']) {
  if (tone === 'danger') return 'rgba(239,68,68,0.14)';
  if (tone === 'safe') return BRAND.primaryMuted;
  return 'rgba(56,189,248,0.14)';
}
function toneColor(tone: SafeRow['tone']) {
  if (tone === 'danger') return BRAND.danger;
  if (tone === 'safe') return BRAND.primary;
  return BRAND.info;
}

export default function DriverSafetyHubScreen() {
  const router = useRouter();
  const { colors, isDark } = useThemeColors();
  const tabPad = useTabBottomPad(8);
  const flow = useFlowLayout();

  // Police state picker
  const [showPolicePicker, setShowPolicePicker] = useState(false);
  const [policeQuery, setPoliceQuery] = useState('');
  const [detectedContact, setDetectedContact] = useState<PoliceContact | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Auto-detect state on mount
  useEffect(() => {
    void detectPoliceState();
  }, []);

  const detectPoliceState = useCallback(async () => {
    try {
      setDetectingLocation(true);
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      const raw = String(geo?.[0]?.region || geo?.[0]?.subregion || '').trim();
      if (raw) {
        const found = matchState(raw);
        if (found) {
          setDetectedContact(found);
          setPoliceQuery(found.state);
        }
      }
    } catch {
      // silent — fall back to manual picker
    } finally {
      setDetectingLocation(false);
    }
  }, []);

  const filteredPolice = useMemo(() => {
    if (!policeQuery.trim()) return POLICE;
    const q = normalise(policeQuery);
    return POLICE.filter(
      (c) => normalise(c.state).includes(q) || c.aliases.some((a) => a.includes(q))
    );
  }, [policeQuery]);

  const callPolice = useCallback((contact: PoliceContact) => {
    Alert.alert(
      `👮 ${contact.state} Police`,
      `Call the ${contact.state} State Police Command?\n\n${contact.phone}`,
      [
        { text: `Call ${contact.phone}`, onPress: () => Linking.openURL(`tel:${contact.phone}`) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, []);

  const handlePoliceQuickAction = useCallback(() => {
    if (detectedContact) {
      callPolice(detectedContact);
    } else {
      setPoliceQuery('');
      setShowPolicePicker(true);
    }
  }, [detectedContact, callPolice]);

  const handleEmergencyAction = useCallback(() => {
    Alert.alert(
      '🚨 Emergency',
      'Choose an emergency action:',
      [
        { text: 'State Police →', onPress: handlePoliceQuickAction },
        { text: 'NEXRYDE support', onPress: () => router.push('/support') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [handlePoliceQuickAction, router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]} edges={['top']}>
      <TabBrandStrip role="driver" />
      {/* Hero */}
      <LinearGradient
        colors={[BRAND.bgDeep, BRAND.bgElevated, BRAND.bgDeep]}
        style={[styles.hero, { paddingHorizontal: flow.padH }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.heroTitle}>Safety & security</Text>
        <Text style={styles.heroSub}>
          Emergency tools, verification, and account protection in one place.
        </Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: flow.padH,
            paddingBottom: tabPad,
            maxWidth: flow.maxContentWidth,
            alignSelf: 'center',
            width: '100%',
            gap: SPACING.stack,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >

        {/* Emergency Quick Actions */}
        <View style={styles.quickSection}>
          <Text style={[styles.quickLabel, { color: colors.textMuted }]}>Quick emergency access</Text>

          {/* SOS — Emergency */}
          <TouchableOpacity
            style={styles.sosButton}
            onPress={handleEmergencyAction}
            activeOpacity={0.85}
          >
            <LinearGradient colors={[BRAND.danger, '#B91C1C']} style={styles.sosGrad}>
              <View style={styles.sosLeft}>
                <View style={styles.sosIconWrap}>
                  <Ionicons name="warning" size={26} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.sosTitle}>SOS Emergency</Text>
                  <Text style={styles.sosSub}>NEXRYDE support · State Police</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Police Call */}
          <TouchableOpacity
            style={styles.policeButton}
            onPress={handlePoliceQuickAction}
            activeOpacity={0.85}
          >
            <LinearGradient colors={[BRAND.bgElevated, BRAND.accentBlue]} style={styles.policeGrad}>
              <View style={styles.sosLeft}>
                <View style={[styles.sosIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Ionicons name="shield" size={24} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sosTitle}>Call police</Text>
                  {detectingLocation ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                      <Text style={styles.sosSub}>Detecting your state...</Text>
                    </View>
                  ) : detectedContact ? (
                    <Text style={styles.sosSub}>
                      {detectedContact.state} Command · {detectedContact.phone}
                    </Text>
                  ) : (
                    <Text style={styles.sosSub}>Tap to select your state's command</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => { setPoliceQuery(''); setShowPolicePicker(true); }}
                style={styles.changeStateBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.changeStateText}>Change state</Text>
              </TouchableOpacity>
            </LinearGradient>
          </TouchableOpacity>

          {/* Witness / Evidence */}
          <View style={styles.quickRow}>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: 'rgba(245,158,11,0.14)', borderColor: 'rgba(245,158,11,0.28)' }]}
              onPress={() => router.push(DRIVER_TRIPS_TAB_HREF as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="eye" size={22} color={BRAND.warning} />
              <Text style={[styles.quickCardText, { color: BRAND.warning }]}>Witness</Text>
              <Text style={styles.quickCardSub}>During active trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: BRAND.primaryMuted, borderColor: `${BRAND.primary}44` }]}
              onPress={() => router.push('/support' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="headset" size={22} color={BRAND.primary} />
              <Text style={[styles.quickCardText, { color: BRAND.primary }]}>Support</Text>
              <Text style={styles.quickCardSub}>24/7 help line</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: 'rgba(56,189,248,0.12)', borderColor: 'rgba(56,189,248,0.28)' }]}
              onPress={() => router.push('/settings' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="settings" size={22} color={BRAND.accentBlue} />
              <Text style={[styles.quickCardText, { color: BRAND.accentBlue }]}>Settings</Text>
              <Text style={styles.quickCardSub}>Privacy & device</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
            {section.rows.map((row) => (
              <TouchableOpacity
                key={row.route + row.label}
                style={[
                  styles.row,
                  {
                    backgroundColor: isDark ? SURFACE.cardDark : colors.card,
                    borderColor: isDark ? SURFACE.hairline : colors.border,
                  },
                ]}
                onPress={() => router.push(row.route as any)}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                <View style={[styles.rowIcon, { backgroundColor: toneBg(row.tone) }]}>
                  <Ionicons name={row.icon} size={20} color={toneColor(row.tone)} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{row.label}</Text>
                  <Text style={[styles.rowDesc, { color: colors.textSecondary }]}>{row.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

      </ScrollView>

      {/* State Police Picker Modal */}
      <Modal visible={showPolicePicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={[styles.pickerContainer, { backgroundColor: isDark ? BRAND.bgDeep : colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: isDark ? SURFACE.hairline : colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Select your state</Text>
            <TouchableOpacity onPress={() => setShowPolicePicker(false)} style={styles.pickerClose}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={[styles.pickerSearchRow, { backgroundColor: isDark ? SURFACE.tile : colors.surface, borderColor: isDark ? SURFACE.hairline : colors.border }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={{ marginLeft: 12 }} />
            <TextInput
              style={[styles.pickerSearch, { color: colors.text }]}
              value={policeQuery}
              onChangeText={setPoliceQuery}
              placeholder="Search state (e.g. Lagos, Kano, Abuja...)"
              placeholderTextColor={colors.textMuted}
              autoFocus
              autoCapitalize="words"
            />
            {policeQuery.length > 0 && (
              <TouchableOpacity onPress={() => setPoliceQuery('')} style={{ padding: 10 }}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <FlatList
            data={filteredPolice}
            keyExtractor={(item) => item.state}
            ItemSeparatorComponent={() => <View style={styles.pickerSep} />}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => {
                  setShowPolicePicker(false);
                  setDetectedContact(item);
                  setPoliceQuery(item.state);
                  callPolice(item);
                }}
                activeOpacity={0.8}
              >
                <View style={styles.pickerRowLeft}>
                  <View style={styles.pickerStateIcon}>
                    <Ionicons name="shield" size={18} color={BRAND.info} />
                  </View>
                  <View>
                    <Text style={[styles.pickerStateName, { color: colors.text }]}>{item.state}</Text>
                    <Text style={[styles.pickerStatePhone, { color: colors.textSecondary }]}>{item.phone}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => Linking.openURL(`tel:${item.phone}`)}
                  style={styles.pickerCallBtn}
                >
                  <Ionicons name="call" size={16} color="#FFF" />
                  <Text style={styles.pickerCallText}>Call</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgDeep },
  hero: {
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.glassBorder,
  },
  heroTitle: { fontSize: 24, fontWeight: '900', color: BRAND.textPrimary, letterSpacing: -0.4 },
  heroSub: { marginTop: SPACING.xs, fontSize: 13, fontWeight: '600', color: BRAND.textSecondary, lineHeight: 19 },

  scroll: { paddingTop: SPACING.md },

  quickSection: { marginBottom: SPACING.md },
  quickLabel: {
    ...TYPOGRAPHY.label,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },

  sosButton: { borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.stack },
  sosGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  policeButton: { borderRadius: RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.stack },
  policeGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.stack,
  },
  sosLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  sosIconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosTitle: { fontSize: 15, fontWeight: '900', color: '#FFF' },
  sosSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  changeStateBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  changeStateText: { fontSize: 11, fontWeight: '800', color: '#FFF' },

  quickRow: { flexDirection: 'row', gap: SPACING.stack, marginTop: SPACING.stack },
  quickCard: {
    flex: 1,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: 4,
    minHeight: LAYOUT.touchMin + 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickCardText: { fontSize: 11, fontWeight: '900' },
  quickCardSub: { fontSize: 10, fontWeight: '600', color: BRAND.textMuted, textAlign: 'center' },

  section: { marginBottom: SPACING.md },
  sectionTitle: {
    ...TYPOGRAPHY.label,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.stack,
    borderWidth: StyleSheet.hairlineWidth,
  },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowDesc: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  pickerContainer: { flex: 1, backgroundColor: BRAND.bgDeep },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickerTitle: { fontSize: 17, fontWeight: '900' },
  pickerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pickerSearch: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    fontSize: 15,
    fontWeight: '600',
  },
  pickerSep: { height: StyleSheet.hairlineWidth, backgroundColor: SURFACE.hairline },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  pickerRowLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  pickerStateIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    backgroundColor: 'rgba(56,189,248,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerStateName: { fontSize: 15, fontWeight: '800' },
  pickerStatePhone: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  pickerCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND.accentBlue,
    borderRadius: RADIUS.md,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  pickerCallText: { fontSize: 11, fontWeight: '800', color: '#FFF' },
});
