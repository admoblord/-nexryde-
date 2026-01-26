import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, SHADOWS, CURRENCY } from '@/src/constants/theme';
import { FallingRoses, RosePetalsStatic, RoseGlow, FloatingRoseBloom } from '@/src/components/FallingRoses';
import { useAppStore } from '@/src/store/appStore';

const { width } = Dimensions.get('window');

export default function LostFoundScreen() {
  const router = useRouter();
  const { user } = useAppStore();
  const [activeTab, setActiveTab] = useState<'report' | 'my-items'>('report');
  const [itemDescription, setItemDescription] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<string | null>(null);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [recentTrips, setRecentTrips] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Demo recent trips
    setRecentTrips([
      { id: 'trip1', date: '2 hours ago', pickup: 'Victoria Island', dropoff: 'Lekki Phase 1', driver: 'Ahmed B.' },
      { id: 'trip2', date: 'Yesterday', pickup: 'Ikeja', dropoff: 'Yaba', driver: 'Chukwu O.' },
      { id: 'trip3', date: '2 days ago', pickup: 'Surulere', dropoff: 'Marina', driver: 'Emeka K.' },
    ]);

    // Demo my items
    setMyItems([
      { id: 'item1', trip_id: 'trip1', item_description: 'Black leather wallet', status: 'found', created_at: '2 hours ago', driver_response: 'found' },
      { id: 'item2', trip_id: 'trip2', item_description: 'iPhone charger cable', status: 'reported', created_at: 'Yesterday' },
    ]);
  };

  const handleSubmitReport = async () => {
    if (!selectedTrip) {
      Alert.alert('Select Trip', 'Please select the trip where you lost the item');
      return;
    }
    if (!itemDescription.trim()) {
      Alert.alert('Description Required', 'Please describe the item you lost');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/lost-found/report?reporter_id=${user?.id || 'demo'}&reporter_role=rider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: selectedTrip,
          item_description: itemDescription,
        }),
      });

      if (response.ok) {
        Alert.alert(
          'Report Submitted! 🌹',
          'The driver has been notified. They will respond within 24 hours.',
          [{ text: 'OK', onPress: () => {
            setItemDescription('');
            setSelectedTrip(null);
            setActiveTab('my-items');
            fetchData();
          }}]
        );
      }
    } catch (error) {
      Alert.alert('Report Submitted!', 'The driver has been notified.');
      setActiveTab('my-items');
    }
    setLoading(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'found': return COLORS.success;
      case 'returned': return COLORS.info;
      case 'not_found': return COLORS.error;
      default: return COLORS.gold;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'found': return 'checkmark-circle';
      case 'returned': return 'gift';
      case 'not_found': return 'close-circle';
      default: return 'time';
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark, COLORS.primary]}
        style={StyleSheet.absoluteFillObject}
      />
      
      <RosePetalsStatic count={10} />
      <FallingRoses intensity="light" />
      <RoseGlow size={200} style={styles.glowTop} />
      
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={COLORS.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Lost & Found</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <LinearGradient
              colors={[COLORS.rosePetal3, COLORS.rosePetal5]}
              style={styles.heroIconGradient}
            >
              <Ionicons name="search" size={32} color={COLORS.white} />
            </LinearGradient>
          </View>
          <Text style={styles.heroTitle}>Lost Something?</Text>
          <Text style={styles.heroSubtitle}>We'll help you find it</Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'report' && styles.tabActive]}
            onPress={() => setActiveTab('report')}
          >
            <Ionicons 
              name="add-circle" 
              size={18} 
              color={activeTab === 'report' ? COLORS.primary : COLORS.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'report' && styles.tabTextActive]}>
              Report Item
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'my-items' && styles.tabActive]}
            onPress={() => setActiveTab('my-items')}
          >
            <Ionicons 
              name="list" 
              size={18} 
              color={activeTab === 'my-items' ? COLORS.primary : COLORS.textMuted} 
            />
            <Text style={[styles.tabText, activeTab === 'my-items' && styles.tabTextActive]}>
              My Reports ({myItems.length})
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          {activeTab === 'report' ? (
            <>
              {/* Select Trip */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Select the Trip</Text>
                <Text style={styles.sectionSubtitle}>Choose the ride where you lost the item</Text>
                
                <View style={styles.tripsList}>
                  {recentTrips.map((trip) => (
                    <TouchableOpacity
                      key={trip.id}
                      style={[styles.tripCard, selectedTrip === trip.id && styles.tripCardSelected]}
                      onPress={() => setSelectedTrip(trip.id)}
                    >
                      <View style={styles.tripLeft}>
                        <View style={[styles.tripIcon, selectedTrip === trip.id && styles.tripIconSelected]}>
                          <Ionicons 
                            name="car" 
                            size={20} 
                            color={selectedTrip === trip.id ? COLORS.primary : COLORS.textMuted} 
                          />
                        </View>
                        <View style={styles.tripInfo}>
                          <Text style={styles.tripRoute}>{trip.pickup} → {trip.dropoff}</Text>
                          <Text style={styles.tripMeta}>{trip.date} • {trip.driver}</Text>
                        </View>
                      </View>
                      <View style={[styles.radioOuter, selectedTrip === trip.id && styles.radioOuterSelected]}>
                        {selectedTrip === trip.id && <View style={styles.radioInner} />}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Describe Item */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Describe the Item</Text>
                <Text style={styles.sectionSubtitle}>Be as specific as possible</Text>
                
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g., Black leather wallet with initials 'AO'"
                    placeholderTextColor={COLORS.textMuted}
                    value={itemDescription}
                    onChangeText={setItemDescription}
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                </View>

                {/* Quick Tags */}
                <View style={styles.quickTags}>
                  {['Phone', 'Wallet', 'Keys', 'Bag', 'Charger', 'Umbrella'].map((tag) => (
                    <TouchableOpacity
                      key={tag}
                      style={styles.quickTag}
                      onPress={() => setItemDescription(prev => prev ? `${prev}, ${tag}` : tag)}
                    >
                      <Text style={styles.quickTagText}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, (!selectedTrip || !itemDescription.trim()) && styles.submitButtonDisabled]}
                onPress={handleSubmitReport}
                disabled={!selectedTrip || !itemDescription.trim() || loading}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={(selectedTrip && itemDescription.trim()) 
                    ? [COLORS.accent, COLORS.accentDark]
                    : [COLORS.gray700, COLORS.gray700]}
                  style={styles.submitGradient}
                >
                  <Ionicons 
                    name="send" 
                    size={20} 
                    color={(selectedTrip && itemDescription.trim()) ? COLORS.primary : COLORS.gray500} 
                  />
                  <Text style={[styles.submitText, (!selectedTrip || !itemDescription.trim()) && styles.submitTextDisabled]}>
                    {loading ? 'Submitting...' : 'Submit Report'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Info Card */}
              <View style={styles.infoCard}>
                <View style={styles.infoHeader}>
                  <View style={styles.infoPetal} />
                  <Text style={styles.infoTitle}>How it works</Text>
                  <View style={styles.infoPetal} />
                </View>
                <View style={styles.infoSteps}>
                  <InfoStep number={1} text="Submit your report" />
                  <InfoStep number={2} text="Driver gets notified immediately" />
                  <InfoStep number={3} text="Driver checks vehicle & responds" />
                  <InfoStep number={4} text="Coordinate return via in-app chat" />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* My Items List */}
              {myItems.length === 0 ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIcon}>
                    <Ionicons name="checkmark-circle" size={60} color={COLORS.success} />
                  </View>
                  <Text style={styles.emptyTitle}>No Lost Items</Text>
                  <Text style={styles.emptySubtitle}>You haven't reported any lost items</Text>
                </View>
              ) : (
                <View style={styles.itemsList}>
                  {myItems.map((item) => (
                    <View key={item.id} style={styles.itemCard}>
                      <LinearGradient
                        colors={[COLORS.surface, COLORS.surfaceLight]}
                        style={styles.itemGradient}
                      >
                        {/* Status Badge */}
                        <View style={[styles.statusBadge, { backgroundColor: `${getStatusColor(item.status)}20` }]}>
                          <Ionicons name={getStatusIcon(item.status)} size={14} color={getStatusColor(item.status)} />
                          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                            {item.status.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>

                        <View style={styles.itemContent}>
                          <View style={[styles.itemIcon, { backgroundColor: `${getStatusColor(item.status)}15` }]}>
                            <Ionicons name="cube" size={24} color={getStatusColor(item.status)} />
                          </View>
                          <View style={styles.itemInfo}>
                            <Text style={styles.itemDescription}>{item.item_description}</Text>
                            <Text style={styles.itemMeta}>Reported {item.created_at}</Text>
                          </View>
                        </View>

                        {item.status === 'found' && (
                          <TouchableOpacity style={styles.contactButton}>
                            <LinearGradient
                              colors={[COLORS.success, '#5A9B7C']}
                              style={styles.contactGradient}
                            >
                              <Ionicons name="chatbubble" size={16} color={COLORS.white} />
                              <Text style={styles.contactText}>Contact Driver</Text>
                            </LinearGradient>
                          </TouchableOpacity>
                        )}

                        {item.status === 'reported' && (
                          <View style={styles.pendingNote}>
                            <Ionicons name="time" size={14} color={COLORS.gold} />
                            <Text style={styles.pendingText}>Waiting for driver response...</Text>
                          </View>
                        )}
                      </LinearGradient>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const InfoStep = ({ number, text }: { number: number; text: string }) => (
  <View style={styles.infoStep}>
    <View style={styles.infoStepNumber}>
      <Text style={styles.infoStepNumberText}>{number}</Text>
    </View>
    <Text style={styles.infoStepText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  glowTop: {
    position: 'absolute',
    top: -80,
    right: -80,
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
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '800',
    color: COLORS.white,
  },
  headerRight: {
    width: 44,
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
  },
  heroIcon: {
    marginBottom: SPACING.md,
    ...SHADOWS.rose,
  },
  heroIconGradient: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: '800',
    color: COLORS.white,
  },
  heroSubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.xs,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.xs,
  },
  tabActive: {
    backgroundColor: COLORS.accent,
  },
  tabText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xs,
  },
  sectionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },
  tripsList: {
    gap: SPACING.sm,
  },
  tripCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tripCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentSoft,
  },
  tripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tripIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.gray800,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  tripIconSelected: {
    backgroundColor: COLORS.accent,
  },
  tripInfo: {
    flex: 1,
  },
  tripRoute: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  tripMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.gray600,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: COLORS.accent,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
  },
  inputContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  textInput: {
    fontSize: FONT_SIZE.md,
    color: COLORS.white,
    minHeight: 100,
  },
  quickTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  quickTag: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.gray700,
  },
  quickTagText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  submitButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    marginBottom: SPACING.xl,
    ...SHADOWS.rose,
  },
  submitButtonDisabled: {
    ...SHADOWS.sm,
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    gap: SPACING.sm,
  },
  submitText: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.primary,
  },
  submitTextDisabled: {
    color: COLORS.gray500,
  },
  infoCard: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  infoPetal: {
    width: 10,
    height: 12,
    backgroundColor: COLORS.rosePetal3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 10,
    transform: [{ rotate: '-45deg' }],
    opacity: 0.7,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.accent,
  },
  infoSteps: {
    gap: SPACING.sm,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  infoStepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoStepNumberText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.primary,
  },
  infoStepText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.accent,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xxl,
  },
  emptyIcon: {
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: '700',
    color: COLORS.white,
  },
  emptySubtitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
  },
  itemsList: {
    gap: SPACING.md,
  },
  itemCard: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.md,
  },
  itemGradient: {
    padding: SPACING.lg,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.full,
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  statusText: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  itemInfo: {
    flex: 1,
  },
  itemDescription: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.white,
  },
  itemMeta: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  contactButton: {
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
    marginTop: SPACING.md,
  },
  contactGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  contactText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.white,
  },
  pendingNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    gap: SPACING.xs,
  },
  pendingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gold,
  },
  bottomSpacer: {
    height: 40,
  },
});
