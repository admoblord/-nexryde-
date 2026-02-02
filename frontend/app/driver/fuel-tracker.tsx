import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function FuelTrackerScreen() {
  const router = useRouter();
  const [fuelAmount, setFuelAmount] = useState('');
  const [liters, setLiters] = useState('');

  const handleLogFuel = () => {
    if (!fuelAmount || !liters) {
      Alert.alert('Missing Info', 'Please enter both amount and liters');
      return;
    }
    Alert.alert('Success', `Fuel purchase of ${CURRENCY}${fuelAmount} (${liters}L) logged!`);
    setFuelAmount('');
    setLiters('');
  };

  const recentLogs = [
    { date: 'Today', amount: 15000, liters: 25, pricePerLiter: 600 },
    { date: 'Yesterday', amount: 12000, liters: 20, pricePerLiter: 600 },
    { date: '3 days ago', amount: 18000, liters: 30, pricePerLiter: 600 },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fuel Tracker</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>This Week's Fuel Cost</Text>
          <Text style={styles.summaryValue}>{CURRENCY}45,000</Text>
          <Text style={styles.summarySubtext}>75 liters total</Text>
        </View>

        <View style={styles.logForm}>
          <Text style={styles.formTitle}>Log Fuel Purchase</Text>
          
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount ({CURRENCY})</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 15000"
                value={fuelAmount}
                onChangeText={setFuelAmount}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Liters</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 25"
                value={liters}
                onChangeText={setLiters}
                keyboardType="numeric"
              />
            </View>
          </View>

          <TouchableOpacity style={styles.logButton} onPress={handleLogFuel}>
            <Ionicons name="add-circle" size={20} color={COLORS.white} />
            <Text style={styles.logButtonText}>Log Fuel</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Recent Logs</Text>
        {recentLogs.map((log, index) => (
          <View key={index} style={styles.logCard}>
            <View style={styles.logIcon}>
              <Ionicons name="flame" size={24} color={COLORS.warning} />
            </View>
            <View style={styles.logInfo}>
              <Text style={styles.logDate}>{log.date}</Text>
              <Text style={styles.logDetails}>{log.liters}L @ {CURRENCY}{log.pricePerLiter}/L</Text>
            </View>
            <Text style={styles.logAmount}>{CURRENCY}{log.amount.toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
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
  backButton: {
    padding: SPACING.sm,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  content: {
    padding: SPACING.lg,
  },
  summaryCard: {
    backgroundColor: COLORS.primary,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  summaryLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accent,
  },
  summaryValue: {
    fontSize: FONT_SIZE.display,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.xs,
  },
  summarySubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray300,
    marginTop: SPACING.xs,
  },
  logForm: {
    backgroundColor: COLORS.white,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  formTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
    marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.gray50,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    fontSize: FONT_SIZE.md,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  logButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  logButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  logCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  logIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  logDate: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  logDetails: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  logAmount: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
  },
});
