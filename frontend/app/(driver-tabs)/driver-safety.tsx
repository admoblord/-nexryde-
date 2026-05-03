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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { BRAND, LAYOUT } from '@/src/constants/designSystem';
import { DRIVER_TRIPS_TAB_HREF } from '@/src/constants/driverNavigation';
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
      { label: 'Active trip safety', desc: 'Police connect, witness & SOS during a live trip', route: DRIVER_TRIPS_TAB_HREF, icon: 'flash', tone: 'danger' },
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
  if (tone === 'danger') return COLORS.errorSoft;
  if (tone === 'safe') return COLORS.successSoft;
  return COLORS.infoSoft;
}
function toneColor(tone: SafeRow['tone']) {
  if (tone === 'danger') return COLORS.error;
  if (tone === 'safe') return COLORS.success;
  return COLORS.info;
}

export default function DriverSafetyHubScreen() {
  const router = useRouter();
  const tabPad = useTabBottomPad(8);

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
        { text: 'Nexryde Support', onPress: () => router.push('/support') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [handlePoliceQuickAction, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Hero */}
      <LinearGradient
        colors={[BRAND.navyDeep, '#0F172A']}
        style={styles.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={styles.heroTitle}>Safety & Security</Text>
        <Text style={styles.heroSub}>
          Emergency tools, verification, and account protection in one place.
        </Text>
      </LinearGradient>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabPad }]} showsVerticalScrollIndicator={false}>

        {/* Emergency Quick Actions */}
        <View style={styles.quickSection}>
          <Text style={styles.quickLabel}>QUICK EMERGENCY ACCESS</Text>

          {/* SOS — Emergency */}
          <TouchableOpacity
            style={styles.sosButton}
            onPress={handleEmergencyAction}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#DC2626', '#B91C1C']} style={styles.sosGrad}>
              <View style={styles.sosLeft}>
                <View style={styles.sosIconWrap}>
                  <Ionicons name="warning" size={26} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.sosTitle}>SOS Emergency</Text>
                  <Text style={styles.sosSub}>Nexryde Support · State Police</Text>
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
            <LinearGradient colors={[BRAND.navyDeep, '#1E3A5F']} style={styles.policeGrad}>
              <View style={styles.sosLeft}>
                <View style={[styles.sosIconWrap, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                  <Ionicons name="shield" size={24} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sosTitle}>Call Police</Text>
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
              style={[styles.quickCard, { backgroundColor: '#FEF3C7' }]}
              onPress={() => router.push(DRIVER_TRIPS_TAB_HREF as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="eye" size={22} color="#D97706" />
              <Text style={[styles.quickCardText, { color: '#D97706' }]}>Witness</Text>
              <Text style={styles.quickCardSub}>During active trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: '#ECFDF5' }]}
              onPress={() => router.push('/support' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="headset" size={22} color="#16A34A" />
              <Text style={[styles.quickCardText, { color: '#16A34A' }]}>Support</Text>
              <Text style={styles.quickCardSub}>24/7 help line</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickCard, { backgroundColor: '#EFF6FF' }]}
              onPress={() => router.push('/settings' as any)}
              activeOpacity={0.85}
            >
              <Ionicons name="settings" size={22} color="#2563EB" />
              <Text style={[styles.quickCardText, { color: '#2563EB' }]}>Settings</Text>
              <Text style={styles.quickCardSub}>Privacy & device</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Sections */}
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map((row) => (
              <TouchableOpacity
                key={row.route + row.label}
                style={styles.row}
                onPress={() => router.push(row.route as any)}
                activeOpacity={0.9}
                accessibilityRole="button"
              >
                <View style={[styles.rowIcon, { backgroundColor: toneBg(row.tone) }]}>
                  <Ionicons name={row.icon} size={20} color={toneColor(row.tone)} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{row.label}</Text>
                  <Text style={styles.rowDesc}>{row.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.lightTextMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ))}

      </ScrollView>

      {/* State Police Picker Modal */}
      <Modal visible={showPolicePicker} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.pickerContainer}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Select Your State</Text>
            <TouchableOpacity onPress={() => setShowPolicePicker(false)} style={styles.pickerClose}>
              <Ionicons name="close" size={24} color={COLORS.lightTextPrimary} />
            </TouchableOpacity>
          </View>
          <View style={styles.pickerSearchRow}>
            <Ionicons name="search" size={18} color={COLORS.lightTextMuted} style={{ marginLeft: 12 }} />
            <TextInput
              style={styles.pickerSearch}
              value={policeQuery}
              onChangeText={setPoliceQuery}
              placeholder="Search state (e.g. Lagos, Kano, Abuja...)"
              placeholderTextColor={COLORS.lightTextMuted}
              autoFocus
              autoCapitalize="words"
            />
            {policeQuery.length > 0 && (
              <TouchableOpacity onPress={() => setPoliceQuery('')} style={{ padding: 10 }}>
                <Ionicons name="close-circle" size={18} color={COLORS.lightTextMuted} />
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
                    <Ionicons name="shield" size={18} color={BRAND.navyDeep} />
                  </View>
                  <View>
                    <Text style={styles.pickerStateName}>{item.state}</Text>
                    <Text style={styles.pickerStatePhone}>{item.phone}</Text>
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
  container: { flex: 1, backgroundColor: COLORS.gray50 },
  hero: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  heroTitle: { fontSize: FONT_SIZE.xxl, fontWeight: '900', color: COLORS.white, letterSpacing: 0.3 },
  heroSub: { marginTop: SPACING.xs, fontSize: FONT_SIZE.sm, fontWeight: '600', color: 'rgba(255,255,255,0.8)', lineHeight: 20 },

  scroll: { padding: SPACING.lg },

  quickSection: { marginBottom: SPACING.lg },
  quickLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: COLORS.lightTextMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },

  sosButton: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.sm },
  sosGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  policeButton: { borderRadius: BORDER_RADIUS.xl, overflow: 'hidden', marginBottom: SPACING.sm },
  policeGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  sosLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, flex: 1 },
  sosIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosTitle: { fontSize: FONT_SIZE.md, fontWeight: '900', color: COLORS.white },
  sosSub: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  changeStateBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  changeStateText: { fontSize: 11, fontWeight: '800', color: '#FFF' },

  quickRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  quickCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: 4,
    minHeight: LAYOUT.touchMin + 8,
  },
  quickCardText: { fontSize: FONT_SIZE.xs, fontWeight: '900' },
  quickCardSub: { fontSize: 10, fontWeight: '600', color: COLORS.lightTextMuted, textAlign: 'center' },

  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.lightTextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary },
  rowDesc: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.lightTextSecondary, marginTop: 2 },

  // Police picker modal
  pickerContainer: { flex: 1, backgroundColor: COLORS.white },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  pickerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '900', color: COLORS.lightTextPrimary },
  pickerClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pickerSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: SPACING.md,
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  pickerSearch: {
    flex: 1,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  pickerSep: { height: 1, backgroundColor: COLORS.gray50 },
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
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerStateName: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary },
  pickerStatePhone: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.lightTextSecondary, marginTop: 2 },
  pickerCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BRAND.navyDeep,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  pickerCallText: { fontSize: FONT_SIZE.xs, fontWeight: '800', color: '#FFF' },
});
