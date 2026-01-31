import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function TrafficPredictionScreen() {
  const router = useRouter();
  const [selectedRoute, setSelectedRoute] = useState('fastest');

  const routes = [
    {
      id: 'fastest',
      name: 'Fastest Route',
      duration: '25 min',
      distance: '12.5 km',
      traffic: 'Moderate',
      trafficColor: COLORS.accentOrange,
      savings: 'Saves 10 min',
      udub: false,
      via: 'Lekki-Epe Expressway',
    },
    {
      id: 'safest',
      name: 'Safest Route (No U-dub)',
      duration: '35 min',
      distance: '14.2 km',
      traffic: 'Light',
      trafficColor: COLORS.accentGreen,
      savings: 'Avoid U-dub zones',
      udub: false,
      via: 'Alternative route via Chevron',
    },
    {
      id: 'shortest',
      name: 'Shortest Route',
      duration: '45 min',
      distance: '10.8 km',
      traffic: 'Heavy',
      trafficColor: COLORS.error,
      savings: 'Shortest distance',
      udub: true,
      via: 'Third Mainland Bridge',
    },
  ];

  const trafficAlerts = [
    {
      id: '1',
      type: 'udub',
      location: 'Lekki Toll Gate',
      severity: 'high',
      icon: 'warning',
      color: COLORS.error,
      message: 'U-dub checkpoint reported',
      time: '5 mins ago',
    },
    {
      id: '2',
      type: 'traffic',
      location: 'Third Mainland Bridge',
      severity: 'medium',
      icon: 'car',
      color: COLORS.accentOrange,
      message: 'Heavy traffic - 20 min delay',
      time: '10 mins ago',
    },
    {
      id: '3',
      type: 'clear',
      location: 'Lekki-Epe Expressway',
      severity: 'low',
      icon: 'checkmark-circle',
      color: COLORS.accentGreen,
      message: 'Road is clear',
      time: '2 mins ago',
    },
  ];

  const handleSelectRoute = (routeId: string) => {
    setSelectedRoute(routeId);
    Alert.alert('Route Selected', 'Navigation will start with this route');
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
            <Ionicons name="analytics" size={28} color={COLORS.white} />
            <Text style={styles.headerText}>Traffic Prediction</Text>
          </View>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* AI Status Card */}
          <View style={styles.aiCard}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentGreenDark]}
              style={styles.aiGradient}
            >
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={24} color={COLORS.white} />
                <Text style={styles.aiTitle}>AI Traffic Analysis</Text>
              </View>
              <Text style={styles.aiText}>
                Analyzing real-time traffic data, U-dub reports, and historical patterns...
              </Text>
              <View style={styles.aiStats}>
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatValue}>94%</Text>
                  <Text style={styles.aiStatLabel}>Accuracy</Text>
                </View>
                <View style={styles.aiStatDivider} />
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatValue}>Live</Text>
                  <Text style={styles.aiStatLabel}>Real-time</Text>
                </View>
                <View style={styles.aiStatDivider} />
                <View style={styles.aiStat}>
                  <Text style={styles.aiStatValue}>3</Text>
                  <Text style={styles.aiStatLabel}>Routes</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Traffic Alerts */}
          <View style={styles.alertsSection}>
            <Text style={styles.sectionTitle}>⚠️ Live Traffic Alerts</Text>
            {trafficAlerts.map((alert) => (
              <View key={alert.id} style={styles.alertCard}>
                <View style={[styles.alertIcon, { backgroundColor: alert.color }]}>
                  <Ionicons name={alert.icon as any} size={20} color={COLORS.white} />
                </View>
                <View style={styles.alertContent}>
                  <Text style={styles.alertLocation}>{alert.location}</Text>
                  <Text style={styles.alertMessage}>{alert.message}</Text>
                  <Text style={styles.alertTime}>{alert.time}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Route Options */}
          <View style={styles.routesSection}>
            <Text style={styles.sectionTitle}>🗺️ Route Options</Text>
            {routes.map((route) => (
              <TouchableOpacity
                key={route.id}
                style={[
                  styles.routeCard,
                  selectedRoute === route.id && styles.routeCardSelected,
                ]}
                onPress={() => handleSelectRoute(route.id)}
              >
                <View style={styles.routeHeader}>
                  <View style={styles.routeInfo}>
                    <Text style={styles.routeName}>{route.name}</Text>
                    {route.udub && (
                      <View style={styles.udubBadge}>
                        <Ionicons name="warning" size={12} color={COLORS.error} />
                        <Text style={styles.udubText}>U-dub possible</Text>
                      </View>
                    )}
                  </View>
                  <View style={[
                    styles.routeRadio,
                    selectedRoute === route.id && styles.routeRadioSelected,
                  ]}>
                    {selectedRoute === route.id && (
                      <View style={styles.routeRadioInner} />
                    )}
                  </View>
                </View>

                <View style={styles.routeStats}>
                  <View style={styles.routeStat}>
                    <Ionicons name="time" size={16} color={COLORS.accentBlue} />
                    <Text style={styles.routeStatValue}>{route.duration}</Text>
                  </View>
                  <View style={styles.routeStat}>
                    <Ionicons name="navigate" size={16} color={COLORS.accentGreen} />
                    <Text style={styles.routeStatValue}>{route.distance}</Text>
                  </View>
                  <View style={styles.routeStat}>
                    <View style={[styles.trafficDot, { backgroundColor: route.trafficColor }]} />
                    <Text style={[styles.routeStatValue, { color: route.trafficColor }]}>
                      {route.traffic}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeFooter}>
                  <Text style={styles.routeVia}>Via {route.via}</Text>
                  <View style={styles.savingsBadge}>
                    <Ionicons name="flash" size={12} color={COLORS.accentGreen} />
                    <Text style={styles.savingsText}>{route.savings}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tips Section */}
          <View style={styles.tipsSection}>
            <Text style={styles.sectionTitle}>💡 Smart Driving Tips</Text>
            <View style={styles.tipCard}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.accentGreen} />
              <Text style={styles.tipText}>
                Avoid Lekki Toll Gate between 5-7 PM for U-dub safety
              </Text>
            </View>
            <View style={styles.tipCard}>
              <Ionicons name="time-outline" size={24} color={COLORS.accentBlue} />
              <Text style={styles.tipText}>
                Third Mainland Bridge clears up after 8 PM
              </Text>
            </View>
            <View style={styles.tipCard}>
              <Ionicons name="navigate-circle" size={24} color={COLORS.accentOrange} />
              <Text style={styles.tipText}>
                Use Lekki-Epe Expressway for fastest route during rush hour
              </Text>
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
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
  },
  scrollView: {
    flex: 1,
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
    fontWeight: '700',
    color: COLORS.white,
  },
  aiText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 20,
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
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: 4,
  },
  aiStatLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  alertsSection: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  alertCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  alertIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  alertContent: {
    flex: 1,
  },
  alertLocation: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  alertMessage: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: 4,
  },
  alertTime: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextMuted,
  },
  routesSection: {
    marginBottom: SPACING.lg,
  },
  routeCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  routeCardSelected: {
    borderColor: COLORS.accentGreen,
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  routeInfo: {
    flex: 1,
  },
  routeName: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  udubBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.errorSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  udubText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.error,
  },
  routeRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRadioSelected: {
    borderColor: COLORS.accentGreen,
  },
  routeRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  routeStats: {
    flexDirection: 'row',
    gap: SPACING.lg,
    marginBottom: SPACING.md,
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  routeStatValue: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  trafficDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  routeVia: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextMuted,
  },
  savingsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.successSoft,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  savingsText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.accentGreen,
  },
  tipsSection: {
    marginTop: SPACING.lg,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tipText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    lineHeight: 20,
  },
});
