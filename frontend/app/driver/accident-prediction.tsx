import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface RiskZone {
  id: string;
  name: string;
  riskLevel: 'high' | 'medium' | 'low';
  accidents: number;
  reason: string;
  time: string;
}

export default function AccidentPredictionScreen() {
  const router = useRouter();
  const [currentRisk, setCurrentRisk] = useState(35);
  const [riskZones, setRiskZones] = useState<RiskZone[]>([
    {
      id: '1',
      name: 'Third Mainland Bridge',
      riskLevel: 'high',
      accidents: 12,
      reason: 'High speed + poor visibility at night',
      time: '6PM - 10PM',
    },
    {
      id: '2',
      name: 'Lekki-Epe Expressway',
      riskLevel: 'high',
      accidents: 8,
      reason: 'Construction zones + speeding',
      time: 'All day',
    },
    {
      id: '3',
      name: 'Oshodi Underbridge',
      riskLevel: 'medium',
      accidents: 5,
      reason: 'Heavy traffic + reckless driving',
      time: '7AM - 9AM',
    },
    {
      id: '4',
      name: 'Apapa Wharf Road',
      riskLevel: 'medium',
      accidents: 4,
      reason: 'Truck congestion + potholes',
      time: 'All day',
    },
  ]);

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'high': return COLORS.error;
      case 'medium': return COLORS.warning;
      case 'low': return COLORS.accentGreen;
      default: return COLORS.gray500;
    }
  };

  const getRiskLabel = (score: number) => {
    if (score < 30) return { label: 'Low Risk', color: COLORS.accentGreen };
    if (score < 60) return { label: 'Moderate Risk', color: COLORS.warning };
    return { label: 'High Risk', color: COLORS.error };
  };

  const riskInfo = getRiskLabel(currentRisk);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#1a1a2e', COLORS.primary]} style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Accident Prediction</Text>
        <View style={{ width: 44 }} />
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content}>
        {/* AI Risk Score */}
        <View style={styles.riskCard}>
          <View style={styles.riskHeader}>
            <Ionicons name="analytics" size={28} color={COLORS.accentBlue} />
            <Text style={styles.riskTitle}>AI Safety Score</Text>
          </View>
          
          <View style={styles.riskScoreContainer}>
            <View style={[styles.riskCircle, { borderColor: riskInfo.color }]}>
              <Text style={[styles.riskScore, { color: riskInfo.color }]}>{currentRisk}%</Text>
              <Text style={styles.riskScoreLabel}>Risk Level</Text>
            </View>
            <View style={styles.riskDetails}>
              <Text style={[styles.riskLevel, { color: riskInfo.color }]}>{riskInfo.label}</Text>
              <Text style={styles.riskDesc}>
                Based on current time, weather, traffic conditions, and historical data.
              </Text>
            </View>
          </View>

          <View style={styles.factorsRow}>
            <FactorBadge icon="time" label="Peak Hours" value="+15%" />
            <FactorBadge icon="rainy" label="Weather" value="+5%" />
            <FactorBadge icon="car" label="Traffic" value="+10%" />
          </View>
        </View>

        {/* High Risk Zones */}
        <Text style={styles.sectionTitle}>⚠️ High Risk Zones Today</Text>
        
        {riskZones.map((zone) => (
          <View key={zone.id} style={styles.zoneCard}>
            <View style={[styles.zoneBadge, { backgroundColor: getRiskColor(zone.riskLevel) }]}>
              <Ionicons name="warning" size={20} color={COLORS.white} />
            </View>
            <View style={styles.zoneInfo}>
              <Text style={styles.zoneName}>{zone.name}</Text>
              <Text style={styles.zoneReason}>{zone.reason}</Text>
              <View style={styles.zoneMetaRow}>
                <View style={styles.zoneMeta}>
                  <Ionicons name="time" size={14} color={COLORS.gray500} />
                  <Text style={styles.zoneMetaText}>{zone.time}</Text>
                </View>
                <View style={styles.zoneMeta}>
                  <Ionicons name="alert-circle" size={14} color={COLORS.error} />
                  <Text style={styles.zoneMetaText}>{zone.accidents} incidents this month</Text>
                </View>
              </View>
            </View>
          </View>
        ))}

        {/* Safety Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>🛡️ AI Safety Recommendations</Text>
          <TipItem icon="speedometer" text="Reduce speed by 20% in high-risk zones" />
          <TipItem icon="eye" text="Stay extra alert during peak accident hours" />
          <TipItem icon="navigate" text="Use alternative routes when possible" />
          <TipItem icon="call" text="Keep emergency contacts ready" />
        </View>

        {/* Emergency Button */}
        <TouchableOpacity 
          style={styles.emergencyButton}
          onPress={() => Alert.alert('🚨 Emergency', 'Calling emergency services...')}
        >
          <Ionicons name="call" size={24} color={COLORS.white} />
          <Text style={styles.emergencyText}>Emergency Assistance</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const FactorBadge = ({ icon, label, value }: any) => (
  <View style={styles.factorBadge}>
    <Ionicons name={icon} size={16} color={COLORS.gray600} />
    <Text style={styles.factorLabel}>{label}</Text>
    <Text style={styles.factorValue}>{value}</Text>
  </View>
);

const TipItem = ({ icon, text }: any) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon} size={20} color={COLORS.accentGreen} />
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.lightBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    borderBottomLeftRadius: BORDER_RADIUS.xxl,
    borderBottomRightRadius: BORDER_RADIUS.xxl,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  riskCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  riskTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  riskScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  riskCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.gray50,
  },
  riskScore: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
  },
  riskScoreLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.gray500,
  },
  riskDetails: { flex: 1 },
  riskLevel: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    marginBottom: SPACING.xs,
  },
  riskDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    lineHeight: 20,
  },
  factorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray100,
  },
  factorBadge: {
    alignItems: 'center',
    flex: 1,
  },
  factorLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.gray500,
    marginTop: 4,
  },
  factorValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.warning,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  zoneCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  zoneBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoneInfo: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  zoneName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: 2,
  },
  zoneReason: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray600,
    marginBottom: SPACING.sm,
  },
  zoneMetaRow: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  zoneMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoneMetaText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.gray500,
  },
  tipsCard: {
    backgroundColor: COLORS.accentGreenSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accentGreen,
    marginBottom: SPACING.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.gray700,
  },
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
  },
  emergencyText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
});
