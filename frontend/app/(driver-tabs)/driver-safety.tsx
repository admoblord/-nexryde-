import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { BRAND, LAYOUT } from '@/src/constants/designSystem';

type Row = { label: string; desc: string; route: string; icon: React.ComponentProps<typeof Ionicons>['name']; tone: 'safe' | 'danger' | 'info' };

const QUICK: { label: string; route: string; icon: React.ComponentProps<typeof Ionicons>['name']; variant: 'danger' | 'police' | 'witness' | 'neutral' }[] = [
  { label: 'Emergency', route: '/driver/trips', icon: 'warning', variant: 'danger' },
  { label: 'Police', route: '/driver/trips', icon: 'shield', variant: 'police' },
  { label: 'Witness', route: '/driver/trips', icon: 'eye', variant: 'witness' },
  { label: 'Settings', route: '/settings', icon: 'settings', variant: 'neutral' },
];

const SECTIONS: { title: string; rows: Row[] }[] = [
  {
    title: 'Verification',
    rows: [
      {
        label: 'Driver verification',
        desc: 'License, vehicle & identity checks',
        route: '/driver/verification',
        icon: 'checkmark-done',
        tone: 'safe',
      },
      {
        label: 'Rider security code',
        desc: 'Confirm rider before starting trip',
        route: '/driver/verify-rider-code',
        icon: 'key',
        tone: 'safe',
      },
      {
        label: 'Documents',
        desc: 'Upload or refresh verification files',
        route: '/driver/documents',
        icon: 'document-text',
        tone: 'info',
      },
    ],
  },
  {
    title: 'Emergency',
    rows: [
      {
        label: 'Active trip tools',
        desc: 'Police connect, witness report & SOS during a trip',
        route: '/driver/trips',
        icon: 'flash',
        tone: 'danger',
      },
      {
        label: 'Safety alerts & zones',
        desc: 'Area risk map and community reports',
        route: '/driver/safety-alerts',
        icon: 'map',
        tone: 'danger',
      },
      {
        label: 'Support',
        desc: '24/7 help and incident reporting',
        route: '/support',
        icon: 'headset',
        tone: 'info',
      },
    ],
  },
  {
    title: 'Recording & trip proof',
    rows: [
      {
        label: 'Trip operations',
        desc: 'Receipts, ratings & trip timeline',
        route: '/driver/trips',
        icon: 'car',
        tone: 'info',
      },
      {
        label: 'Story mode',
        desc: 'Optional trip notes & media',
        route: '/driver/story-mode',
        icon: 'mic',
        tone: 'info',
      },
    ],
  },
  {
    title: 'Account security',
    rows: [
      {
        label: 'Bank & earnings vault',
        desc: 'Biometric withdrawals & locked savings',
        route: '/driver/bank',
        icon: 'finger-print',
        tone: 'safe',
      },
      {
        label: 'Subscription & access',
        desc: 'Payment status for trip offers',
        route: '/driver/subscription',
        icon: 'card',
        tone: 'info',
      },
      {
        label: 'App settings',
        desc: 'Privacy, notifications & device',
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

export default function DriverSafetyHubScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Safety & security</Text>
        <Text style={styles.heroSub}>Critical tools in one place — verification, emergencies, and account protection.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.quickLabel}>Quick access</Text>
        <Text style={styles.quickHint}>Police & witness actions work during an active trip (open Trips).</Text>
        <View style={styles.quickRow}>
          {QUICK.map(q => (
            <TouchableOpacity
              key={q.label}
              style={styles.quickBtn}
              onPress={() => router.push(q.route as any)}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray50 },
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
  scroll: { padding: SPACING.lg, paddingBottom: SPACING.huge },
  quickLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.lightTextMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginTop: 4,
    marginBottom: SPACING.sm,
  },
  quickRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
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
  section: { marginBottom: SPACING.lg },
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
