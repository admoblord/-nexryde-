import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTabBottomPad } from '@/src/hooks/useBottomPad';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Vibration,
  Animated,
  Easing,
  Linking,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { BRAND, LAYOUT } from '@/src/constants/designSystem';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useAppStore } from '@/src/store/appStore';
import { BACKEND_URL, triggerSOS, getAuthHeaders } from '@/src/services/api';
import { ConfirmationModal, EmergencyButton } from '@/src/components/tier1';
import policeContacts from '@/src/data/policeContacts';

type PoliceContact = { state: string; aliases: string[]; phone: string };
const POLICE: PoliceContact[] = policeContacts as PoliceContact[];

function normaliseQ(v: string) {
  return v.toLowerCase().replace(/\bstate\b/g, '').replace(/\s+/g, ' ').trim();
}
function matchPoliceState(query: string): PoliceContact | null {
  const q = normaliseQ(query);
  if (!q) return null;
  return (
    POLICE.find((c) => c.aliases.some((a) => a.includes(q) || q.includes(a))) ||
    POLICE.find((c) => normaliseQ(c.state).includes(q)) ||
    null
  );
}

type Row = {
  label: string;
  desc: string;
  route: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: 'safe' | 'danger' | 'info';
};

const QUICK = [
  { label: 'Emergency', route: '/(rider-tabs)/rider-safety', icon: 'warning' as const, variant: 'danger' as const },
  { label: 'Police & help', route: '/support', icon: 'shield' as const, variant: 'police' as const },
  { label: 'Witness', route: '/rider/share-trip', icon: 'eye' as const, variant: 'witness' as const },
  { label: 'Settings', route: '/settings', icon: 'settings' as const, variant: 'neutral' as const },
];

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Verification',
    rows: [
      {
        label: 'Pick-up Code',
        desc: 'Your 4-digit code — shown to driver at pickup to confirm identity',
        route: '/rider/security-code',
        icon: 'keypad',
        tone: 'safe',
      },
      {
        label: 'Rider verification',
        desc: 'Complete profile verification',
        route: '/(auth)/rider-verification',
        icon: 'checkmark-done',
        tone: 'safe',
      },
    ],
  },
  {
    title: 'Emergency & live trip',
    rows: [
      {
        label: 'Live tracking',
        desc: 'Map, ETA & silent safety tools during trips',
        route: '/rider/tracking',
        icon: 'navigate',
        tone: 'danger',
      },
      {
        label: 'Support line',
        desc: 'Talk to NEXRYDE when something feels off',
        route: '/support',
        icon: 'headset',
        tone: 'info',
      },
    ],
  },
  {
    title: 'Recording & sharing',
    rows: [
      {
        label: 'Trip recording',
        desc: 'Optional protected trip capture',
        route: '/rider/ride-recording',
        icon: 'mic',
        tone: 'info',
      },
      {
        label: 'Share trip with someone',
        desc: 'Live location for a trusted contact',
        route: '/rider/share-trip',
        icon: 'share-social',
        tone: 'safe',
      },
    ],
  },
  {
    title: 'Account security',
    rows: [
      {
        label: 'Wallet & payments',
        desc: 'Balances and payment methods (Wallet tab)',
        route: '/(rider-tabs)/rider-wallet',
        icon: 'wallet',
        tone: 'info',
      },
      {
        label: 'App settings',
        desc: 'Privacy, notifications & appearance',
        route: '/settings',
        icon: 'options',
        tone: 'info',
      },
    ],
  },
];

function toneIconBg(tone: Row['tone']) {
  switch (tone) {
    case 'danger':
      return COLORS.errorSoft;
    case 'safe':
      return COLORS.successSoft;
    default:
      return COLORS.infoSoft;
  }
}

function toneIconColor(tone: Row['tone']) {
  switch (tone) {
    case 'danger':
      return COLORS.error;
    case 'safe':
      return COLORS.success;
    default:
      return COLORS.info;
  }
}

function quickBg(v: (typeof QUICK)[number]['variant']) {
  switch (v) {
    case 'danger':
      return COLORS.error;
    case 'police':
      return BRAND.navyDeep;
    case 'witness':
      return COLORS.warning;
    default:
      return COLORS.gray700;
  }
}

export default function RiderSafetyScreen() {
  const router = useRouter();
  const { user, currentTrip } = useAppStore();
  const [activeTripId, setActiveTripId] = useState<string | null>(currentTrip?.id || null);
  const [loadingTrip, setLoadingTrip] = useState(false);
  const tabPad = useTabBottomPad(8);
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const sosPulse = useRef(new Animated.Value(1)).current;

  // Nigerian state police picker
  const [showPolicePicker, setShowPolicePicker] = useState(false);
  const [policeQuery, setPoliceQuery] = useState('');
  const [detectedPolice, setDetectedPolice] = useState<PoliceContact | null>(null);
  const [detectingPolice, setDetectingPolice] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setDetectingPolice(true);
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const geo = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        const raw = String(geo?.[0]?.region || geo?.[0]?.subregion || '').trim();
        if (raw) {
          const found = matchPoliceState(raw);
          if (found) { setDetectedPolice(found); setPoliceQuery(found.state); }
        }
      } catch { /* silent */ } finally { setDetectingPolice(false); }
    })();
  }, []);

  const filteredPolice = useMemo(() => {
    if (!policeQuery.trim()) return POLICE;
    const q = normaliseQ(policeQuery);
    return POLICE.filter((c) => normaliseQ(c.state).includes(q) || c.aliases.some((a) => a.includes(q)));
  }, [policeQuery]);

  const callPolice = useCallback((contact: PoliceContact) => {
    Alert.alert(
      `${contact.state} Police`,
      `Call ${contact.state} State Police?\n${contact.phone}`,
      [
        { text: `Call ${contact.phone}`, onPress: () => Linking.openURL(`tel:${contact.phone}`) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, []);

  const effectiveTripId = useMemo(() => currentTrip?.id || activeTripId || null, [currentTrip?.id, activeTripId]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sosPulse, {
          toValue: 1.06,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(sosPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [sosPulse]);

  useEffect(() => {
    const fetchActiveTrip = async () => {
      if (!user?.id || !BACKEND_URL) return;
      setLoadingTrip(true);
      try {
        const res = await fetch(`${BACKEND_URL}/api/trips/active/${user.id}`, { headers: getAuthHeaders() });
        const data = await res.json();
        if (data?.active && data?.trip?.id) {
          setActiveTripId(String(data.trip.id));
        } else {
          setActiveTripId(null);
        }
      } catch {
        // Keep existing trip state.
      } finally {
        setLoadingTrip(false);
      }
    };

    fetchActiveTrip();
    const interval = setInterval(fetchActiveTrip, 20000);
    return () => clearInterval(interval);
  }, [user?.id, BACKEND_URL]);

  const handleConfirmSOS = async () => {
    if (!effectiveTripId) {
      Alert.alert('No Active Trip', 'SOS works only during an active trip.');
      return;
    }

    setSendingSos(true);
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 400, 200, 400]);
    }

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location Required', 'Please enable location permission to send SOS with your live location.');
        setSendingSos(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await triggerSOS({
        trip_id: effectiveTripId,
        location_lat: location.coords.latitude,
        location_lng: location.coords.longitude,
      });

      setSosModalVisible(false);
      Alert.alert(
        'SOS Sent',
        'Emergency alert has been sent to your contacts and NEXRYDE support.',
      );
    } catch (error: any) {
      Alert.alert('SOS Failed', error?.response?.data?.detail || 'Could not send SOS right now.');
    } finally {
      setSendingSos(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Safety Center</Text>
        <Text style={styles.heroSub}>Verification, emergencies, and trip protection — organized in one screen.</Text>
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: tabPad }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.quickLabel}>Quick access</Text>
        <View style={styles.quickRow}>
          {QUICK.map(q => (
            <TouchableOpacity
              key={q.label}
              style={styles.quickBtn}
              onPress={() => {
                if (q.route === '/(rider-tabs)/rider-safety') {
                  setSosModalVisible(true);
                  return;
                }
                router.push(q.route as any);
              }}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel={q.label}
            >
              <View style={[styles.quickIconWrap, { backgroundColor: quickBg(q.variant) }]}>
                <Ionicons name={q.icon} size={22} color={COLORS.white} />
              </View>
              <Text style={styles.quickText} numberOfLines={2}>
                {q.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Animated.View
          style={[
            styles.sosButton,
            !effectiveTripId && styles.sosDisabled,
            { transform: [{ scale: sosPulse }] },
          ]}
        >
          <View style={styles.sosIconWrap}>
            <Ionicons name="alert-circle" size={44} color={COLORS.white} />
          </View>
          <Text style={styles.sosText}>{sendingSos ? 'Sending SOS...' : 'Emergency SOS'}</Text>
          <Text style={styles.sosSubtext}>
            {effectiveTripId ? 'Trigger a protected emergency alert now' : 'SOS available only in active trip'}
          </Text>
          <EmergencyButton
            label={effectiveTripId ? 'Send SOS Alert' : 'No Active Trip'}
            style={styles.sosCta}
            onPress={() => setSosModalVisible(true)}
            compact={false}
          />
        </Animated.View>
        {loadingTrip ? <ActivityIndicator size="small" color={COLORS.accentGreen} style={{ marginBottom: SPACING.md }} /> : null}

        {/* Nigerian Police Finder */}
        <View style={styles.policeCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="shield" size={20} color="#1d4ed8" />
            <Text style={styles.policeCardTitle}>Nigerian Police Finder</Text>
            {detectingPolice && <ActivityIndicator size="small" color="#1d4ed8" style={{ marginLeft: 8 }} />}
          </View>
          {detectedPolice ? (
            <View style={styles.policeDetected}>
              <Ionicons name="location" size={14} color="#16a34a" />
              <Text style={styles.policeDetectedText}>Detected: {detectedPolice.state} Police</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.policeCallBtn}
            onPress={() => {
              if (detectedPolice) {
                callPolice(detectedPolice);
              } else {
                setPoliceQuery('');
                setShowPolicePicker(true);
              }
            }}
          >
            <Ionicons name="call" size={18} color="#fff" />
            <Text style={styles.policeCallBtnText}>
              {detectedPolice ? `Call ${detectedPolice.state} Police` : 'Find & Call State Police'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setPoliceQuery(''); setShowPolicePicker(true); }} style={{ marginTop: 6 }}>
            <Text style={{ color: '#1d4ed8', fontSize: 12, textAlign: 'center' }}>Search a different state</Text>
          </TouchableOpacity>
        </View>

        {SECTIONS.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.rows.map(row => (
              <TouchableOpacity
                key={row.route + row.label}
                style={styles.row}
                onPress={() => router.push(row.route as any)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={row.label}
              >
                <View style={[styles.rowIcon, { backgroundColor: toneIconBg(row.tone) }]}>
                  <Ionicons name={row.icon} size={22} color={toneIconColor(row.tone)} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{row.label}</Text>
                  <Text style={styles.rowDesc}>{row.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.lightTextMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </ScrollView>

      <ConfirmationModal
        visible={sosModalVisible}
        title="Confirm Emergency SOS"
        message="This sends your live location and trip details to emergency contacts and NEXRYDE support."
        confirmText={sendingSos ? 'Sending...' : 'Send SOS'}
        cancelText="Cancel"
        destructive
        onCancel={() => setSosModalVisible(false)}
        onConfirm={() => void handleConfirmSOS()}
      />

      {/* Police State Picker Modal */}
      <Modal visible={showPolicePicker} animationType="slide" transparent onRequestClose={() => setShowPolicePicker(false)}>
        <View style={styles.policeModal}>
          <View style={styles.policeModalSheet}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: '#0f172a' }}>Select Your State</Text>
              <TouchableOpacity onPress={() => setShowPolicePicker(false)}>
                <Ionicons name="close-circle" size={26} color="#94a3b8" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.policeSearchInput}
              placeholder="Search state (e.g. Lagos, Abuja...)"
              placeholderTextColor="#94a3b8"
              value={policeQuery}
              onChangeText={setPoliceQuery}
              autoFocus
            />
            <FlatList
              data={filteredPolice}
              keyExtractor={(item) => item.state}
              style={{ maxHeight: 380 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.policeListItem}
                  onPress={() => { setShowPolicePicker(false); callPolice(item); }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: '#0f172a' }}>{item.state} Police</Text>
                    <Text style={{ fontSize: 13, color: '#1d4ed8', marginTop: 2 }}>{item.phone}</Text>
                  </View>
                  <Ionicons name="call" size={20} color="#16a34a" />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#f1f5f9' }} />}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  hero: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    backgroundColor: BRAND.navyDeep,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  heroTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  heroSub: {
    marginTop: SPACING.xs,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 20,
  },
  scroll: {
    padding: SPACING.lg,
  },
  quickLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.lightTextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    minHeight: LAYOUT.touchMin + 8,
  },
  quickIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickText: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
  },
  sosButton: {
    backgroundColor: COLORS.error,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    marginBottom: SPACING.xl,
    ...SHADOWS.lg,
    shadowColor: '#EF4444',
    shadowOpacity: 0.35,
    shadowRadius: 14,
  },
  sosIconWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  sosDisabled: {
    backgroundColor: COLORS.gray400,
  },
  sosText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.sm,
    letterSpacing: -0.5,
  },
  sosSubtext: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#FEE2E2',
    marginTop: SPACING.xs,
  },
  sosCta: {
    marginTop: SPACING.md,
    alignSelf: 'stretch',
  },
  policeCard: {
    backgroundColor: '#eff6ff',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  policeCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1d4ed8',
    marginLeft: 8,
    flex: 1,
  },
  policeDetected: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 4,
  },
  policeDetectedText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
    marginLeft: 4,
  },
  policeCallBtn: {
    backgroundColor: '#1d4ed8',
    borderRadius: BORDER_RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  policeCallBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 6,
  },
  policeModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  policeModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  policeSearchInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a',
    marginBottom: 12,
  },
  policeListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    minHeight: LAYOUT.touchMin + 6,
    ...SHADOWS.sm,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: FONT_SIZE.md, fontWeight: '800', color: COLORS.lightTextPrimary },
  rowDesc: { fontSize: FONT_SIZE.xs, fontWeight: '600', color: COLORS.lightTextSecondary, marginTop: 2 },
});
