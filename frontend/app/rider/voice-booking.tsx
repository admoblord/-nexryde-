import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function VoiceBookingScreen() {
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('pidgin');
  const pulseAnim = new Animated.Value(1);

  const languages = [
    { id: 'pidgin', label: 'Pidgin', flag: '🇳🇬', example: 'Book me go Lekki' },
    { id: 'yoruba', label: 'Yorùbá', flag: '🟢', example: 'Mo fẹ́ lọ sí Ikeja' },
    { id: 'igbo', label: 'Igbo', flag: '🔴', example: 'Biko kpọọrọ m gaa VI' },
    { id: 'hausa', label: 'Hausa', flag: '🟡', example: 'Ina so in tafi Apapa' },
    { id: 'english', label: 'English', flag: '🌍', example: 'Book a ride to Yaba' },
  ];

  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  const startListening = () => {
    setIsListening(true);
    setRecognizedText('');
    
    // Simulate voice recognition
    setTimeout(() => {
      const lang = languages.find(l => l.id === selectedLanguage);
      setRecognizedText(lang?.example || 'Book me go Lekki');
      setIsListening(false);
      
      Alert.alert(
        '🎤 Voice Recognized!',
        `"${lang?.example}"\n\nBooking ride to Lekki...`,
        [
          { text: 'Confirm', onPress: () => router.push('/rider/tracking') },
          { text: 'Try Again', style: 'cancel' }
        ]
      );
    }, 3000);
  };

  const stopListening = () => {
    setIsListening(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>🎤 Voice Booking</Text>
          <Text style={styles.subtitle}>
            Book rides in your language - Pidgin, Yoruba, Igbo, Hausa!
          </Text>

          {/* Language Selector */}
          <View style={styles.languageSelector}>
            {languages.map((lang) => (
              <TouchableOpacity
                key={lang.id}
                style={[
                  styles.languageButton,
                  selectedLanguage === lang.id && styles.languageButtonSelected
                ]}
                onPress={() => setSelectedLanguage(lang.id)}
              >
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <Text style={[
                  styles.languageLabel,
                  selectedLanguage === lang.id && styles.languageLabelSelected
                ]}>{lang.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Microphone Button */}
          <View style={styles.micContainer}>
            <Animated.View style={[styles.pulseRing, { transform: [{ scale: pulseAnim }] }]} />
            <TouchableOpacity
              style={[styles.micButton, isListening && styles.micButtonActive]}
              onPressIn={startListening}
              onPressOut={stopListening}
            >
              <Ionicons 
                name={isListening ? 'mic' : 'mic-outline'} 
                size={48} 
                color={COLORS.white} 
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.instruction}>
            {isListening 
              ? '🎙️ Listening... Speak now!'
              : 'Hold the button and speak'}
          </Text>

          {/* Example Phrases */}
          <View style={styles.examplesCard}>
            <Text style={styles.examplesTitle}>💬 Example Commands</Text>
            {languages.map((lang) => (
              <View key={lang.id} style={styles.exampleRow}>
                <Text style={styles.exampleFlag}>{lang.flag}</Text>
                <Text style={styles.exampleText}>"{lang.example}"</Text>
              </View>
            ))}
          </View>

          {/* Recognized Text */}
          {recognizedText && (
            <View style={styles.recognizedCard}>
              <Ionicons name="checkmark-circle" size={24} color={COLORS.accentGreen} />
              <Text style={styles.recognizedText}>{recognizedText}</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  backButton: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.lg,
    zIndex: 10,
    padding: SPACING.sm,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: SPACING.xl,
    paddingTop: SPACING.xxl * 2,
  },
  title: {
    fontSize: FONT_SIZE.xxl + 4,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZE.md,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  languageSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xxl,
  },
  languageButton: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  languageButtonSelected: {
    backgroundColor: COLORS.white,
  },
  languageFlag: { fontSize: 20 },
  languageLabel: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.white,
    marginTop: 2,
  },
  languageLabelSelected: {
    color: COLORS.primary,
  },
  micContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  pulseRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  micButton: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: COLORS.white,
  },
  micButtonActive: {
    backgroundColor: COLORS.error,
    borderColor: '#ff6b6b',
  },
  instruction: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: SPACING.xl,
  },
  examplesCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
  },
  examplesTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '900',
    color: COLORS.white,
    marginBottom: SPACING.md,
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  exampleFlag: { fontSize: 16 },
  exampleText: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.9)',
    fontStyle: 'italic',
  },
  recognizedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: 'rgba(0,255,136,0.2)',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.full,
    marginTop: SPACING.lg,
  },
  recognizedText: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.white,
  },
});
