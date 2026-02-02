/**
 * NEXRYDE Voice Assistant UI Component
 * Floating voice button with Nigerian accent support
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Animated,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useVoiceAssistant, VoiceIntent } from '../services/voiceAssistant';

const { width, height } = Dimensions.get('window');

const COLORS = {
  primary: '#00D084',
  secondary: '#00B4D8',
  accent: '#FFB800',
  dark: '#1a1a1a',
  darkCard: '#2a2a2a',
  white: '#FFFFFF',
  textPrimary: '#FFFFFF',
  textSecondary: '#B0B0B0',
  error: '#FF6B6B',
  success: '#00D084',
};

interface VoiceAssistantButtonProps {
  onCommand?: (intent: VoiceIntent, params?: any) => void;
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  userType?: 'rider' | 'driver';
}

export const VoiceAssistantButton: React.FC<VoiceAssistantButtonProps> = ({
  onCommand,
  position = 'bottom-right',
  userType = 'rider',
}) => {
  const {
    isListening,
    isSpeaking,
    transcript,
    lastCommand,
    preferredLanguage,
    error,
    startListening,
    stopListening,
    testVoiceCommand,
    setPreferredLanguage,
  } = useVoiceAssistant();
  
  const [showModal, setShowModal] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const [waveAnim] = useState(new Animated.Value(0));
  
  // Pulse animation when listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);
  
  // Wave animation when speaking
  useEffect(() => {
    if (isSpeaking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(waveAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(waveAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      waveAnim.setValue(0);
    }
  }, [isSpeaking]);
  
  // Handle voice button press
  const handleVoicePress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
      setShowModal(true);
    }
  };
  
  // Test voice commands (for development)
  const handleTestCommand = async (text: string) => {
    const command = await testVoiceCommand(text);
    if (command && onCommand) {
      onCommand(command.intent, command.params);
    }
  };
  
  // Position styles
  const getPositionStyle = () => {
    const base = { position: 'absolute' as const, bottom: 100 };
    switch (position) {
      case 'bottom-center':
        return { ...base, alignSelf: 'center' };
      case 'bottom-left':
        return { ...base, left: 20 };
      case 'bottom-right':
      default:
        return { ...base, right: 20 };
    }
  };
  
  // Example commands based on user type
  const getExampleCommands = () => {
    if (userType === 'driver') {
      return [
        { text: 'Go online', pidgin: 'Go online' },
        { text: 'Accept ride', pidgin: 'Accept ride' },
        { text: 'How much I make today?', pidgin: 'How much I make today?' },
        { text: 'I wan rest small', pidgin: 'I wan rest small' },
        { text: 'Start trip', pidgin: 'Start trip' },
        { text: 'Complete trip', pidgin: 'Complete trip' },
      ];
    }
    return [
      { text: 'Book ride to Lekki', pidgin: 'I wan go Lekki' },
      { text: 'Where driver dey?', pidgin: 'Where driver dey?' },
      { text: 'How much be the price?', pidgin: 'How much be am?' },
      { text: 'Cancel this ride', pidgin: 'Cancel this ride' },
      { text: 'Share my location', pidgin: 'Share my location' },
      { text: 'Send SOS', pidgin: 'Send SOS sharp sharp' },
    ];
  };
  
  return (
    <>
      {/* Floating Voice Button */}
      <Animated.View style={[styles.floatingButton, getPositionStyle(), { transform: [{ scale: pulseAnim }] }]}>
        <TouchableOpacity onPress={handleVoicePress} activeOpacity={0.8}>
          <LinearGradient
            colors={isListening ? ['#FF6B00', '#FF0000'] : isSpeaking ? ['#00D084', '#00B4D8'] : ['#00B4D8', '#0096C7']}
            style={styles.voiceButton}
          >
            <Ionicons
              name={isListening ? 'mic' : isSpeaking ? 'volume-high' : 'mic-outline'}
              size={32}
              color={COLORS.white}
            />
          </LinearGradient>
        </TouchableOpacity>
        
        {/* Listening indicator */}
        {isListening && (
          <View style={styles.listeningDot}>
            <Animated.View
              style={[
                styles.listeningDotInner,
                {
                  opacity: pulseAnim.interpolate({
                    inputRange: [1, 1.3],
                    outputRange: [1, 0.3],
                  }),
                },
              ]}
            />
          </View>
        )}
      </Animated.View>
      
      {/* Voice Assistant Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <BlurView intensity={90} style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <Ionicons name="mic-circle" size={32} color={COLORS.primary} />
                <View style={styles.headerText}>
                  <Text style={styles.modalTitle}>🎤 Voice Assistant</Text>
                  <Text style={styles.modalSubtitle}>
                    {isListening ? '🔴 Listening...' : isSpeaking ? '🗣️ Speaking...' : 'Ready to help!'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeButton}>
                <Ionicons name="close-circle" size={32} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Status Card */}
              <View style={styles.statusCard}>
                <LinearGradient
                  colors={isListening ? ['#FF6B00', '#FF0000'] : isSpeaking ? ['#00D084', '#00B4D8'] : ['#2a2a2a', '#1a1a1a']}
                  style={styles.statusGradient}
                >
                  <Ionicons
                    name={isListening ? 'mic' : isSpeaking ? 'volume-high' : 'ear'}
                    size={64}
                    color={COLORS.white}
                  />
                  <Text style={styles.statusText}>
                    {isListening ? 'Listening...' : isSpeaking ? 'Speaking...' : 'Tap mic to start'}
                  </Text>
                  <Text style={styles.statusHint}>
                    {isListening ? 'Speak in English or Pidgin' : isSpeaking ? 'Please wait...' : 'Speak naturally!'}
                  </Text>
                </LinearGradient>
              </View>
              
              {/* Transcript */}
              {transcript && (
                <View style={styles.transcriptCard}>
                  <Text style={styles.transcriptLabel}>You said:</Text>
                  <Text style={styles.transcriptText}>"{transcript}"</Text>
                  {lastCommand && (
                    <View style={styles.intentBadge}>
                      <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
                      <Text style={styles.intentText}>
                        {lastCommand.intent.replace(/_/g, ' ')}
                      </Text>
                      <Text style={styles.confidenceText}>
                        {Math.round(lastCommand.confidence * 100)}% confident
                      </Text>
                    </View>
                  )}
                </View>
              )}
              
              {/* Error */}
              {error && (
                <View style={styles.errorCard}>
                  <Ionicons name="warning" size={20} color={COLORS.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              
              {/* Language Selector */}
              <View style={styles.languageCard}>
                <Text style={styles.sectionTitle}>🗣️ Voice Language</Text>
                <View style={styles.languageButtons}>
                  {[
                    { code: 'pcm', label: 'Pidgin', flag: '🇳🇬' },
                    { code: 'en', label: 'English', flag: '🇬🇧' },
                    { code: 'yo', label: 'Yoruba', flag: '🇳🇬' },
                  ].map((lang) => (
                    <TouchableOpacity
                      key={lang.code}
                      style={[
                        styles.langButton,
                        preferredLanguage === lang.code && styles.langButtonActive,
                      ]}
                      onPress={() => setPreferredLanguage(lang.code as any)}
                    >
                      <Text style={styles.langFlag}>{lang.flag}</Text>
                      <Text
                        style={[
                          styles.langLabel,
                          preferredLanguage === lang.code && styles.langLabelActive,
                        ]}
                      >
                        {lang.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              {/* Example Commands */}
              <View style={styles.examplesCard}>
                <Text style={styles.sectionTitle}>💡 Try saying:</Text>
                <Text style={styles.examplesHint}>
                  Tap any example to test it
                </Text>
                {getExampleCommands().map((example, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.exampleItem}
                    onPress={() => handleTestCommand(preferredLanguage === 'pcm' ? example.pidgin : example.text)}
                  >
                    <View style={styles.exampleLeft}>
                      <Ionicons name="chatbox-ellipses" size={20} color={COLORS.primary} />
                      <View style={styles.exampleText}>
                        <Text style={styles.exampleEnglish}>{example.text}</Text>
                        {preferredLanguage === 'pcm' && example.pidgin !== example.text && (
                          <Text style={styles.examplePidgin}>"{example.pidgin}"</Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="play-circle" size={24} color={COLORS.secondary} />
                  </TouchableOpacity>
                ))}
              </View>
              
              {/* Features */}
              <View style={styles.featuresCard}>
                <Text style={styles.sectionTitle}>✨ Features</Text>
                <View style={styles.featuresList}>
                  <View style={styles.featureItem}>
                    <Ionicons name="mic" size={20} color={COLORS.primary} />
                    <Text style={styles.featureText}>Nigerian accent recognition</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="language" size={20} color={COLORS.primary} />
                    <Text style={styles.featureText}>Pidgin, English, Yoruba support</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="flash" size={20} color={COLORS.primary} />
                    <Text style={styles.featureText}>Hands-free operation</Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="shield-checkmark" size={20} color={COLORS.primary} />
                    <Text style={styles.featureText}>Privacy protected</Text>
                  </View>
                </View>
              </View>
              
              {/* Main Voice Button */}
              <TouchableOpacity
                style={styles.mainVoiceButton}
                onPress={handleVoicePress}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={isListening ? ['#FF6B00', '#FF0000'] : ['#00B4D8', '#0096C7']}
                  style={styles.mainVoiceGradient}
                >
                  <Ionicons
                    name={isListening ? 'stop-circle' : 'mic-circle'}
                    size={32}
                    color={COLORS.white}
                  />
                  <Text style={styles.mainVoiceText}>
                    {isListening ? 'Stop Listening' : 'Start Voice Command'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </BlurView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  floatingButton: {
    zIndex: 1000,
    elevation: 10,
  },
  voiceButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  listeningDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF0000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listeningDotInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.dark,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.9,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: {
    gap: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    padding: 20,
  },
  statusCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  statusGradient: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    marginTop: 8,
  },
  statusHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  transcriptCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  transcriptLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  transcriptText: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,208,132,0.1)',
    padding: 8,
    borderRadius: 8,
  },
  intentText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    textTransform: 'capitalize',
    flex: 1,
  },
  confidenceText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,107,107,0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  errorText: {
    fontSize: 14,
    color: COLORS.error,
    flex: 1,
  },
  languageCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  langButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langButtonActive: {
    backgroundColor: 'rgba(0,180,216,0.2)',
    borderColor: COLORS.secondary,
  },
  langFlag: {
    fontSize: 20,
  },
  langLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  langLabelActive: {
    color: COLORS.secondary,
  },
  examplesCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  examplesHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  exampleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  exampleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  exampleText: {
    flex: 1,
    gap: 4,
  },
  exampleEnglish: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  examplePidgin: {
    fontSize: 12,
    color: COLORS.primary,
    fontStyle: 'italic',
  },
  featuresCard: {
    backgroundColor: COLORS.darkCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  mainVoiceButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  mainVoiceGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 18,
  },
  mainVoiceText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
});
