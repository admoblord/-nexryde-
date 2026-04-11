import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Linking, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (_name: string, _cb: any) => {};
try {
  const speechMod = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechMod.ExpoSpeechRecognitionModule || null;
  useSpeechRecognitionEvent = speechMod.useSpeechRecognitionEvent || ((_n: string, _c: any) => {});
} catch {}
import { askSupportVoiceBot, reportTripIssue } from '@/src/services/api';
import { useAppStore } from '@/src/store/appStore';

function SupportVoiceHandler({
  onListeningStart,
  onListeningEnd,
  onError,
  onResult,
}: {
  onListeningStart: () => void;
  onListeningEnd: () => void;
  onError: (msg: string) => void;
  onResult: (transcript: string) => void;
}) {
  try {
    useSpeechRecognitionEvent('start', () => onListeningStart());
    useSpeechRecognitionEvent('end', () => onListeningEnd());
    useSpeechRecognitionEvent('error', (event: any) => {
      onError(event?.message || 'Unable to capture voice right now.');
    });
    useSpeechRecognitionEvent('result', (event: any) => {
      if (!event?.isFinal) return;
      const transcript = event?.results?.[0]?.transcript?.trim();
      if (transcript) onResult(transcript);
    });
  } catch {
    // Native speech module unavailable
  }
  return null;
}

class SupportVoiceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? null : this.props.children; }
}

type BotMessage = {
  id: string;
  role: 'user' | 'bot';
  text: string;
};

export default function SupportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, currentTrip } = useAppStore();
  const [message, setMessage] = useState('');
  const [issueCategory, setIssueCategory] = useState<'safety' | 'fare' | 'behavior' | 'route' | 'payment' | 'general'>('general');
  const [issueText, setIssueText] = useState('');
  const [reportingIssue, setReportingIssue] = useState(false);
  const [messages, setMessages] = useState<BotMessage[]>([
    {
      id: 'welcome',
      role: 'bot',
      text: 'Support Assistant is live. Ask in English or Pidgin (voice/text) for fast help.',
    },
  ]);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);

  const contactOptions = [
    { icon: 'call', label: 'Call Support', value: '+234 810 889 9392', action: () => Linking.openURL('tel:+2348108899392') },
    { icon: 'mail', label: 'Email Us', value: 'support@nexryde.com', action: () => Linking.openURL('mailto:support@nexryde.com') },
  ];

  const quickPrompts = useMemo(
    () => [
      'Driver stopped and I feel unsafe',
      'OTP not coming to my phone',
      'I was charged wrongly for a trip',
      'How do I report an emergency?',
    ],
    []
  );
  const prefilledTripId = (params.tripId as string) || currentTrip?.id || '';

  const sendToBot = async (text: string) => {
    const cleaned = text.trim();
    if (!cleaned || sending) return;

    const userMsg: BotMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: cleaned,
    };
    setMessages((prev) => [...prev, userMsg]);
    setMessage('');
    setSending(true);

    try {
      const res = await askSupportVoiceBot({
        message: cleaned,
        user_id: user?.id,
        trip_id: currentTrip?.id,
        language: 'auto',
      });
      const data = res.data || {};
      const botText =
        data.response ||
        'I could not complete that request right now. Please try again or call support.';
      const botMsg: BotMessage = {
        id: `b-${Date.now()}`,
        role: 'bot',
        text: botText,
      };
      setMessages((prev) => [...prev, botMsg]);
      if (data.escalate) {
        Alert.alert(
          'Emergency Guidance',
          'Please trigger SOS from the Safety screen now or call support immediately.'
        );
      }
    } catch (error: any) {
      const errorMsg: BotMessage = {
        id: `b-err-${Date.now()}`,
        role: 'bot',
        text: error?.response?.data?.detail || 'Support service is temporarily unavailable.',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const [voiceActive, setVoiceActive] = useState(false);

  const startVoiceSupport = async () => {
    try {
      if (
        !ExpoSpeechRecognitionModule ||
        typeof ExpoSpeechRecognitionModule.requestPermissionsAsync !== 'function' ||
        typeof ExpoSpeechRecognitionModule.start !== 'function'
      ) {
        Alert.alert('Not Available', 'Voice recognition is not available on this device.');
        return;
      }
      setVoiceActive(true);
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed for voice support.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-NG',
        interimResults: true,
        maxAlternatives: 2,
        continuous: false,
        contextualStrings: [
          'abeg help me',
          'driver stop',
          'otp no come',
          'payment issue',
          'refund',
          'emergency',
          'safety',
          'trip',
        ],
      });
    } catch (e: any) {
      Alert.alert('Voice Error', e?.message || 'Could not start voice support.');
    }
  };

  const submitIssueReport = async () => {
    if (!user?.id) {
      Alert.alert('Login required', 'Please login and try again.');
      return;
    }
    if (!prefilledTripId) {
      Alert.alert('Trip required', 'Open support from an active/completed trip to report issue.');
      return;
    }
    if (!issueText.trim()) {
      Alert.alert('Describe issue', 'Please describe what happened.');
      return;
    }
    setReportingIssue(true);
    try {
      const role = user.role === 'driver' ? 'driver' : 'rider';
      const res = await reportTripIssue({
        trip_id: prefilledTripId,
        user_id: user.id,
        role,
        category: issueCategory,
        description: issueText.trim(),
      });
      if (res.data?.success) {
        Alert.alert('Reported', 'Issue submitted. Support now has your full trip context.');
        setIssueText('');
      } else {
        Alert.alert('Error', 'Could not submit issue report.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.detail || 'Could not submit issue report.');
    } finally {
      setReportingIssue(false);
    }
  };

  return (
    <View style={styles.container}>
      {voiceActive && (
        <SupportVoiceErrorBoundary>
          <SupportVoiceHandler
            onListeningStart={() => setListening(true)}
            onListeningEnd={() => setListening(false)}
            onError={(msg) => { setListening(false); Alert.alert('Voice Error', msg); }}
            onResult={(transcript) => sendToBot(transcript)}
          />
        </SupportVoiceErrorBoundary>
      )}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.gray900} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Help & Support</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          {contactOptions.map((option, index) => (
            <TouchableOpacity key={index} style={styles.contactCard} onPress={option.action}>
              <View style={styles.contactIcon}>
                <Ionicons name={option.icon} size={24} color={COLORS.accentGreen} />
              </View>
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>{option.label}</Text>
                <Text style={styles.contactValue}>{option.value}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.contactCard}
            onPress={() =>
              router.push({
                pathname: '/shield-disputes',
                params: prefilledTripId ? { tripId: prefilledTripId } : {},
              })
            }
          >
            <View style={styles.contactIcon}>
              <Ionicons name="shield-checkmark" size={24} color={COLORS.accentGreen} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactLabel}>NEXRYDE Shield — Disputes</Text>
              <Text style={styles.contactValue}>Fair process: both sides heard before any action</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.gray400} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Support Voice Bot (Pidgin + English)</Text>
          <View style={styles.messageCard}>
            <View style={styles.quickPromptWrap}>
              {quickPrompts.map((prompt) => (
                <TouchableOpacity key={prompt} style={styles.quickPrompt} onPress={() => sendToBot(prompt)}>
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.chatBox}>
              {messages.map((m) => (
                <View
                  key={m.id}
                  style={[styles.bubble, m.role === 'user' ? styles.userBubble : styles.botBubble]}
                >
                  <Text style={[styles.bubbleText, m.role === 'user' && styles.userBubbleText]}>{m.text}</Text>
                </View>
              ))}
              {sending && (
                <View style={[styles.bubble, styles.botBubble]}>
                  <ActivityIndicator size="small" color={COLORS.accentGreen} />
                </View>
              )}
            </View>
          </View>

          <Text style={styles.sectionTitle}>Send Message / Voice</Text>
          <View style={styles.messageCard}>
            <TextInput
              style={styles.messageInput}
              placeholder="Talk or type your issue..."
              placeholderTextColor={COLORS.gray400}
              multiline
              numberOfLines={4}
              value={message}
              onChangeText={setMessage}
            />
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.voiceButton, listening && styles.voiceButtonActive]}
                onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : startVoiceSupport}
              >
                <Ionicons name={listening ? 'mic' : 'mic-outline'} size={18} color={COLORS.white} />
                <Text style={styles.voiceButtonText}>{listening ? 'Listening...' : 'Voice'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={() => sendToBot(message)} disabled={sending}>
                <Text style={styles.sendButtonText}>Send to Bot</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Report Trip Issue</Text>
          <View style={styles.messageCard}>
            <Text style={styles.issueMeta}>
              Trip: {prefilledTripId || 'No trip selected'}
            </Text>
            <View style={styles.quickPromptWrap}>
              {(['safety', 'fare', 'behavior', 'route', 'payment', 'general'] as const).map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.quickPrompt, issueCategory === cat && styles.selectedCategory]}
                  onPress={() => setIssueCategory(cat)}
                >
                  <Text style={[styles.quickPromptText, issueCategory === cat && styles.selectedCategoryText]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.messageInput}
              placeholder="Describe issue with this trip..."
              placeholderTextColor={COLORS.gray400}
              multiline
              numberOfLines={4}
              value={issueText}
              onChangeText={setIssueText}
            />
            <TouchableOpacity style={styles.sendButton} onPress={submitIssueReport} disabled={reportingIssue}>
              <Text style={styles.sendButtonText}>{reportingIssue ? 'Submitting...' : 'Submit Issue Report'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  safeArea: { flex: 1 },
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
  backButton: { padding: SPACING.xs },
  headerTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900 },
  placeholder: { width: 40 },
  content: { flex: 1, padding: SPACING.lg },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: '700', color: COLORS.gray900, marginBottom: SPACING.md, marginTop: SPACING.lg },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.md,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accentGreenSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactInfo: { flex: 1 },
  contactLabel: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray900, marginBottom: 4 },
  contactValue: { fontSize: FONT_SIZE.sm, color: COLORS.gray600 },
  messageCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
  },
  quickPromptWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  quickPrompt: {
    backgroundColor: COLORS.accentGreenSoft,
    borderRadius: BORDER_RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
  },
  quickPromptText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.accentGreen,
    fontWeight: '700',
  },
  selectedCategory: {
    backgroundColor: COLORS.accentGreen,
  },
  selectedCategoryText: {
    color: COLORS.white,
  },
  issueMeta: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.gray600,
    marginBottom: SPACING.sm,
    fontWeight: '600',
  },
  chatBox: {
    maxHeight: 240,
    marginBottom: SPACING.sm,
  },
  bubble: {
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.xs,
    maxWidth: '92%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.accentGreen,
  },
  botBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.gray100,
  },
  bubbleText: {
    color: COLORS.gray900,
    fontSize: FONT_SIZE.sm,
  },
  userBubbleText: {
    color: COLORS.white,
  },
  messageInput: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray900,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  voiceButton: {
    backgroundColor: COLORS.gray700,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  voiceButtonActive: {
    backgroundColor: COLORS.accentGreen,
  },
  voiceButtonText: { color: COLORS.white, fontSize: FONT_SIZE.sm, fontWeight: '700' },
  sendButton: {
    backgroundColor: COLORS.accentGreen,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    flex: 1,
  },
  sendButtonText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
});