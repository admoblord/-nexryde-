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

export default function PerformanceScreen() {
  const router = useRouter();

  const metrics = [
    { label: 'Acceptance Rate', value: '95%', target: '90%', status: 'good', icon: 'checkmark-circle' },
    { label: 'Completion Rate', value: '98%', target: '95%', status: 'good', icon: 'flag' },
    { label: 'Cancellation Rate', value: '2%', target: '<5%', status: 'good', icon: 'close-circle' },
    { label: 'Average Rating', value: '4.9', target: '4.7', status: 'excellent', icon: 'star' },
    { label: 'On-Time Arrival', value: '92%', target: '85%', status: 'good', icon: 'time' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return COLORS.success;
      case 'good': return COLORS.info;
      case 'needs_improvement': return COLORS.warning;
      case 'poor': return COLORS.error;
      default: return COLORS.gray500;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Performance</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.overallCard}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreValue}>A+</Text>
          </View>
          <Text style={styles.overallTitle}>Excellent Performance</Text>
          <Text style={styles.overallSubtext}>
            You're in the top 10% of drivers this month!
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Key Metrics</Text>

        {metrics.map((metric, index) => (
          <View key={index} style={styles.metricCard}>
            <View style={[styles.metricIcon, { backgroundColor: getStatusColor(metric.status) + '20' }]}>
              <Ionicons name={metric.icon as any} size={24} color={getStatusColor(metric.status)} />
            </View>
            <View style={styles.metricInfo}>
              <Text style={styles.metricLabel}>{metric.label}</Text>
              <Text style={styles.metricTarget}>Target: {metric.target}</Text>
            </View>
            <View style={styles.metricValueWrap}>
              <Text style={[styles.metricValue, { color: getStatusColor(metric.status) }]}>
                {metric.value}
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.tipsCard}>
          <Ionicons name="bulb" size={24} color={COLORS.accent} />
          <View style={styles.tipsContent}>
            <Text style={styles.tipsTitle}>Pro Tip</Text>
            <Text style={styles.tipsText}>
              Maintain a high acceptance rate during peak hours to unlock bonus rewards.
            </Text>
          </View>
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
  overallCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.success,
  },
  scoreValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.success,
  },
  overallTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.gray800,
    marginTop: SPACING.md,
  },
  overallSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  metricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  metricLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  metricTarget: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray500,
  },
  metricValueWrap: {
    paddingHorizontal: SPACING.md,
  },
  metricValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
  },
  tipsCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.accentSoft,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.md,
    gap: SPACING.md,
  },
  tipsContent: {
    flex: 1,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
  },
  tipsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    marginTop: 4,
    lineHeight: 20,
  },
});
