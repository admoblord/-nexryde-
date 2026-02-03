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
import { 
  useSpeechRecognitionEvent,
  ExpoSpeechRecognitionModule,
  AudioEncodingAndroid,
  AudioSourceAndroid,
} from 'expo-speech-recognition';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function VoiceBookingScreen() {
  const router = useRouter();
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-NG');
  const [parsedLocation, setParsedLocation] = useState({ pickup: '', destination: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const languages = [
    { id: 'en-NG', label: 'Nigerian English', flag: '🇳🇬', example: 'Take me to Ikorodu from Lekki' },
    { id: 'en-US', label: 'English', flag: '🌍', example: 'Book a ride to Victoria Island' },
  ];

  // Request permissions on mount
  useEffect(() => {
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (result.granted) {
        setPermissionGranted(true);
      } else {
        Alert.alert(
          'Microphone Permission Required',
          'Voice booking needs microphone access to work. Please enable it in settings.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Permission error:', error);
    }
  };

  // Listen for speech recognition events
  useSpeechRecognitionEvent('start', () => {
    console.log('Speech recognition started');
    setIsListening(true);
  });

  useSpeechRecognitionEvent('end', () => {
    console.log('Speech recognition ended');
    setIsListening(false);
  });

  useSpeechRecognitionEvent('result', (event) => {
    console.log('Speech result:', event.results[0]?.transcript);
    const transcript = event.results[0]?.transcript || '';
    if (transcript) {
      setRecognizedText(transcript);
      processVoiceCommand(transcript);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    console.error('Speech recognition error:', event.error);
    setIsListening(false);
    speakResponse('Sorry, I could not hear you clearly. Please try again.');
  });

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
      rate: 0.9,
    });
  };

  const startListening = async () => {
    if (!permissionGranted) {
      await requestPermissions();
      return;
    }

    setIsListening(true);
    setRecognizedText('');
    setParsedLocation({ pickup: '', destination: '' });

    // Provide audio feedback
    speakResponse('Yes, where do you want to go?');

    // Start recognition after speech finishes
    setTimeout(async () => {
      try {
        const result = await ExpoSpeechRecognitionModule.start({
          lang: selectedLanguage,
          interimResults: true,
          maxAlternatives: 1,
          continuous: false,
          requiresOnDeviceRecognition: false,
          addsPunctuation: false,
          contextualStrings: [
            // Nigerian cities for better recognition
            'Lekki', 'Ikorodu', 'Ikeja', 'Yaba', 'Surulere', 'Apapa',
            'Victoria Island', 'Ajah', 'Sangotedo', 'Festac', 'Oshodi',
            'Abuja', 'Wuse', 'Garki', 'Gwarimpa', 'Maitama',
            'Lagos', 'Kano', 'Port Harcourt', 'Ibadan', 'Enugu',
          ],
          ...(Platform.OS === 'android' && {
            androidIntentOptions: {
              EXTRA_LANGUAGE_MODEL: 'free_form',
              EXTRA_MAX_RESULTS: 5,
              EXTRA_PARTIAL_RESULTS: true,
            },
            androidRecognitionServicePackage: 'com.google.android.googlequicksearchbox',
          }),
        });
        
        console.log('Speech recognition started:', result);
      } catch (error) {
        console.error('Error starting recognition:', error);
        setIsListening(false);
        Alert.alert('Error', 'Could not start voice recognition. Please check microphone permission.');
      }
    }, 1500);
  };

  const stopListening = async () => {
    try {
      await ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (error) {
      console.error('Error stopping recognition:', error);
      setIsListening(false);
    }
  };

  const processVoiceCommand = async (text: string) => {
    setIsProcessing(true);
    
    try {
      console.log('Processing voice command:', text);
      
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
        console.log('Parsed result:', result);
        setParsedLocation(result);
        
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
            { 
              text: 'Try Again', 
              style: 'cancel', 
              onPress: () => {
                setRecognizedText('');
                setParsedLocation({ pickup: '', destination: '' });
                fadeAnim.setValue(0);
              }
            }
          ]
        );
      } else {
        const error = await response.json();
        speakResponse('Sorry, I could not understand. Please try again.');
        Alert.alert('Could Not Understand', error.detail || 'Please speak more clearly.');
      }
    } catch (error) {
      console.error('Error processing voice command:', error);
      speakResponse('Sorry, something went wrong. Please try again.');
      Alert.alert('Error', 'Could not process voice command. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmBooking = (pickup: string, destination: string) => {
    speakResponse('Perfect! Booking your ride now.');
    router.push({
      pathname: '/rider/book',
      params: { 
        voicePickup: pickup,
        voiceDestination: destination 
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#667eea', '#764ba2']} style={styles.gradient}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Text style={styles.title}>🎤 Voice Booking</Text>
            <Text style={styles.subtitle}>
              Say "Take me to [Location]" - Nigerian accent supported!
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
              <Text style={styles.exampleText}>
                "Take me to Ajah from Sangotedo"
              </Text>
              <Text style={styles.exampleText}>
                "I want to go to Ikorodu"
              </Text>
              <Text style={styles.exampleText}>
                "Book me go Lekki from Yaba"
              </Text>
              <Text style={styles.examplesSubtext}>
                Works with 600+ Nigerian locations!
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
                  disabled={isProcessing || !permissionGranted}
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
                {!permissionGranted ? 'Permission Required' : isProcessing ? 'Processing...' : isListening ? '🎤 Listening...' : 'Tap to Speak'}
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
              <Text style={styles.tipText}>• Speak clearly in a quiet environment</Text>
              <Text style={styles.tipText}>• Say EXACT location names (e.g., "Ajah", "Sangotedo")</Text>
              <Text style={styles.tipText}>• Use "from X to Y" or just "to Y"</Text>
              <Text style={styles.tipText}>• Works with 600+ Nigerian cities!</Text>
              <Text style={styles.tipText}>• Supports Pidgin: "I wan go Yaba"</Text>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  gradient: { flex: 1 },
  backButton: {
    position: 'absolute',
    top: 60,
    left: 20,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingTop: 100,
    paddingBottom: 40,
  },
  content: {
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  languageSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 32,
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 25,
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
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
  },
  examplesTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  exampleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  examplesSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
    marginTop: 8,
  },
  micContainer: {
    alignItems: 'center',
    marginVertical: 40,
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
    marginTop: 20,
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
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
    marginBottom: 16,
    lineHeight: 24,
  },
  parsedInfo: {
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 16,
    gap: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    borderRadius: 20,
    padding: 20,
  },
  tipsTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  tipText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 8,
    lineHeight: 20,
  },
});
