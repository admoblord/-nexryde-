import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { DriverOfferSoundPreferences } from '@/src/components/profile/DriverOfferSoundPreferences';

/**
 * Driver hub → dedicated screen for ride-offer alert sound (loops while an offer is on screen).
 */
export default function DriverOfferRingtoneScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={26} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ride request ringtone</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <View style={styles.introIcon}>
            <Ionicons name="notifications" size={22} color="#0284C7" />
          </View>
          <Text style={styles.introTitle}>Choose how new offers sound</Text>
          <Text style={styles.introBody}>
            When a ride request appears, your phone plays the tone you pick (and can loop until you accept or
            decline). Use preview to hear each option — including Nexryde originals tuned for clarity in the car.
          </Text>
        </View>

        <View style={styles.card}>
          <DriverOfferSoundPreferences defaultExpandedTones />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.lightBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.gray200,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.gray800,
  },
  headerSpacer: { width: 44 },
  scroll: { padding: SPACING.lg, paddingBottom: 40 },
  intro: {
    marginBottom: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  introIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  introTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.gray800,
    marginBottom: 6,
  },
  introBody: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    overflow: 'hidden',
  },
});
