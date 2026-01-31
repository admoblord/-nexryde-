import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://nexryde-ui.emergent.host';

export default function PerformanceScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState<any>(null);
  const [hasData, setHasData] = useState(false);

  useEffect(() => {
    fetchPerformance();
  }, []);

  const fetchPerformance = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/driver/${user.id}/performance`);
      const data = await response.json();
      
      if (data.trips_completed > 0) {
        setPerformance(data);
        setHasData(true);
      } else {
        setHasData(false);
      }
    } catch (error) {
      console.error('Error fetching performance:', error);
      setHasData(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading performance...</Text>
      </View>
    );
  }

  if (!hasData) {
    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Performance</Text>
            <View style={styles.placeholder} />
          </View>

          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Ionicons name="speedometer-outline" size={80} color={COLORS.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>No Performance Data</Text>
            <Text style={styles.emptyText}>
              Complete your first trip to start tracking your performance metrics including rating, acceptance rate, and efficiency!
            </Text>
            <TouchableOpacity 
              style={styles.emptyButton}
              onPress={() => router.back()}
            >
              <Text style={styles.emptyButtonText}>Go Online</Text>
              <Ionicons name="power" size={20} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Performance</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Rating */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="star" size={32} color="#FFD700" />
              <Text style={styles.metricTitle}>Rating</Text>
            </View>
            <Text style={styles.metricValue}>{performance?.rating?.toFixed(1) || 'N/A'}</Text>
            <Text style={styles.metricSubtext}>
              Based on {performance?.total_ratings || 0} ratings
            </Text>
          </View>

          {/* Acceptance Rate */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="checkmark-circle" size={32} color={COLORS.success} />
              <Text style={styles.metricTitle}>Acceptance Rate</Text>
            </View>
            <Text style={styles.metricValue}>{performance?.acceptance_rate || 0}%</Text>
            <Text style={styles.metricSubtext}>
              {performance?.trips_accepted || 0} of {performance?.trip_requests || 0} requests
            </Text>
          </View>

          {/* Completion Rate */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="flag" size={32} color={COLORS.primary} />
              <Text style={styles.metricTitle}>Completion Rate</Text>
            </View>
            <Text style={styles.metricValue}>{performance?.completion_rate || 100}%</Text>
            <Text style={styles.metricSubtext}>
              {performance?.trips_completed || 0} completed
            </Text>
          </View>

          {/* Cancellation Rate */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <Ionicons name="close-circle" size={32} color={COLORS.error} />
              <Text style={styles.metricTitle}>Cancellation Rate</Text>
            </View>
            <Text style={styles.metricValue}>{performance?.cancellation_rate || 0}%</Text>
            <Text style={styles.metricSubtext}>
              {performance?.trips_cancelled || 0} cancelled
            </Text>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoText}>
              📊 Real performance data from your completed trips
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: SPACING.md,
    color: COLORS.textSecondary,
  },
  safeArea: {
    flex: 1,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.lightSurface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderColor,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 40,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  emptyIconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.borderColor,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: SPACING.xl,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  emptyButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  content: {
    padding: SPACING.md,
  },
  metricCard: {
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  metricTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  metricValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  metricSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  infoCard: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});