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
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
            </View>
            <TouchableOpacity 
              style={styles.profileButton}
              onPress={() => router.push('/profile')}
            >
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
            <Text style={styles.modeText}>Driver Mode</Text>
          </View>

          {/* Online/Offline Toggle Card */}
          <View style={styles.statusCard}>
            <View style={styles.statusLeft}>
              <View style={[styles.statusIcon, { backgroundColor: isOnline ? COLORS.accentGreenSoft : COLORS.lightSurface }]}>
                <Ionicons 
                  name={isOnline ? "radio" : "radio-outline"} 
                  size={26} 
                  color={isOnline ? COLORS.accentGreen : COLORS.lightTextMuted} 
                />
              </View>
              <View>
                <Text style={styles.statusTitle}>
                  {isOnline ? "You're Online" : "You're Offline"}
                </Text>
                <Text style={styles.statusDesc}>
                  {isOnline ? 'Accepting ride requests' : 'Go online to start earning'}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[styles.toggleButton, isOnline && styles.toggleButtonOnline]}
              onPress={() => setIsOnline(!isOnline)}
            >
              <LinearGradient
                colors={isOnline ? [COLORS.error, '#FF6B6B'] : [COLORS.accentGreen, COLORS.accentBlue]}
                style={styles.toggleGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.toggleText}>{isOnline ? 'Stop' : 'Start'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Stats Cards */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                <Ionicons name="cash" size={22} color={COLORS.accentGreen} />
              </View>
              <Text style={styles.statLabel}>Today</Text>
              <Text style={styles.statValue}>{CURRENCY}0</Text>
            </View>
            <View style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
                <Ionicons name="car" size={22} color={COLORS.accentBlue} />
              </View>
              <Text style={styles.statLabel}>Trips</Text>
              <Text style={styles.statValue}>0</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionsSection}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              <ActionCard 
                icon="trophy" 
                title="Challenges" 
                color={COLORS.accentGreen}
                onPress={() => router.push('/driver/challenges')}
              />
              <ActionCard 
                icon="stats-chart" 
                title="Earnings" 
                color={COLORS.accentBlue}
                onPress={() => router.push('/driver/earnings-dashboard')}
              />
              <ActionCard 
                icon="ribbon" 
                title="Tiers" 
                color={COLORS.gold}
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

          {/* Subscription CTA */}
          <TouchableOpacity 
            style={styles.subscriptionCard}
            onPress={() => router.push('/driver/subscription')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.subscriptionGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.subscriptionLeft}>
                <Ionicons name="diamond" size={30} color={COLORS.white} />
                <View>
                  <Text style={styles.subscriptionTitle}>Go Premium</Text>
                  <Text style={styles.subscriptionDesc}>Keep 100% of your earnings</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={26} color={COLORS.white} />
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
    <View style={[styles.actionIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.actionTitle}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
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
    fontSize: FONT_SIZE.lg,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  profileButton: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  profileGradient: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  modeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  modeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  statusIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  statusDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    color: COLORS.lightTextSecondary,
  },
  toggleButton: {
    borderRadius: BORDER_RADIUS.full,
    overflow: 'hidden',
  },
  toggleButtonOnline: {},
  toggleGradient: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm + 2,
    borderRadius: BORDER_RADIUS.full,
  },
  toggleText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  statLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
  },
  actionsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  actionCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  subscriptionCard: {
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
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
  subscriptionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    color: COLORS.white,
  },
  subscriptionDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
