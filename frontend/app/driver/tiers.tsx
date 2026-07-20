import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function SubscriptionTiersScreen() {
  const router = useRouter();

  const handleSubscribe = (tier: string) => {
    router.push({
      pathname: '/driver/subscription',
      params: { tier },
    });
  };

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
          <Text style={styles.headerTitle}>Subscription Plans</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Intra-City Plan (Dynamic Intro Pricing) */}
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <View style={[styles.planIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
                <Ionicons name="location" size={32} color={COLORS.accentGreen} />
              </View>
              <View style={styles.earlyAdopterBadge}>
                <Text style={styles.earlyAdopterText}>EARLY ADOPTER PRICE</Text>
              </View>
            </View>

            <Text style={styles.planName}>Intra-City Plan</Text>
            <Text style={styles.planDesc}>Operate within any single city in Nigeria</Text>

            <View style={styles.priceSection}>
              <Text style={styles.priceOld}>₦18,000</Text>
              <Text style={styles.priceNew}>₦15,000</Text>
              <Text style={styles.priceUnit}>/month</Text>
            </View>

            <View style={styles.savingsCard}>
              <Ionicons name="trending-down" size={20} color={COLORS.accentGreen} />
              <Text style={styles.savingsText}>First 500 drivers: ₦15,000, then ₦18,000.</Text>
            </View>

            <View style={styles.benefitsSection}>
              <Text style={styles.benefitsTitle}>What's Included:</Text>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.benefitText}>Drive in ANY city in Nigeria</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.benefitText}>Lagos → Lagos ✅</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.benefitText}>Abuja → Abuja ✅</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.benefitText}>Port Harcourt → PH ✅</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.benefitText}>Keep 100% of your earnings</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentGreen} />
                <Text style={styles.benefitText}>Premium driver tools</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="close-circle" size={20} color={COLORS.lightTextMuted} />
                <Text style={[styles.benefitText, { color: COLORS.lightTextMuted }]}>
                  State-to-state trips locked
                </Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.subscribeButton}
              onPress={() => handleSubscribe('city_rider')}
            >
              <Text style={styles.subscribeText}>Subscribe Now - From ₦15,000</Text>
            </TouchableOpacity>
          </View>

          {/* Warrior Pack (₦30,000) */}
          <View style={[styles.planCard, styles.planCardFeatured]}>
            <View style={styles.featuredBadge}>
              <Text style={styles.featuredText}>✨ MOST POPULAR</Text>
            </View>

            <View style={styles.planHeader}>
              <View style={[styles.planIcon, { backgroundColor: '#FFD700' + '30' }]}>
                <Ionicons name="rocket" size={32} color="#FFD700" />
              </View>
              <View style={[styles.earlyAdopterBadge, { backgroundColor: '#FFD700' }]}>
                <Text style={[styles.earlyAdopterText, { color: COLORS.background }]}>
                  EARLY ADOPTER PRICE
                </Text>
              </View>
            </View>

            <Text style={styles.planName}>Road Warrior Pack</Text>
            <Text style={styles.planDesc}>Drive ANYWHERE in Nigeria - Inter-State Unlocked!</Text>

            <View style={styles.priceSection}>
              <Text style={styles.priceOld}>₦45,000</Text>
              <Text style={[styles.priceNew, { color: '#FFD700' }]}>₦30,000</Text>
              <Text style={styles.priceUnit}>/month</Text>
            </View>

            <View style={[styles.savingsCard, { backgroundColor: '#FFD700' + '20' }]}>
              <Ionicons name="trending-down" size={20} color="#FFD700" />
              <Text style={[styles.savingsText, { color: '#FFD700' }]}>
                Save ₦15,000 with current introductory pricing!
              </Text>
            </View>

            <View style={styles.benefitsSection}>
              <Text style={styles.benefitsTitle}>Everything in Intra-City, PLUS:</Text>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                <Text style={styles.benefitText}>🔓 Lagos → Ibadan UNLOCKED</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                <Text style={styles.benefitText}>🔓 Lagos → Abuja UNLOCKED</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                <Text style={styles.benefitText}>🔓 ALL STATE-TO-STATE trips</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                <Text style={styles.benefitText}>Higher earning potential</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                <Text style={styles.benefitText}>Priority support</Text>
              </View>
              
              <View style={styles.benefit}>
                <Ionicons name="checkmark-circle" size={20} color="#FFD700" />
                <Text style={styles.benefitText}>Warrior badge in app</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={[styles.subscribeButton, styles.subscribeButtonFeatured]}
              onPress={() => handleSubscribe('road_warrior')}
            >
              <LinearGradient
                colors={['#FFD700', '#FFA500']}
                style={styles.subscribeGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={[styles.subscribeText, { color: COLORS.background }]}>
                  Upgrade to Warrior - ₦30,000
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Comparison Note */}
          <View style={styles.noteCard}>
            <Ionicons name="information-circle" size={24} color={COLORS.accentBlue} />
            <Text style={styles.noteText}>
              💡 All plans: Keep 100% of earnings • No commission fees • Cancel anytime
            </Text>
          </View>
        </ScrollView>
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
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
  },
  placeholder: {
    width: 40,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  planCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    position: 'relative',
  },
  planCardFeatured: {
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  planIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  earlyAdopterBadge: {
    backgroundColor: COLORS.accentGreen,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.md,
  },
  earlyAdopterText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.xs,
  },
  planDesc: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.lg,
  },
  priceSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.md,
  },
  priceOld: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextMuted,
    textDecorationLine: 'line-through',
    marginRight: SPACING.xs,
  },
  priceNew: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.accentGreen,
  },
  priceUnit: {
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextSecondary,
    marginLeft: 4,
  },
  savingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentGreenSoft,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.lg,
    gap: SPACING.xs,
  },
  savingsText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
    color: COLORS.accentGreen,
  },
  benefitsSection: {
    marginBottom: SPACING.lg,
  },
  benefitsTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.lightTextPrimary,
    marginBottom: SPACING.md,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  benefitText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextPrimary,
  },
  subscribeButton: {
    borderRadius: BORDER_RADIUS.xl,
    backgroundColor: COLORS.accentGreen,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  subscribeButtonFeatured: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  subscribeGradient: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    width: '100%',
    alignItems: 'center',
  },
  subscribeText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '800',
    color: COLORS.white,
  },
  featuredBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: '#FFD700',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderTopRightRadius: BORDER_RADIUS.xl,
    borderBottomLeftRadius: BORDER_RADIUS.lg,
    zIndex: 10,
  },
  featuredText: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.background,
    letterSpacing: 0.5,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  noteText: {
    flex: 1,
    fontSize: FONT_SIZE.xs,
    color: COLORS.lightTextSecondary,
    lineHeight: 18,
  },
});
