import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Vibration,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { TrafficAI, TrafficAlert, TrafficHotspot, TrafficRoute, useTrafficAI } from '@/src/services/trafficAI';
import { useAppStore } from '@/src/store/appStore';

export default function DriverTrafficScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const { hotspots, routes, alerts, loading, fetchTrafficStatus, fetchOptimizedRoutes, fetchTrafficAlerts } = useTrafficAI();
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<TrafficRoute | null>(null);
  const [showRouteComparison, setShowRouteComparison] = useState(false);

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
    loadTrafficData();
    
    // Auto-refresh every 3 minutes
    const interval = setInterval(loadTrafficData, 3 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const loadTrafficData = async () => {
    if (user?.id) {
      await Promise.all([
        fetchTrafficStatus(currentLocation.latitude, currentLocation.longitude, 10000),
        fetchTrafficAlerts(user.id, currentLocation),
      ]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTrafficData();
    setRefreshing(false);
  };

  const handleCheckAlternativeRoutes = async () => {
    // Simulated destination
    const destination = {
      latitude: 6.4281,
      longitude: 3.4219,
    };
    
    await fetchOptimizedRoutes(currentLocation, destination);
    setShowRouteComparison(true);
  };

  const handleSelectRoute = (route: TrafficRoute) => {
    setSelectedRoute(route);
    const timeSaved = route.timeSavedVsAlternative || 0;
    Alert.alert(
      '🚗 Route Selected',
      `AI recommends this route.\n\n` +
      `⏱️ ETA: ${Math.round(route.durationWithTraffic / 60)} mins\n` +
      `🚦 Traffic: ${route.trafficLevel}\n` +
      `${timeSaved > 0 ? `⏰ Saves ${Math.round(timeSaved / 60)} mins` : ''}\n\n` +
      `Navigation will start shortly.`,
      [{ text: 'Start Navigation', onPress: () => router.back() }]
    );
  };

  const getCriticalAlerts = () => alerts.filter(a => a.priority === 'critical' || a.priority === 'high');
  const getSevereHotspots = () => hotspots.filter(h => h.severity === 'severe' || h.severity === 'high');

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#FF6B00', '#FF8800']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🚦 Traffic Intelligence</Text>
          <Text style={styles.headerSubtitle}>AI-Powered Live Updates</Text>
        </View>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={handleRefresh}
        >
          <Ionicons name="refresh" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Critical Alerts Banner */}
        {getCriticalAlerts().length > 0 && (
          <View style={styles.criticalBanner}>
            <Ionicons name="warning" size={32} color={COLORS.white} />
            <View style={styles.criticalInfo}>
              <Text style={styles.criticalTitle}>
                {getCriticalAlerts().length} Critical Alert{getCriticalAlerts().length > 1 ? 's' : ''}
              </Text>
              <Text style={styles.criticalSubtitle}>
                Immediate action recommended
              </Text>
            </View>
          </View>
        )}

        {/* Traffic Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.sectionTitle}>📊 Traffic Summary</Text>
          <View style={styles.summaryGrid}>
            <SummaryItem
              icon="checkmark-circle"
              color={TrafficAI.TRAFFIC_COLORS.light}
              label="Clear Roads"
              value={hotspots.filter(h => h.severity === 'low').length}
            />
            <SummaryItem
              icon="alert-circle"
              color={TrafficAI.TRAFFIC_COLORS.moderate}
              label="Moderate"
              value={hotspots.filter(h => h.severity === 'moderate').length}
            />
            <SummaryItem
              icon="warning"
              color={TrafficAI.TRAFFIC_COLORS.heavy}
              label="Heavy"
              value={hotspots.filter(h => h.severity === 'high').length}
            />
            <SummaryItem
              icon="close-circle"
              color={TrafficAI.TRAFFIC_COLORS.severe}
              label="Severe"
              value={hotspots.filter(h => h.severity === 'severe').length}
            />
          </View>
        </View>

        {/* AI Route Optimizer */}
        <TouchableOpacity 
          style={styles.optimizerCard}
          onPress={handleCheckAlternativeRoutes}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#00B4D8', '#0096C7']}
            style={styles.optimizerGradient}
          >
            <Ionicons name="navigate" size={32} color={COLORS.white} />
            <View style={styles.optimizerInfo}>
              <Text style={styles.optimizerTitle}>🤖 AI Route Optimizer</Text>
              <Text style={styles.optimizerSubtitle}>
                Get fastest route with real-time traffic
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={COLORS.white} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Route Comparison (if requested) */}
        {showRouteComparison && routes.length > 0 && (
          <View style={styles.routesSection}>
            <Text style={styles.sectionTitle}>🗺️ AI Route Recommendations</Text>
            {routes.map((route, index) => (
              <RouteCard
                key={route.id}
                route={route}
                rank={index + 1}
                selected={selectedRoute?.id === route.id}
                onSelect={() => handleSelectRoute(route)}
              />
            ))}
          </View>
        )}

        {/* Live Alerts */}
        {alerts.length > 0 && (
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>🚨 Live Alerts</Text>
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </View>
        )}

        {/* Hotspots Map */}
        {getSevereHotspots().length > 0 && (
          <View style={styles.hotspotsSection}>
            <Text style={styles.sectionTitle}>🔥 Traffic Hotspots</Text>
            {getSevereHotspots().map((hotspot) => (
              <HotspotCard key={hotspot.id} hotspot={hotspot} />
            ))}
          </View>
        )}

        {/* AI Insights */}
        <View style={styles.insightsCard}>
          <Text style={styles.insightsTitle}>💡 AI Traffic Insights</Text>
          <InsightItem
            icon="trending-up"
            color="#FF6B00"
            text="Rush hour traffic building on major roads"
          />
          <InsightItem
            icon="time"
            color="#00B4D8"
            text="Best time to travel: 10:00 AM - 2:00 PM"
          />
          <InsightItem
            icon="location"
            color="#00D084"
            text="Lekki-Epe area has lighter traffic today"
          />
          <InsightItem
            icon="alert-circle"
            color="#FFB800"
            text="Event near Victoria Island - expect delays"
          />
        </View>

        {/* Traffic Legend */}
        <View style={styles.legendCard}>
          <Text style={styles.legendTitle}>Traffic Levels</Text>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: TrafficAI.TRAFFIC_COLORS.light }]} />
            <Text style={styles.legendText}>Light - Free flowing</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: TrafficAI.TRAFFIC_COLORS.moderate }]} />
            <Text style={styles.legendText}>Moderate - Some delays</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: TrafficAI.TRAFFIC_COLORS.heavy }]} />
            <Text style={styles.legendText}>Heavy - Significant delays</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: TrafficAI.TRAFFIC_COLORS.severe }]} />
            <Text style={styles.legendText}>Severe - Avoid if possible</Text>
          </View>
        </View>
      </ScrollView>
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

const RouteCard = ({ route, rank, selected, onSelect }: any) => (
  <TouchableOpacity
    style={[styles.routeCard, selected && styles.routeCardSelected]}
    onPress={onSelect}
    activeOpacity={0.7}
  >
    <View style={styles.routeRank}>
      <Text style={styles.routeRankText}>#{rank}</Text>
      {rank === 1 && <Text style={styles.routeBest}>BEST</Text>}
    </View>
    
    <View style={styles.routeContent}>
      <View style={styles.routeHeader}>
        <View style={[styles.trafficIndicator, { backgroundColor: TrafficAI.getTrafficColor(route.trafficLevel) }]} />
        <Text style={styles.routeTitle}>Route {rank}</Text>
        <View style={styles.aiScore}>
          <Ionicons name="sparkles" size={14} color={COLORS.accentYellow} />
          <Text style={styles.aiScoreText}>{route.aiScore}</Text>
        </View>
      </View>

      <View style={styles.routeStats}>
        <RouteStatItem icon="time" value={`${Math.round(route.durationWithTraffic / 60)} mins`} />
        <RouteStatItem icon="navigate" value={`${(route.distance / 1000).toFixed(1)} km`} />
        <RouteStatItem icon="warning" value={TrafficAI.formatDelay(route.trafficDelay)} />
        {route.toll && <RouteStatItem icon="cash" value={`₦${route.tollCost}`} />}
      </View>

      {route.timeSavedVsAlternative && route.timeSavedVsAlternative > 0 && (
        <View style={styles.timeSavedBadge}>
          <Ionicons name="flash" size={16} color={COLORS.accentGreen} />
          <Text style={styles.timeSavedText}>
            Saves {Math.round(route.timeSavedVsAlternative / 60)} mins
          </Text>
        </View>
      )}
    </View>

    {selected && (
      <View style={styles.selectedBadge}>
        <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />
      </View>
    )}
  </TouchableOpacity>
);

const RouteStatItem = ({ icon, value }: any) => (
  <View style={styles.routeStatItem}>
    <Ionicons name={icon} size={16} color={COLORS.lightTextMuted} />
    <Text style={styles.routeStatValue}>{value}</Text>
  </View>
);

const AlertCard = ({ alert }: { alert: TrafficAlert }) => {
  const getAlertColor = () => {
    switch (alert.priority) {
      case 'critical': return '#FF0000';
      case 'high': return '#FF6B00';
      case 'medium': return '#FFB800';
      default: return '#00B4D8';
    }
  };

  const getAlertIcon = () => {
    switch (alert.type) {
      case 'avoid': return 'close-circle';
      case 'warning': return 'warning';
      case 'info': return 'information-circle';
      default: return 'alert-circle';
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
          <Text style={styles.alertLocation}>
            {alert.location} • {(alert.distance / 1000).toFixed(1)}km away
          </Text>
        </View>
        {alert.actionRequired && (
          <View style={styles.alertAction}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.accentBlue} />
            <Text style={styles.alertActionText}>{alert.actionRequired}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const HotspotCard = ({ hotspot }: { hotspot: TrafficHotspot }) => (
  <View style={styles.hotspotCard}>
    <View style={[styles.severityBadge, { backgroundColor: TrafficAI.getTrafficColor(TrafficAI.getTrafficLevel(hotspot.delayMinutes)) }]}>
      <Text style={styles.severityText}>{hotspot.severity.toUpperCase()}</Text>
    </View>
    
    <View style={styles.hotspotContent}>
      <Text style={styles.hotspotLocation}>{hotspot.location.address}</Text>
      <Text style={styles.hotspotDescription}>{hotspot.description}</Text>
      
      <View style={styles.hotspotStats}>
        <View style={styles.hotspotStat}>
          <Ionicons name="time" size={16} color={COLORS.lightTextMuted} />
          <Text style={styles.hotspotStatText}>+{hotspot.delayMinutes} min delay</Text>
        </View>
        <View style={styles.hotspotStat}>
          <Ionicons name="people" size={16} color={COLORS.lightTextMuted} />
          <Text style={styles.hotspotStatText}>{hotspot.verifiedReports} reports</Text>
        </View>
        <View style={styles.hotspotStat}>
          <Ionicons name="sparkles" size={16} color={COLORS.accentYellow} />
          <Text style={styles.hotspotStatText}>{hotspot.aiConfidence}% AI</Text>
        </View>
      </View>
    </View>
  </View>
);

const InsightItem = ({ icon, color, text }: any) => (
  <View style={styles.insightItem}>
    <Ionicons name={icon} size={20} color={color} />
    <Text style={styles.insightText}>{text}</Text>
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
  refreshButton: {
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
  
  criticalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: '#FF0000',
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
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
    gap: SPACING.xs,
  },
  summaryValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
  },
  summaryLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  
  optimizerCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  optimizerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  optimizerInfo: {
    flex: 1,
  },
  optimizerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  optimizerSubtitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    opacity: 0.9,
  },
  
  routesSection: {
    marginBottom: SPACING.lg,
  },
  routeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  routeCardSelected: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreenSoft,
  },
  routeRank: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  routeRankText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextMuted,
  },
  routeBest: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  routeContent: {
    gap: SPACING.sm,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  trafficIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeTitle: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  aiScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accentYellow + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  aiScoreText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.accentYellow,
  },
  routeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  routeStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  routeStatValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  timeSavedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accentGreenSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    alignSelf: 'flex-start',
  },
  timeSavedText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  selectedBadge: {
    position: 'absolute',
    top: SPACING.lg,
    right: SPACING.lg,
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
  },
  alertLocation: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  alertAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.sm,
  },
  alertActionText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.accentBlue,
  },
  
  hotspotsSection: {
    marginBottom: SPACING.lg,
  },
  hotspotCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  severityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  severityText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.white,
  },
  hotspotContent: {
    gap: SPACING.xs,
  },
  hotspotLocation: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  hotspotDescription: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  hotspotStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  hotspotStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  hotspotStatText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  
  insightsCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  insightsTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  insightItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  insightText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  
  legendCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  legendTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
});
