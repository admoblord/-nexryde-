import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function MoodPreferencesScreen() {
  const router = useRouter();
  const [selectedMood, setSelectedMood] = useState('any');
  const [selectedMusic, setSelectedMusic] = useState('any');
  const [selectedTemp, setSelectedTemp] = useState('any');
  const [selectedDrivingStyle, setSelectedDrivingStyle] = useState('any');
  const [allowCalls, setAllowCalls] = useState(true);
  const [allowEating, setAllowEating] = useState(true);

  const moods = [
    { id: 'chatty', label: 'Chatty', icon: 'chatbubbles', emoji: '😊' },
    { id: 'quiet', label: 'Quiet', icon: 'volume-mute', emoji: '🤫' },
    { id: 'professional', label: 'Professional', icon: 'briefcase', emoji: '💼' },
    { id: 'friendly', label: 'Friendly', icon: 'happy', emoji: '😄' },
    { id: 'any', label: 'Any Mood', icon: 'shuffle', emoji: '🎲' },
  ];

  const musicTypes = [
    { id: 'afrobeats', label: 'Afrobeats', emoji: '🎵' },
    { id: 'gospel', label: 'Gospel', emoji: '🙏' },
    { id: 'hiphop', label: 'Hip Hop', emoji: '🎤' },
    { id: 'jazz', label: 'Jazz', emoji: '🎷' },
    { id: 'no_music', label: 'No Music', emoji: '🔇' },
    { id: 'any', label: 'Any Music', emoji: '🎶' },
  ];

  const temps = [
    { id: 'cold', label: 'Cold AC', emoji: '❄️' },
    { id: 'moderate', label: 'Moderate', emoji: '🌤️' },
    { id: 'warm', label: 'Warm', emoji: '🌡️' },
    { id: 'any', label: 'Any Temp', emoji: '🎲' },
  ];

  const drivingStyles = [
    { id: 'smooth', label: 'Smooth', emoji: '🛣️' },
    { id: 'moderate', label: 'Moderate', emoji: '🚗' },
    { id: 'fast', label: 'Fast', emoji: '🏎️' },
    { id: 'any', label: 'Any Style', emoji: '🎲' },
  ];

  const handleSave = () => {
    // Save preferences (would call API here)
    Alert.alert('Success', 'Your ride preferences have been saved!');
    router.back();
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ride Preferences</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Info Card */}
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color={COLORS.accentBlue} />
            <Text style={styles.infoText}>
              Set your ride preferences to be matched with compatible drivers
            </Text>
          </View>

          {/* Mood Preference */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driver Mood</Text>
            <View style={styles.optionsGrid}>
              {moods.map((mood) => (
                <TouchableOpacity
                  key={mood.id}
                  style={[
                    styles.optionCard,
                    selectedMood === mood.id && styles.optionCardSelected,
                  ]}
                  onPress={() => setSelectedMood(mood.id)}
                >
                  <Text style={styles.optionEmoji}>{mood.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    selectedMood === mood.id && styles.optionLabelSelected,
                  ]}>
                    {mood.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Music Preference */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Music Type</Text>
            <View style={styles.optionsGrid}>
              {musicTypes.map((music) => (
                <TouchableOpacity
                  key={music.id}
                  style={[
                    styles.optionCard,
                    selectedMusic === music.id && styles.optionCardSelected,
                  ]}
                  onPress={() => setSelectedMusic(music.id)}
                >
                  <Text style={styles.optionEmoji}>{music.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    selectedMusic === music.id && styles.optionLabelSelected,
                  ]}>
                    {music.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Temperature Preference */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Temperature</Text>
            <View style={styles.optionsGrid}>
              {temps.map((temp) => (
                <TouchableOpacity
                  key={temp.id}
                  style={[
                    styles.optionCard,
                    selectedTemp === temp.id && styles.optionCardSelected,
                  ]}
                  onPress={() => setSelectedTemp(temp.id)}
                >
                  <Text style={styles.optionEmoji}>{temp.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    selectedTemp === temp.id && styles.optionLabelSelected,
                  ]}>
                    {temp.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Driving Style */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Driving Style</Text>
            <View style={styles.optionsGrid}>
              {drivingStyles.map((style) => (
                <TouchableOpacity
                  key={style.id}
                  style={[
                    styles.optionCard,
                    selectedDrivingStyle === style.id && styles.optionCardSelected,
                  ]}
                  onPress={() => setSelectedDrivingStyle(style.id)}
                >
                  <Text style={styles.optionEmoji}>{style.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    selectedDrivingStyle === style.id && styles.optionLabelSelected,
                  ]}>
                    {style.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Additional Preferences */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Preferences</Text>
            
            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Ionicons name="call" size={20} color={COLORS.gray700} />
                <Text style={styles.switchLabel}>Allow driver to take calls</Text>
              </View>
              <Switch
                value={allowCalls}
                onValueChange={setAllowCalls}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchLeft}>
                <Ionicons name="fast-food" size={20} color={COLORS.gray700} />
                <Text style={styles.switchLabel}>Allow eating/drinking</Text>
              </View>
              <Switch
                value={allowEating}
                onValueChange={setAllowEating}
                trackColor={{ false: COLORS.gray300, true: COLORS.accentGreen }}
                thumbColor={COLORS.white}
              />
            </View>
          </View>

          {/* Save Button */}
          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <LinearGradient
              colors={[COLORS.accentGreen, COLORS.accentBlue]}
              style={styles.saveGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.saveButtonText}>Save Preferences</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    borderBottomColor: COLORS.gray200,
  },
  backButton: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.gray900,
  },
  placeholder: {
    width: 40,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentBlueSoft,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    gap: SPACING.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentBlue,
    lineHeight: 20,
  },
  section: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.gray900,
    marginBottom: SPACING.md,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  optionCard: {
    width: '31%',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gray200,
  },
  optionCardSelected: {
    borderColor: COLORS.accentGreen,
    backgroundColor: COLORS.accentGreenSoft,
  },
  optionEmoji: {
    fontSize: 32,
    marginBottom: SPACING.xs,
  },
  optionLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    color: COLORS.gray700,
    textAlign: 'center',
  },
  optionLabelSelected: {
    color: COLORS.accentGreen,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.sm,
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  switchLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.gray700,
  },
  saveButton: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    marginBottom: SPACING.xxl,
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  saveGradient: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
