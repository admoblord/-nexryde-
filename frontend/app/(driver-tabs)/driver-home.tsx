import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, CURRENCY } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function DriverHomeScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [isOnline, setIsOnline] = useState(false);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.background, COLORS.primary, COLORS.background]}
        style={StyleSheet.absoluteFillObject}
      />
      
      {/* Decorative Glows */}
      <View style={[styles.glow, { top: 80, right: 30, backgroundColor: COLORS.accentGreen }]} />
      <View style={[styles.glow, { top: 200, left: 20, backgroundColor: COLORS.accentBlue, width: 60, height: 60 }]} />
      
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity style={styles.profileButton}>
              <LinearGradient
                colors={[COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.profileGradient}
              >
                <Text style={styles.profileInitial}>{user?.name?.charAt(0) || 'D'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Driver Mode Badge */}
          <View style={styles.modeBadge}>
            <View style={[styles.modeDot, { backgroundColor: COLORS.accentGreen }]} />
            <Text style={[styles.modeText, { color: COLORS.accentGreen }]}>Driver Mode</Text>
          </View>

          {/* Online Toggle Card */}
          <View style={styles.onlineCard}>
            <LinearGradient
              colors={isOnline ? [COLORS.accentGreen, COLORS.accentGreenDark] : [COLORS.surface, COLORS.surfaceLight]}
              style={styles.onlineGradient}
            >
              <View style={styles.onlineLeft}>
                <View style={[styles.onlineIcon, isOnline && styles.onlineIconActive]}>
                  <Ionicons 
                    name={isOnline ? 'radio-button-on' : 'radio-button-off'} 
                    size={24} 
                    color={isOnline ? COLORS.white : COLORS.textMuted} 
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
                <View style={[styles.statIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                  <Ionicons name="wallet" size={24} color={COLORS.accentGreen} />
                </View>
                <Text style={styles.statLabel}>Today</Text>
                <Text style={styles.statValue}>{CURRENCY}0</Text>
              </LinearGradient>
            </View>
            <View style={styles.statCard}>
              <LinearGradient
                colors={[COLORS.surface, COLORS.surfaceLight]}
                style={styles.statGradient}
              >
                <View style={[styles.statIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
                  <Ionicons name="car" size={24} color={COLORS.accentBlue} />
                </View>
                <Text style={styles.statLabel}>Trips</Text>
                <Text style={styles.statValue}>0</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <ActionCard
                icon="trophy"
                title="Challenges"
                color={COLORS.gold}
                onPress={() => router.push('/driver/challenges')}
              />
              <ActionCard
                icon="stats-chart"
                title="Earnings"
                color={COLORS.accentGreen}
                onPress={() => router.push('/driver/earnings-dashboard')}
              />
              <ActionCard
                icon="ribbon"
                title="Tiers"
                color={COLORS.accentBlue}
                onPress={() => router.push('/driver/tiers')}
              />
              <ActionCard
                icon="card"
                title="Subscribe"
                color={COLORS.info}
                onPress={() => router.push('/driver/subscription')}
              />
            </View>
          </View>

          {/* Subscription Banner */}
          <TouchableOpacity 
            style={styles.subscriptionBanner}
            onPress={() => router.push('/driver/subscription')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.accentGreenLight, COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.subscriptionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <View style={styles.subscriptionLeft}>
                <View style={styles.subscriptionIcon}>
                  <Ionicons name="diamond" size={24} color={COLORS.primary} />
                </View>
                <View>
                  <Text style={styles.subscriptionTitle}>Subscribe & Earn</Text>
                  <Text style={styles.subscriptionDesc}>Keep 100% of your earnings</Text>
                </View>
              </View>
              <View style={styles.subscriptionPrice}>
                <Text style={styles.subscriptionPriceText}>{CURRENCY}25K</Text>
                <Text style={styles.subscriptionPeriod}>/month</Text>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* AI Assistant */}
          <TouchableOpacity 
            style={styles.aiCard}
            onPress={() => router.push('/assistant')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.primary, COLORS.primaryLight]}
              style={styles.aiGradient}
            >
              <View style={styles.aiLeft}>
                <View style={styles.aiIcon}>
                  <Ionicons name="sparkles" size={24} color={COLORS.accentGreen} />
                </View>
                <View>
                  <Text style={styles.aiTitle}>AI Assistant</Text>
                  <Text style={styles.aiDesc}>Get driving tips & support</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.accentGreen} />
            </LinearGradient>
          </TouchableOpacity>
          
          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const ActionCard = ({ icon, title, color, onPress }: { icon: string; title: string; color: string; onPress: () => void }) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
    <LinearGradient
      colors={[COLORS.surface, COLORS.surfaceLight]}
      style={styles.actionGradient}
    >
      <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
    </LinearGradient>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  glow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    opacity: 0.12,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
    marginBottom: SPACING.sm,
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
    borderRadius: 24,
    overflow: 'hidden',
  },
  profileGradient: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  onlineCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  onlineGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xxl,
  },
  onlineLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  onlineIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  onlineSubtitleActive: {
    color: 'rgba(255,255,255,0.8)',
  },
  onlineButton: {
    backgroundColor: COLORS.accentGreen,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.full,
  },
  onlineButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
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
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  statGradient: {
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  statValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  actionsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  actionCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  actionGradient: {
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  actionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  subscriptionBanner: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  subscriptionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  subscriptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  subscriptionIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.primary,
  },
  subscriptionDesc: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(25, 37, 63, 0.7)',
  },
  subscriptionPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  subscriptionPriceText: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.primary,
  },
  subscriptionPeriod: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(25, 37, 63, 0.7)',
  },
  aiCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  aiGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.xl,
  },
  aiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  aiIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  aiDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
