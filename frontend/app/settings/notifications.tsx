import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function NotificationsScreen() {
  const router = useRouter();
  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [tripUpdates, setTripUpdates] = useState(true);
  const [promos, setPromos] = useState(true);
  const [driverUpdates, setDriverUpdates] = useState(true);
  const [payments, setPayments] = useState(true);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Channels</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="notifications" size={24} color={COLORS.accentGreen} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Push Notifications</Text>
                  <Text style={styles.settingDesc}>Get alerts on your device</Text>
                </View>
              </View>
              <Switch
                value={pushEnabled}
                onValueChange={setPushEnabled}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="mail" size={24} color={COLORS.accentBlue} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Email</Text>
                  <Text style={styles.settingDesc}>Receive updates via email</Text>
                </View>
              </View>
              <Switch
                value={emailEnabled}
                onValueChange={setEmailEnabled}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="chatbubble" size={24} color={COLORS.accentOrange} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>SMS</Text>
                  <Text style={styles.settingDesc}>Get text messages</Text>
                </View>
              </View>
              <Switch
                value={smsEnabled}
                onValueChange={setSmsEnabled}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Preferences</Text>
            
            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="car" size={24} color={COLORS.gray700} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Trip Updates</Text>
                  <Text style={styles.settingDesc}>Driver arrived, trip started, etc.</Text>
                </View>
              </View>
              <Switch
                value={tripUpdates}
                onValueChange={setTripUpdates}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="pricetag" size={24} color={COLORS.gray700} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Promotions</Text>
                  <Text style={styles.settingDesc}>Special offers and discounts</Text>
                </View>
              </View>
              <Switch
                value={promos}
                onValueChange={setPromos}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="person" size={24} color={COLORS.gray700} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Driver Updates</Text>
                  <Text style={styles.settingDesc}>Messages from your driver</Text>
                </View>
              </View>
              <Switch
                value={driverUpdates}
                onValueChange={setDriverUpdates}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingLeft}>
                <Ionicons name="card" size={24} color={COLORS.gray700} />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingLabel}>Payment Alerts</Text>
                  <Text style={styles.settingDesc}>Charges and receipts</Text>
                </View>
              </View>
              <Switch
                value={payments}
                onValueChange={setPayments}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900 },
  placeholder: { width: 40 },
  content: { flex: 1 },
  section: {
    backgroundColor: COLORS.white,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray600,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray100,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray900, marginBottom: 2 },
  settingDesc: { fontSize: FONT_SIZE.xs, color: COLORS.gray600 },
});