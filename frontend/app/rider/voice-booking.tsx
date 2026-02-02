import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function VoiceBookingScreen() {
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-NG'); // Nigerian English
  const [parsedLocation, setParsedLocation] = useState({ pickup: '', destination: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Recognition instance for web
  const recognitionRef = useRef<any>(null);

  const languages = [
    { id: 'en-NG', label: 'Nigerian English', flag: '🇳🇬', example: 'Take me to Ikorodu from Lekki' },
    { id: 'en-US', label: 'English', flag: '🌍', example: 'Book a ride to Victoria Island' },
    { id: 'pcm', label: 'Pidgin', flag: '🇳🇬', example: 'I wan go Yaba from VI' },
  ];

  useEffect(() => {
    // Initialize Web Speech API for web platform
    if (Platform.OS === 'web' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = selectedLanguage;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setRecognizedText(transcript);
        setIsListening(false);
        processVoiceCommand(transcript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        speakResponse('Sorry, I could not hear you. Please try again.');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [selectedLanguage]);

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

  useEffect(() => {
    if (recognizedText) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [recognizedText]);

  const speakResponse = (text: string) => {
    Speech.speak(text, {
      language: selectedLanguage,
      pitch: 1.0,
      rate: 0.9, // Slightly slower for clarity
    });
  };

  const startListening = () => {
    setIsListening(true);
    setRecognizedText('');
    setParsedLocation({ pickup: '', destination: '' });

    // Provide audio feedback
    speakResponse('Yes, where do you want to go?');

    // Start recognition after speech finishes
    setTimeout(() => {
      if (Platform.OS === 'web' && recognitionRef.current) {
        try {
          recognitionRef.current.lang = selectedLanguage;
          recognitionRef.current.start();
        } catch (error) {
          console.error('Error starting recognition:', error);
          setIsListening(false);
          Alert.alert('Error', 'Could not start voice recognition. Please try again.');
        }
      } else {
        // For mobile (Expo Go), we'll simulate until proper library is configured
        simulateVoiceRecognition();
      }
    }, 1500);
  };

  // Simulate voice recognition for mobile (until proper setup)
  const simulateVoiceRecognition = () => {
    setTimeout(() => {
      const examples = [
        'Take me to Ikorodu from Lekki',
        'I want to go to Victoria Island',
        'Book me go Yaba from Ikeja',
        'I wan reach Surulere from Apapa',
      ];
      const randomExample = examples[Math.floor(Math.random() * examples.length)];
      setRecognizedText(randomExample);
      setIsListening(false);
      processVoiceCommand(randomExample);
    }, 3000);
  };

  const processVoiceCommand = async (text: string) => {
    setIsProcessing(true);
    
    try {
      // Call backend to parse the voice command
      const response = await fetch(`${BACKEND_URL}/api/voice/parse-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          language: selectedLanguage,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setParsedLocation(result);
        
        // Provide confirmation
        const confirmMessage = `Okay, booking ride from ${result.pickup} to ${result.destination}. Is this correct?`;
        speakResponse(confirmMessage);
        
        Alert.alert(
          '🎤 Voice Command Understood!',
          `Pickup: ${result.pickup}\nDestination: ${result.destination}`,
          [
            { 
              text: 'Confirm & Book', 
              onPress: () => confirmBooking(result.pickup, result.destination)
            },
            { text: 'Try Again', style: 'cancel', onPress: () => {
              setRecognizedText('');
              setParsedLocation({ pickup: '', destination: '' });
            }}
          ]
        );
      } else {
        speakResponse('Sorry, I could not understand your destination. Please try again.');
        Alert.alert('Error', 'Could not parse voice command. Please try again with clearer pronunciation.');
      }
    } catch (error) {
      console.error('Error processing voice command:', error);
      speakResponse('Sorry, something went wrong. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmBooking = (pickup: string, destination: string) => {
    speakResponse('Perfect! Booking your ride now.');
    // Navigate to tracking with the locations
    router.push({
      pathname: '/rider/tracking',
      params: { pickup, destination }
    });
  };

  const stopListening = () => {
    setIsListening(false);
    if (Platform.OS === 'web' && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text style={styles.title}>🎤 Voice Booking</Text>
            <Text style={styles.subtitle}>
              Book rides with your voice - Nigerian accent supported!
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
                  disabled={isListening}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text style={[
                    styles.languageLabel,
                    selectedLanguage === lang.id && styles.languageLabelSelected
                  ]}>
                    {lang.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Example Phrases */}
            <View style={styles.examplesCard}>
              <Text style={styles.examplesTitle}>📢 Say something like:</Text>
              {languages.find(l => l.id === selectedLanguage)?.example && (
                <Text style={styles.exampleText}>
                  "{languages.find(l => l.id === selectedLanguage)?.example}"
                </Text>
              )}
              <Text style={styles.examplesSubtext}>
                Or just say: "Take me to [Location]" or "I want to go to [Place]"
              </Text>
            </View>

            {/* Microphone Button */}
            <View style={styles.micContainer}>
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <TouchableOpacity
                  style={[
                    styles.micButton,
                    isListening && styles.micButtonActive
                  ]}
                  onPress={isListening ? stopListening : startListening}
                  disabled={isProcessing}
                >
                  <LinearGradient
                    colors={isListening ? ['#ef4444', '#dc2626'] : ['#10b981', '#059669']}
                    style={styles.micGradient}
                  >
                    {isProcessing ? (
                      <Ionicons name="sync" size={60} color="#fff" />
                    ) : (
                      <Ionicons 
                        name={isListening ? 'stop' : 'mic'} 
                        size={60} 
                        color="#fff" 
                      />
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </Animated.View>
              
              <Text style={styles.micStatus}>
                {isProcessing ? 'Processing...' : isListening ? 'Listening...' : 'Tap to Speak'}
              </Text>
            </View>

            {/* Recognized Text Display */}
            {recognizedText && (
              <Animated.View style={[styles.resultCard, { opacity: fadeAnim }]}>
                <View style={styles.resultHeader}>
                  <Ionicons name="chatbubble-ellipses" size={24} color="#10b981" />
                  <Text style={styles.resultTitle}>You said:</Text>
                </View>
                <Text style={styles.resultText}>"{recognizedText}"</Text>
                
                {parsedLocation.pickup && parsedLocation.destination && (
                  <View style={styles.parsedInfo}>
                    <View style={styles.locationRow}>
                      <Ionicons name="location" size={20} color="#10b981" />
                      <Text style={styles.locationLabel}>Pickup:</Text>
                      <Text style={styles.locationValue}>{parsedLocation.pickup}</Text>
                    </View>
                    <View style={styles.locationRow}>
                      <Ionicons name="navigate" size={20} color="#ef4444" />
                      <Text style={styles.locationLabel}>Destination:</Text>
                      <Text style={styles.locationValue}>{parsedLocation.destination}</Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            )}

            {/* Tips */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Tips for Best Results:</Text>
              <Text style={styles.tipText}>• Speak clearly and naturally</Text>
              <Text style={styles.tipText}>• Mention both pickup and destination</Text>
              <Text style={styles.tipText}>• Use familiar Nigerian location names</Text>
              <Text style={styles.tipText}>• Works with Pidgin, Yoruba accent, Igbo accent, Hausa accent!</Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: SPACING.xl,
    left: SPACING.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: SPACING.xxl + 40,
    paddingBottom: SPACING.xxl,
  },
  content: {
    paddingHorizontal: SPACING.lg,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: SPACING.xl,
    lineHeight: 24,
  },
  languageSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    gap: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  languageButtonSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderColor: '#fff',
  },
  languageFlag: {
    fontSize: 20,
  },
  languageLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  languageLabelSelected: {
    color: '#fff',
  },
  examplesCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  examplesTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: SPACING.sm,
  },
  exampleText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },
  examplesSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  micContainer: {
    alignItems: 'center',
    marginVertical: SPACING.xxl,
  },
  micButton: {
    width: 160,
    height: 160,
    borderRadius: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  micButtonActive: {
    shadowColor: '#ef4444',
    shadowOpacity: 0.5,
  },
  micGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micStatus: {
    marginTop: SPACING.lg,
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a1a2e',
  },
  resultText: {
    fontSize: 16,
    color: '#374151',
    fontStyle: 'italic',
    marginBottom: SPACING.md,
    lineHeight: 24,
  },
  parsedInfo: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  locationLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6b7280',
    minWidth: 90,
  },
  locationValue: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a2e',
  },
  tipsCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: SPACING.sm,
  },
  tipText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 6,
    lineHeight: 20,
  },
});
