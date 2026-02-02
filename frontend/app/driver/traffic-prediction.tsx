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

export default function TrafficPredictionScreen() {
  const router = useRouter();

  const predictions = [
    { time: '7:00 AM - 9:00 AM', level: 'Heavy', areas: ['Lekki-Ikoyi Link', 'Third Mainland Bridge', 'Victoria Island'], color: COLORS.error },
    { time: '12:00 PM - 2:00 PM', level: 'Moderate', areas: ['Opebi', 'Allen Avenue', 'Ikeja'], color: COLORS.warning },
    { time: '5:00 PM - 8:00 PM', level: 'Heavy', areas: ['Oshodi', 'Apapa', 'CMS'], color: COLORS.error },
    { time: '9:00 PM - 11:00 PM', level: 'Light', areas: ['Most areas clear'], color: COLORS.success },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.gray800} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Traffic Prediction</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.aiCard}>
          <Ionicons name="analytics" size={32} color={COLORS.info} />
          <Text style={styles.aiTitle}>AI Traffic Analysis</Text>
          <Text style={styles.aiSubtext}>
            Predictions based on historical data and real-time patterns
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Today's Forecast</Text>

        {predictions.map((pred, index) => (
          <View key={index} style={styles.predictionCard}>
            <View style={styles.predictionHeader}>
              <View style={[styles.levelBadge, { backgroundColor: pred.color + '20' }]}>
                <Text style={[styles.levelText, { color: pred.color }]}>{pred.level}</Text>
              </View>
              <Text style={styles.predictionTime}>{pred.time}</Text>
            </View>
            <View style={styles.areasWrap}>
              {pred.areas.map((area, areaIndex) => (
                <View key={areaIndex} style={styles.areaBadge}>
                  <Ionicons name="location" size={14} color={COLORS.gray600} />
                  <Text style={styles.areaText}>{area}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Pro Tips</Text>
          <Text style={styles.tipsText}>• Avoid Lekki-Ikoyi Link during morning rush</Text>
          <Text style={styles.tipsText}>• Third Mainland Bridge clears up by 10 AM</Text>
          <Text style={styles.tipsText}>• Best earnings: 5 PM - 8 PM in Victoria Island</Text>
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
  aiCard: {
    backgroundColor: COLORS.infoSoft,
    padding: SPACING.xl,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  aiTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.info,
    marginTop: SPACING.sm,
  },
  aiSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.md,
  },
  predictionCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  predictionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  levelBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  levelText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '800',
  },
  predictionTime: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray600,
  },
  areasWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  areaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray100,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
    gap: 4,
  },
  areaText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  tipsCard: {
    backgroundColor: COLORS.accentSoft,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginTop: SPACING.md,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.gray800,
    marginBottom: SPACING.sm,
  },
  tipsText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray700,
    marginBottom: 4,
    lineHeight: 20,
  },
});
