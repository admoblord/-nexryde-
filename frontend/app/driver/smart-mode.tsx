import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, useThemeColors } from '@/src/constants/theme';
import { SURFACE } from '@/src/constants/designSystem';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';
import { BACKEND_URL, getAuthHeaders, getDriverSalaryMode, updateDriverSalaryMode } from '@/src/services/api';

const SMART_MODE_STORAGE_KEY = 'nexryde_smart_mode_settings';

interface SmartModeSettings {
  enabled: boolean;
  minDistance: number; // km
  maxDistance: number; // km
  minRating: number; // 1-5
  acceptSurge: boolean;
  minSurgeMultiplier: number; // 1.0-3.0
  avoidLowRated: boolean;
  lowRatingThreshold: number; // 1-5
  preferredAreas: string[];
  autoRejectAfterHours: boolean;
  maxWaitTime: number; // seconds before auto-accept
}

interface SalaryModePlan {
  enabled: boolean;
  monthly_income_target: number;
  achieved_this_month: number;
  remaining_to_target: number;
  days_left_in_month: number;
  required_daily_average: number;
  expected_by_today: number;
  pace_gap: number;
  projected_month_end: number;
  dispatch_priority_boost: number;
  status: 'inactive' | 'on_track' | 'behind';
}

export default function SmartModeScreen() {
  const { colors, isDark } = useThemeColors();
  const screenBg = isDark ? colors.background : COLORS.lightBackground;
  const cardBg = isDark ? SURFACE.cardDark : COLORS.white;
  const textPrimary = colors.text;
  const textMuted = colors.textMuted;
  const router = useRouter();
  const { userId: driverId, canCallAuthedApi } = useAuthedUserId();

  const [settings, setSettings] = useState<SmartModeSettings>({
    enabled: false,
    minDistance: 1,
    maxDistance: 15,
    minRating: 4.0,
    acceptSurge: true,
    minSurgeMultiplier: 1.5,
    avoidLowRated: true,
    lowRatingThreshold: 3.5,
    preferredAreas: [],
    autoRejectAfterHours: false,
    maxWaitTime: 10,
  });

  const [showPreview, setShowPreview] = useState(false);
  const [earnings, setEarnings] = useState({
    today: 0,
    average: 0,
    projected: 0,
  });
  const [salaryMode, setSalaryMode] = useState<SalaryModePlan>({
    enabled: false,
    monthly_income_target: 350000,
    achieved_this_month: 0,
    remaining_to_target: 350000,
    days_left_in_month: 30,
    required_daily_average: 0,
    expected_by_today: 0,
    pace_gap: 0,
    projected_month_end: 0,
    dispatch_priority_boost: 1,
    status: 'inactive',
  });

  const didMount = useRef(false);

  useEffect(() => {
    void loadSmartFilters();
    if (!canCallAuthedApi) return;
    void loadSalaryMode();
    void loadEarnings();
  }, [canCallAuthedApi]);

  // Auto-save smart filters to AsyncStorage whenever they change (after first mount)
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    void AsyncStorage.setItem(SMART_MODE_STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [settings]);

  const loadSmartFilters = async () => {
    try {
      const stored = await AsyncStorage.getItem(SMART_MODE_STORAGE_KEY);
      if (stored) {
        const parsed: Partial<SmartModeSettings> = JSON.parse(stored);
        setSettings((prev) => ({ ...prev, ...parsed }));
      }
    } catch { /* keep defaults */ }
  };

  const loadSalaryMode = async () => {
    if (!driverId) return;
    try {
      const res = await getDriverSalaryMode(driverId);
      if (res.data?.salary_mode) {
        setSalaryMode((prev) => ({ ...prev, ...res.data.salary_mode }));
      }
    } catch { /* keep defaults */ }
  };

  const loadSettings = loadSalaryMode;

  const loadEarnings = async () => {
    if (!driverId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/driver/earnings/${driverId}?period=today`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      const summary = data?.summary || {};
      const projections = data?.projections || {};
      const todayTotal = Number(summary.total_earnings ?? 0) || Number(projections.daily ?? 0);
      setEarnings({
        today: todayTotal,
        average: Number(projections.daily ?? todayTotal) || 0,
        projected: Number(projections.daily ?? 0) || 0,
      });
    } catch {
      /* keep defaults */
    }
  };

  const saveSettings = async () => {
    if (!driverId) return;
    try {
      const res = await updateDriverSalaryMode(driverId, {
        enabled: salaryMode.enabled,
        monthly_income_target: salaryMode.monthly_income_target,
      });
      if (res.data?.salary_mode) {
        setSalaryMode((prev) => ({ ...prev, ...res.data.salary_mode }));
      }
      Alert.alert('Settings Saved!', 'Smart Mode filters and Salary Mode target have been saved to your device.');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    }
  };

  const toggleSmartMode = () => {
    if (!settings.enabled) {
      Alert.alert(
        'Enable Smart Mode?',
        'Smart Mode highlights rides that match your distance and rating preferences. You still tap to accept — set your filters below and save.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => {
              // Use functional update to avoid stale-state race
              setSettings((prev) => ({ ...prev, enabled: true }));
              // saveSettings reads salaryMode — call after state flushes
              setTimeout(saveSettings, 0);
            },
          },
        ]
      );
    } else {
      setSettings((prev) => ({ ...prev, enabled: false }));
      setTimeout(saveSettings, 0);
    }
  };

  const calculateAcceptanceRate = () => {
    // Rule preview
    const distanceScore = ((settings.maxDistance - settings.minDistance) / 20) * 100;
    const ratingScore = (settings.minRating / 5) * 100;
    const surgeBonus = settings.acceptSurge ? 20 : 0;
    
    const baseRate = (distanceScore + ratingScore) / 2;
    const finalRate = Math.min(baseRate + surgeBonus, 95);
    
    return Math.round(finalRate);
  };

  const estimateEarnings = () => {
    const acceptanceRate = calculateAcceptanceRate();
    const multiplier = 1 + (acceptanceRate / 100);
    return Math.round(earnings.average * multiplier);
  };

  const targetPreset = Math.round(salaryMode.monthly_income_target / 5000) * 5000;
  const salaryHeadline = salaryMode.enabled
    ? salaryMode.status === 'behind'
      ? `Behind target by ₦${salaryMode.pace_gap.toLocaleString()}`
      : `On track for ₦${salaryMode.projected_month_end.toLocaleString()}`
    : 'Turn on salary mode for predictable monthly income';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Smart Mode</Text>
        <TouchableOpacity 
          style={styles.infoButton}
          onPress={() => setShowPreview(true)}
        >
          <Ionicons name="information-circle" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Smart Mode Toggle Card */}
        <View style={styles.toggleCard}>
          <LinearGradient
            colors={settings.enabled ? [COLORS.accentGreen, COLORS.accentBlue] : [COLORS.gray400, COLORS.gray500]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.toggleGradient}
          >
            <View style={styles.toggleContent}>
              <View style={styles.toggleLeft}>
                <View style={styles.toggleIcon}>
                  <Ionicons 
                    name={settings.enabled ? "flash" : "flash-off"} 
                    size={32} 
                    color={COLORS.white} 
                  />
                </View>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleTitle}>
                    {settings.enabled ? 'Smart Mode Active' : 'Smart Mode Off'}
                  </Text>
                  <Text style={styles.toggleSubtitle}>
                    {settings.enabled
                      ? 'Filtering rides by your distance & rating rules'
                      : 'Tap to apply distance, rating & surge filters'}
                  </Text>
                </View>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={toggleSmartMode}
                trackColor={{ false: COLORS.gray300, true: 'rgba(255,255,255,0.5)' }}
                thumbColor={COLORS.white}
                ios_backgroundColor={COLORS.gray300}
              />
            </View>
          </LinearGradient>
        </View>

        {/* Earnings Projection */}
        {settings.enabled && (
          <View style={styles.earningsCard}>
            <Text style={styles.cardTitle}>📈 Projected Earnings</Text>
            <View style={styles.earningsGrid}>
              <View style={styles.earningItem}>
                <Text style={styles.earningLabel}>Today</Text>
                <Text style={styles.earningValue}>₦{earnings.today.toLocaleString()}</Text>
              </View>
              <View style={styles.earningItem}>
                <Text style={styles.earningLabel}>Daily Average</Text>
                <Text style={styles.earningValue}>₦{earnings.average.toLocaleString()}</Text>
              </View>
              <View style={styles.earningItem}>
                <Text style={styles.earningLabel}>Estimated (filtered)</Text>
                <Text style={[styles.earningValue, styles.earningProjected]}>
                  ₦{estimateEarnings().toLocaleString()}
                </Text>
                <Text style={styles.earningIncrease}>
                  projection based on filters
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💼 Driver Salary Mode</Text>
          <View style={styles.salaryCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingRowLeft}>
                <Text style={styles.settingLabel}>Income predictability</Text>
                <Text style={styles.settingDesc}>
                  Set your monthly target and Nexryde boosts dispatch when you fall behind pace.
                </Text>
              </View>
              <Switch
                value={salaryMode.enabled}
                onValueChange={(value) => setSalaryMode((prev) => ({ ...prev, enabled: value }))}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.divider} />
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Monthly income target</Text>
              <Text style={styles.settingValue}>₦{targetPreset.toLocaleString()}</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={50000}
              maximumValue={1500000}
              step={5000}
              value={targetPreset}
              onValueChange={(value) => setSalaryMode((prev) => ({ ...prev, monthly_income_target: value }))}
              minimumTrackTintColor={COLORS.accentPurple}
              maximumTrackTintColor={COLORS.gray300}
              thumbTintColor={COLORS.accentPurple}
            />
            <Text style={styles.settingHint}>
              Nexryde will use this target to shape monthly dispatch priority for you.
            </Text>

            <View style={styles.salaryStatusRow}>
              <View style={styles.salaryMetric}>
                <Text style={styles.salaryMetricLabel}>This month</Text>
                <Text style={styles.salaryMetricValue}>₦{Number(salaryMode.achieved_this_month || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.salaryMetric}>
                <Text style={styles.salaryMetricLabel}>Still needed</Text>
                <Text style={styles.salaryMetricValue}>₦{Number(salaryMode.remaining_to_target || 0).toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.salaryStatusRow}>
              <View style={styles.salaryMetric}>
                <Text style={styles.salaryMetricLabel}>Daily pace</Text>
                <Text style={styles.salaryMetricValue}>₦{Number(salaryMode.required_daily_average || 0).toLocaleString()}</Text>
              </View>
              <View style={styles.salaryMetric}>
                <Text style={styles.salaryMetricLabel}>Dispatch boost</Text>
                <Text style={styles.salaryMetricValue}>{Number(salaryMode.dispatch_priority_boost || 1).toFixed(2)}x</Text>
              </View>
            </View>

            <View style={styles.salaryBanner}>
              <Ionicons
                name={salaryMode.status === 'behind' ? 'trending-up' : 'shield-checkmark'}
                size={18}
                color={salaryMode.status === 'behind' ? COLORS.warning : COLORS.accentGreen}
              />
              <Text style={styles.salaryBannerText}>{salaryHeadline}</Text>
            </View>
          </View>
        </View>

        {/* Acceptance Rate Preview */}
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.cardTitle}>🎯 Acceptance Rate</Text>
            <View style={styles.previewBadge}>
              <Text style={styles.previewBadgeText}>{calculateAcceptanceRate()}%</Text>
            </View>
          </View>
          <Text style={styles.previewDesc}>
            Based on your settings, Smart Mode will accept approximately {calculateAcceptanceRate()}% of incoming rides.
          </Text>
        </View>

        {/* Distance Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 Distance Preferences</Text>
          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Minimum Distance</Text>
              <Text style={styles.settingValue}>{settings.minDistance} km</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={0.5}
              maximumValue={10}
              step={0.5}
              value={settings.minDistance}
              onValueChange={(value) => setSettings({ ...settings, minDistance: value })}
              minimumTrackTintColor={COLORS.accentGreen}
              maximumTrackTintColor={COLORS.gray300}
              thumbTintColor={COLORS.accentGreen}
            />
            <Text style={styles.settingHint}>Reject rides shorter than this distance</Text>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Maximum Distance</Text>
              <Text style={styles.settingValue}>{settings.maxDistance} km</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={5}
              maximumValue={50}
              step={1}
              value={settings.maxDistance}
              onValueChange={(value) => setSettings({ ...settings, maxDistance: value })}
              minimumTrackTintColor={COLORS.accentBlue}
              maximumTrackTintColor={COLORS.gray300}
              thumbTintColor={COLORS.accentBlue}
            />
            <Text style={styles.settingHint}>Reject rides longer than this distance</Text>
          </View>
        </View>

        {/* Rating Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⭐ Rider Rating Filters</Text>
          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingRowLeft}>
                <Text style={styles.settingLabel}>Avoid Low-Rated Riders</Text>
                <Text style={styles.settingDesc}>Skip riders with poor ratings</Text>
              </View>
              <Switch
                value={settings.avoidLowRated}
                onValueChange={(value) => setSettings({ ...settings, avoidLowRated: value })}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            {settings.avoidLowRated && (
              <>
                <View style={styles.divider} />
                <View style={styles.settingHeader}>
                  <Text style={styles.settingLabel}>Minimum Rider Rating</Text>
                  <Text style={styles.settingValue}>{settings.minRating.toFixed(1)} ⭐</Text>
                </View>
                <Slider
                  style={styles.slider}
                  minimumValue={3.0}
                  maximumValue={5.0}
                  step={0.1}
                  value={settings.minRating}
                  onValueChange={(value) => setSettings({ ...settings, minRating: value })}
                  minimumTrackTintColor={COLORS.accent}
                  maximumTrackTintColor={COLORS.gray300}
                  thumbTintColor={COLORS.accent}
                />
                <Text style={styles.settingHint}>Only accept riders rated {settings.minRating.toFixed(1)} or higher</Text>
              </>
            )}
          </View>
        </View>

        {/* Surge Pricing Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💰 Surge Pricing</Text>
          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <View style={styles.settingRowLeft}>
                <Text style={styles.settingLabel}>Highlight Surge Rides</Text>
                <Text style={styles.settingDesc}>Smart Mode flags surge rides so you can accept faster</Text>
              </View>
              <Switch
                value={settings.acceptSurge}
                onValueChange={(value) => setSettings({ ...settings, acceptSurge: value })}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            {settings.acceptSurge && (
              <>
                <View style={styles.divider} />
                <View style={styles.settingHeader}>
                  <Text style={styles.settingLabel}>Minimum Surge Multiplier</Text>
                  <Text style={styles.settingValue}>{settings.minSurgeMultiplier.toFixed(1)}x</Text>
                </View>
                <Slider
                  style={styles.slider}
                  minimumValue={1.0}
                  maximumValue={3.0}
                  step={0.1}
                  value={settings.minSurgeMultiplier}
                  onValueChange={(value) => setSettings({ ...settings, minSurgeMultiplier: value })}
                  minimumTrackTintColor={COLORS.warning}
                  maximumTrackTintColor={COLORS.gray300}
                  thumbTintColor={COLORS.warning}
                />
                <Text style={styles.settingHint}>
                  Accept surge rides with {settings.minSurgeMultiplier.toFixed(1)}x or higher multiplier
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Evaluation Window */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱️ Evaluation Window</Text>
          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Seconds to review per ride</Text>
              <Text style={styles.settingValue}>{settings.maxWaitTime}s</Text>
            </View>
            <Slider
              style={styles.slider}
              minimumValue={3}
              maximumValue={30}
              step={1}
              value={settings.maxWaitTime}
              onValueChange={(value) => setSettings({ ...settings, maxWaitTime: value })}
              minimumTrackTintColor={COLORS.accentPurple}
              maximumTrackTintColor={COLORS.gray300}
              thumbTintColor={COLORS.accentPurple}
            />
            <Text style={styles.settingHint}>
              Smart Mode highlights whether this ride matches your filters — you still decide to accept
            </Text>
          </View>
        </View>

        {/* Rule Explanation */}
        <View style={styles.rulesCard}>
          <View style={styles.rulesHeader}>
            <Ionicons name="hardware-chip" size={24} color={COLORS.accentBlue} />
            <Text style={styles.rulesTitle}>How Smart Mode Works</Text>
          </View>
          <View style={styles.rulesList}>
            <SmartModeRule icon="analytics" text="Filters rides by distance, rider rating, and surge multiplier" />
            <SmartModeRule icon="calculator" text="Previews estimated acceptance rate based on your rules" />
            <SmartModeRule icon="flag" text="Highlights matching rides so you can accept faster" />
            <SmartModeRule icon="close-circle" text="Dims rides below your minimum standards" />
            <SmartModeRule icon="wallet" text="Salary Mode raises your dispatch priority when behind monthly target" />
            <SmartModeRule icon="settings" text="All filters are local preferences - you still accept each ride" />
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
          <LinearGradient
            colors={[COLORS.accentGreen, COLORS.accentBlue]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.saveGradient}
          >
            <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
            <Text style={styles.saveText}>Save Smart Mode Settings</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Warning Notice */}
        <View style={styles.noticeCard}>
          <Ionicons name="information-circle" size={20} color={COLORS.accentBlue} />
          <Text style={styles.noticeText}>
            You can disable Smart Mode anytime. All rides are tracked and insured as usual.
          </Text>
        </View>
      </ScrollView>

      {/* Info Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPreview(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Smart Mode Benefits</Text>
              <TouchableOpacity onPress={() => setShowPreview(false)}>
                <Ionicons name="close" size={28} color={COLORS.gray500} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <BenefitItem 
                icon="flash" 
                title="Save Time"
                desc="No more manual ride acceptance. Focus on driving."
              />
              <BenefitItem 
                icon="trending-up" 
                title="Maximize Earnings"
                desc="Your rules highlight the most profitable rides for you."
              />
              <BenefitItem 
                icon="shield-checkmark" 
                title="Avoid Bad Rides"
                desc="Skip low-rated riders and unprofitable trips."
              />
              <BenefitItem 
                icon="analytics" 
                title="Data-Driven"
                desc="Ride data helps preview distance, rating, and surge tradeoffs."
              />
              <BenefitItem 
                icon="settings" 
                title="Fully Customizable"
                desc="Set your own rules for distance, rating, and surge."
              />
              <BenefitItem 
                icon="cash" 
                title="Surge Priority"
                desc="Never miss high-earning surge pricing rides."
              />
            </ScrollView>

            <TouchableOpacity 
              style={styles.modalButton}
              onPress={() => setShowPreview(false)}
            >
              <Text style={styles.modalButtonText}>Got It!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const SmartModeRule = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.aiFeature}>
    <Ionicons name={icon as any} size={18} color={COLORS.accentBlue} />
    <Text style={styles.aiFeatureText}>{text}</Text>
  </View>
);

const BenefitItem = ({ icon, title, desc }: { icon: string; title: string; desc: string }) => (
  <View style={styles.benefitItem}>
    <View style={styles.benefitIcon}>
      <Ionicons name={icon as any} size={24} color={COLORS.accentGreen} />
    </View>
    <View style={styles.benefitContent}>
      <Text style={styles.benefitTitle}>{title}</Text>
      <Text style={styles.benefitDesc}>{desc}</Text>
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
  infoButton: {
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
  
  // Toggle Card
  toggleCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  toggleGradient: {
    padding: SPACING.lg,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  toggleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs / 2,
  },
  toggleSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  
  // Earnings Card
  earningsCard: {
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
  earningsGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  earningItem: {
    flex: 1,
    backgroundColor: COLORS.gray100,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    alignItems: 'center',
  },
  earningLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginBottom: SPACING.xs / 2,
    textAlign: 'center',
  },
  earningValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  earningProjected: {
    color: COLORS.accentGreen,
  },
  earningIncrease: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '800',
    color: COLORS.accentGreen,
    marginTop: SPACING.xs / 2,
  },
  
  // Preview Card
  previewCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  previewBadge: {
    backgroundColor: COLORS.accentGreen + '20',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
  },
  previewBadgeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  previewDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    lineHeight: 20,
  },
  
  // Sections
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  
  // Setting Cards
  settingCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  salaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accentPurple + '20',
  },
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  settingLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  settingValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  settingDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    marginTop: 2,
  },
  settingHint: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    marginTop: SPACING.xs,
  },
  slider: {
    width: '100%',
    height: 40,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingRowLeft: {
    flex: 1,
    marginRight: SPACING.md,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.lightBorder,
    marginVertical: SPACING.md,
  },
  salaryStatusRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  salaryMetric: {
    flex: 1,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
  },
  salaryMetricLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    marginBottom: 4,
  },
  salaryMetricValue: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  salaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.accentPurpleSoft,
  },
  salaryBannerText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentPurpleDark,
  },
  
  // Rules Card
  rulesCard: {
    backgroundColor: COLORS.accentBlueSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accentBlue + '30',
  },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  rulesTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accentBlue,
  },
  rulesList: {
    gap: SPACING.sm,
  },
  aiFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  aiFeatureText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentBlue,
    flex: 1,
  },
  
  // Save Button
  saveButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  saveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md + 4,
  },
  saveText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
  
  // Notice Card
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.accentBlueSoft,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.accentBlue + '30',
  },
  noticeText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentBlue,
    lineHeight: 18,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
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
  modalTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  modalScroll: {
    padding: SPACING.lg,
  },
  benefitItem: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitContent: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs / 2,
  },
  benefitDesc: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    lineHeight: 20,
  },
  modalButton: {
    margin: SPACING.lg,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.white,
  },
});
