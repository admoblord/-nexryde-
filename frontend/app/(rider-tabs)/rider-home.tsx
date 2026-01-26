import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS } from '@/src/constants/theme';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function RiderHomeScreen() {
  const router = useRouter();
  const { user, setCurrentLocation } = useAppStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: 'Current Location',
        });
      }
    } catch (error) {
      console.log('Location permission error:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await requestLocationPermission();
    setRefreshing(false);
  }, []);

  const handleBookRide = () => {
    router.push('/rider/book');
  };

  return (
    <View style={styles.container}>
      {/* Premium Header */}
      <View style={styles.headerContainer}>
        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hello,</Text>
              <Text style={styles.userName}>{user?.name?.split(' ')[0] || 'Rider'}</Text>
            </View>
            <TouchableOpacity style={styles.notificationBtn}>
              <Ionicons name="notifications-outline" size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Book Ride Card */}
        <View style={styles.bookRideCard}>
          <Text style={styles.bookRideTitle}>Where to?</Text>
          <TouchableOpacity 
            style={styles.searchBar}
            onPress={handleBookRide}
            activeOpacity={0.8}
          >
            <View style={styles.searchIconWrap}>
              <Ionicons name="search" size={20} color={COLORS.accent} />
            </View>
            <Text style={styles.searchPlaceholder}>Enter your destination</Text>
          </TouchableOpacity>
          
          <View style={styles.savedLocations}>
            <TouchableOpacity style={styles.savedLocation} onPress={handleBookRide}>
              <View style={[styles.savedLocationIcon, { backgroundColor: COLORS.infoSoft }]}>
                <Ionicons name="home" size={18} color={COLORS.info} />
              </View>
              <Text style={styles.savedLocationText}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.savedLocation} onPress={handleBookRide}>
              <View style={[styles.savedLocationIcon, { backgroundColor: COLORS.accentSoft }]}>
                <Ionicons name="briefcase" size={18} color={COLORS.accent} />
              </View>
              <Text style={styles.savedLocationText}>Work</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.savedLocation} onPress={handleBookRide}>
              <View style={[styles.savedLocationIcon, { backgroundColor: COLORS.successSoft }]}>
                <Ionicons name="location" size={18} color={COLORS.success} />
              </View>
              <Text style={styles.savedLocationText}>Map</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Assistant Banner */}
        <TouchableOpacity 
          style={styles.aiAssistantBanner}
          onPress={() => router.push('/assistant')}
          activeOpacity={0.85}
        >
          <View style={styles.aiAssistantLeft}>
            <View style={styles.aiAssistantIcon}>
              <Ionicons name="sparkles" size={22} color={COLORS.accent} />
            </View>
            <View>
              <Text style={styles.aiAssistantTitle}>AI Assistant</Text>
              <Text style={styles.aiAssistantSubtext}>Get help with anything</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.accent} />
        </TouchableOpacity>

        {/* Family Mode */}
        <TouchableOpacity 
          style={styles.familyCard}
          onPress={() => router.push('/rider/family')}
          activeOpacity={0.8}
        >
          <View style={styles.familyCardLeft}>
            <View style={styles.familyIcon}>
              <Ionicons name="people" size={24} color={COLORS.info} />
            </View>
            <View>
              <Text style={styles.familyTitle}>KODA Family</Text>
              <Text style={styles.familySubtext}>Share trips with loved ones</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
        </TouchableOpacity>

        {/* Why KODA */}
        <Text style={styles.sectionTitle}>Why KODA?</Text>
        <View style={styles.featuresGrid}>
          <View style={styles.featureCard}>
            <View style={[styles.featureIconWrap, { backgroundColor: COLORS.accentSoft }]}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.accent} />
            </View>
            <Text style={styles.featureTitle}>Verified Drivers</Text>
            <Text style={styles.featureDesc}>All drivers verified with NIN</Text>
          </View>
          
          <View style={styles.featureCard}>
            <View style={[styles.featureIconWrap, { backgroundColor: COLORS.successSoft }]}>
              <Ionicons name="cash" size={24} color={COLORS.success} />
            </View>
            <Text style={styles.featureTitle}>Fair Pricing</Text>
            <Text style={styles.featureDesc}>No hidden charges</Text>
          </View>
          
          <View style={styles.featureCard}>
            <View style={[styles.featureIconWrap, { backgroundColor: COLORS.infoSoft }]}>
              <Ionicons name="location" size={24} color={COLORS.info} />
            </View>
            <Text style={styles.featureTitle}>Live Tracking</Text>
            <Text style={styles.featureDesc}>Real-time trip monitoring</Text>
          </View>
          
          <View style={styles.featureCard}>
            <View style={[styles.featureIconWrap, { backgroundColor: COLORS.errorSoft }]}>
              <Ionicons name="call" size={24} color={COLORS.error} />
            </View>
            <Text style={styles.featureTitle}>24/7 Support</Text>
            <Text style={styles.featureDesc}>Always here to help</Text>
          </View>
        </View>

        {/* Bottom Spacer */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  headerContainer: {
    backgroundColor: COLORS.primary,
    paddingBottom: SPACING.lg,
    borderBottomLeftRadius: BORDER_RADIUS.xxxl,
    borderBottomRightRadius: BORDER_RADIUS.xxxl,
    ...SHADOWS.lg,
  },
  headerSafe: {
    paddingHorizontal: SPACING.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: SPACING.md,
  },
  greeting: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray400,
  },
  userName: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  bookRideCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xxl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  bookRideTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.gray50,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.gray100,
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  searchPlaceholder: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textTertiary,
  },
  savedLocations: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  savedLocation: {
    alignItems: 'center',
    gap: SPACING.sm,
  },
  savedLocationIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedLocationText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  aiAssistantBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.md,
    ...SHADOWS.lg,
  },
  aiAssistantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  aiAssistantIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,215,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiAssistantTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  aiAssistantSubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray400,
  },
  familyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    marginBottom: SPACING.lg,
    ...SHADOWS.sm,
  },
  familyCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  familyIcon: {
    width: 48,
    height: 48,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.infoSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  familySubtext: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: SPACING.md,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  featureCard: {
    width: (width - SPACING.lg * 2 - SPACING.md) / 2 - SPACING.md / 2,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    ...SHADOWS.sm,
  },
  featureIconWrap: {
    width: 44,
    height: 44,
    borderRadius: BORDER_RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  featureTitle: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  bottomSpacer: {
    height: SPACING.xxl,
  },
});
