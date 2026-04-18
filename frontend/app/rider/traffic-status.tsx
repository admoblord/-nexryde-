import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { TrafficAI, TrafficPrediction, useTrafficAI } from '@/src/services/trafficAI';
import { BACKEND_URL } from '@/src/services/api';

type SearchedLocation = {
  name: string;
  lat: number;
  lng: number;
  prediction?: TrafficPrediction;
};

export default function RiderTrafficStatusScreen() {
  const router = useRouter();
  const { hotspots, loading, fetchTrafficStatus } = useTrafficAI();
  
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<TrafficPrediction[]>([]);
  const [searchedLocation, setSearchedLocation] = useState<SearchedLocation | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Popular Lagos locations for predictions
  const popularLocations = [
    { latitude: 6.5244, longitude: 3.3792, name: 'Yaba' },
    { latitude: 6.4541, longitude: 3.3947, name: 'Victoria Island' },
    { latitude: 6.4281, longitude: 3.4219, name: 'Lekki' },
    { latitude: 6.5027, longitude: 3.3748, name: 'Ikeja' },
  ];

  useEffect(() => {
    loadTrafficData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadTrafficData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  const loadTrafficData = async () => {
    // Default location (Lagos center)
    await fetchTrafficStatus(6.5244, 3.3792, 15000);
    
    // Load predictions
    const predictionsData = await TrafficAI.getTrafficPredictions(popularLocations);
    setPredictions(predictionsData);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTrafficData();
    setRefreshing(false);
  };

  const handleSearchLocation = async () => {
    if (!searchQuery.trim()) return;
    
    setSearchLoading(true);
    try {
      const geocodeResponse = await fetch(
        `${BACKEND_URL}/api/places/geocode-address?address=${encodeURIComponent(searchQuery + ', Lagos, Nigeria')}`
      );
      
      const geocodeData = await geocodeResponse.json();
      
      if (geocodeResponse.ok && geocodeData?.latitude && geocodeData?.longitude) {
        const lat = geocodeData.latitude;
        const lng = geocodeData.longitude;
        
        // Fetch traffic status for this location
        await fetchTrafficStatus(lat, lng, 5000);
        
        // Get AI prediction for this location
        const prediction = await TrafficAI.getTrafficPredictions([
          { latitude: lat, longitude: lng, name: searchQuery }
        ]);
        
        setSearchedLocation({
          name: geocodeData.formatted_address || searchQuery,
          lat,
          lng,
          prediction: prediction[0],
        });
      } else {
        alert('Location not found. Please try a different search term.');
      }
    } catch (error) {
      console.error('Search error:', error);
      alert('Failed to search location. Please try again.');
    } finally {
      setSearchLoading(false);
    }
  };

  const getBestTimeToTravel = () => {
    const currentHour = new Date().getHours();
    if (currentHour >= 6 && currentHour < 10) return '10:00 AM - 2:00 PM';
    if (currentHour >= 16 && currentHour < 20) return '8:00 PM onwards';
    return 'Now';
  };

  const getTrafficSummary = () => {
    const severe = hotspots.filter(h => h.severity === 'severe').length;
    const high = hotspots.filter(h => h.severity === 'high').length;
    
    if (severe > 2) return { level: 'Poor', color: '#FF0000', icon: 'close-circle' as any };
    if (high > 3 || severe > 0) return { level: 'Moderate', color: '#FFB800', icon: 'alert-circle' as any };
    return { level: 'Good', color: '#00D084', icon: 'checkmark-circle' as any };
  };

  const summary = getTrafficSummary();

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={[COLORS.accentBlue, '#0096C7']}
        style={styles.header}
      >
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>🚦 Traffic Status</Text>
          <Text style={styles.headerSubtitle}>Plan Your Trip Smart</Text>
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
        {/* Overall Traffic Status */}
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>📍 Lagos Traffic Now</Text>
          <View style={styles.statusMain}>
            <Ionicons name={summary.icon} size={64} color={summary.color} />
            <View style={styles.statusInfo}>
              <Text style={[styles.statusLevel, { color: summary.color }]}>
                {summary.level}
              </Text>
              <Text style={styles.statusDescription}>
                {summary.level === 'Good' && 'Roads are mostly clear'}
                {summary.level === 'Moderate' && 'Some delays on major roads'}
                {summary.level === 'Poor' && 'Heavy traffic on multiple routes'}
              </Text>
            </View>
          </View>
        </View>

        {/* Best Time to Travel */}
        <View style={styles.bestTimeCard}>
          <LinearGradient
            colors={['#00D084', '#00B471']}
            style={styles.bestTimeGradient}
          >
            <Ionicons name="time" size={32} color={COLORS.white} />
            <View style={styles.bestTimeInfo}>
              <Text style={styles.bestTimeLabel}>Best Time to Travel</Text>
              <Text style={styles.bestTimeValue}>{getBestTimeToTravel()}</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Search Location */}
        <View style={styles.searchCard}>
          <Text style={styles.sectionTitle}>🔍 Check Specific Location</Text>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={20} color={COLORS.lightTextMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search location (e.g., Lekki, Ikeja)..."
              placeholderTextColor={COLORS.lightTextMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearchLocation}
              returnKeyType="search"
            />
            {searchLoading ? (
              <ActivityIndicator size="small" color={COLORS.accentBlue} />
            ) : (
              <TouchableOpacity onPress={handleSearchLocation} disabled={!searchQuery.trim()}>
                <Ionicons 
                  name="arrow-forward-circle" 
                  size={28} 
                  color={searchQuery.trim() ? COLORS.accentBlue : COLORS.lightTextMuted} 
                />
              </TouchableOpacity>
            )}
          </View>
          
          {/* Searched Location Result */}
          {searchedLocation && (
            <View style={styles.searchResult}>
              <View style={styles.searchResultHeader}>
                <Ionicons name="location" size={20} color={COLORS.accentBlue} />
                <Text style={styles.searchResultTitle}>{searchedLocation.name}</Text>
              </View>
              {searchedLocation.prediction && (
                <View style={styles.searchResultContent}>
                  <Text style={styles.searchResultLabel}>Traffic Status:</Text>
                  <Text style={[
                    styles.searchResultValue,
                    {
                      color:
                        searchedLocation.prediction.predictedLevel === 'light'
                          ? COLORS.success
                          : searchedLocation.prediction.predictedLevel === 'moderate'
                            ? COLORS.warning
                            : COLORS.danger,
                    }
                  ]}>
                    {searchedLocation.prediction.predictedLevel.toUpperCase()}
                  </Text>
                  <Text style={styles.searchResultDesc}>
                    {searchedLocation.prediction.factors.length > 0
                      ? searchedLocation.prediction.factors.join(', ')
                      : 'Live prediction available for this area.'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Traffic Predictions */}
        {predictions.length > 0 && (
          <View style={styles.predictionsSection}>
            <Text style={styles.sectionTitle}>🔮 AI Traffic Predictions</Text>
            <Text style={styles.sectionSubtitle}>Next 30 minutes</Text>
            {predictions.map((prediction, index) => (
              <PredictionCard key={index} prediction={prediction} />
            ))}
          </View>
        )}

        {/* Traffic Hotspots Summary */}
        {hotspots.length > 0 && (
          <View style={styles.hotspotsSection}>
            <Text style={styles.sectionTitle}>🔥 Active Hotspots</Text>
            <View style={styles.hotspotsGrid}>
              <HotspotSummaryItem
                count={hotspots.filter(h => h.type === 'accident').length}
                label="Accidents"
                icon="car"
                color="#FF0000"
              />
              <HotspotSummaryItem
                count={hotspots.filter(h => h.type === 'roadwork').length}
                label="Roadwork"
                icon="construct"
                color="#FFB800"
              />
              <HotspotSummaryItem
                count={hotspots.filter(h => h.type === 'congestion').length}
                label="Congestion"
                icon="alert-circle"
                color="#FF6B00"
              />
              <HotspotSummaryItem
                count={hotspots.filter(h => h.type === 'event').length}
                label="Events"
                icon="calendar"
                color="#00B4D8"
              />
            </View>
          </View>
        )}

        {/* Route Status from live predictions */}
        <View style={styles.routesSection}>
          <Text style={styles.sectionTitle}>🛣️ Route Status</Text>
          {predictions.length > 0 ? (
            predictions.map((p, idx) => (
              <RouteStatusItem
                key={`${p.location.name}-${idx}`}
                name={p.location.name}
                level={p.predictedLevel}
                delay={
                  p.predictedLevel === 'severe' ? 45 :
                  p.predictedLevel === 'heavy' ? 30 :
                  p.predictedLevel === 'moderate' ? 15 : 5
                }
              />
            ))
          ) : (
            <View style={styles.emptyRouteCard}>
              <Text style={styles.emptyRouteText}>No live route predictions yet. Pull to refresh.</Text>
            </View>
          )}
        </View>

        {/* Travel Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>💡 Smart Travel Tips</Text>
          <TipItem
            icon="time"
            text="Avoid booking rides during rush hours (7-10 AM, 5-8 PM)"
          />
          <TipItem
            icon="navigate"
            text="Our AI automatically finds the fastest routes for you"
          />
          <TipItem
            icon="flash"
            text="Book early to avoid surge pricing during peak traffic"
          />
          <TipItem
            icon="calendar"
            text="Weekends typically have 30% less traffic"
          />
        </View>

        {/* Traffic Data Source */}
        <View style={styles.dataSourceCard}>
          <Ionicons name="sparkles" size={24} color={COLORS.accentYellow} />
          <View style={styles.dataSourceInfo}>
            <Text style={styles.dataSourceTitle}>Powered by AI</Text>
            <Text style={styles.dataSourceText}>
              Real-time data from {hotspots.reduce((sum, h) => sum + h.verifiedReports, 0)}+ driver reports
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const PredictionCard = ({ prediction }: { prediction: TrafficPrediction }) => {
  const getChangeIcon = () => {
    const currentLevels = ['light', 'moderate', 'heavy', 'severe'];
    const currentIndex = currentLevels.indexOf(prediction.currentLevel);
    const predictedIndex = currentLevels.indexOf(prediction.predictedLevel);
    
    if (predictedIndex > currentIndex) return { name: 'trending-up', color: '#FF6B00' };
    if (predictedIndex < currentIndex) return { name: 'trending-down', color: '#00D084' };
    return { name: 'remove', color: '#FFB800' };
  };

  const change = getChangeIcon();

  return (
    <View style={styles.predictionCard}>
      <View style={styles.predictionHeader}>
        <Text style={styles.predictionLocation}>{prediction.location.name}</Text>
        <View style={styles.predictionConfidence}>
          <Ionicons name="sparkles" size={14} color={COLORS.accentYellow} />
          <Text style={styles.predictionConfidenceText}>{prediction.confidence}%</Text>
        </View>
      </View>
      
      <View style={styles.predictionContent}>
        <View style={styles.predictionLevel}>
          <View style={[styles.levelDot, { backgroundColor: TrafficAI.getTrafficColor(prediction.currentLevel) }]} />
          <Text style={styles.levelText}>Now: {prediction.currentLevel}</Text>
        </View>
        
        <Ionicons name={change.name as any} size={20} color={change.color} />
        
        <View style={styles.predictionLevel}>
          <View style={[styles.levelDot, { backgroundColor: TrafficAI.getTrafficColor(prediction.predictedLevel) }]} />
          <Text style={styles.levelText}>Soon: {prediction.predictedLevel}</Text>
        </View>
      </View>
      
      {prediction.factors.length > 0 && (
        <Text style={styles.predictionFactors}>
          {prediction.factors.join(', ')}
        </Text>
      )}
    </View>
  );
};

const HotspotSummaryItem = ({ count, label, icon, color }: any) => (
  <View style={styles.hotspotSummaryItem}>
    <View style={[styles.hotspotIconCircle, { backgroundColor: color + '20' }]}>
      <Ionicons name={icon as any} size={24} color={color} />
    </View>
    <Text style={[styles.hotspotCount, { color }]}>{count}</Text>
    <Text style={styles.hotspotLabel}>{label}</Text>
  </View>
);

const RouteStatusItem = ({ name, level, delay }: any) => (
  <View style={styles.routeStatusItem}>
    <View style={[styles.routeStatusDot, { backgroundColor: TrafficAI.getTrafficColor(level) }]} />
    <View style={styles.routeStatusInfo}>
      <Text style={styles.routeStatusName}>{name}</Text>
      <Text style={styles.routeStatusDelay}>+{delay} mins</Text>
    </View>
    <View style={[styles.routeStatusBadge, { backgroundColor: TrafficAI.getTrafficColor(level) + '20' }]}>
      <Text style={[styles.routeStatusLevel, { color: TrafficAI.getTrafficColor(level) }]}>
        {level.toUpperCase()}
      </Text>
    </View>
  </View>
);

const TipItem = ({ icon, text }: any) => (
  <View style={styles.tipItem}>
    <Ionicons name={icon as any} size={20} color={COLORS.accentBlue} />
    <Text style={styles.tipText}>{text}</Text>
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
  
  statusCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  statusTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  statusMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  statusInfo: {
    flex: 1,
  },
  statusLevel: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    marginBottom: SPACING.xs,
  },
  statusDescription: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
  },
  
  bestTimeCard: {
    marginBottom: SPACING.lg,
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
  },
  bestTimeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    padding: SPACING.lg,
  },
  bestTimeInfo: {
    flex: 1,
  },
  bestTimeLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
    opacity: 0.9,
    marginBottom: SPACING.xs,
  },
  bestTimeValue: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '900',
    color: COLORS.white,
  },
  
  searchCard: {
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.lightBackground,
    borderRadius: BORDER_RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  
  predictionsSection: {
    marginBottom: SPACING.lg,
  },
  predictionCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  predictionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  predictionLocation: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
  },
  predictionConfidence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.accentYellow + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  predictionConfidenceText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
    color: COLORS.accentYellow,
  },
  predictionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  predictionLevel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  levelText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  predictionFactors: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
    fontStyle: 'italic',
  },
  
  hotspotsSection: {
    marginBottom: SPACING.lg,
  },
  hotspotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
  },
  hotspotSummaryItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    alignItems: 'center',
  },
  hotspotIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  hotspotCount: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '900',
    marginBottom: SPACING.xs,
  },
  hotspotLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.lightTextMuted,
  },
  
  routesSection: {
    marginBottom: SPACING.lg,
  },
  routeStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  emptyRouteCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
  },
  emptyRouteText: {
    color: COLORS.lightTextSecondary,
    fontWeight: '600',
  },
  routeStatusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  routeStatusInfo: {
    flex: 1,
  },
  routeStatusName: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs / 2,
  },
  routeStatusDelay: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.lightTextMuted,
  },
  routeStatusBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  routeStatusLevel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '900',
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
  
  dataSourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: COLORS.accentYellow + '15',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.accentYellow + '30',
  },
  dataSourceInfo: {
    flex: 1,
  },
  dataSourceTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '900',
    color: COLORS.accentYellow,
    marginBottom: SPACING.xs / 2,
  },
  dataSourceText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.accentYellow,
    opacity: 0.8,
  },
  searchResult: {
    backgroundColor: COLORS.accentBlueSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  searchResultTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    flex: 1,
  },
  searchResultContent: {
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.lightBorder,
  },
  searchResultLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.xs,
  },
  searchResultValue: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '800',
    marginBottom: SPACING.xs,
  },
  searchResultDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    lineHeight: 18,
  },
});
