import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Vibration,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { AreaBoySafety, DangerZone, SafetyAlert, DangerReport, useAreaBoySafety } from '@/src/services/areaBoySafety';
import { useAuthedUserId } from '@/src/hooks/useAuthedUserId';

export default function DriverSafetyAlertsScreen() {
  const router = useRouter();
  const { user, userId: driverId, canCallAuthedApi } = useAuthedUserId();
  const { dangerZones, safetyAlerts, loading, fetchDangerZones, fetchSafetyAlerts, reportDanger } = useAreaBoySafety();
  
  const [refreshing, setRefreshing] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportType, setReportType] = useState<DangerZone['type']>('area_boys');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSeverity, setReportSeverity] = useState<DangerZone['severity']>('moderate');

  const [currentLocation, setCurrentLocation] = useState({ latitude: 6.5244, longitude: 3.3792 });

  useEffect(() => {
    (async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCurrentLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch { /* use default */ }
    })();
    loadSafetyData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadSafetyData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const loadSafetyData = async () => {
    await Promise.all([
      fetchDangerZones(currentLocation.latitude, currentLocation.longitude, 15000),
      fetchSafetyAlerts(currentLocation),
    ]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadSafetyData();
    setRefreshing(false);
  };

  const handleReportDanger = async () => {
    if (!reportDescription.trim()) {
      Alert.alert('Error', 'Please describe the danger');
      return;
    }

    if (!driverId || !canCallAuthedApi) {
      Alert.alert('Session', 'Please wait for sign-in to finish, then try again.');
      return;
    }

    const report: Omit<DangerReport, 'id' | 'timestamp'> = {
      userId: driverId,
      userName: user?.name || 'Driver',
      userRole: 'driver',
      incidentType: reportType,
      severity: reportSeverity,
      description: reportDescription,
      verified: false,
      upvotes: 0,
      downvotes: 0,
    };

    const success = await reportDanger(report);
    
    if (success) {
      Alert.alert(
        '✅ Report Submitted',
        'Thank you for keeping the community safe! Your report will be verified shortly.',
        [{ text: 'OK', onPress: () => setShowReportModal(false) }]
      );
      setReportDescription('');
      await loadSafetyData();
    } else {
      Alert.alert('Error', 'Failed to submit report. Please try again.');
    }
  };

  const getCriticalAlerts = () => safetyAlerts.filter(a => a.priority === 'critical');
  const getActiveDangerZones = () => dangerZones.filter(z => AreaBoySafety.isZoneDangerousNow(z));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#FF0000', '#DC143C']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🚨 Safety Alerts</Text>
          <Text style={styles.headerSubtitle}>Area Boy & Community Reports</Text>
        </View>
        <TouchableOpacity 
          style={styles.reportButton}
          onPress={() => setShowReportModal(true)}
        >
          <Ionicons name="megaphone" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={styles.guidanceBanner}>
          <Ionicons name="shield-checkmark" size={18} color="#0F766E" />
          <Text style={styles.guidanceText}>
            Review active zones before going offline or taking unfamiliar routes. Use reports for urgent field intelligence, not routine traffic updates.
          </Text>
        </View>

        {/* Critical Alerts Banner */}
        {getCriticalAlerts().length > 0 && (
          <View style={styles.criticalBanner}>
            <Ionicons name="warning" size={32} color={COLORS.white} />
            <View style={styles.criticalInfo}>
              <Text style={styles.criticalTitle}>
                {getCriticalAlerts().length} CRITICAL DANGER{getCriticalAlerts().length > 1 ? 'S' : ''}
              </Text>
              <Text style={styles.criticalSubtitle}>
                AVOID THESE AREAS NOW!
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.criticalButton}
              onPress={() => Vibration.vibrate([0, 500, 200, 500])}
            >
              <Ionicons name="navigate" size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* Safety Status Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>Danger zone summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem
              icon="warning"
              color="#FF0000"
              label="Area Boys"
              value={dangerZones.filter(z => z.type === 'area_boys').length}
            />
            <SummaryItem
              icon="shield-checkmark"
              color="#FFB800"
              label="Checkpoints"
              value={dangerZones.filter(z => z.type === 'checkpoint').length}
            />
            <SummaryItem
              icon="skull"
              color="#8B0000"
              label="Robbery Risk"
              value={dangerZones.filter(z => z.type === 'robbery').length}
            />
            <SummaryItem
              icon="alert-circle"
              color="#FF6B00"
              label="Harassment"
              value={dangerZones.filter(z => z.type === 'harassment').length}
            />
          </View>
        </View>

        {/* Active Danger Zones */}
        {getActiveDangerZones().length > 0 && (
          <View style={styles.dangerSection}>
            <Text style={styles.sectionTitle}>Active danger zones ({getActiveDangerZones().length})</Text>
            <Text style={styles.sectionSubtitle}>
              Dangerous areas right now - AVOID or proceed with extreme caution
            </Text>
            {getActiveDangerZones().map((zone) => (
              <DangerZoneCard key={zone.id} zone={zone} />
            ))}
          </View>
        )}

        {/* Live Safety Alerts */}
        {safetyAlerts.length > 0 && (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>Live safety alerts</Text>
            {safetyAlerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </View>
        )}

        {/* Safety Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Nigerian driver safety tips</Text>
          <SafetyTip
            icon="lock-closed"
            text="ALWAYS lock doors and close windows in traffic, especially at night"
          />
          <SafetyTip
            icon="eye"
            text="Be alert for 'area boys' at traffic lights and bus stops"
          />
          <SafetyTip
            icon="shield-checkmark"
            text="Have your documents ready for checkpoints to avoid delays"
          />
          <SafetyTip
            icon="time"
            text="Avoid dangerous areas at night (10 PM - 6 AM)"
          />
          <SafetyTip
            icon="call"
            text="Report any incident immediately through the app"
          />
          <SafetyTip
            icon="people"
            text="Follow community reports - they're from fellow drivers"
          />
        </View>

        {/* Community Stats */}
        <View style={styles.communityCard}>
          <LinearGradient
            colors={['#00B4D8', '#0096C7']}
            style={styles.communityGradient}
          >
            <Ionicons name="people" size={32} color={COLORS.white} />
            <View style={styles.communityInfo}>
              <Text style={styles.communityTitle}>Community Safety Network</Text>
              <Text style={styles.communityStats}>
                {dangerZones.reduce((sum, z) => sum + z.verifiedReports, 0)}+ reports from drivers
              </Text>
              <Text style={styles.communitySubtext}>
                Together, we keep each other safe 💚
              </Text>
            </View>
          </LinearGradient>
        </View>

        {/* Report Button (Bottom) */}
        <TouchableOpacity
          style={styles.reportDangerButton}
          onPress={() => setShowReportModal(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#FF6B00', '#FF8800']}
            style={styles.reportDangerGradient}
          >
            <Ionicons name="megaphone" size={24} color={COLORS.white} />
            <Text style={styles.reportDangerText}>Report Danger Zone</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

      {/* Report Modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>📢 Report Danger</Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <Ionicons name="close" size={28} color={COLORS.lightTextPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.modalLabel}>Type of Danger:</Text>
              <View style={styles.typeGrid}>
                {Object.entries(AreaBoySafety.DANGER_TYPES).map(([key, info]) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.typeButton,
                      reportType === key && { borderColor: info.color, borderWidth: 3 },
                    ]}
                    onPress={() => setReportType(key as DangerZone['type'])}
                  >
                    <Ionicons name={info.icon as any} size={24} color={info.color} />
                    <Text style={styles.typeLabel}>{info.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Severity:</Text>
              <View style={styles.severityRow}>
                {(['low', 'moderate', 'high', 'critical'] as const).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.severityButton,
                      reportSeverity === level && styles.severityButtonActive,
                    ]}
                    onPress={() => setReportSeverity(level)}
                  >
                    <Text
                      style={[
                        styles.severityText,
                        reportSeverity === level && styles.severityTextActive,
                      ]}
                    >
                      {level.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Description:</Text>
              <TextInput
                style={styles.descriptionInput}
                placeholder="Describe what happened (e.g., area boys at traffic light, checkpoint causing delay...)"
                placeholderTextColor={COLORS.lightTextMuted}
                value={reportDescription}
                onChangeText={setReportDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleReportDanger}
              >
                <LinearGradient
                  colors={['#00D084', '#00B471']}
                  style={styles.submitGradient}
                >
                  <Text style={styles.submitText}>Submit Report</Text>
                  <Ionicons name="checkmark-circle" size={24} color={COLORS.white} />
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const SummaryItem = ({ icon, color, label, value }: any) => (
  <View style={styles.summaryItem}>
    <Ionicons name={icon} size={28} color={color} />
    <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </View>
);

const DangerZoneCard = ({ zone }: { zone: DangerZone }) => {
  const typeInfo = AreaBoySafety.getDangerTypeInfo(zone.type);
  
  return (
    <View style={[styles.dangerCard, { borderLeftColor: typeInfo.color }]}>
      <View style={styles.dangerHeader}>
        <View style={[styles.dangerIcon, { backgroundColor: typeInfo.color + '20' }]}>
          <Ionicons name={typeInfo.icon as any} size={32} color={typeInfo.color} />
        </View>
        <View style={styles.dangerInfo}>
          <Text style={styles.dangerLocation}>{zone.location.address}</Text>
          {zone.location.landmark && (
            <Text style={styles.dangerLandmark}>📍 {zone.location.landmark}</Text>
          )}
        </View>
        <View style={[styles.severityBadge, { backgroundColor: typeInfo.color }]}>
          <Text style={styles.severityBadgeText}>{zone.severity.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.dangerDescription}>{zone.description}</Text>

      <View style={styles.dangerStats}>
        <StatItem icon="time" text={AreaBoySafety.formatActiveTime(zone.activeTime)} />
        <StatItem icon="people" text={`${zone.verifiedReports} reports`} />
        <StatItem icon="sparkles" text={`${zone.aiConfidence}% AI`} />
        <StatItem icon="star" text={`${Number(zone.communityRating || 0).toFixed(1)}★`} />
      </View>

      {zone.safeAlternatives && zone.safeAlternatives.length > 0 && (
        <View style={styles.alternativesBox}>
          <Text style={styles.alternativesTitle}>✅ Safe Alternatives:</Text>
          {zone.safeAlternatives.map((alt, index) => (
            <Text key={index} style={styles.alternativeText}>• {alt}</Text>
          ))}
        </View>
      )}
    </View>
  );
};

const AlertCard = ({ alert }: { alert: SafetyAlert }) => {
  const getAlertColor = () => {
    switch (alert.type) {
      case 'danger': return '#FF0000';
      case 'warning': return '#FF6B00';
      case 'checkpoint': return '#FFB800';
      default: return '#00B4D8';
    }
  };

  const getAlertIcon = () => {
    switch (alert.type) {
      case 'danger': return 'skull';
      case 'warning': return 'warning';
      case 'checkpoint': return 'shield-checkmark';
      default: return 'information-circle';
    }
  };

  return (
    <View style={[styles.alertCard, { borderLeftColor: getAlertColor() }]}>
      <Ionicons name={getAlertIcon()} size={32} color={getAlertColor()} />
      <View style={styles.alertContent}>
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertMessage}>{alert.message}</Text>
        <View style={styles.alertMeta}>
          <Ionicons name="location" size={14} color={COLORS.lightTextMuted} />
          <Text style={styles.alertMetaText}>
            {(Number(alert.distance || 0) / 1000).toFixed(1)}km away
          </Text>
        </View>
        <View style={styles.alertAction}>
          <Ionicons name="arrow-forward" size={16} color="#FF0000" />
          <Text style={styles.alertActionText}>{alert.actionRequired}</Text>
        </View>
      </View>
    </View>
  );
};

const SafetyTip = ({ icon, text }: any) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon} size={20} color={COLORS.accentBlue} />
    <Text style={styles.tipText}>{text}</Text>
  </View>
);

const StatItem = ({ icon, text }: any) => (
  <View style={styles.statItem}>
    <Ionicons name={icon} size={14} color={COLORS.lightTextMuted} />
    <Text style={styles.statText}>{text}</Text>
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    opacity: 0.9,
  },
  reportButton: {
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
  guidanceBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  guidanceText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    lineHeight: 20,
    color: '#115E59',
  },
  
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#8B0000',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
  },
  criticalInfo: {
    flex: 1,
  },
  criticalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  criticalSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    opacity: 0.9,
  },
  criticalButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    marginBottom: SPACING.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  summaryItem: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    gap: SPACING.xs,
    padding: SPACING.md,
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.lg,
  },
  summaryValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
  },
  summaryLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
    textAlign: 'center',
  },
  
  dangerSection: {
    marginBottom: SPACING.lg,
  },
  dangerCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dangerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerInfo: {
    flex: 1,
  },
  dangerLocation: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs / 2,
  },
  dangerLandmark: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  severityBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  severityBadgeText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.white,
  },
  dangerDescription: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    lineHeight: 20,
    marginBottom: SPACING.sm,
  },
  dangerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  alternativesBox: {
    backgroundColor: '#00D084' + '15',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: '#00D084' + '30',
  },
  alternativesTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: '#00D084',
    marginBottom: SPACING.xs,
  },
  alternativeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: '#00D084',
    lineHeight: 20,
  },
  
  alertsSection: {
    marginBottom: SPACING.lg,
  },
  alertCard: {
    flexDirection: 'row',
    gap: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderLeftWidth: 4,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  alertMessage: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  alertMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  alertMetaText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  alertAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  alertActionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: '#FF0000',
  },
  
  tipsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  tipsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    lineHeight: 20,
  },
  
  communityCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  communityGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  communityInfo: {
    flex: 1,
  },
  communityTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  communityStats: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: SPACING.xs / 2,
  },
  communitySubtext: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    opacity: 0.9,
  },
  
  reportDangerButton: {
    marginTop: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  reportDangerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  reportDangerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: BORDER_RADIUS.xxl,
    borderTopRightRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  modalLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  typeButton: {
    flex: 1,
    minWidth: '30%',
    alignItems: 'center',
    gap: SPACING.xs,
    padding: SPACING.md,
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  typeLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    textAlign: 'center',
  },
  severityRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  severityButton: {
    flex: 1,
    padding: SPACING.sm,
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  severityButtonActive: {
    backgroundColor: COLORS.accentBlue,
  },
  severityText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.lightTextMuted,
  },
  severityTextActive: {
    color: COLORS.white,
  },
  descriptionInput: {
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
    minHeight: 100,
  },
  submitButton: {
    marginTop: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
  },
  submitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
  },
});
