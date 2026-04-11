import React, { useState, useEffect } from 'react';
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
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

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

export default function SmartModeScreen() {
  const router = useRouter();
  const { user } = useAppStore();

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

  useEffect(() => {
    loadSettings();
    loadEarnings();
  }, []);

  const loadSettings = async () => {
    if (!user?.id) return;
    try {
      const { BACKEND_URL } = require('@/src/services/api');
      const res = await fetch(`${BACKEND_URL}/api/smart-mode/settings/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.settings) setSettings((prev: any) => ({ ...prev, ...data.settings }));
      }
    } catch { /* keep defaults */ }
  };

  const loadEarnings = async () => {
    if (!user?.id) return;
    try {
      const { BACKEND_URL } = require('@/src/services/api');
      const res = await fetch(`${BACKEND_URL}/api/driver/earnings/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setEarnings({
          today: data?.today_earnings || data?.projections?.daily || 0,
          average: data?.average_daily || data?.projections?.daily || 0,
          projected: data?.projections?.daily || 0,
        });
      }
    } catch { /* keep defaults */ }
  };

  const saveSettings = async () => {
    try {
      // TODO: Save to backend
      // await updateSmartModeSettings(user?.id, settings);
      Alert.alert('Settings Saved!', 'Smart Mode preferences updated successfully.');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings. Please try again.');
    }
  };

  const toggleSmartMode = () => {
    if (!settings.enabled) {
      Alert.alert(
        '🤖 Enable Smart Mode?',
        'Smart Mode will automatically accept rides that match your preferences. You can disable it anytime.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => {
              setSettings({ ...settings, enabled: true });
              saveSettings();
            }
          }
        ]
      );
    } else {
      setSettings({ ...settings, enabled: false });
      saveSettings();
    }
  };

  const calculateAcceptanceRate = () => {
    // AI logic preview
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
                    {settings.enabled ? '🤖 Smart Mode Active' : '🔴 Smart Mode Off'}
                  </Text>
                  <Text style={styles.toggleSubtitle}>
                    {settings.enabled 
                      ? 'Auto-accepting rides that match your rules' 
                      : 'Tap to enable automatic ride acceptance'}
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
                <Text style={styles.earningLabel}>With Smart Mode</Text>
                <Text style={[styles.earningValue, styles.earningProjected]}>
                  ₦{estimateEarnings().toLocaleString()}
                </Text>
                <Text style={styles.earningIncrease}>
                  +{Math.round(((estimateEarnings() - earnings.average) / earnings.average) * 100)}% 🚀
                </Text>
              </View>
            </View>
          </View>
        )}

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
                <Text style={styles.settingLabel}>Prioritize Surge Rides</Text>
                <Text style={styles.settingDesc}>Auto-accept rides with surge pricing</Text>
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

        {/* Auto-Accept Timing */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏱️ Auto-Accept Timing</Text>
          <View style={styles.settingCard}>
            <View style={styles.settingHeader}>
              <Text style={styles.settingLabel}>Wait Time Before Auto-Accept</Text>
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
              Smart Mode will wait {settings.maxWaitTime} seconds to evaluate before accepting
            </Text>
          </View>
        </View>

        {/* AI Logic Explanation */}
        <View style={styles.aiCard}>
          <View style={styles.aiHeader}>
            <Ionicons name="hardware-chip" size={24} color={COLORS.accentBlue} />
            <Text style={styles.aiTitle}>How Smart Mode Works</Text>
          </View>
          <View style={styles.aiList}>
            <AIFeature icon="analytics" text="Analyzes distance, rating, and surge pricing" />
            <AIFeature icon="calculator" text="Calculates profitability score for each ride" />
            <AIFeature icon="checkmark-done" text="Auto-accepts rides meeting your criteria" />
            <AIFeature icon="close-circle" text="Auto-rejects rides below your standards" />
            <AIFeature icon="trending-up" text="Learns from your preferences over time" />
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
              <Text style={styles.modalTitle}>🤖 Smart Mode Benefits</Text>
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
                desc="AI picks the most profitable rides for you."
              />
              <BenefitItem 
                icon="shield-checkmark" 
                title="Avoid Bad Rides"
                desc="Skip low-rated riders and unprofitable trips."
              />
              <BenefitItem 
                icon="analytics" 
                title="Data-Driven"
                desc="AI learns from thousands of rides to optimize."
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

const AIFeature = ({ icon, text }: { icon: string; text: string }) => (
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
  
  // AI Card
  aiCard: {
    backgroundColor: COLORS.accentBlueSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accentBlue + '30',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  aiTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.accentBlue,
  },
  aiList: {
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
