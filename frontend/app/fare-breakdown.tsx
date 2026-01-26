import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';

const { width } = Dimensions.get('window');

interface FareBreakdownProps {
  visible?: boolean;
  tripId?: string;
  onClose?: () => void;
  standalone?: boolean;
}

export default function FareBreakdownScreen() {
  const router = useRouter();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  
  return <FareBreakdownContent tripId={tripId} standalone onClose={() => router.back()} />;
}

export const FareBreakdownContent: React.FC<FareBreakdownProps> = ({ 
  tripId, 
  onClose, 
  standalone = false 
}) => {
  const [breakdown, setBreakdown] = useState<any>(null);
  const [showDispute, setShowDispute] = useState(false);

  useEffect(() => {
    fetchBreakdown();
  }, [tripId]);

  const fetchBreakdown = async () => {
    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/fare/breakdown/${tripId || 'demo'}`
      );
      const data = await response.json();
      setBreakdown(data);
    } catch (error) {
      // Demo data
      setBreakdown({
        trip_id: tripId || 'demo',
        base_fare: 1500,
        estimated_time: 25,
        actual_time: 58,
        breakdown: {
          traffic_delay: {
            extra_minutes: 28,
            rate: 20,
            charge: 560
          },
          weather: {
            condition: 'heavy_rain',
            surcharge: 150
          }
        },
        total_adjustment: 710,
        cap_applied: false,
        final_fare: 2210
      });
    }
  };

  const formatCurrency = (amount: number) => `${CURRENCY}${amount?.toLocaleString() || 0}`;

  const Content = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fare Breakdown</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Hero Total Card */}
      <View style={styles.heroCard}>
        <LinearGradient
          colors={[COLORS.rosePetal4, COLORS.rosePetal5]}
          style={styles.heroGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <FloatingRoseBloom style={{ position: 'absolute', top: 10, right: 10, opacity: 0.3 }} />
          
          <Text style={styles.heroLabel}>Total Fare</Text>
          <Text style={styles.heroValue}>{formatCurrency(breakdown?.final_fare || 0)}</Text>
          
          {breakdown?.total_adjustment > 0 && (
            <View style={styles.adjustmentBadge}>
              <Ionicons name="information-circle" size={16} color={COLORS.white} />
              <Text style={styles.adjustmentBadgeText}>
                Includes {formatCurrency(breakdown?.total_adjustment)} traffic adjustment
              </Text>
            </View>
          )}
        </LinearGradient>
      </View>

      {/* Detailed Breakdown Card */}
      <View style={styles.breakdownCard}>
        <LinearGradient
          colors={[COLORS.surface, COLORS.surfaceLight]}
          style={styles.breakdownGradient}
        >
          <Text style={styles.breakdownTitle}>Fare Details</Text>
          
          {/* Base Fare */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownLeft}>
              <View style={[styles.breakdownIcon, { backgroundColor: COLORS.accentSoft }]}>
                <Ionicons name="car" size={18} color={COLORS.accent} />
              </View>
              <View>
                <Text style={styles.breakdownLabel}>Base Fare</Text>
                <Text style={styles.breakdownSub}>Distance + time estimate</Text>
              </View>
            </View>
            <Text style={styles.breakdownValue}>{formatCurrency(breakdown?.base_fare || 0)}</Text>
          </View>

          <View style={styles.divider} />

          {/* Traffic Delay */}
          {breakdown?.breakdown?.traffic_delay?.charge > 0 && (
            <>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownIcon, { backgroundColor: COLORS.infoSoft }]}>
                    <Ionicons name="time" size={18} color={COLORS.info} />
                  </View>
                  <View>
                    <Text style={styles.breakdownLabel}>Traffic Compensation</Text>
                    <Text style={styles.breakdownSub}>
                      {breakdown?.breakdown?.traffic_delay?.extra_minutes} min × {formatCurrency(breakdown?.breakdown?.traffic_delay?.rate)}/min
                    </Text>
                  </View>
                </View>
                <Text style={[styles.breakdownValue, { color: COLORS.info }]}>
                  +{formatCurrency(breakdown?.breakdown?.traffic_delay?.charge || 0)}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {/* Weather Surcharge */}
          {breakdown?.breakdown?.weather?.surcharge > 0 && (
            <>
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownIcon, { backgroundColor: COLORS.warningSoft }]}>
                    <Ionicons name="rainy" size={18} color={COLORS.warning} />
                  </View>
                  <View>
                    <Text style={styles.breakdownLabel}>Weather Surcharge</Text>
                    <Text style={styles.breakdownSub}>
                      {breakdown?.breakdown?.weather?.condition?.replace('_', ' ') || 'Heavy rain'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.breakdownValue, { color: COLORS.warning }]}>
                  +{formatCurrency(breakdown?.breakdown?.weather?.surcharge || 0)}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {/* Total */}
          <View style={[styles.breakdownRow, styles.totalRow]}>
            <View style={styles.breakdownLeft}>
              <View style={[styles.breakdownIcon, { backgroundColor: COLORS.successSoft }]}>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
              </View>
              <Text style={styles.totalLabel}>Total to Pay</Text>
            </View>
            <Text style={styles.totalValue}>{formatCurrency(breakdown?.final_fare || 0)}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* Time Comparison Card */}
      <View style={styles.timeCard}>
        <View style={styles.timeItem}>
          <Ionicons name="time-outline" size={20} color={COLORS.textMuted} />
          <View>
            <Text style={styles.timeLabel}>Estimated</Text>
            <Text style={styles.timeValue}>{breakdown?.estimated_time || 0} min</Text>
          </View>
        </View>
        <View style={styles.timeArrow}>
          <Ionicons name="arrow-forward" size={20} color={COLORS.accent} />
        </View>
        <View style={styles.timeItem}>
          <Ionicons name="time" size={20} color={COLORS.accent} />
          <View>
            <Text style={styles.timeLabel}>Actual</Text>
            <Text style={[styles.timeValue, { color: COLORS.accent }]}>{breakdown?.actual_time || 0} min</Text>
          </View>
        </View>
      </View>

      {/* Cap Notice */}
      {breakdown?.cap_applied && (
        <View style={styles.capNotice}>
          <Ionicons name="shield-checkmark" size={20} color={COLORS.success} />
          <Text style={styles.capNoticeText}>
            50% cap applied - You're protected from excessive charges
          </Text>
        </View>
      )}

      {/* Fair Pricing Explanation */}
      <View style={styles.fairPricingCard}>
        <View style={styles.fairPricingHeader}>
          <View style={styles.fairPricingPetal} />
          <Text style={styles.fairPricingTitle}>KODA Fair Pricing</Text>
          <View style={styles.fairPricingPetal} />
        </View>
        <View style={styles.fairPricingList}>
          <FairPricingItem icon="checkmark" text="5-minute free buffer included" />
          <FairPricingItem icon="checkmark" text="Maximum 50% increase cap" />
          <FairPricingItem icon="checkmark" text="Real traffic & weather data used" />
          <FairPricingItem icon="checkmark" text="Driver gets 100% of fare" />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsSection}>
        <TouchableOpacity 
          style={styles.disputeButton}
          onPress={() => setShowDispute(true)}
        >
          <Ionicons name="help-circle" size={20} color={COLORS.textMuted} />
          <Text style={styles.disputeButtonText}>Dispute this fare</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneButton} onPress={onClose} activeOpacity={0.9}>
          <LinearGradient
            colors={[COLORS.accent, COLORS.accentDark]}
            style={styles.doneGradient}
          >
            <Text style={styles.doneText}>Done</Text>
            <Ionicons name="checkmark" size={20} color={COLORS.primary} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Dispute Modal */}
      <Modal visible={showDispute} transparent animationType="slide">
        <View style={styles.disputeModal}>
          <View style={styles.disputeContent}>
            <LinearGradient
              colors={[COLORS.surface, COLORS.surfaceLight]}
              style={styles.disputeGradient}
            >
              <View style={styles.disputeHeader}>
                <Text style={styles.disputeTitle}>Dispute Fare</Text>
                <TouchableOpacity onPress={() => setShowDispute(false)}>
                  <Ionicons name="close" size={24} color={COLORS.white} />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.disputeInfo}>
                You have 24 hours to dispute this fare. Our team will review:
              </Text>
              
              <View style={styles.disputeEvidence}>
                <EvidenceItem icon="location" text="GPS speed logs during trip" />
                <EvidenceItem icon="map" text="Traffic layer history" />
                <EvidenceItem icon="rainy" text="Weather data at trip time" />
                <EvidenceItem icon="git-compare" text="Route comparison analysis" />
              </View>
              
              <TouchableOpacity style={styles.submitDisputeButton}>
                <Text style={styles.submitDisputeText}>Submit Dispute</Text>
              </TouchableOpacity>
              
              <Text style={styles.disputeNote}>
                If valid, you'll receive credit for your next ride
              </Text>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );

  if (standalone) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
          style={StyleSheet.absoluteFillObject}
        />
        <RosePetalsStatic count={8} />
        <FallingRoses intensity="light" />
        <RoseGlow size={180} style={styles.glowTop} />
        <SafeAreaView style={styles.safeArea}>
          <Content />
        </SafeAreaView>
      </View>
    );
  }

  return <Content />;
};

const FairPricingItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.fairPricingItem}>
    <Ionicons name={icon as any} size={16} color={COLORS.success} />
    <Text style={styles.fairPricingItemText}>{text}</Text>
  </View>
);

const EvidenceItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.evidenceItem}>
    <Ionicons name={icon as any} size={18} color={COLORS.info} />
    <Text style={styles.evidenceText}>{text}</Text>
  </View>
);

// Export as a reusable modal component
export const FareBreakdownModal: React.FC<FareBreakdownProps & { visible: boolean }> = ({ 
  visible, 
  tripId, 
  onClose 
}) => {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.modalContainer}>
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
          style={StyleSheet.absoluteFillObject}
        />
        <RosePetalsStatic count={6} />
        <FallingRoses intensity="light" />
        <SafeAreaView style={styles.safeArea}>
          <FareBreakdownContent tripId={tripId} onClose={onClose} />
        </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  glowTop: {
    position: 'absolute',
    top: -60,
    right: -60,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerRight: {
    width: 44,
  },
  heroCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.rose,
  },
  heroGradient: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  heroValue: {
    fontSize: FONT_SIZE.hero,
    fontWeight: '900',
    color: COLORS.white,
    marginVertical: SPACING.sm,
  },
  adjustmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
  },
  adjustmentBadgeText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.white,
  },
  breakdownCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  breakdownGradient: {
    padding: SPACING.lg,
  },
  breakdownTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.lg,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  breakdownIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakdownLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  breakdownSub: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  breakdownValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.gray700,
    marginVertical: SPACING.sm,
  },
  totalRow: {
    marginTop: SPACING.sm,
  },
  totalLabel: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  totalValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.success,
  },
  timeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  timeLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  timeValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  timeArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.successSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  capNoticeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.success,
    fontWeight: '500',
  },
  fairPricingCard: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  fairPricingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  fairPricingPetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.7,
  },
  fairPricingTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accent,
  },
  fairPricingList: {
    gap: SPACING.sm,
  },
  fairPricingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  fairPricingItemText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
  },
  actionsSection: {
    gap: SPACING.md,
  },
  disputeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.sm,
  },
  disputeButtonText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  doneButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  doneGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  doneText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  disputeModal: {
    flex: 1,
    backgroundColor: COLORS.overlay,
    justifyContent: 'flex-end',
  },
  disputeContent: {
    borderTopLeftRadius: BORDER_RADIUS.xxxl,
    borderTopRightRadius: BORDER_RADIUS.xxxl,
    overflow: 'hidden',
  },
  disputeGradient: {
    padding: SPACING.xl,
  },
  disputeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  disputeTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  disputeInfo: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 22,
  },
  disputeEvidence: {
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  evidenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.infoSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  evidenceText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.info,
    flex: 1,
  },
  submitDisputeButton: {
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  submitDisputeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  disputeNote: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  bottomSpacer: {
    height: 40,
  },
});
