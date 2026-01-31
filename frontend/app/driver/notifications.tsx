import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

interface Notification {
  id: string;
  type: 'surge' | 'demand' | 'weather' | 'traffic' | 'earning' | 'safety';
  title: string;
  message: string;
  time: string;
  icon: string;
  color: string;
  priority: 'high' | 'medium' | 'low';
  read: boolean;
}

export default function SmartNotificationsScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');

  // Notification preferences
  const [preferences, setPreferences] = useState({
    surgeAlerts: true,
    demandAlerts: true,
    weatherAlerts: true,
    trafficAlerts: true,
    earningUpdates: true,
    safetyAlerts: true,
    soundEnabled: true,
    vibrationEnabled: true,
    quietHours: false,
  });

  const notifications: Notification[] = [
    {
      id: '1',
      type: 'surge',
      title: '⚡ Surge Pricing Active!',
      message: 'Lekki area has 2.5x surge. Earn ₦5,000+ per trip!',
      time: '2 mins ago',
      icon: 'flash',
      color: COLORS.accentOrange,
      priority: 'high',
      read: false,
    },
    {
      id: '2',
      type: 'demand',
      title: '🔥 High Demand Alert',
      message: 'Victoria Island needs drivers now. 15 ride requests waiting.',
      time: '5 mins ago',
      icon: 'people',
      color: COLORS.accentGreen,
      priority: 'high',
      read: false,
    },
    {
      id: '3',
      type: 'traffic',
      title: '🚦 Traffic Alert',
      message: 'Heavy traffic on Third Mainland Bridge. Use alternative route.',
      time: '10 mins ago',
      icon: 'warning',
      color: COLORS.error,
      priority: 'medium',
      read: false,
    },
    {
      id: '4',
      type: 'weather',
      title: '🌧️ Weather Alert',
      message: 'Rain expected in 30 minutes. Demand will increase.',
      time: '15 mins ago',
      icon: 'rainy',
      color: COLORS.accentBlue,
      priority: 'medium',
      read: true,
    },
    {
      id: '5',
      type: 'earning',
      title: '💰 Earnings Milestone',
      message: 'You earned ₦25,000 today! Keep going!',
      time: '1 hour ago',
      icon: 'cash',
      color: COLORS.accentGreen,
      priority: 'low',
      read: true,
    },
    {
      id: '6',
      type: 'safety',
      title: '⚠️ U-dub Alert',
      message: 'U-dub checkpoint reported at Lekki Toll Gate.',
      time: '2 hours ago',
      icon: 'shield',
      color: COLORS.error,
      priority: 'high',
      read: true,
    },
  ];

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications.filter(n => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  const togglePreference = (key: string) => {
    setPreferences({ ...preferences, [key]: !preferences[key] });
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <View style={styles.headerTitle}>
            <Ionicons name="notifications" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Smart Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{unreadCount}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.settingsButton}>
            <Ionicons name="settings" size={24} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersScroll}
          contentContainerStyle={styles.filtersContent}
        >
          <TouchableOpacity
            style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'unread' && styles.filterButtonActive]}
            onPress={() => setFilter('unread')}
          >
            <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>
              Unread ({unreadCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'surge' && styles.filterButtonActive]}
            onPress={() => setFilter('surge')}
          >
            <Ionicons name="flash" size={16} color={filter === 'surge' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.filterText, filter === 'surge' && styles.filterTextActive]}>
              Surge
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'demand' && styles.filterButtonActive]}
            onPress={() => setFilter('demand')}
          >
            <Ionicons name="people" size={16} color={filter === 'demand' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.filterText, filter === 'demand' && styles.filterTextActive]}>
              Demand
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterButton, filter === 'safety' && styles.filterButtonActive]}
            onPress={() => setFilter('safety')}
          >
            <Ionicons name="shield" size={16} color={filter === 'safety' ? COLORS.white : COLORS.textSecondary} />
            <Text style={[styles.filterText, filter === 'safety' && styles.filterTextActive]}>
              Safety
            </Text>
          </TouchableOpacity>
        </ScrollView>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* AI Smart Insights */}
          <View style={styles.aiCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
              style={styles.aiGradient}
            >
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={24} color={COLORS.white} />
                <Text style={styles.aiTitle}>AI Smart Alerts</Text>
              </View>
              <Text style={styles.aiText}>
                Our AI analyzes traffic, weather, and demand patterns to send you perfectly timed notifications.
              </Text>
              <View style={styles.aiStats}>
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatValue}>Real-time</Text>
                  <Text style={styles.aiStatLabel}>Updates</Text>
                </View>
                <View style={styles.aiStatDivider} />
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatValue}>Smart</Text>
                  <Text style={styles.aiStatLabel}>Timing</Text>
                </View>
                <View style={styles.aiStatDivider} />
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatValue}>Actionable</Text>
                  <Text style={styles.aiStatLabel}>Insights</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Notifications List */}
          <View style={styles.notificationsSection}>
            {filteredNotifications.length > 0 ? (
              filteredNotifications.map((notification) => (
                <View key={notification.id} style={[
                  styles.notificationCard,
                  !notification.read && styles.notificationCardUnread,
                ]}>
                  <View style={[styles.notificationIcon, { backgroundColor: notification.color }]}>
                    <Ionicons name={notification.icon as any} size={24} color={COLORS.white} />
                  </View>
                  <View style={styles.notificationContent}>
                    <View style={styles.notificationHeader}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      {notification.priority === 'high' && (
                        <View style={styles.priorityBadge}>
                          <Text style={styles.priorityText}>HIGH</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.notificationMessage}>{notification.message}</Text>
                    <Text style={styles.notificationTime}>{notification.time}</Text>
                  </View>
                  {!notification.read && <View style={styles.unreadDot} />}
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="notifications-off" size={48} color={COLORS.white} />
                <Text style={styles.emptyText}>No notifications</Text>
              </View>
            )}
          </View>

          {/* Notification Preferences */}
          <View style={styles.preferencesSection}>
            <Text style={styles.sectionTitle}>⚙️ Notification Preferences</Text>
            
            <View style={styles.preferenceCard}>
              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="flash" size={20} color={COLORS.accentOrange} />
                  <Text style={styles.preferenceLabel}>Surge Price Alerts</Text>
                </View>
                <Switch
                  value={preferences.surgeAlerts}
                  onValueChange={() => togglePreference('surgeAlerts')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="people" size={20} color={COLORS.accentGreen} />
                  <Text style={styles.preferenceLabel}>High Demand Alerts</Text>
                </View>
                <Switch
                  value={preferences.demandAlerts}
                  onValueChange={() => togglePreference('demandAlerts')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="rainy" size={20} color={COLORS.accentBlue} />
                  <Text style={styles.preferenceLabel}>Weather Alerts</Text>
                </View>
                <Switch
                  value={preferences.weatherAlerts}
                  onValueChange={() => togglePreference('weatherAlerts')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="car" size={20} color={COLORS.accentOrange} />
                  <Text style={styles.preferenceLabel}>Traffic Alerts</Text>
                </View>
                <Switch
                  value={preferences.trafficAlerts}
                  onValueChange={() => togglePreference('trafficAlerts')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="cash" size={20} color={COLORS.accentGreen} />
                  <Text style={styles.preferenceLabel}>Earning Updates</Text>
                </View>
                <Switch
                  value={preferences.earningUpdates}
                  onValueChange={() => togglePreference('earningUpdates')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="shield" size={20} color={COLORS.error} />
                  <Text style={styles.preferenceLabel}>Safety Alerts (U-dub)</Text>
                </View>
                <Switch
                  value={preferences.safetyAlerts}
                  onValueChange={() => togglePreference('safetyAlerts')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>
            </View>

            <View style={styles.preferenceCard}>
              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="volume-high" size={20} color={COLORS.lightTextSecondary} />
                  <Text style={styles.preferenceLabel}>Sound</Text>
                </View>
                <Switch
                  value={preferences.soundEnabled}
                  onValueChange={() => togglePreference('soundEnabled')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="phone-portrait" size={20} color={COLORS.lightTextSecondary} />
                  <Text style={styles.preferenceLabel}>Vibration</Text>
                </View>
                <Switch
                  value={preferences.vibrationEnabled}
                  onValueChange={() => togglePreference('vibrationEnabled')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>

              <View style={styles.preferenceItem}>
                <View style={styles.preferenceInfo}>
                  <Ionicons name="moon" size={20} color={COLORS.accentBlue} />
                  <Text style={styles.preferenceLabel}>Quiet Hours (10PM-6AM)</Text>
                </View>
                <Switch
                  value={preferences.quietHours}
                  onValueChange={() => togglePreference('quietHours')}
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentGreen }}
                />
              </View>
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
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  unreadBadge: {
    backgroundColor: COLORS.error,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.white,
  },
  filtersScroll: {
    maxHeight: 50,
  },
  filtersContent: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
  },
  filterButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
  filterText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTextActive: {
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
    marginTop: SPACING.md,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  aiCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  aiGradient: {
    padding: SPACING.lg,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  aiTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  aiText: {
    fontSize: FONT_SIZE.sm,
    color: '#64748B',
    marginBottom: SPACING.md,
    lineHeight: 20,
    fontWeight: '700',
  },
  aiStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.sm,
  },
  aiStat: {
    flex: 1,
    alignItems: 'center',
  },
  aiStatDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  aiStatValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  aiStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  notificationsSection: {
    marginBottom: SPACING.lg,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    alignItems: 'flex-start',
  },
  notificationCardUnread: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accentGreen,
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.xs,
  },
  notificationTitle: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  priorityBadge: {
    backgroundColor: COLORS.errorSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.md,
  },
  priorityText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.error,
  },
  notificationMessage: {
    fontSize: FONT_SIZE.sm,
    color: '#475569',
    marginBottom: SPACING.xs,
    lineHeight: 20,
    fontWeight: '700',
  },
  notificationTime: {
    fontSize: FONT_SIZE.xs,
    color: '#64748B',
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accentGreen,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: '#334155',
    marginTop: SPACING.md,
    fontWeight: '700',
  },
  preferencesSection: {
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: SPACING.md,
    letterSpacing: -0.5,
  },
  preferenceCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  preferenceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  preferenceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flex: 1,
  },
  preferenceLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: '#0F172A',
  },
});
