import React, { useEffect, useMemo, useState } from 'react';
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
        label: 'Area safety check',
        desc: 'Look up risk context before you ride',
        route: '/rider/safety-check',
        icon: 'map',
        tone: 'info',
      },
      {
        label: 'Trip security code',
        desc: 'PIN-style verification with your driver',
        route: '/rider/security-code',
        icon: 'key',
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
        desc: 'Optional encrypted-style trip capture',
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
  const [sosModalVisible, setSosModalVisible] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);

  const effectiveTripId = useMemo(() => currentTrip?.id || activeTripId || null, [currentTrip?.id, activeTripId]);

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

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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

        <View style={[styles.sosButton, !effectiveTripId && styles.sosDisabled]}>
          <Ionicons name="alert-circle" size={32} color={COLORS.white} />
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
        </View>
        {loadingTrip ? <ActivityIndicator size="small" color={COLORS.accentGreen} style={{ marginBottom: SPACING.md }} /> : null}

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
    paddingBottom: SPACING.huge,
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
