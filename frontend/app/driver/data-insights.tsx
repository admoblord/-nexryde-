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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { Ionicons } from '@expo/vector-icons';

export default function DataInsightsScreen() {
  const router = useRouter();

  const insights = [
    { title: 'Best Days', value: 'Fri, Sat', subtitle: 'Highest earnings', icon: 'calendar', color: COLORS.success },
    { title: 'Peak Hours', value: '7-9 AM', subtitle: 'Most trips', icon: 'time', color: COLORS.info },
    { title: 'Hot Zones', value: 'Victoria Island', subtitle: 'Highest demand', icon: 'location', color: COLORS.warning },
    { title: 'Avg. Trip', value: '₦2,850', subtitle: 'Per ride', icon: 'cash', color: COLORS.accent },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Data Insights</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Ionicons name="analytics" size={40} color={COLORS.accent} />
          <Text style={styles.heroTitle}>AI-Powered Insights</Text>
          <Text style={styles.heroSubtitle}>
            Personalized recommendations based on your driving patterns
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Your Performance</Text>

        <View style={styles.insightsGrid}>
          {insights.map((insight, index) => (
            <View key={index} style={styles.insightCard}>
              <View style={[styles.insightIcon, { backgroundColor: insight.color + '20' }]}>
                <Ionicons name={insight.icon as any} size={24} color={insight.color} />
              </View>
              <Text style={styles.insightValue}>{insight.value}</Text>
              <Text style={styles.insightTitle}>{insight.title}</Text>
              <Text style={styles.insightSubtitle}>{insight.subtitle}</Text>
            </View>
          ))}
        </View>

        <View style={styles.comingSoonCard}>
          <Ionicons name="rocket" size={32} color={COLORS.primary} />
          <Text style={styles.comingSoonTitle}>More Insights Coming Soon</Text>
          <Text style={styles.comingSoonText}>
            We're building advanced analytics to help you maximize your earnings.
          </Text>
        </View>
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
  heroCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  heroTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.gray800,
    marginTop: SPACING.md,
  },
  heroSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  insightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  insightCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.md,
    ...SHADOWS.sm,
  },
  insightIcon: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  insightValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.gray800,
  },
  insightTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.gray600,
    marginTop: 2,
  },
  insightSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray400,
  },
  comingSoonCard: {
    backgroundColor: COLORS.primarySoft,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  comingSoonTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: SPACING.md,
  },
  comingSoonText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
});
