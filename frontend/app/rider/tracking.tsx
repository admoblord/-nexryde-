import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function TrackingScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.lightTextPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Finding Driver</Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.content}>
          {/* Map Placeholder */}
          <View style={styles.mapPlaceholder}>
            <View style={styles.mapOverlay}>
              <Text style={styles.mapTitle}>Live Map View</Text>
              <Text style={styles.mapSubtitle}>Tracking your ride in real-time</Text>
            </View>
          </View>

          {/* Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accentGreen} />
            </View>
            <Text style={styles.statusTitle}>Finding your driver...</Text>
            <Text style={styles.statusSubtitle}>This usually takes 1-2 minutes</Text>

            {/* Route Info */}
            <View style={styles.routeInfo}>
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.accentGreen }]} />
                <Text style={styles.routeText}>Current Location</Text>
              </View>
              <View style={styles.routeLine} />
              <View style={styles.routePoint}>
                <View style={[styles.routeDot, { backgroundColor: COLORS.accentBlue }]} />
                <Text style={styles.routeText}>Destination</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Cancel Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity 
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelText}>Cancel Ride</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.lightBackground,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 44,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  mapPlaceholder: {
    height: 200,
    backgroundColor: COLORS.lightSurface,
    borderRadius: BORDER_RADIUS.xxl,
    marginBottom: SPACING.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  mapOverlay: {
    flex: 1,
    backgroundColor: 'rgba(58, 209, 115, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  mapSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginTop: 4,
  },
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  loadingContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  statusTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.lg,
  },
  routeInfo: {
    width: '100%',
    paddingHorizontal: SPACING.lg,
  },
  routePoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
  },
  routeLine: {
    width: 2,
    height: 24,
    backgroundColor: COLORS.lightBorder,
    marginLeft: 5,
    marginVertical: 4,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  cancelButton: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.error,
  },
  cancelText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.error,
  },
});
