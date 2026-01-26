import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';
import { FallingRoses } from '@/src/components/FallingRoses';

const { width } = Dimensions.get('window');

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Subtle Falling Roses */}
      <FallingRoses intensity="light" />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity style={styles.profileButton}>
              <LinearGradient
                colors={[COLORS.accent, COLORS.accentDark]}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>{user?.name?.charAt(0) || 'D'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Driver Mode Badge */}
          <View style={styles.modeBadge}>
            <View style={styles.modeDot} />
            <Text style={styles.modeText}>Driver Mode</Text>
          </View>

          {/* Online Toggle Card */}
          <View style={styles.onlineCard}>
            <LinearGradient
              colors={isOnline ? [COLORS.success, '#5A9B7C'] : [COLORS.surface, COLORS.surfaceLight]}
              style={styles.onlineGradient}
            >
              <View style={styles.onlineLeft}>
                <View style={[styles.onlineIcon, isOnline && styles.onlineIconActive]}>
                  <Ionicons 
                    name={isOnline ? 'radio-button-on' : 'radio-button-off'} 
                    size={24} 
                    color={isOnline ? COLORS.success : COLORS.textMuted} 
                  />
                </View>
                <View>
                  <Text style={[styles.onlineTitle, isOnline && styles.onlineTitleActive]}>
                    {isOnline ? "You're Online" : "You're Offline"}
                  </Text>
                  <Text style={[styles.onlineSubtitle, isOnline && styles.onlineSubtitleActive]}>
                    {isOnline ? 'Ready to receive rides' : 'Go online to start earning'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.onlineButton, isOnline && styles.onlineButtonActive]}
                onPress={() => setIsOnline(!isOnline)}
              >
                <Text style={[styles.onlineButtonText, isOnline && styles.onlineButtonTextActive]}>
                  {isOnline ? 'Stop' : 'Start'}
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.surface, COLORS.surfaceLight]}
                style={styles.statGradient}
              >
                <Text style={styles.statLabel}>Today's Earnings</Text>
                <Text style={styles.statValue}>{CURRENCY}0</Text>
                <View style={styles.statBadge}>
                  <Text style={styles.statBadgeText}>Keep 100% - Zero commission</Text>
                </View>
              </LinearGradient>
            </View>
            
            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.surface, COLORS.surfaceLight]}
                style={styles.statGradient}
              >
                <View style={styles.statRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statItemValue}>0</Text>
                    <Text style={styles.statItemLabel}>Total Trips</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statItemValue}>5.0</Text>
                    <Text style={styles.statItemLabel}>Rating</Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          </View>

          {/* Subscription Card */}
          <TouchableOpacity 
            style={styles.subscriptionCard}
            onPress={() => router.push('/driver/subscription')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.rosePetal4, COLORS.rosePetal5]}
              style={styles.subscriptionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.subscriptionIcon}>
                <Ionicons name="diamond" size={24} color={COLORS.white} />
              </View>
              <View style={styles.subscriptionContent}>
                <Text style={styles.subscriptionTitle}>No Active Subscription</Text>
                <Text style={styles.subscriptionSubtitle}>Subscribe to go online</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.white} />
            </LinearGradient>
          </TouchableOpacity>

          {/* Challenges Banner */}
          <TouchableOpacity 
            style={styles.challengeBanner}
            onPress={() => router.push('/driver/challenges')}
            activeOpacity={0.9}
          >
            <View style={styles.challengeRose}>
              <View style={styles.rosePetal} />
              <View style={[styles.rosePetal, { transform: [{ rotate: '72deg' }] }]} />
              <View style={[styles.rosePetal, { transform: [{ rotate: '144deg' }] }]} />
              <View style={[styles.rosePetal, { transform: [{ rotate: '216deg' }] }]} />
              <View style={[styles.rosePetal, { transform: [{ rotate: '288deg' }] }]} />
            </View>
            <View style={styles.challengeContent}>
              <Text style={styles.challengeTitle}>Daily Challenges</Text>
              <Text style={styles.challengeSubtitle}>3 active • Earn up to {CURRENCY}30K extra</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
          </TouchableOpacity>

          {/* Quick Actions */}
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <ActionCard
              icon="trophy"
              title="Challenges"
              color={COLORS.gold}
              onPress={() => router.push('/driver/challenges')}
            />
            <ActionCard
              icon="podium"
              title="Leaderboard"
              color={COLORS.rosePetal3}
              onPress={() => router.push('/driver/leaderboard')}
            />
            <ActionCard
              icon="car"
              title="Vehicle"
              color={COLORS.info}
              onPress={() => router.push('/driver/vehicle')}
            />
            <ActionCard
              icon="card"
              title="Bank"
              color={COLORS.success}
              onPress={() => router.push('/driver/bank')}
            />
          </View>

          {/* Driver Benefits */}
          <View style={styles.benefitsSection}>
            <Text style={styles.sectionTitle}>Your Benefits</Text>
            <View style={styles.benefitsList}>
              <BenefitItem icon="cash" text="Keep 100% of your earnings" color={COLORS.success} />
              <BenefitItem icon="time" text="Flexible working hours" color={COLORS.info} />
              <BenefitItem icon="shield" text="Driver protection program" color={COLORS.rosePetal3} />
              <BenefitItem icon="medal" text="Weekly challenges & rewards" color={COLORS.gold} />
            </View>
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ActionCard = ({ icon, title, color, onPress }: any) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
    <View style={[styles.actionIcon, { backgroundColor: `${color}20` }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.actionTitle}>{title}</Text>
  </TouchableOpacity>
);

const BenefitItem = ({ icon, text, color }: any) => (
  <View style={styles.benefitItem}>
    <View style={[styles.benefitIcon, { backgroundColor: `${color}15` }]}>
      <Ionicons name={icon} size={18} color={color} />
    </View>
    <Text style={styles.benefitText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  greeting: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  profileButton: {
    borderRadius: 25,
    ...SHADOWS.rose,
  },
  profileGradient: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.primary,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
    marginRight: SPACING.sm,
  },
  modeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.success,
  },
  onlineCard: {
    marginHorizontal: SPACING.lg,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    ...SHADOWS.lg,
  },
  onlineGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  onlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.gray800,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  onlineIconActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  onlineTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  onlineTitleActive: {
    color: COLORS.white,
  },
  onlineSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  onlineSubtitleActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  onlineButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
  },
  onlineButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  onlineButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  onlineButtonTextActive: {
    color: COLORS.white,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  statGradient: {
    padding: SPACING.md,
  },
  statLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.xs,
  },
  statValue: {
    fontSize: FONT_SIZE.xxxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  statBadge: {
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
    marginTop: SPACING.xs,
  },
  statBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: COLORS.success,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statItemValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  statItemLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.gray700,
  },
  subscriptionCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.rose,
  },
  subscriptionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  subscriptionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  subscriptionContent: {
    flex: 1,
  },
  subscriptionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  subscriptionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  challengeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.accentSoft,
  },
  challengeRose: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rosePetal: {
    position: 'absolute',
    width: 14,
    height: 18,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 14,
    opacity: 0.8,
  },
  challengeContent: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  challengeSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  actionCard: {
    width: (width - SPACING.lg * 2 - SPACING.md * 3) / 4,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.gray800,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  actionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  benefitsSection: {
    marginBottom: SPACING.xl,
  },
  benefitsList: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.gray800,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  benefitText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  bottomSpacer: {
    height: 100,
  },
});
