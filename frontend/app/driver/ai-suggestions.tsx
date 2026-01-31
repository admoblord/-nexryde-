import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

// Dynamic AI logic based on time, day, location
const generateDynamicTips = () => {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;
  const tips = [];

  // Time-based tips
  if (hour >= 6 && hour < 9) {
    tips.push({
      id: 'morning',
      icon: 'sunny',
      color: '#FF9500',
      title: 'Morning Rush Hour',
      description: 'High demand from residential areas to business districts',
      zones: ['Lekki → VI', 'Ikoyi → VI', 'Ikeja → VI'],
      expectedEarnings: '₦12,000 - ₦18,000',
      confidence: 92,
    });
  } else if (hour >= 9 && hour < 12) {
    tips.push({
      id: 'mid-morning',
      icon: 'briefcase',
      color: '#007AFF',
      title: 'Mid-Morning Business Trips',
      description: 'Moderate demand for meetings and appointments',
      zones: ['Victoria Island', 'Ikoyi', 'Ikeja GRA'],
      expectedEarnings: '₦8,000 - ₦12,000',
      confidence: 78,
    });
  } else if (hour >= 12 && hour < 14) {
    tips.push({
      id: 'lunch',
      icon: 'restaurant',
      color: '#FF3B30',
      title: 'Lunch Hour Surge',
      description: 'Peak demand around restaurants and food areas',
      zones: ['VI Business District', 'Ikeja Mall Area', 'Lekki Phase 1'],
      expectedEarnings: '₦10,000 - ₦15,000',
      confidence: 85,
    });
  } else if (hour >= 14 && hour < 17) {
    tips.push({
      id: 'afternoon',
      icon: 'business',
      color: '#5856D6',
      title: 'Afternoon Activity',
      description: 'Steady demand from business areas',
      zones: ['Victoria Island', 'Lekki', 'Ajah'],
      expectedEarnings: '₦6,000 - ₦10,000',
      confidence: 72,
    });
  } else if (hour >= 17 && hour < 20) {
    tips.push({
      id: 'evening',
      icon: 'trending-up',
      color: '#34C759',
      title: '🔥 Evening Rush - HIGHEST DEMAND',
      description: 'Peak hours! Business districts to residential areas',
      zones: ['VI → Lekki', 'VI → Ikoyi', 'Ikeja → Residential'],
      expectedEarnings: '₦18,000 - ₦28,000',
      confidence: 96,
    });
  } else if (hour >= 20 && hour < 23) {
    tips.push({
      id: 'night',
      icon: 'moon',
      color: '#AF52DE',
      title: 'Night Entertainment',
      description: 'Good demand from bars, clubs, and restaurants',
      zones: ['Lekki Entertainment', 'VI Nightlife', 'Ikeja GRA'],
      expectedEarnings: '₦8,000 - ₦15,000',
      confidence: 80,
    });
  } else {
    tips.push({
      id: 'late-night',
      icon: 'moon-outline',
      color: '#8E8E93',
      title: 'Late Night / Early Morning',
      description: 'Low demand - Consider resting or airport runs',
      zones: ['Murtala Muhammed Airport', 'Hotels'],
      expectedEarnings: '₦3,000 - ₦8,000',
      confidence: 60,
    });
  }

  // Day-specific tips
  if (isWeekend) {
    tips.push({
      id: 'weekend',
      icon: 'calendar',
      color: '#FF9500',
      title: 'Weekend Strategy',
      description: 'Focus on leisure and shopping areas',
      zones: ['Shopping Malls', 'Beaches', 'Restaurants', 'Parks'],
      expectedEarnings: '₦15,000 - ₦22,000',
      confidence: 88,
    });
  } else {
    tips.push({
      id: 'weekday',
      icon: 'briefcase-outline',
      color: '#007AFF',
      title: 'Weekday Strategy',
      description: 'Business commuters are your primary customers',
      zones: ['Business Districts', 'Office Areas', 'Corporate HQs'],
      expectedEarnings: '₦12,000 - ₦20,000',
      confidence: 90,
    });
  }

  // Lagos-specific tips
  tips.push({
    id: 'lagos-hot-zones',
    icon: 'location',
    color: '#FF3B30',
    title: 'Lagos High-Demand Zones',
    description: 'Always busy areas with consistent rides',
    zones: [
      'Victoria Island (VI)',
      'Lekki Phase 1',
      'Ikoyi',
      'Ikeja GRA',
      'Ajah',
      'Surulere',
    ],
    expectedEarnings: '₦10,000 - ₦25,000',
    confidence: 94,
  });

  // Weather-based tip (simulate)
  const isRainySeason = now.getMonth() >= 3 && now.getMonth() <= 10;
  if (isRainySeason) {
    tips.push({
      id: 'weather',
      icon: 'rainy',
      color: '#5AC8FA',
      title: 'Rainy Season Strategy',
      description: 'Higher demand expected, stay near sheltered areas',
      zones: ['Mall Areas', 'Covered Locations', 'Residential'],
      expectedEarnings: '+20% surge expected',
      confidence: 85,
    });
  }

  return tips;
};

export default function AITripSuggestionsScreen() {
  const router = useRouter();
  const [tips, setTips] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadTips();
    // Update tips every 30 minutes
    const interval = setInterval(() => {
      setCurrentTime(new Date());
      loadTips();
    }, 30 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const loadTips = () => {
    const dynamicTips = generateDynamicTips();
    setTips(dynamicTips);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setCurrentTime(new Date());
    loadTips();
    setTimeout(() => setRefreshing(false), 1000);
  };

  const formatTime = () => {
    return currentTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI Tips</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Ionicons name="refresh" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.content}>
            {/* Live Update Badge */}
            <View style={styles.liveCard}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>
                Live AI Recommendations · Updated {formatTime()}
              </Text>
            </View>

            {/* Tips List */}
            {tips.map((tip) => (
              <View key={tip.id} style={styles.tipCard}>
                <View style={[styles.tipIcon, { backgroundColor: tip.color + '20' }]}>
                  <Ionicons name={tip.icon as any} size={28} color={tip.color} />
                </View>

                <View style={styles.tipContent}>
                  <Text style={styles.tipTitle}>{tip.title}</Text>
                  <Text style={styles.tipDescription}>{tip.description}</Text>

                  {/* Zones */}
                  <View style={styles.zonesSection}>
                    <Text style={styles.zonesLabel}>🎯 Recommended Zones:</Text>
                    {tip.zones.map((zone: string, index: number) => (
                      <View key={index} style={styles.zoneChip}>
                        <Text style={styles.zoneText}>{zone}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Expected Earnings */}
                  <View style={styles.earningsSection}>
                    <Ionicons name="cash-outline" size={16} color={COLORS.success} />
                    <Text style={styles.earningsText}>{tip.expectedEarnings}</Text>
                  </View>

                  {/* Confidence */}
                  <View style={styles.confidenceSection}>
                    <View style={styles.confidenceBar}>
                      <View
                        style={[styles.confidenceFill, { width: `${tip.confidence}%` }]}
                      />
                    </View>
                    <Text style={styles.confidenceText}>{tip.confidence}% confident</Text>
                  </View>
                </View>
              </View>
            ))}

            {/* Info */}
            <View style={styles.infoCard}>
              <Ionicons name="information-circle" size={20} color={COLORS.primary} />
              <Text style={styles.infoText}>
                💡 Tips update automatically based on time of day, day of week, and Lagos traffic patterns
              </Text>
            </View>
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
  },
  safeArea: {
    flex: 1,
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
  refreshButton: {
    padding: SPACING.xs,
  },
  content: {
    padding: SPACING.md,
  },
  liveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.success + '20',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  liveText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  tipCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  tipIcon: {
    width: 56,
    height: 56,
    borderRadius: BORDER_RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: 'bold',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  tipDescription: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    lineHeight: 20,
  },
  zonesSection: {
    marginBottom: SPACING.sm,
  },
  zonesLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  zoneChip: {
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  zoneText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  earningsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  earningsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  confidenceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  confidenceBar: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.borderColor,
    borderRadius: 3,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  confidenceText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    minWidth: 80,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary + '10',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
