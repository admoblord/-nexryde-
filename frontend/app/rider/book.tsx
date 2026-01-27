import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function BookScreen() {
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
          <Text style={styles.headerTitle}>Set Pickup</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Progress Steps */}
          <View style={styles.progressContainer}>
            <View style={styles.progressStep}>
              <View style={[styles.stepCircle, styles.stepActive]}>
                <Text style={styles.stepNumber}>1</Text>
              </View>
              <View style={[styles.stepLine, styles.lineActive]} />
            </View>
            <View style={styles.progressStep}>
              <View style={styles.stepCircle}>
                <Text style={[styles.stepNumber, styles.stepNumberInactive]}>2</Text>
              </View>
              <View style={styles.stepLine} />
            </View>
            <View style={styles.progressStep}>
              <View style={styles.stepCircle}>
                <Text style={[styles.stepNumber, styles.stepNumberInactive]}>3</Text>
              </View>
            </View>
          </View>

          {/* Pickup Location Input */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>Pickup Location</Text>
            <View style={styles.inputContainer}>
              <View style={styles.inputDot} />
              <TextInput
                style={styles.textInput}
                placeholder="Enter pickup address"
                placeholderTextColor={COLORS.lightTextMuted}
              />
            </View>
          </View>

          {/* Suggestions */}
          <Text style={styles.sectionTitle}>Suggestions</Text>
          
          <TouchableOpacity style={styles.suggestionCard}>
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentGreenSoft }]}>
              <Ionicons name="navigate" size={20} color={COLORS.accentGreen} />
            </View>
            <View style={styles.suggestionContent}>
              <Text style={styles.suggestionTitle}>Current Location</Text>
              <Text style={styles.suggestionSubtitle}>Use GPS location</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.suggestionCard}>
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.accentBlueSoft }]}>
              <Ionicons name="home" size={20} color={COLORS.accentBlue} />
            </View>
            <View style={styles.suggestionContent}>
              <Text style={styles.suggestionTitle}>Home</Text>
              <Text style={styles.suggestionSubtitle}>Victoria Island, Lagos</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.suggestionCard}>
            <View style={[styles.suggestionIcon, { backgroundColor: COLORS.warningSoft }]}>
              <Ionicons name="briefcase" size={20} color={COLORS.warning} />
            </View>
            <View style={styles.suggestionContent}>
              <Text style={styles.suggestionTitle}>Work</Text>
              <Text style={styles.suggestionSubtitle}>Lekki Phase 1, Lagos</Text>
            </View>
          </TouchableOpacity>
        </ScrollView>

        {/* Bottom Button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity 
            style={styles.confirmButton}
            onPress={() => router.push('/rider/tracking')}
          >
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.confirmGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.confirmText}>Confirm Pickup</Text>
            </LinearGradient>
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
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.xxl,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xl,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.lightSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
  },
  stepActive: {
    backgroundColor: COLORS.accentGreen,
    borderColor: COLORS.accentGreen,
  },
  stepNumber: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
  stepNumberInactive: {
    color: COLORS.lightTextMuted,
  },
  stepLine: {
    width: 40,
    height: 3,
    backgroundColor: COLORS.lightBorder,
    marginHorizontal: 4,
  },
  lineActive: {
    backgroundColor: COLORS.accentGreen,
  },
  inputCard: {
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  inputDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accentGreen,
  },
  textInput: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    color: COLORS.lightTextPrimary,
    padding: 0,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextSecondary,
    marginBottom: SPACING.md,
  },
  suggestionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  suggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.lightTextPrimary,
  },
  suggestionSubtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.lightTextSecondary,
    marginTop: 2,
  },
  bottomContainer: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  confirmButton: {
    borderRadius: BORDER_RADIUS.xl,
    overflow: 'hidden',
    shadowColor: COLORS.accentGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  confirmGradient: {
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  confirmText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
