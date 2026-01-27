import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function LostFoundScreen() {
  const router = useRouter();
  const [selectedTab, setSelectedTab] = useState<'report' | 'history'>('report');
  const [itemDescription, setItemDescription] = useState('');

  const recentTrips = [
    { id: 1, driver: 'Chukwuemeka O.', date: 'Today, 2:30 PM', from: 'Victoria Island', to: 'Ikeja' },
    { id: 2, driver: 'Adebayo F.', date: 'Yesterday, 5:15 PM', from: 'Lekki', to: 'VI' },
  ];

  const history = [
    { id: 1, item: 'Black Wallet', status: 'Found', date: '2 days ago' },
    { id: 2, item: 'iPhone Charger', status: 'Searching', date: '5 days ago' },
  ];

  const handleReport = () => {
    if (!itemDescription.trim()) {
      Alert.alert('Error', 'Please describe the lost item');
      return;
    }
    Alert.alert('Report Submitted', 'We will contact the driver and notify you if found.', [{ text: 'OK', onPress: () => setItemDescription('') }]);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[COLORS.background, COLORS.primary, COLORS.background]} style={StyleSheet.absoluteFillObject} />
      <View style={[styles.glow, { top: 80, left: 30, backgroundColor: COLORS.accentBlue }]} />
      <View style={[styles.glow, { bottom: 200, right: 20, backgroundColor: COLORS.accentGreen, width: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lost & Found</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, selectedTab === 'report' && styles.tabActive]} onPress={() => setSelectedTab('report')}>
            <Text style={[styles.tabText, selectedTab === 'report' && styles.tabTextActive]}>Report Lost Item</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, selectedTab === 'history' && styles.tabActive]} onPress={() => setSelectedTab('history')}>
            <Text style={[styles.tabText, selectedTab === 'history' && styles.tabTextActive]}>History</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {selectedTab === 'report' ? (
            <>
              <View style={styles.inputCard}>
                <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.inputGradient}>
                  <Text style={styles.inputLabel}>Describe Lost Item</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="E.g., Black leather wallet with ID cards"
                    placeholderTextColor={COLORS.textMuted}
                    value={itemDescription}
                    onChangeText={setItemDescription}
                    multiline
                    numberOfLines={3}
                  />
                </LinearGradient>
              </View>

              <Text style={styles.sectionTitle}>Select Recent Trip</Text>
              {recentTrips.map((trip) => (
                <TouchableOpacity key={trip.id} style={styles.tripCard}>
                  <View style={styles.tripIcon}>
                    <Ionicons name="car" size={20} color={COLORS.accentGreen} />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripDriver}>{trip.driver}</Text>
                    <Text style={styles.tripRoute}>{trip.from} → {trip.to}</Text>
                    <Text style={styles.tripDate}>{trip.date}</Text>
                  </View>
                  <View style={styles.tripRadio} />
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={styles.submitButton} onPress={handleReport}>
                <LinearGradient colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]} style={styles.submitGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={styles.submitText}>Submit Report</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            history.map((item) => (
              <View key={item.id} style={styles.historyCard}>
                <View style={[styles.statusIcon, { backgroundColor: item.status === 'Found' ? COLORS.accentGreenSoft : COLORS.warningSoft }]}>
                  <Ionicons name={item.status === 'Found' ? 'checkmark-circle' : 'search'} size={24} color={item.status === 'Found' ? COLORS.accentGreen : COLORS.warning} />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyItem}>{item.item}</Text>
                  <Text style={styles.historyDate}>{item.date}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'Found' ? COLORS.accentGreenSoft : COLORS.warningSoft }]}>
                  <Text style={[styles.statusText, { color: item.status === 'Found' ? COLORS.accentGreen : COLORS.warning }]}>{item.status}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  glow: { position: 'absolute', width: 80, height: 80, borderRadius: 40, opacity: 0.12 },
  safeArea: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FONT_SIZE.xl, fontWeight: '700', color: COLORS.white },
  tabs: { flexDirection: 'row', paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg, gap: SPACING.md },
  tab: { flex: 1, paddingVertical: SPACING.md, borderRadius: BORDER_RADIUS.xl, backgroundColor: COLORS.surface, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.accentGreen },
  tabText: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.primary },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  inputCard: { marginBottom: SPACING.lg, borderRadius: BORDER_RADIUS.xxl, overflow: 'hidden' },
  inputGradient: { padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.xxl },
  inputLabel: { fontSize: FONT_SIZE.sm, fontWeight: '600', color: COLORS.textSecondary, marginBottom: SPACING.sm },
  input: { backgroundColor: COLORS.surfaceLight, borderRadius: BORDER_RADIUS.lg, padding: SPACING.md, fontSize: FONT_SIZE.md, color: COLORS.white, minHeight: 80, textAlignVertical: 'top' },
  sectionTitle: { fontSize: FONT_SIZE.md, fontWeight: '700', color: COLORS.white, marginBottom: SPACING.md },
  tripCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.surfaceLight },
  tripIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.accentGreenSoft, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  tripInfo: { flex: 1 },
  tripDriver: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  tripRoute: { fontSize: FONT_SIZE.sm, color: COLORS.textSecondary },
  tripDate: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  tripRadio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.accentGreen },
  submitButton: { marginTop: SPACING.lg, borderRadius: BORDER_RADIUS.xl, overflow: 'hidden' },
  submitGradient: { paddingVertical: SPACING.lg, alignItems: 'center' },
  submitText: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.primary },
  historyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: BORDER_RADIUS.xl, padding: SPACING.md, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.surfaceLight },
  statusIcon: { width: 48, height: 48, borderRadius: BORDER_RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginRight: SPACING.md },
  historyInfo: { flex: 1 },
  historyItem: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  historyDate: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  statusBadge: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs, borderRadius: BORDER_RADIUS.full },
  statusText: { fontSize: FONT_SIZE.sm, fontWeight: '600' },
});