import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';

export default function SupportScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');

  const contactOptions = [
    { icon: 'call', label: 'Call Support', value: '+234-900-000-0000', action: () => Linking.openURL('tel:+2349000000000') },
    { icon: 'mail', label: 'Email Us', value: 'support@nexryde.com', action: () => Linking.openURL('mailto:support@nexryde.com') },
    { icon: 'logo-whatsapp', label: 'WhatsApp', value: '+234-900-000-0000', action: () => Linking.openURL('https://wa.me/2349000000000') },
  ];

  const faqs = [
    { question: 'How do I change my payment method?', answer: 'Go to Settings > Payment Methods' },
    { question: 'How to cancel a ride?', answer: 'Tap the ride and select Cancel' },
    { question: 'How do refunds work?', answer: 'Refunds are processed within 3-5 business days' },
  ];

  return (
    <View style={styles.container}>
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

          <Text style={styles.sectionTitle}>Send us a message</Text>
          <View style={styles.messageCard}>
            <TextInput
              style={styles.messageInput}
              placeholder="Describe your issue..."
              placeholderTextColor={COLORS.gray400}
              multiline
              numberOfLines={4}
              value={message}
              onChangeText={setMessage}
            />
            <TouchableOpacity 
              style={styles.sendButton}
              onPress={() => {
                Alert.alert('Success', 'Your message has been sent! We\'ll get back to you soon.');
                setMessage('');
              }}
            >
              <Text style={styles.sendButtonText}>Send Message</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>FAQs</Text>
          {faqs.map((faq, index) => (
            <TouchableOpacity key={index} style={styles.faqCard}>
              <Text style={styles.faqQuestion}>{faq.question}</Text>
              <Text style={styles.faqAnswer}>{faq.answer}</Text>
            </TouchableOpacity>
          ))}
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
  messageInput: {
    fontSize: FONT_SIZE.md,
    color: COLORS.gray900,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: SPACING.md,
  },
  sendButton: {
    backgroundColor: COLORS.accentGreen,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
  },
  sendButtonText: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.white },
  faqCard: {
    backgroundColor: COLORS.white,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    marginBottom: SPACING.sm,
  },
  faqQuestion: { fontSize: FONT_SIZE.md, fontWeight: '600', color: COLORS.gray900, marginBottom: SPACING.xs },
  faqAnswer: { fontSize: FONT_SIZE.sm, color: COLORS.gray600 },
});