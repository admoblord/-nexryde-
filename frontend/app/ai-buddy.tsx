/**
 * NEXRYDE AI Trip Buddy Screen
 * Chat with AI companion during rides
 */

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAITripBuddy, AI_PERSONALITIES, AIPersonality } from '../src/services/aiTripBuddy';

const { width } = Dimensions.get('window');
const COLORS = { primary: '#00D084', secondary: '#00B4D8', accent: '#FFB800', purple: '#9D4EDD', dark: '#1a1a1a', darkCard: '#2a2a2a', white: '#FFFFFF', textPrimary: '#FFFFFF', textSecondary: '#B0B0B0' };

const AITripBuddyScreen = () => {
  const { personality, messages, isTyping, sendMessage, changePersonality, clearConversation } = useAITripBuddy();
  const [inputText, setInputText] = useState('');
  const [showPersonalities, setShowPersonalities] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  
  const currentPersonality = AI_PERSONALITIES.find(p => p.id === personality);
  
  useEffect(() => { scrollViewRef.current?.scrollToEnd({ animated: true }); }, [messages, isTyping]);
  
  const handleSend = async () => { if (inputText.trim()) { await sendMessage(inputText); setInputText(''); } };
  
  const handleSelectPersonality = (newPersonality: AIPersonality) => { changePersonality(newPersonality); setShowPersonalities(false); };
  
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#00B4D8', '#0096C7']} style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color={COLORS.white} /></TouchableOpacity>
        <View style={styles.headerCenter}><Text style={styles.headerTitle}>💬 AI Trip Buddy</Text><Text style={styles.headerSubtitle}>{currentPersonality?.name} {currentPersonality?.icon}</Text></View>
        <TouchableOpacity onPress={() => setShowPersonalities(!showPersonalities)} style={styles.personalityButton}><Ionicons name="person-circle" size={28} color={COLORS.white} /></TouchableOpacity>
      </LinearGradient>
      
      {showPersonalities && (
        <View style={styles.personalitiesPanel}>
          <Text style={styles.panelTitle}>Choose Your AI Buddy:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.personalitiesScroll}>
            {AI_PERSONALITIES.map((p) => (
              <TouchableOpacity key={p.id} style={[styles.personalityCard, personality === p.id && styles.personalityCardActive]} onPress={() => handleSelectPersonality(p.id)}>
                <Text style={styles.personalityIcon}>{p.icon}</Text>
                <Text style={styles.personalityName}>{p.name}</Text>
                <Text style={styles.personalityDesc}>{p.description}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.chatContainer} keyboardVerticalOffset={90}>
        <ScrollView ref={scrollViewRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent} showsVerticalScrollIndicator={false}>
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{currentPersonality?.icon}</Text>
              <Text style={styles.emptyTitle}>{currentPersonality?.greeting}</Text>
              <Text style={styles.emptySubtitle}>Start chatting! Ask me anything about:</Text>
              <View style={styles.topicsList}>
                {currentPersonality?.sampleTopics.map((topic, index) => (<View key={index} style={styles.topicTag}><Text style={styles.topicText}>{topic}</Text></View>))}
              </View>
            </View>
          )}
          
          {messages.map((message) => (
            <View key={message.id} style={[styles.messageRow, message.sender === 'user' ? styles.messageRowUser : styles.messageRowAI]}>
              {message.sender === 'ai' && (<View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>{currentPersonality?.icon}</Text></View>)}
              <View style={[styles.messageBubble, message.sender === 'user' ? styles.messageBubbleUser : styles.messageBubbleAI]}>
                <Text style={[styles.messageText, message.sender === 'user' ? styles.messageTextUser : styles.messageTextAI]}>{message.text}</Text>
              </View>
            </View>
          ))}
          
          {isTyping && (
            <View style={[styles.messageRow, styles.messageRowAI]}>
              <View style={styles.aiAvatar}><Text style={styles.aiAvatarText}>{currentPersonality?.icon}</Text></View>
              <View style={[styles.messageBubble, styles.messageBubbleAI]}><Text style={styles.typingText}>Typing...</Text></View>
            </View>
          )}
        </ScrollView>
        
        <View style={styles.inputContainer}>
          <TextInput style={styles.input} value={inputText} onChangeText={setInputText} placeholder="Type a message..." placeholderTextColor={COLORS.textSecondary} multiline maxLength={500} onSubmitEditing={handleSend} />
          <TouchableOpacity style={styles.sendButton} onPress={handleSend} activeOpacity={0.7}><LinearGradient colors={['#00D084', '#00B4D8']} style={styles.sendGradient}><Ionicons name="send" size={20} color={COLORS.white} /></LinearGradient></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.dark },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 16, paddingHorizontal: 20 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  headerCenter: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  personalityButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  personalitiesPanel: { backgroundColor: COLORS.darkCard, paddingVertical: 16 },
  panelTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, paddingHorizontal: 20, marginBottom: 12 },
  personalitiesScroll: { paddingLeft: 20 },
  personalityCard: { width: 140, backgroundColor: '#3a3a3a', borderRadius: 12, padding: 12, marginRight: 12, borderWidth: 2, borderColor: 'transparent' },
  personalityCardActive: { borderColor: COLORS.secondary, backgroundColor: '#00B4D820' },
  personalityIcon: { fontSize: 32, textAlign: 'center', marginBottom: 8 },
  personalityName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 4 },
  personalityDesc: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'center' },
  chatContainer: { flex: 1 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 8 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 8, paddingHorizontal: 20 },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 16 },
  topicsList: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  topicTag: { backgroundColor: '#00B4D820', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  topicText: { fontSize: 12, fontWeight: '600', color: COLORS.secondary },
  messageRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  messageRowUser: { justifyContent: 'flex-end' },
  messageRowAI: { justifyContent: 'flex-start' },
  aiAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.darkCard, justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  aiAvatarText: { fontSize: 20 },
  messageBubble: { maxWidth: width * 0.7, borderRadius: 16, padding: 12 },
  messageBubbleUser: { backgroundColor: COLORS.secondary },
  messageBubbleAI: { backgroundColor: COLORS.darkCard },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageTextUser: { color: COLORS.white },
  messageTextAI: { color: COLORS.textPrimary },
  typingText: { fontSize: 14, color: COLORS.textSecondary, fontStyle: 'italic' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 16, paddingBottom: Platform.OS === 'ios' ? 34 : 16, backgroundColor: COLORS.darkCard, borderTopWidth: 1, borderTopColor: '#3a3a3a', gap: 12 },
  input: { flex: 1, backgroundColor: '#3a3a3a', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, color: COLORS.textPrimary, fontSize: 15, maxHeight: 100 },
  sendButton: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  sendGradient: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});

export default AITripBuddyScreen;
