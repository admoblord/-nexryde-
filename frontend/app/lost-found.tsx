import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function LostFoundScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'report' | 'history'>('report');
  const [description, setDescription] = useState('');

  const recentTrips = [
    { id: 1, driver: 'Chukwuemeka O.', route: 'Victoria Island → Ikeja', time: 'Today, 2:30 PM' },
    { id: 2, driver: 'Adebayo F.', route: 'Lekki → VI', time: 'Yesterday, 5:15 PM' },
  ];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lost & Found</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'report' && styles.tabActive]}
            onPress={() => setActiveTab('report')}
          >
            <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>Report Lost Item</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'history' && styles.tabActive]}
            onPress={() => setActiveTab('history')}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {activeTab === 'report' ? (
            <>
              {/* Description Input */}
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>Describe Lost Item</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="E.g., Black leather wallet with ID cards"
                  placeholderTextColor={COLORS.lightTextMuted}
                  multiline
                  numberOfLines={4}
                  value={description}
                  onChangeText={setDescription}
                  textAlignVertical="top"
                />
              </View>

              {/* Select Trip */}
              <Text style={styles.sectionTitle}>Select Recent Trip</Text>
              {recentTrips.map(trip => (
                <TouchableOpacity key={trip.id} style={styles.tripCard}>
                  <View style={[styles.tripIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                    <Ionicons name="person" size={20} color={COLORS.accentGreen} />
                  </View>
                  <View style={styles.tripInfo}>
                    <Text style={styles.tripDriver}>{trip.driver}</Text>
                    <Text style={styles.tripRoute}>{trip.route}</Text>
                    <Text style={styles.tripTime}>{trip.time}</Text>
                  </View>
                  <View style={styles.radioOuter}>
                    <View style={styles.radioInner} />
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: COLORS.lightSurface }]}>
                <Ionicons name="search" size={32} color={COLORS.lightTextMuted} />
              </View>
              <Text style={styles.emptyTitle}>No Reports Yet</Text>
              <Text style={styles.emptyDesc}>Your lost item reports will appear here</Text>
            </View>
          )}
        </ScrollView>

        {/* Submit Button */}
        {activeTab === 'report' && (
          <View style={styles.bottomContainer}>
            <TouchableOpacity style={styles.submitButton}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.submitText}>Submit Report</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.full,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.full,
  },
  tabActive: {
    backgroundColor: COLORS.accentGreen,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  tabTextActive: {
    color: COLORS.white,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  inputCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  textInput: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    minHeight: 100,
    padding: 0,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.md,
  },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  tripIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  tripInfo: {
    flex: 1,
  },
  tripDriver: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  tripRoute: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  tripTime: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.accentGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  submitGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  submitText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
