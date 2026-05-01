/**
 * NEXRYDE Prayer Times Screen for Drivers
 * Smart prayer alerts with mosque locations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Dimensions,
  Linking,
  Platform,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { usePrayerTimes, PrayerTime, Mosque } from '@/src/services/prayerTimes';
import { router } from 'expo-router';

const { width } = Dimensions.get('window');

const COLORS = {
  primary: '#00D084',
  secondary: '#00B4D8',
  accent: '#FFB800',
  purple: '#9D4EDD',
  dark: '#1a1a1a',
  darkCard: '#2a2a2a',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  success: '#00D084',
  warning: '#FFB800',
  error: '#FF6B6B',
};

const DriverPrayerTimesScreen = () => {
  const {
    prayerTimes,
    settings,
    nearbyMosques,
    isPraying,
    loading,
    saveSettings,
    fetchPrayerTimes,
  } = usePrayerTimes();
  
  const [refreshing, setRefreshing] = useState(false);
  
  useEffect(() => {
    // Refresh prayer times when screen loads
    fetchPrayerTimes();
  }, []);
  
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPrayerTimes();
    setRefreshing(false);
  };
  
  const handleOpenMap = (mosque: Mosque) => {
    const url = Platform.select({
      ios: `maps:0,0?q=${mosque.latitude},${mosque.longitude}`,
      android: `geo:0,0?q=${mosque.latitude},${mosque.longitude}(${mosque.name})`,
    });
    
    if (url) {
      Linking.openURL(url);
    }
  };
  
  const getPrayerColor = (prayerName: string): string => {
    switch (prayerName.toLowerCase()) {
      case 'fajr':    return '#4A90E2';
      case 'dhuhr':   return '#FFB800';
      case 'asr':     return '#FF9500';
      case 'maghrib': return '#FF6B6B';
      case 'isha':    return '#9D4EDD';
      default:        return COLORS.primary;
    }
  };

  const getPrayerIcon = (prayerName: string): string => {
    switch (prayerName.toLowerCase()) {
      case 'fajr':    return 'sunny-outline';
      case 'dhuhr':   return 'sunny';
      case 'asr':     return 'partly-sunny';
      case 'maghrib': return 'moon-outline';
      case 'isha':    return 'moon';
      default:        return 'time';
    }
  };
  
  if (loading && !prayerTimes) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['#9D4EDD', '#7B2CBF']} style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Prayer Times</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.purple} />
          <Text style={[styles.loadingText, { marginTop: 16 }]}>Loading prayer times...</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient colors={['#9D4EDD', '#7B2CBF']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🕌 Prayer Times</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
          <Ionicons name="refresh" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </LinearGradient>
      
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
      >
        {/* Status Banner */}
        {isPraying && (
          <View style={styles.prayingBanner}>
            <LinearGradient
              colors={['#9D4EDD', '#7B2CBF']}
              style={styles.prayingGradient}
            >
              <Ionicons name="hand-right" size={32} color={COLORS.white} />
              <View style={styles.prayingInfo}>
                <Text style={styles.prayingTitle}>Prayer Time Active</Text>
                <Text style={styles.prayingSubtitle}>
                  {settings.autoPauseRides
                    ? `Ride requests paused for ${settings.pauseDuration} minutes`
                    : 'May your prayers be accepted'}
                </Text>
              </View>
            </LinearGradient>
          </View>
        )}
        
        {/* Enable Prayer Alerts */}
        <View style={styles.section}>
          <View style={styles.toggleCard}>
            <View style={styles.toggleLeft}>
              <View style={styles.toggleIcon}>
                <Ionicons name="notifications" size={24} color={COLORS.purple} />
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Enable Prayer Alerts</Text>
                <Text style={styles.toggleSubtitle}>
                  Get notified before prayer times
                </Text>
              </View>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(value) => saveSettings({ enabled: value })}
              trackColor={{ false: '#3e3e3e', true: COLORS.purple }}
              thumbColor={settings.enabled ? COLORS.white : '#f4f3f4'}
            />
          </View>
        </View>
        
            {/* Today's Prayer Times */}
            {prayerTimes && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>📅 Today's Prayer Times</Text>
                  <Text style={styles.sectionSubtitle}>
                    {prayerTimes.location} • {prayerTimes.date}
                  </Text>
                </View>
                
                <View style={styles.prayersList}>
                  {prayerTimes.prayers.map((prayer, index) => (
                    <TouchableOpacity
                      key={prayer.name}
                      style={[
                        styles.prayerCard,
                        prayer.isActive && styles.prayerCardActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.prayerIcon, { backgroundColor: getPrayerColor(prayer.name) + '20' }]}>
                        <Ionicons
                          name={getPrayerIcon(prayer.name) as any}
                          size={28}
                          color={getPrayerColor(prayer.name)}
                        />
                      </View>
                      
                      <View style={styles.prayerInfo}>
                        <Text style={styles.prayerName}>{prayer.name.toUpperCase()}</Text>
                        <Text style={styles.prayerArabic}>{prayer.arabicName}</Text>
                        <Text style={styles.prayerHausa}>{prayer.hausaName}</Text>
                      </View>
                      
                      <View style={styles.prayerTimeContainer}>
                        <Text style={styles.prayerTime}>{prayer.time}</Text>
                        {prayer.isActive && (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>NOW</Text>
                          </View>
                        )}
                      </View>
                      
                      {prayer === prayerTimes.nextPrayer && !prayer.isActive && (
                        <View style={styles.nextBadge}>
                          <Text style={styles.nextBadgeText}>NEXT</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

        {settings.enabled && (
          <>
            {/* Settings */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>⚙️ Prayer Settings</Text>
              
              {/* Auto-Pause Rides */}
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Ionicons name="pause-circle" size={24} color={COLORS.purple} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Auto-Pause Rides</Text>
                    <Text style={styles.settingSubtitle}>
                      Automatically pause ride requests during prayer
                    </Text>
                  </View>
                </View>
                <Switch
                  value={settings.autoPauseRides}
                  onValueChange={(value) => saveSettings({ autoPauseRides: value })}
                  trackColor={{ false: '#3e3e3e', true: COLORS.purple }}
                  thumbColor={settings.autoPauseRides ? COLORS.white : '#f4f3f4'}
                />
              </View>
              
              {/* Pause Duration */}
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Ionicons name="time" size={24} color={COLORS.purple} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Pause Duration</Text>
                    <Text style={styles.settingSubtitle}>
                      How long to pause ride requests
                    </Text>
                  </View>
                </View>
                <View style={styles.durationButtons}>
                  {[10, 15, 20, 30].map((duration) => (
                    <TouchableOpacity
                      key={duration}
                      style={[
                        styles.durationButton,
                        settings.pauseDuration === duration && styles.durationButtonActive,
                      ]}
                      onPress={() => saveSettings({ pauseDuration: duration })}
                    >
                      <Text
                        style={[
                          styles.durationText,
                          settings.pauseDuration === duration && styles.durationTextActive,
                        ]}
                      >
                        {duration}m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Alert Before */}
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Ionicons name="alarm" size={24} color={COLORS.purple} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Alert Before Prayer</Text>
                    <Text style={styles.settingSubtitle}>
                      Notify me before prayer time
                    </Text>
                  </View>
                </View>
                <View style={styles.durationButtons}>
                  {[5, 10, 15, 20].map((minutes) => (
                    <TouchableOpacity
                      key={minutes}
                      style={[
                        styles.durationButton,
                        settings.alertBefore === minutes && styles.durationButtonActive,
                      ]}
                      onPress={() => saveSettings({ alertBefore: minutes })}
                    >
                      <Text
                        style={[
                          styles.durationText,
                          settings.alertBefore === minutes && styles.durationTextActive,
                        ]}
                      >
                        {minutes}m
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Show Mosques */}
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Ionicons name="location" size={24} color={COLORS.purple} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Show Nearby Mosques</Text>
                    <Text style={styles.settingSubtitle}>
                      Display mosques near you
                    </Text>
                  </View>
                </View>
                <Switch
                  value={settings.showMosqueLocations}
                  onValueChange={(value) => saveSettings({ showMosqueLocations: value })}
                  trackColor={{ false: '#3e3e3e', true: COLORS.purple }}
                  thumbColor={settings.showMosqueLocations ? COLORS.white : '#f4f3f4'}
                />
              </View>
              
              {/* Notification Sound */}
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Ionicons name="volume-high" size={24} color={COLORS.purple} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Notification Sound</Text>
                    <Text style={styles.settingSubtitle}>
                      Play sound for prayer alerts
                    </Text>
                  </View>
                </View>
                <Switch
                  value={settings.notificationSound === 'default'}
                  onValueChange={(value) =>
                    saveSettings({ notificationSound: value ? 'default' : 'silent' })
                  }
                  trackColor={{ false: '#3e3e3e', true: COLORS.purple }}
                  thumbColor={settings.notificationSound === 'default' ? COLORS.white : '#f4f3f4'}
                />
              </View>
              
              {/* Vibration */}
              <View style={styles.settingCard}>
                <View style={styles.settingLeft}>
                  <Ionicons name="phone-portrait" size={24} color={COLORS.purple} />
                  <View style={styles.settingText}>
                    <Text style={styles.settingTitle}>Vibration</Text>
                    <Text style={styles.settingSubtitle}>
                      Vibrate for prayer alerts
                    </Text>
                  </View>
                </View>
                <Switch
                  value={settings.vibration}
                  onValueChange={(value) => saveSettings({ vibration: value })}
                  trackColor={{ false: '#3e3e3e', true: COLORS.purple }}
                  thumbColor={settings.vibration ? COLORS.white : '#f4f3f4'}
                />
              </View>
            </View>
            
            {/* Nearby Mosques */}
            {settings.showMosqueLocations && nearbyMosques.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🕌 Nearby Mosques</Text>
                <Text style={styles.sectionSubtitle}>
                  {nearbyMosques.length} mosques found near you
                </Text>
                
                <View style={styles.mosquesList}>
                  {nearbyMosques.map((mosque) => (
                    <TouchableOpacity
                      key={mosque.id}
                      style={styles.mosqueCard}
                      onPress={() => handleOpenMap(mosque)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.mosqueIcon}>
                        <Ionicons name="business" size={24} color={COLORS.purple} />
                      </View>
                      
                      <View style={styles.mosqueInfo}>
                        <Text style={styles.mosqueName}>{mosque.name}</Text>
                        <Text style={styles.mosqueAddress}>{mosque.address}</Text>
                        
                        <View style={styles.mosqueFacilities}>
                          {mosque.hasWudu && (
                            <View style={styles.facilityTag}>
                              <Ionicons name="water" size={12} color={COLORS.secondary} />
                              <Text style={styles.facilityText}>Wudu</Text>
                            </View>
                          )}
                          {mosque.hasParking && (
                            <View style={styles.facilityTag}>
                              <Ionicons name="car" size={12} color={COLORS.secondary} />
                              <Text style={styles.facilityText}>Parking</Text>
                            </View>
                          )}
                          {mosque.capacity && (
                            <View style={styles.facilityTag}>
                              <Ionicons name="people" size={12} color={COLORS.secondary} />
                              <Text style={styles.facilityText}>{mosque.capacity}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      
                      <View style={styles.mosqueDistance}>
                        <Text style={styles.distanceText}>{mosque.distance}km</Text>
                        <Ionicons name="navigate" size={20} color={COLORS.purple} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            
            {/* Benefits */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>✨ Benefits</Text>
              <View style={styles.benefitsList}>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>
                    Never miss prayer times while driving
                  </Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>
                    Auto-pause ensures no interruptions during prayer
                  </Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>
                    Find nearby mosques easily with directions
                  </Text>
                </View>
                <View style={styles.benefitItem}>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                  <Text style={styles.benefitText}>
                    Respects your religious obligations
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
        
        {/* Footer Message */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            "And establish prayer and give zakah and bow with those who bow." - Al-Baqarah 2:43
          </Text>
          <Text style={styles.footerSubtext}>
            May Allah accept your prayers and bless your work.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.dark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: COLORS.textSecondary,
  },
  content: {
    flex: 1,
  },
  prayingBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  prayingGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  prayingInfo: {
    flex: 1,
    gap: 4,
  },
  prayingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  prayingSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toggleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9D4EDD20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  toggleSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  prayersList: {
    gap: 12,
  },
  prayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    position: 'relative',
  },
  prayerCardActive: {
    borderWidth: 2,
    borderColor: COLORS.purple,
    backgroundColor: '#9D4EDD10',
  },
  prayerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  prayerInfo: {
    flex: 1,
    gap: 2,
  },
  prayerName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prayerArabic: {
    fontSize: 18,
    color: COLORS.purple,
    fontWeight: '600',
  },
  prayerHausa: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  prayerTimeContainer: {
    alignItems: 'flex-end',
    gap: 4,
  },
  prayerTime: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  activeBadge: {
    backgroundColor: COLORS.purple,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  nextBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: COLORS.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nextBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingText: {
    flex: 1,
    gap: 4,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  settingSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  durationButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  durationButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  durationButtonActive: {
    backgroundColor: '#9D4EDD20',
    borderColor: COLORS.purple,
  },
  durationText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  durationTextActive: {
    color: COLORS.purple,
  },
  mosquesList: {
    gap: 12,
    marginTop: 12,
  },
  mosqueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  mosqueIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#9D4EDD20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mosqueInfo: {
    flex: 1,
    gap: 4,
  },
  mosqueName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  mosqueAddress: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  mosqueFacilities: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  facilityTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,180,216,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  facilityText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.secondary,
  },
  mosqueDistance: {
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.purple,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    flex: 1,
  },
  footer: {
    marginTop: 32,
    marginBottom: 32,
    paddingHorizontal: 20,
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.purple,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  footerSubtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
});

export default DriverPrayerTimesScreen;
