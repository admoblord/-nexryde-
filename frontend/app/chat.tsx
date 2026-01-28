import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '@/src/store/appStore';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'driver' | 'ai';
  timestamp: Date;
  isRead: boolean;
}

type ChatTab = 'driver' | 'ai';

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAppStore();
  const tripId = params.tripId as string;
  const driverName = params.driverName as string || 'Driver';
  const flatListRef = useRef<FlatList>(null);
  
  const [activeTab, setActiveTab] = useState<ChatTab>('ai');
  const [message, setMessage] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  // Driver messages
  const [driverMessages, setDriverMessages] = useState<Message[]>([]);
  const [presetMessages, setPresetMessages] = useState<string[]>([]);
  
  // AI messages
  const [aiMessages, setAiMessages] = useState<Message[]>([
    {
      id: 'ai-welcome',
      text: "👋 Hi! I'm your NEXRYDE AI Assistant powered by GPT-4o.\n\nI can help you with:\n• Trip information & fare estimates\n• Safety tips & emergency help\n• Account & payment questions\n• Finding nearby places\n\nHow can I assist you today?",
      sender: 'ai',
      timestamp: new Date(),
      isRead: true,
    },
  ]);

  const quickReplies = activeTab === 'driver' 
    ? presetMessages.length > 0 ? presetMessages : ["I'm here", "On my way", "Running late", "Can you wait?"]
    : ["Estimate fare", "Safety tips", "Report issue", "Cancel trip"];

  const messages = activeTab === 'driver' ? driverMessages : aiMessages;

  // Load chat history on mount
  useEffect(() => {
    loadAIChatHistory();
    loadPresetMessages();
    
    if (tripId) {
      loadDriverMessages();
      // Start polling for new messages
      const interval = setInterval(loadDriverMessages, 3000);
      return () => clearInterval(interval);
    }
  }, [activeTab, tripId]);

  const loadAIChatHistory = async () => {
    if (!user?.id) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/ai/history/${user.id}`);
      const data = await response.json();
      
      if (data.messages && data.messages.length > 0) {
        setSessionId(data.session_id);
        const loadedMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          text: msg.message,
          sender: msg.role === 'user' ? 'user' : 'ai',
          timestamp: new Date(msg.timestamp),
          isRead: true,
        }));
        
        // Keep welcome message + loaded history
        setAiMessages([aiMessages[0], ...loadedMessages]);
      }
    } catch (error) {
      console.error('Error loading AI chat history:', error);
    }
  };

  const loadDriverMessages = async () => {
    if (!tripId || !user?.id) return;
    
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/chat/messages/${tripId}?user_id=${user.id}`
      );
      const data = await response.json();
      
      if (data.messages) {
        const loadedMessages: Message[] = data.messages.map((msg: any) => ({
          id: msg.id,
          text: msg.message,
          sender: msg.sender_role === 'rider' ? 'user' : 'driver',
          timestamp: new Date(msg.timestamp),
          isRead: msg.is_read,
        }));
        setDriverMessages(loadedMessages);
      }
    } catch (error) {
      console.error('Error loading driver messages:', error);
    }
  };

  const loadPresetMessages = async () => {
    try {
      const role = user?.role === 'driver' ? 'driver' : 'rider';
      const response = await fetch(`${BACKEND_URL}/api/chat/presets/${role}`);
      const data = await response.json();
      if (data.presets) {
        setPresetMessages(data.presets);
      }
    } catch (error) {
      console.error('Error loading preset messages:', error);
    }
  };

  const sendAIMessage = async (messageText: string) => {
    if (!messageText.trim() || !user?.id) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText.trim(),
      sender: 'user',
      timestamp: new Date(),
      isRead: false,
    };
    
    setAiMessages(prev => [...prev, userMessage]);
    setIsAiTyping(true);
    setMessage('');
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/chat/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          message: messageText.trim(),
          user_role: user.role || 'rider',
          session_id: sessionId,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.message) {
        setSessionId(data.session_id);
        
        const aiMessage: Message = {
          id: `ai-${Date.now()}`,
          text: data.message,
          sender: 'ai',
          timestamp: new Date(),
          isRead: true,
        };
        
        setAiMessages(prev => [...prev, aiMessage]);
      } else {
        // Show error message
        const errorMessage: Message = {
          id: `ai-error-${Date.now()}`,
          text: data.message || "Sorry, I couldn't process that. Please try again.",
          sender: 'ai',
          timestamp: new Date(),
          isRead: true,
        };
        setAiMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: Message = {
        id: `ai-error-${Date.now()}`,
        text: "I'm having trouble connecting. Please check your internet and try again.",
        sender: 'ai',
        timestamp: new Date(),
        isRead: true,
      };
      setAiMessages(prev => [...prev, errorMessage]);
    }
    
    setIsAiTyping(false);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendDriverMessage = async (messageText: string) => {
    if (!messageText.trim() || !tripId || !user?.id) return;
    
    const userMessage: Message = {
      id: Date.now().toString(),
      text: messageText.trim(),
      sender: 'user',
      timestamp: new Date(),
      isRead: false,
    };
    
    setDriverMessages(prev => [...prev, userMessage]);
    setMessage('');
    
    try {
      await fetch(`${BACKEND_URL}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trip_id: tripId,
          sender_id: user.id,
          sender_role: user.role === 'driver' ? 'driver' : 'rider',
          message: messageText.trim(),
          message_type: 'text',
        }),
      });
    } catch (error) {
      console.error('Send driver message error:', error);
    }
    
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const sendMessage = async () => {
    if (!message.trim()) return;
    
    if (activeTab === 'ai') {
      await sendAIMessage(message);
    } else {
      await sendDriverMessage(message);
    }
  };

  const sendQuickReply = (text: string) => {
    if (activeTab === 'ai') {
      sendAIMessage(text);
    } else {
      sendDriverMessage(text);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'ai') {
      await loadAIChatHistory();
    } else {
      await loadDriverMessages();
    }
    setRefreshing(false);
  }, [activeTab]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.sender === 'user';
    const isAI = item.sender === 'ai';
    
    return (
      <View style={[
        styles.messageContainer,
        isUser ? styles.userMessageContainer : styles.otherMessageContainer
      ]}>
        {!isUser && (
          <View style={[styles.avatar, isAI ? styles.aiAvatar : styles.driverAvatar]}>
            <Ionicons 
              name={isAI ? "sparkles" : "car"} 
              size={16} 
              color="#FFFFFF" 
            />
          </View>
        )}
        <View style={[
          styles.messageBubble,
          isUser ? styles.userBubble : (isAI ? styles.aiBubble : styles.driverBubble)
        ]}>
          <Text style={[
            styles.messageText,
            isUser && styles.userMessageText
          ]}>
            {item.text}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[
              styles.messageTime,
              isUser && styles.userMessageTime
            ]}>
              {formatTime(item.timestamp)}
            </Text>
            {isAI && (
              <View style={styles.poweredBy}>
                <Text style={styles.poweredByText}>GPT-4o</Text>
              </View>
            )}
          </View>
        </View>
      </View>
    );
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
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>Messages</Text>
          
          <View style={{ width: 40 }} />
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'ai' && styles.activeTab]}
            onPress={() => setActiveTab('ai')}
          >
            <Ionicons 
              name="sparkles" 
              size={18} 
              color={activeTab === 'ai' ? '#FFFFFF' : '#6B7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'ai' && styles.activeTabText]}>
              AI Assistant
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.tab, activeTab === 'driver' && styles.activeTab]}
            onPress={() => setActiveTab('driver')}
          >
            <Ionicons 
              name="car" 
              size={18} 
              color={activeTab === 'driver' ? '#FFFFFF' : '#6B7280'} 
            />
            <Text style={[styles.tabText, activeTab === 'driver' && styles.activeTabText]}>
              {user?.role === 'driver' ? 'Rider Chat' : 'Driver Chat'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Chat Info Banner */}
        {activeTab === 'ai' && (
          <View style={styles.infoBanner}>
            <Ionicons name="flash" size={16} color="#8B5CF6" />
            <Text style={styles.infoBannerText}>
              Powered by GPT-4o • Available 24/7
            </Text>
          </View>
        )}
        
        {activeTab === 'driver' && !tripId && (
          <View style={[styles.infoBanner, styles.warningBanner]}>
            <Ionicons name="information-circle" size={16} color="#F59E0B" />
            <Text style={[styles.infoBannerText, styles.warningText]}>
              Start a trip to chat with your {user?.role === 'driver' ? 'rider' : 'driver'}
            </Text>
          </View>
        )}

        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          {/* Messages List */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#8B5CF6"
              />
            }
          />

          {/* AI Typing Indicator */}
          {isAiTyping && (
            <View style={styles.typingContainer}>
              <View style={styles.typingBubble}>
                <View style={styles.typingDots}>
                  <View style={[styles.dot, styles.dot1]} />
                  <View style={[styles.dot, styles.dot2]} />
                  <View style={[styles.dot, styles.dot3]} />
                </View>
                <Text style={styles.typingText}>AI is thinking...</Text>
              </View>
            </View>
          )}

          {/* Quick Replies */}
          <View style={styles.quickRepliesContainer}>
            <FlatList
              horizontal
              data={quickReplies}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[
                    styles.quickReplyButton,
                    activeTab === 'ai' && styles.quickReplyButtonAI
                  ]}
                  onPress={() => sendQuickReply(item)}
                >
                  <Text style={[
                    styles.quickReplyText,
                    activeTab === 'ai' && styles.quickReplyTextAI
                  ]}>{item}</Text>
                </TouchableOpacity>
              )}
              keyExtractor={(item, index) => `${item}-${index}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRepliesList}
            />
          </View>

          {/* Input Area */}
          <View style={styles.inputContainer}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                placeholder={activeTab === 'ai' ? "Ask AI anything..." : "Type a message..."}
                placeholderTextColor="#9CA3AF"
                value={message}
                onChangeText={setMessage}
                multiline
                maxLength={500}
                editable={activeTab === 'ai' || !!tripId}
              />
              <TouchableOpacity 
                style={[
                  styles.sendButton, 
                  message.trim() && styles.sendButtonActive,
                  activeTab === 'ai' && message.trim() && styles.sendButtonAI
                ]}
                onPress={sendMessage}
                disabled={!message.trim() || isAiTyping || (activeTab === 'driver' && !tripId)}
              >
                <Ionicons 
                  name="send" 
                  size={20} 
                  color={message.trim() ? '#FFFFFF' : '#9CA3AF'} 
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    gap: 6,
  },
  activeTab: {
    backgroundColor: '#8B5CF6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  warningBanner: {
    backgroundColor: '#FEF3C7',
  },
  infoBannerText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '500',
  },
  warningText: {
    color: '#92400E',
  },
  keyboardView: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  otherMessageContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  driverAvatar: {
    backgroundColor: '#22C55E',
  },
  aiAvatar: {
    backgroundColor: '#8B5CF6',
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#22C55E',
    borderBottomRightRadius: 4,
  },
  driverBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  aiBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  messageText: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  userMessageTime: {
    color: 'rgba(255,255,255,0.7)',
  },
  poweredBy: {
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  poweredByText: {
    fontSize: 9,
    color: '#7C3AED',
    fontWeight: '600',
  },
  typingContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    alignSelf: 'flex-start',
    gap: 10,
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
  dot1: {
    opacity: 0.4,
  },
  dot2: {
    opacity: 0.7,
  },
  dot3: {
    opacity: 1,
  },
  typingText: {
    fontSize: 13,
    color: '#7C3AED',
    fontWeight: '500',
  },
  quickRepliesContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 10,
  },
  quickRepliesList: {
    paddingHorizontal: 16,
  },
  quickReplyButton: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickReplyButtonAI: {
    backgroundColor: '#F3E8FF',
    borderColor: '#DDD6FE',
  },
  quickReplyText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  quickReplyTextAI: {
    color: '#7C3AED',
  },
  inputContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 4,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
    maxHeight: 100,
    paddingVertical: 10,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonActive: {
    backgroundColor: '#22C55E',
  },
  sendButtonAI: {
    backgroundColor: '#8B5CF6',
  },
});
