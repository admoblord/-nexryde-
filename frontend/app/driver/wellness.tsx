import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Platform,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

interface DrivingSession {
  startTime: Date;
  endTime?: Date;
  duration: number; // minutes
  ridesCompleted: number;
  earnings: number;
  breaksTaken: number;
}

interface BreakRecord {
  id: string;
  timestamp: Date;
  duration: number; // minutes
  type: 'short' | 'long' | 'meal';
  location?: string;
}

export default function DriverWellnessScreen() {
  const router = useRouter();
  const { user } = useAppStore();

  // Driving session tracking
  const [currentSession, setCurrentSession] = useState<DrivingSession | null>(null);
  const [drivingTimeMinutes, setDrivingTimeMinutes] = useState(0);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakStartTime, setBreakStartTime] = useState<Date | null>(null);
  
  // Settings
  const [alertInterval, setAlertInterval] = useState(240); // 4 hours in minutes
  const [alertsEnabled, setAlertsEnabled] = useState(true);
  const [lastAlertTime, setLastAlertTime] = useState<Date | null>(null);
  
  // History
  const [todaySessions, setTodaySessions] = useState<DrivingSession[]>([]);
  const [breakHistory, setBreakHistory] = useState<BreakRecord[]>([]);
  
  // Stats
  const [weeklyStats, setWeeklyStats] = useState({
    totalDrivingTime: 0,
    averageSessionTime: 0,
    breaksTaken: 0,
    wellnessScore: 0,
  });

  // Show rest modal
  const [showRestModal, setShowRestModal] = useState(false);
  const [showBreakSuggestions, setShowBreakSuggestions] = useState(false);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadWellnessData();
    startDrivingTimer();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    // Check if it's time for a rest alert
    if (alertsEnabled && drivingTimeMinutes > 0 && drivingTimeMinutes % alertInterval === 0) {
      if (!lastAlertTime || (new Date().getTime() - lastAlertTime.getTime()) > 60000) {
        triggerRestAlert();
        setLastAlertTime(new Date());
      }
    }
  }, [drivingTimeMinutes]);

  const loadWellnessData = async () => {
    if (!user?.id) return;
    try {
      const { BACKEND_URL } = require('@/src/services/api');
      const res = await fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}`);
      const data = await res.json();
      const hours = data?.hours_worked || data?.online_hours || 0;
      const trips = data?.total_trips || 0;
      setWeeklyStats({
        totalDrivingTime: Math.round(hours * 60),
        averageSessionTime: trips > 0 ? Math.round((hours * 60) / Math.max(trips, 1)) : 0,
        breaksTaken: Math.max(0, Math.floor(hours / 2)),
        wellnessScore: Math.min(100, Math.max(0, hours < 50 ? 90 : hours < 80 ? 70 : 50)),
      });
    } catch { /* keep defaults */ }
  };

  const startDrivingTimer = () => {
    timerRef.current = setInterval(() => {
      if (!isOnBreak) {
        setDrivingTimeMinutes(prev => prev + 1);
      }
    }, 60000); // Every minute
  };

  const triggerRestAlert = () => {
    if (Platform.OS !== 'web') {
      Vibration.vibrate([0, 500, 200, 500]);
    }

    setShowRestModal(true);

    // Also show notification
    Alert.alert(
      '⏰ Time for a Break!',
      `You've been driving for ${Math.floor(drivingTimeMinutes / 60)} hours. Taking a break improves safety and earnings.`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'Start Break', onPress: startBreak }
      ]
    );
  };

  const startBreak = () => {
    setIsOnBreak(true);
    setBreakStartTime(new Date());
    setShowRestModal(false);
    Alert.alert('Break Started', 'Enjoy your rest! Tap "End Break" when you\'re ready to continue.');
  };

  const endBreak = () => {
    if (breakStartTime) {
      const breakDuration = Math.round((new Date().getTime() - breakStartTime.getTime()) / 60000);
      
      const breakRecord: BreakRecord = {
        id: Date.now().toString(),
        timestamp: breakStartTime,
        duration: breakDuration,
        type: breakDuration < 15 ? 'short' : breakDuration < 45 ? 'long' : 'meal',
      };

      setBreakHistory([breakRecord, ...breakHistory]);
      setIsOnBreak(false);
      setBreakStartTime(null);
      
      Alert.alert(
        'Break Ended',
        `You rested for ${breakDuration} minutes. Great job taking care of yourself! 💚`
      );
    }
  };

  const calculateWellnessScore = () => {
    if (drivingTimeMinutes === 0) return 85; // Default good score when not driving
    // Based on breaks taken vs driving time
    const breakRatio = breakHistory.length / Math.max(1, drivingTimeMinutes / 240); // breaks per 4 hours
    const score = Math.min(100, Math.round(50 + (breakRatio * 50)));
    return isNaN(score) ? 85 : score;
  };

  const getTotalDrivingTimeToday = () => {
    return Math.floor(drivingTimeMinutes / 60);
  };

  const getTotalBreakTimeToday = () => {
    return breakHistory.reduce((sum, b) => sum + b.duration, 0);
  };

  const getNextBreakRecommendation = () => {
    const timeSinceLastBreak = drivingTimeMinutes % alertInterval;
    const timeUntilNextBreak = alertInterval - timeSinceLastBreak;
    return Math.max(0, timeUntilNextBreak);
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getWellnessLevel = (score: number) => {
    if (score >= 85) return { label: 'Excellent', color: COLORS.success };
    if (score >= 70) return { label: 'Good', color: COLORS.accentGreen };
    if (score >= 50) return { label: 'Fair', color: COLORS.warning };
    return { label: 'Needs Attention', color: COLORS.error };
  };

  const wellnessScore = calculateWellnessScore();
  const wellnessLevel = getWellnessLevel(wellnessScore);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Driver Wellness</Text>
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => {/* TODO: Settings */}}
        >
          <Ionicons name="settings" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Current Status Card */}
        <View style={styles.statusCard}>
          <LinearGradient
            colors={isOnBreak ? [COLORS.accentPurple, COLORS.accentBlue] : [COLORS.accentGreen, COLORS.accentBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.statusGradient}
          >
            <View style={styles.statusHeader}>
              <View style={styles.statusIconContainer}>
                <Ionicons 
                  name={isOnBreak ? "pause-circle" : "car-sport"} 
                  size={40} 
                  color={COLORS.white} 
                />
              </View>
              <View style={styles.statusInfo}>
                <Text style={styles.statusTitle}>
                  {isOnBreak ? '☕ On Break' : '🚗 Driving'}
                </Text>
                <Text style={styles.statusSubtitle}>
                  {isOnBreak 
                    ? `Started ${breakStartTime ? formatTime(Math.round((new Date().getTime() - breakStartTime.getTime()) / 60000)) : '0m'} ago`
                    : `${formatTime(drivingTimeMinutes)} driving time today`}
                </Text>
              </View>
            </View>

            {!isOnBreak && (
              <View style={styles.nextBreakInfo}>
                <Ionicons name="time-outline" size={16} color={COLORS.white} />
                <Text style={styles.nextBreakText}>
                  Next break recommended in {formatTime(getNextBreakRecommendation())}
                </Text>
              </View>
            )}

            {isOnBreak ? (
              <TouchableOpacity style={styles.actionButton} onPress={endBreak}>
                <Text style={styles.actionButtonText}>End Break</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionButton} onPress={startBreak}>
                <Text style={styles.actionButtonText}>Take a Break Now</Text>
              </TouchableOpacity>
            )}
          </LinearGradient>
        </View>

        {/* Wellness Score */}
        <View style={styles.wellnessCard}>
          <Text style={styles.cardTitle}>💚 Wellness Score</Text>
          <View style={styles.wellnessScoreContainer}>
            <View style={styles.scoreCircle}>
              <Text style={[styles.scoreNumber, { color: wellnessLevel.color }]}>
                {wellnessScore}
              </Text>
              <Text style={styles.scoreLabel}>/100</Text>
            </View>
            <View style={styles.scoreLevelContainer}>
              <Text style={[styles.scoreLevel, { color: wellnessLevel.color }]}>
                {wellnessLevel.label}
              </Text>
              <Text style={styles.scoreLevelDesc}>
                {wellnessScore >= 85 && 'Great job! You\'re taking excellent care of yourself.'}
                {wellnessScore >= 70 && wellnessScore < 85 && 'Good balance between work and rest.'}
                {wellnessScore >= 50 && wellnessScore < 70 && 'Consider taking more frequent breaks.'}
                {wellnessScore < 50 && 'Please prioritize rest for your safety.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Today's Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.cardTitle}>📊 Today's Activity</Text>
          <View style={styles.statsGrid}>
            <StatItem 
              icon="time-outline" 
              label="Driving Time" 
              value={formatTime(drivingTimeMinutes)}
              color={COLORS.accentBlue}
            />
            <StatItem 
              icon="cafe-outline" 
              label="Break Time" 
              value={formatTime(getTotalBreakTimeToday())}
              color={COLORS.accentPurple}
            />
            <StatItem 
              icon="pulse-outline" 
              label="Breaks Taken" 
              value={breakHistory.length.toString()}
              color={COLORS.accentGreen}
            />
            <StatItem 
              icon="shield-checkmark-outline" 
              label="Safety Level" 
              value={wellnessScore >= 70 ? 'High' : wellnessScore >= 50 ? 'Medium' : 'Low'}
              color={wellnessLevel.color}
            />
          </View>
        </View>

        {/* Break Suggestions */}
        <TouchableOpacity 
          style={styles.suggestionsCard}
          onPress={() => setShowBreakSuggestions(true)}
        >
          <View style={styles.suggestionsHeader}>
            <Ionicons name="bulb-outline" size={24} color={COLORS.accent} />
            <Text style={styles.suggestionsTitle}>Break Suggestions</Text>
          </View>
          <Text style={styles.suggestionsDesc}>
            Tap to see recommended activities for your break
          </Text>
          <View style={styles.suggestionsArrow}>
            <Ionicons name="chevron-forward" size={20} color={COLORS.lightTextMuted} />
          </View>
        </TouchableOpacity>

        {/* Weekly Summary */}
        <View style={styles.weeklyCard}>
          <Text style={styles.cardTitle}>📅 This Week</Text>
          <View style={styles.weeklyMetrics}>
            <WeeklyMetric 
              label="Total Driving" 
              value={formatTime(weeklyStats.totalDrivingTime)}
              icon="car-sport"
            />
            <WeeklyMetric 
              label="Avg Session" 
              value={formatTime(weeklyStats.averageSessionTime)}
              icon="timer"
            />
            <WeeklyMetric 
              label="Breaks Taken" 
              value={`${weeklyStats.breaksTaken} times`}
              icon="cafe"
            />
          </View>
        </View>

        {/* Safety Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.cardTitle}>🛡️ Safety Tips</Text>
          <View style={styles.tipsList}>
            <TipItem text="Take a 15-minute break every 4 hours" />
            <TipItem text="Stay hydrated - drink water regularly" />
            <TipItem text="Stretch your legs during breaks" />
            <TipItem text="Avoid driving when you feel drowsy" />
            <TipItem text="Get 7-8 hours of sleep before long shifts" />
          </View>
        </View>

        {/* Emergency Rest Button */}
        <TouchableOpacity 
          style={styles.emergencyButton}
          onPress={() => {
            Alert.alert(
              '🚨 Feeling Tired?',
              'Your safety is most important. Take a break immediately if you feel fatigued.',
              [
                { text: 'I\'m Fine', style: 'cancel' },
                { text: 'Take Break', onPress: startBreak, style: 'destructive' }
              ]
            );
          }}
        >
          <Ionicons name="alert-circle" size={24} color={COLORS.error} />
          <Text style={styles.emergencyText}>Feeling Fatigued? Rest Now</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Rest Alert Modal */}
      <Modal
        visible={showRestModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowRestModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <LinearGradient
              colors={[COLORS.warning, COLORS.accent]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalGradient}
            >
              <Ionicons name="alert-circle" size={60} color={COLORS.white} />
              <Text style={styles.modalTitle}>Time for a Break!</Text>
              <Text style={styles.modalText}>
                You've been driving for {Math.floor(drivingTimeMinutes / 60)} hours.
                Taking a break improves safety and helps you earn more.
              </Text>
            </LinearGradient>

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setShowRestModal(false)}
              >
                <Text style={styles.modalButtonSecondaryText}>Remind Me Later</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  setShowRestModal(false);
                  startBreak();
                }}
              >
                <Text style={styles.modalButtonText}>Start Break</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Break Suggestions Modal */}
      <Modal
        visible={showBreakSuggestions}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowBreakSuggestions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.suggestionsModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>💡 Break Activities</Text>
              <TouchableOpacity onPress={() => setShowBreakSuggestions(false)}>
                <Ionicons name="close" size={28} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <BreakActivity 
                icon="walk" 
                title="Take a Short Walk"
                desc="5-10 minutes of walking improves circulation"
                duration="10 min"
              />
              <BreakActivity 
                icon="body" 
                title="Stretch Your Body"
                desc="Reduce muscle tension with simple stretches"
                duration="5 min"
              />
              <BreakActivity 
                icon="water" 
                title="Hydrate"
                desc="Drink water or healthy beverages"
                duration="2 min"
              />
              <BreakActivity 
                icon="restaurant" 
                title="Light Snack"
                desc="Eat something nutritious for energy"
                duration="15 min"
              />
              <BreakActivity 
                icon="eye" 
                title="Rest Your Eyes"
                desc="Close eyes or look at distant objects"
                duration="5 min"
              />
              <BreakActivity 
                icon="musical-notes" 
                title="Listen to Music"
                desc="Relax with your favorite tunes"
                duration="10 min"
              />
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalCloseButton}
              onPress={() => setShowBreakSuggestions(false)}
            >
              <Text style={styles.modalCloseButtonText}>Got It!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const StatItem = ({ icon, label, value, color }: any) => (
  <View style={styles.statItem}>
    <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon} size={24} color={color} />
    </View>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const WeeklyMetric = ({ label, value, icon }: any) => (
  <View style={styles.weeklyMetric}>
    <Ionicons name={icon} size={20} color={COLORS.accentBlue} />
    <Text style={styles.weeklyMetricLabel}>{label}</Text>
    <Text style={styles.weeklyMetricValue}>{value}</Text>
  </View>
);

const TipItem = ({ text }: { text: string }) => (
  <View style={styles.tipItem}>
    <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

const BreakActivity = ({ icon, title, desc, duration }: any) => (
  <View style={styles.activityItem}>
    <View style={styles.activityIcon}>
      <Ionicons name={icon} size={28} color={COLORS.accentGreen} />
    </View>
    <View style={styles.activityContent}>
      <Text style={styles.activityTitle}>{title}</Text>
      <Text style={styles.activityDesc}>{desc}</Text>
    </View>
    <View style={styles.activityDuration}>
      <Text style={styles.activityDurationText}>{duration}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
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
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xxl * 2,
  },
  
  // Status Card
  statusCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  statusGradient: {
    padding: SPACING.lg,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  statusIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs / 2,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  nextBreakInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.3)',
  },
  nextBreakText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.95)',
  },
  actionButton: {
    backgroundColor: COLORS.white,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  
  // Wellness Card
  wellnessCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  cardTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  wellnessScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.gray100,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.success,
  },
  scoreNumber: {
    fontSize: FONT_SIZE.xxl + 10,
    fontWeight: '900',
  },
  scoreLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  scoreLevelContainer: {
    flex: 1,
  },
  scoreLevel: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    marginBottom: SPACING.xs / 2,
  },
  scoreLevelDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    lineHeight: 20,
  },
  
  // Stats Card
  statsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  statItem: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
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
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginBottom: SPACING.xs / 2,
  },
  statValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  
  // Suggestions Card
  suggestionsCard: {
    backgroundColor: COLORS.accent + '15',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accent + '30',
    position: 'relative',
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  suggestionsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accent,
  },
  suggestionsDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accent,
    lineHeight: 20,
  },
  suggestionsArrow: {
    position: 'absolute',
    right: SPACING.lg,
    top: '50%',
    marginTop: -10,
  },
  
  // Weekly Card
  weeklyCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  weeklyMetrics: {
    gap: SPACING.md,
  },
  weeklyMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  weeklyMetricLabel: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  weeklyMetricValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  
  // Tips Card
  tipsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  tipsList: {
    gap: SPACING.sm,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    lineHeight: 20,
  },
  
  // Emergency Button
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.error + '15',
    paddingVertical: SPACING.md + 4,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  emergencyText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.error,
  },
  
  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 400,
  },
  modalGradient: {
    padding: SPACING.xxl,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: FONT_SIZE.xxl + 4,
    fontWeight: '900',
    color: COLORS.white,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  modalText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: COLORS.accentGreen,
  },
  modalButtonSecondary: {
    backgroundColor: COLORS.gray100,
  },
  modalButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  modalButtonSecondaryText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  
  // Suggestions Modal
  suggestionsModal: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    width: '100%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  modalHeaderTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  modalScroll: {
    padding: SPACING.lg,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  activityIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs / 2,
  },
  activityDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    lineHeight: 18,
  },
  activityDuration: {
    backgroundColor: COLORS.accentBlueSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  activityDurationText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.accentBlue,
  },
  modalCloseButton: {
    margin: SPACING.lg,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
});
